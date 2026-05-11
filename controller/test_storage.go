package controller

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/service/storage"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
)

// TestCreationStorageReq 是测试上传的请求体。
//
// 设计原则：admin 在 UI 上没保存设置就能先点「测试上传」验证。
// 字段含义跟 system_setting.CreationSetting 中以 Upload/S3/Local 开头的字段一一对应。
// 任意字段为零值时，fallback 到当前已保存的设置——尤其 S3AccessKeySecret 是 password
// 类型，前端从不回显，admin 不改 SK 时该字段会是空字符串，fallback 行为保证测试用 DB
// 里的真值，跟实际生产上传时一致。
type TestCreationStorageReq struct {
	UploadDriver string `json:"upload_driver"`

	LocalUploadPath    string `json:"local_upload_path"`
	LocalPublicBaseURL string `json:"local_public_base_url"`

	S3Endpoint             string `json:"s3_endpoint"`
	S3Region               string `json:"s3_region"`
	S3Bucket               string `json:"s3_bucket"`
	S3AccessKeyID          string `json:"s3_access_key_id"`
	S3AccessKeySecret      string `json:"s3_access_key_secret"`
	S3UsePathStyle         *bool  `json:"s3_use_path_style"`
	S3PublicBaseURL        string `json:"s3_public_base_url"`
	S3KeyPrefix            string `json:"s3_key_prefix"`
	S3PrivateBucket        *bool  `json:"s3_private_bucket"`
	S3PresignExpireSeconds int    `json:"s3_presign_expire_seconds"`
}

// TestCreationStorage admin-only：用请求里的配置临时构造 storage，执行一次
// Put + Delete 测试。不影响全局 storage 实例，不影响其它字段。
func TestCreationStorage(c *gin.Context) {
	var req TestCreationStorageReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请求体解析失败: " + err.Error()})
		return
	}

	cur := system_setting.GetCreationSetting()

	// 把请求字段合到当前配置上：请求里有值用请求的，没有沿用当前 saved 值。
	cs := &system_setting.CreationSetting{
		Enabled:            cur.Enabled,
		UploadDriver:       firstNonEmpty(req.UploadDriver, cur.UploadDriver),
		LocalUploadPath:    firstNonEmpty(req.LocalUploadPath, cur.LocalUploadPath),
		LocalPublicBaseURL: firstNonEmpty(req.LocalPublicBaseURL, cur.LocalPublicBaseURL),
		S3Endpoint:         firstNonEmpty(req.S3Endpoint, cur.S3Endpoint),
		S3Region:           firstNonEmpty(req.S3Region, cur.S3Region),
		S3Bucket:           firstNonEmpty(req.S3Bucket, cur.S3Bucket),
		S3AccessKeyID:      firstNonEmpty(req.S3AccessKeyID, cur.S3AccessKeyID),
		S3AccessKeySecret:  firstNonEmpty(req.S3AccessKeySecret, cur.S3AccessKeySecret),
		S3PublicBaseURL:    firstNonEmpty(req.S3PublicBaseURL, cur.S3PublicBaseURL),
		S3KeyPrefix:        firstNonEmpty(req.S3KeyPrefix, cur.S3KeyPrefix),
	}
	if req.S3UsePathStyle != nil {
		cs.S3UsePathStyle = *req.S3UsePathStyle
	} else {
		cs.S3UsePathStyle = cur.S3UsePathStyle
	}
	if req.S3PrivateBucket != nil {
		cs.S3PrivateBucket = *req.S3PrivateBucket
	} else {
		cs.S3PrivateBucket = cur.S3PrivateBucket
	}
	if req.S3PresignExpireSeconds > 0 {
		cs.S3PresignExpireSeconds = req.S3PresignExpireSeconds
	} else {
		cs.S3PresignExpireSeconds = cur.S3PresignExpireSeconds
	}

	// newStorage 是包内私有，通过 storage.NewForTest 暴露一个测试入口。
	st, err := storage.NewForTest(cs)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "存储初始化失败: " + err.Error()})
		return
	}

	// 生成随机 key 避免并发测试冲突。前缀加 .test 子目录，不污染正常上传命名空间。
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	key := fmt.Sprintf(".test/ping-%s.txt", hex.EncodeToString(buf[:]))

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	body := bytes.NewBufferString("new-api storage connectivity test\n")
	publicURL, putErr := st.Put(ctx, key, body, int64(body.Len()), storage.PutOptions{
		ContentType:  "text/plain; charset=utf-8",
		CacheControl: "no-store",
	})
	if putErr != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "上传失败: " + putErr.Error(),
			"driver":  st.Driver(),
		})
		return
	}

	// Put 成功还不够——签名 / endpoint 错误也可能让客户端拉不到。
	// 端到端验证：用返回的公网 URL 真正 GET 一次，验证客户端能拉到对象。
	// 走 storage.Get 是后端 SDK 路径（鉴权用 AK/SK），跟客户端浏览器走签名 URL 的
	// 路径不一样，所以这里直接用 net/http 拉 publicURL 才有意义。
	readErr := verifyReadable(ctx, publicURL)

	// 不管读验证结果如何，都尽量删测试对象，避免污染 bucket。
	delErr := st.Delete(context.Background(), key)

	if readErr != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "上传成功但读取测试失败（可能是 ACL / 签名 / 域名解析问题）: " + readErr.Error(),
			"driver":  st.Driver(),
			"url":     publicURL,
		})
		return
	}

	deleteMsg := ""
	if delErr != nil {
		deleteMsg = "上传/读取均成功，但删除测试对象失败（仅警告，可手工清理）: " + delErr.Error()
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"driver":       st.Driver(),
		"url":          publicURL,
		"test_key":     key,
		"delete_error": deleteMsg,
	})
}

// verifyReadable 用 HTTP GET 拉 publicURL 验证客户端浏览器能拿到对象。
// 不读完整 body（最多 1KB），节省时间。
func verifyReadable(ctx context.Context, publicURL string) error {
	if publicURL == "" {
		return fmt.Errorf("storage 没有返回 URL")
	}
	// /api/upload/file/... 这种相对路径来自 local driver，跳过端到端读测试
	// （后端没有自己的 base URL，且 local 已经在 Put 时落盘成功）。
	if strings.HasPrefix(publicURL, "/") {
		return nil
	}
	c2, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(c2, http.MethodGet, publicURL, nil)
	if err != nil {
		return fmt.Errorf("构造 GET 请求失败: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("GET 网络错误: %w", err)
	}
	defer resp.Body.Close()
	// 拉前 1KB 用于触发实际读取
	_, _ = io.CopyN(io.Discard, resp.Body, 1024)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("GET HTTP %d（公开 bucket 需 PublicRead；私有 bucket 需勾选「私有 Bucket」走签名 URL）", resp.StatusCode)
	}
	return nil
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
