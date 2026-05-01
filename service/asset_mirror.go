package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service/storage"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

// MirrorUpstreamURLAsync 将上游短期 URL 异步镜像到我们的对象存储。
//
// 仅当 system_setting.CreationSetting.MirrorUpstreamUrls = true 时启用。
//
// 行为：
//   - 同步内只做合法性校验，立即拉起 goroutine 执行下载和上传
//   - 上传成功后，通过 onMirrored 回调把新 URL 持久化（典型场景：写回 Task.PrivateData.ResultURL）
//   - 上传失败则吞掉错误（不阻塞主流程，不删原任务），仅日志
//
// 参数：
//   - taskID  外部公开任务 ID，用于生成 key
//   - userID  归属用户，用于 key 隔离
//   - origURL 上游临时 URL
//   - onMirrored 镜像成功回调；newURL 是落到我们对象存储后的稳定 URL
func MirrorUpstreamURLAsync(taskID string, userID int, origURL string, onMirrored func(newURL string)) {
	cs := system_setting.GetCreationSetting()
	if !cs.MirrorUpstreamUrls {
		return
	}
	if origURL == "" || strings.HasPrefix(origURL, "data:") {
		return
	}

	go func() {
		newURL, err := mirrorOnce(taskID, userID, origURL, cs)
		if err != nil {
			common.SysError(fmt.Sprintf("asset mirror failed for task %s: %v", taskID, err))
			return
		}
		if newURL == "" {
			return
		}
		if onMirrored != nil {
			defer func() {
				if r := recover(); r != nil {
					common.SysError(fmt.Sprintf("asset mirror onMirrored callback panic: %v", r))
				}
			}()
			onMirrored(newURL)
		}
	}()
}

func mirrorOnce(taskID string, userID int, origURL string, cs *system_setting.CreationSetting) (string, error) {
	timeout := time.Duration(cs.MirrorDownloadTimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	maxBytes := int64(cs.MirrorMaxFileMB) * 1024 * 1024
	if maxBytes <= 0 {
		maxBytes = 200 * 1024 * 1024
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	// 复用 SSRF 防护过的下载入口
	resp, err := DoDownloadRequest(origURL, "creation_mirror")
	if err != nil {
		return "", fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("download: upstream status %d", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// 限定大小：使用 LimitReader + 提前判断 Content-Length
	if resp.ContentLength > 0 && resp.ContentLength > maxBytes {
		return "", fmt.Errorf("file exceeds limit: %d > %d", resp.ContentLength, maxBytes)
	}
	limitedBody := io.LimitReader(resp.Body, maxBytes+1)

	// 用唯一 key（带日期分桶）落入 mirror/{user}/{date}/{taskID}.{ext}
	dateDir := time.Now().UTC().Format("20060102")
	ext := guessExt(origURL, contentType)
	key := fmt.Sprintf("mirror/%d/%s/%s%s", userID, dateDir, sanitizeKeyPart(taskID), ext)

	// 包一层 Reader，把超限信号转成 error
	body := &capLimitReader{R: limitedBody, Cap: maxBytes}

	st, err := storage.Get()
	if err != nil {
		return "", fmt.Errorf("storage init: %w", err)
	}
	newURL, err := st.Put(ctx, key, body, resp.ContentLength, storage.PutOptions{
		ContentType: contentType,
	})
	if err != nil {
		if errors.Is(err, errOverCap) {
			return "", fmt.Errorf("file exceeds limit during stream copy")
		}
		return "", fmt.Errorf("storage put: %w", err)
	}
	common.SysLog(fmt.Sprintf("asset mirror ok: task=%s user=%d driver=%s key=%s", taskID, userID, st.Driver(), key))
	return newURL, nil
}

// capLimitReader 跟踪累计字节数，超限时返回 errOverCap
type capLimitReader struct {
	R     io.Reader
	Cap   int64
	count int64
}

var errOverCap = errors.New("over cap")

func (c *capLimitReader) Read(p []byte) (int, error) {
	n, err := c.R.Read(p)
	c.count += int64(n)
	if c.count > c.Cap {
		return n, errOverCap
	}
	return n, err
}

func guessExt(rawURL, contentType string) string {
	// 优先从 URL path 取扩展名
	if u, err := url.Parse(rawURL); err == nil {
		if ext := strings.ToLower(path.Ext(u.Path)); ext != "" && len(ext) <= 5 {
			return ext
		}
	}
	// 否则按 Content-Type
	if ct := strings.SplitN(contentType, ";", 2)[0]; ct != "" {
		if exts, _ := mime.ExtensionsByType(strings.TrimSpace(ct)); len(exts) > 0 {
			return exts[0]
		}
	}
	return ""
}

func sanitizeKeyPart(s string) string {
	// 只保留 [A-Za-z0-9_-]，其余转下划线，最多 64 字符
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9',
			r == '_' || r == '-':
			b.WriteRune(r)
		default:
			b.WriteRune('_')
		}
		if b.Len() >= 64 {
			break
		}
	}
	if b.Len() == 0 {
		return "asset"
	}
	return b.String()
}

// 静态自检：确保接口签名稳定
var _ = http.StatusOK
