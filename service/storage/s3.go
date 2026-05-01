package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/setting/system_setting"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type s3Storage struct {
	client    *s3.Client
	uploader  *manager.Uploader
	bucket    string
	publicURL string // 自定义公网 URL 前缀（trim trailing /）
	endpoint  string // 用于回退构造 URL
	pathStyle bool
	keyPrefix string // 包含末尾 /，例如 "creation/"
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

	return &s3Storage{
		client:    client,
		uploader:  manager.NewUploader(client),
		bucket:    cs.S3Bucket,
		publicURL: strings.TrimRight(cs.S3PublicBaseURL, "/"),
		endpoint:  strings.TrimRight(cs.S3Endpoint, "/"),
		pathStyle: cs.S3UsePathStyle,
		keyPrefix: keyPrefix,
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

	_, err := s.uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:       &s.bucket,
		Key:          &full,
		Body:         body,
		ContentType:  &contentType,
		CacheControl: &cacheControl,
		ACL:          types.ObjectCannedACLPublicRead,
	})
	if err != nil {
		// 部分私有云不支持 ACL；fallback 不带 ACL 再试一次
		if isACLNotSupported(err) {
			_, err2 := s.uploader.Upload(ctx, &s3.PutObjectInput{
				Bucket:       &s.bucket,
				Key:          &full,
				Body:         body,
				ContentType:  &contentType,
				CacheControl: &cacheControl,
			})
			if err2 != nil {
				return "", fmt.Errorf("storage s3: upload (no acl): %w", err2)
			}
		} else {
			return "", fmt.Errorf("storage s3: upload: %w", err)
		}
	}
	return s.publicURLFor(full), nil
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

// publicURLFor 拼接对外 URL；如果配置了 S3PublicBaseURL 优先用它
func (s *s3Storage) publicURLFor(fullKey string) string {
	if s.publicURL != "" {
		return s.publicURL + "/" + fullKey
	}
	if s.endpoint == "" {
		// 默认 AWS 模板
		return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", s.bucket, fullKey)
	}
	u, err := url.Parse(s.endpoint)
	if err != nil {
		return fmt.Sprintf("%s/%s/%s", s.endpoint, s.bucket, fullKey)
	}
	if s.pathStyle {
		// {scheme}://{host}/{bucket}/{key}
		return fmt.Sprintf("%s://%s/%s/%s", u.Scheme, u.Host, s.bucket, fullKey)
	}
	// 虚拟主机模式：{scheme}://{bucket}.{host}/{key}
	return fmt.Sprintf("%s://%s.%s/%s", u.Scheme, s.bucket, u.Host, fullKey)
}

func isACLNotSupported(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "AccessControlListNotSupported") ||
		strings.Contains(msg, "ACL") && strings.Contains(msg, "not supported")
}
