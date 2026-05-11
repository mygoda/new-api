package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/system_setting"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type s3Storage struct {
	client        *s3.Client
	presignClient *s3.PresignClient
	uploader      *manager.Uploader
	bucket        string
	publicURL     string // 自定义公网 URL 前缀（trim trailing /）
	endpoint      string // 用于回退构造 URL
	pathStyle     bool
	keyPrefix     string // 包含末尾 /，例如 "creation/"
	privateBucket bool
	presignExpire time.Duration
}

func newS3Storage(cs *system_setting.CreationSetting) (Storage, error) {
	if cs.S3Bucket == "" {
		return nil, errors.New("storage s3: bucket is required")
	}
	if cs.S3AccessKeyID == "" || cs.S3AccessKeySecret == "" {
		return nil, errors.New("storage s3: access key id/secret are required")
	}

	region := cs.S3Region
	if region == "" {
		region = "us-east-1"
	}

	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cs.S3AccessKeyID, cs.S3AccessKeySecret, "",
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("storage s3: load config: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if cs.S3Endpoint != "" {
			ep := cs.S3Endpoint
			o.BaseEndpoint = &ep
		}
		if cs.S3UsePathStyle {
			o.UsePathStyle = true
		}
	})

	keyPrefix := cs.S3KeyPrefix
	if keyPrefix != "" && !strings.HasSuffix(keyPrefix, "/") {
		keyPrefix += "/"
	}

	expire := time.Duration(cs.S3PresignExpireSeconds) * time.Second
	if expire <= 0 {
		expire = 24 * time.Hour
	}
	// AWS 文档上限 7 天；保险起见 cap 一下，避免被服务端拒。
	if expire > 7*24*time.Hour {
		expire = 7 * 24 * time.Hour
	}

	return &s3Storage{
		client:        client,
		presignClient: s3.NewPresignClient(client),
		uploader:      manager.NewUploader(client),
		bucket:        cs.S3Bucket,
		publicURL:     strings.TrimRight(cs.S3PublicBaseURL, "/"),
		endpoint:      strings.TrimRight(cs.S3Endpoint, "/"),
		pathStyle:     cs.S3UsePathStyle,
		keyPrefix:     keyPrefix,
		privateBucket: cs.S3PrivateBucket,
		presignExpire: expire,
	}, nil
}

func (s *s3Storage) Driver() string { return "s3" }

func (s *s3Storage) fullKey(key string) string { return s.keyPrefix + key }

func (s *s3Storage) Put(ctx context.Context, key string, body io.Reader, _ int64, opts PutOptions) (string, error) {
	if err := validateKey(key); err != nil {
		return "", err
	}
	cacheControl := opts.CacheControl
	if cacheControl == "" {
		cacheControl = "public, max-age=31536000"
	}
	contentType := opts.ContentType
	if contentType == "" {
		contentType = detectContentTypeFromExt(key)
	}
	full := s.fullKey(key)

	// 私有 bucket 大多禁止 PublicRead ACL（设了会被服务端 reject）。
	// 公开模式下保留 ACL，让对象直接公网可读（最常见的简化部署）。
	putInput := &s3.PutObjectInput{
		Bucket:       &s.bucket,
		Key:          &full,
		Body:         body,
		ContentType:  &contentType,
		CacheControl: &cacheControl,
	}
	if !s.privateBucket {
		putInput.ACL = types.ObjectCannedACLPublicRead
	}

	_, err := s.uploader.Upload(ctx, putInput)
	if err != nil {
		// 公开模式下部分私有云不支持 ACL；fallback 不带 ACL 再试一次
		if !s.privateBucket && isACLNotSupported(err) {
			putInput.ACL = ""
			_, err2 := s.uploader.Upload(ctx, putInput)
			if err2 != nil {
				return "", fmt.Errorf("storage s3: upload (no acl): %w", err2)
			}
		} else {
			return "", fmt.Errorf("storage s3: upload: %w", err)
		}
	}
	return s.publicURLFor(ctx, full)
}

func (s *s3Storage) Delete(ctx context.Context, key string) error {
	if err := validateKey(key); err != nil {
		return err
	}
	full := s.fullKey(key)
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &s.bucket, Key: &full,
	})
	if err != nil {
		return fmt.Errorf("storage s3: delete: %w", err)
	}
	return nil
}

func (s *s3Storage) Exists(ctx context.Context, key string) (bool, error) {
	if err := validateKey(key); err != nil {
		return false, err
	}
	full := s.fullKey(key)
	_, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: &s.bucket, Key: &full})
	if err == nil {
		return true, nil
	}
	var nf *types.NotFound
	if errors.As(err, &nf) {
		return false, nil
	}
	if strings.Contains(err.Error(), "NotFound") || strings.Contains(err.Error(), "404") {
		return false, nil
	}
	return false, err
}

func (s *s3Storage) Get(ctx context.Context, key string) (io.ReadCloser, string, error) {
	if err := validateKey(key); err != nil {
		return nil, "", err
	}
	full := s.fullKey(key)
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: &s.bucket, Key: &full})
	if err != nil {
		if strings.Contains(err.Error(), "NoSuchKey") || strings.Contains(err.Error(), "NotFound") {
			return nil, "", ErrNoSuchKey
		}
		return nil, "", err
	}
	ct := ""
	if out.ContentType != nil {
		ct = *out.ContentType
	}
	if ct == "" {
		ct = detectContentTypeFromExt(key)
	}
	return out.Body, ct, nil
}

// publicURLFor 决定对外 URL：
//   - 私有 bucket：返回 GET 预签名 URL（带 X-Amz-Signature，有有效期）
//   - 公开 bucket：返回明文 URL（CDN > endpoint 拼接）
func (s *s3Storage) publicURLFor(ctx context.Context, fullKey string) (string, error) {
	if s.privateBucket {
		req, err := s.presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
			Bucket: &s.bucket,
			Key:    &fullKey,
		}, s3.WithPresignExpires(s.presignExpire))
		if err != nil {
			return "", fmt.Errorf("storage s3: presign: %w", err)
		}
		return req.URL, nil
	}
	if s.publicURL != "" {
		return s.publicURL + "/" + fullKey, nil
	}
	if s.endpoint == "" {
		// 默认 AWS 模板
		return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", s.bucket, fullKey), nil
	}
	u, err := url.Parse(s.endpoint)
	if err != nil {
		return fmt.Sprintf("%s/%s/%s", s.endpoint, s.bucket, fullKey), nil
	}
	if s.pathStyle {
		// {scheme}://{host}/{bucket}/{key}
		return fmt.Sprintf("%s://%s/%s/%s", u.Scheme, u.Host, s.bucket, fullKey), nil
	}
	// 虚拟主机模式：{scheme}://{bucket}.{host}/{key}
	return fmt.Sprintf("%s://%s.%s/%s", u.Scheme, s.bucket, u.Host, fullKey), nil
}

func isACLNotSupported(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "AccessControlListNotSupported") ||
		strings.Contains(msg, "ACL") && strings.Contains(msg, "not supported")
}
