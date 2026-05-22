package controller

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"

	"github.com/gin-gonic/gin"
)

// RelayImagesModerations 实现 Seedance 兼容的图片素材审核入库接口:
//
//	POST /v1/images/moderations  (别名: POST /v1/assets/moderations)
//	Authorization: Bearer sk-xxxxxx
//	Content-Type: application/json
//	{
//	  "model": "doubao-seedance-2.0",
//	  "images" / "image_urls": ["https://..."],   或  "image_url": "https://..."
//	  "asset_type": "Image"   // 可选,默认 Image
//	}
//
// 流程:
//  1. 校验 model + URL 列表(≤50 张,公网 http(s),受支持扩展名)
//  2. 复用 distributor 已经按 model+group 选好的渠道,拿 base_url + key
//  3. 并发(默认 8 并发)下载每张图,加 SSRF 防御 + 30MB 上限
//  4. 每张图转发到 {base_url}/api/v3/files 入库,拿 file_id
//  5. 按 cubicspaces 文档格式返回 {code, data:{items:[{source_url, asset_url, passed,...}]}}
//
// 单张失败不阻塞整批,只在该条目的 error 字段标注;整体 status 在全部 passed
// 时为 approved,否则为 rejected。
func RelayImagesModerations(c *gin.Context) {
	var req imagesModerationsRequest
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		respondJSONError(c, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if strings.TrimSpace(req.Model) == "" {
		respondJSONError(c, http.StatusBadRequest, "missing_model", "model 必填,建议传 doubao-seedance-2.0")
		return
	}

	urls := req.collectURLs()
	if len(urls) == 0 {
		respondJSONError(c, http.StatusBadRequest, "no_images", "images / image_urls / image_url 至少传一个")
		return
	}
	if len(urls) > moderationMaxImages {
		respondJSONError(c, http.StatusBadRequest, "too_many_images",
			fmt.Sprintf("单次最多 %d 个 URL", moderationMaxImages))
		return
	}

	// distributor 已经按 model+group 选好渠道,context 里能直接拿 base_url + key
	baseURL := strings.TrimRight(common.GetContextKeyString(c, constant.ContextKeyChannelBaseUrl), "/")
	apiKey := strings.TrimSpace(common.GetContextKeyString(c, constant.ContextKeyChannelKey))
	if baseURL == "" || apiKey == "" {
		respondJSONError(c, http.StatusBadGateway, "channel_not_ready",
			"渠道未就绪,请检查渠道是否启用且配置了 base URL 与密钥")
		return
	}

	items := make([]moderationItem, len(urls))
	sem := make(chan struct{}, moderationConcurrency)
	var wg sync.WaitGroup
	for i, srcURL := range urls {
		i, srcURL := i, srcURL
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			item := moderationItem{SourceURL: srcURL}
			ctx, cancel := context.WithTimeout(c.Request.Context(), moderationItemTimeout)
			defer cancel()

			data, filename, contentType, err := moderationDownload(ctx, srcURL)
			if err != nil {
				item.Error = err.Error()
				items[i] = item
				return
			}
			fileID, err := moderationUploadToVolcFiles(ctx, baseURL, apiKey, data, filename, contentType)
			if err != nil {
				item.Error = err.Error()
				items[i] = item
				return
			}
			item.AssetURL = "asset://" + fileID
			item.SubmitReviewStatus = 1
			item.Passed = true
			items[i] = item
		}()
	}
	wg.Wait()

	overallStatus := "approved"
	for _, it := range items {
		if !it.Passed {
			overallStatus = "rejected"
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    "success",
		"message": "",
		"data": gin.H{
			"object":          "asset_moderation",
			"status":          overallStatus,
			"review_batch_id": moderationRandomID("review-batch-"),
			"task_id":         moderationRandomID("moderation-task-"),
			"items":           items,
		},
	})
}

// ────────────────────────────────────────────────────────────────────────────
// 内部实现
// ────────────────────────────────────────────────────────────────────────────

const (
	moderationMaxImages      = 50
	moderationMaxBytes       = 30 * 1024 * 1024 // 30 MB
	moderationDownloadTO     = 30 * time.Second
	moderationItemTimeout    = 120 * time.Second // 单条目总超时(下载 + 上传)
	moderationConcurrency    = 8
)

var moderationAllowedExt = map[string]bool{
	".jpeg": true, ".jpg": true, ".png": true, ".webp": true,
	".bmp": true, ".tiff": true, ".tif": true, ".gif": true,
	".heic": true, ".heif": true,
}

type imagesModerationsRequest struct {
	Model     string   `json:"model"`
	Images    []string `json:"images,omitempty"`
	ImageUrls []string `json:"image_urls,omitempty"`
	ImageURL  string   `json:"image_url,omitempty"`
	AssetType string   `json:"asset_type,omitempty"`
}

type moderationItem struct {
	SourceURL          string `json:"source_url"`
	AssetURL           string `json:"asset_url,omitempty"`
	SubmitReviewStatus int    `json:"submit_review_status"`
	Passed             bool   `json:"passed"`
	Error              string `json:"error,omitempty"`
}

func (r *imagesModerationsRequest) collectURLs() []string {
	seen := make(map[string]struct{})
	var urls []string
	add := func(u string) {
		u = strings.TrimSpace(u)
		if u == "" {
			return
		}
		if _, ok := seen[u]; ok {
			return
		}
		seen[u] = struct{}{}
		urls = append(urls, u)
	}
	for _, u := range r.Images {
		add(u)
	}
	for _, u := range r.ImageUrls {
		add(u)
	}
	add(r.ImageURL)
	return urls
}

// moderationHTTPClient 专门用于下载用户提供的公网图片。
// 通过自定义 DialContext 阻止解析后的 IP 落在私网/回环/链路本地等内部网段,
// 防御 SSRF。
var moderationHTTPClient = &http.Client{
	Timeout: moderationDownloadTO,
	Transport: &http.Transport{
		DialContext:           moderationSafeDial,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 20 * time.Second,
		MaxIdleConns:          50,
		IdleConnTimeout:       90 * time.Second,
	},
	// 跟随重定向但每跳都重新过 DialContext,保证不会被 302 到内网。
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		return nil
	},
}

func moderationSafeDial(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}

	// 若 host 本身是 IP,直接判断;否则做一次 DNS 解析。
	var ips []net.IP
	if ip := net.ParseIP(host); ip != nil {
		ips = []net.IP{ip}
	} else {
		resolved, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil {
			return nil, fmt.Errorf("dns lookup: %w", err)
		}
		ips = resolved
	}

	for _, ip := range ips {
		if !moderationIsPublicIP(ip) {
			return nil, fmt.Errorf("blocked private/internal IP %s for host %s", ip, host)
		}
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("no IP resolved for %s", host)
	}

	// 用第一个解析出的公网 IP 连接,避免 DNS rebinding。
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
}

func moderationIsPublicIP(ip net.IP) bool {
	if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	if ip4 := ip.To4(); ip4 != nil {
		// RFC1918 / 回环 / 链路本地 / CGNAT
		switch {
		case ip4[0] == 10:
			return false
		case ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31:
			return false
		case ip4[0] == 192 && ip4[1] == 168:
			return false
		case ip4[0] == 127:
			return false
		case ip4[0] == 169 && ip4[1] == 254:
			return false
		case ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127:
			return false
		case ip4[0] == 0:
			return false
		}
		return true
	}
	// IPv6: ULA fc00::/7
	if len(ip) == 16 && ip[0]&0xfe == 0xfc {
		return false
	}
	return true
}

func moderationDownload(ctx context.Context, srcURL string) ([]byte, string, string, error) {
	parsed, err := url.Parse(srcURL)
	if err != nil {
		return nil, "", "", fmt.Errorf("parse url failed: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, "", "", fmt.Errorf("unsupported scheme %q (only http/https allowed)", parsed.Scheme)
	}

	ext := strings.ToLower(path.Ext(parsed.Path))
	if !moderationAllowedExt[ext] {
		return nil, "", "", fmt.Errorf("unsupported file extension %q (allowed: jpeg/jpg/png/webp/bmp/tiff/tif/gif/heic/heif)", ext)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, srcURL, nil)
	if err != nil {
		return nil, "", "", err
	}
	req.Header.Set("User-Agent", "new-api/moderation")

	resp, err := moderationHTTPClient.Do(req)
	if err != nil {
		return nil, "", "", fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", "", fmt.Errorf("download status %d", resp.StatusCode)
	}
	if resp.ContentLength > moderationMaxBytes {
		return nil, "", "", fmt.Errorf("image too large: %d bytes (max %d)", resp.ContentLength, moderationMaxBytes)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, moderationMaxBytes+1))
	if err != nil {
		return nil, "", "", fmt.Errorf("read body failed: %w", err)
	}
	if int64(len(data)) > moderationMaxBytes {
		return nil, "", "", fmt.Errorf("image exceeds %d bytes", moderationMaxBytes)
	}

	filename := path.Base(parsed.Path)
	if filename == "" || filename == "/" || filename == "." {
		filename = "image" + ext
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return data, filename, contentType, nil
}

func moderationUploadToVolcFiles(ctx context.Context, baseURL, apiKey string, payload []byte, filename, contentType string) (string, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if err := writer.WriteField("purpose", "user_data"); err != nil {
		return "", err
	}
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(payload); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}

	uploadURL := baseURL + "/api/v3/files"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upstream files api failed: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("upstream %d: %s", resp.StatusCode, truncateForError(string(respBody), 512))
	}

	var fo struct {
		ID string `json:"id"`
	}
	if err := common.Unmarshal(respBody, &fo); err != nil {
		return "", fmt.Errorf("parse upstream response: %w (body=%s)", err, truncateForError(string(respBody), 256))
	}
	if fo.ID == "" {
		return "", fmt.Errorf("upstream returned empty file id: %s", truncateForError(string(respBody), 256))
	}
	return fo.ID, nil
}

func truncateForError(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func moderationRandomID(prefix string) string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return prefix + fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return prefix + hex.EncodeToString(b[:])
}
