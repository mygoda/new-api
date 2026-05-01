package controller

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service/storage"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
)

// UploadImage 处理 POST /api/upload/image
//
// 鉴权：UserAuth（gin session 中要有 id）。
// Form 字段：
//   - file (required, multipart/form-data)
//   - purpose (optional, 例：creation_input)
//
// 返回：
//
//	{
//	  "success": true,
//	  "data": {
//	    "url": "https://...",
//	    "key": "creation/{user}/{nanoid}.png",
//	    "size_bytes": 12345,
//	    "mime": "image/png",
//	    "driver": "s3"
//	  }
//	}
func UploadImage(c *gin.Context) {
	cs := system_setting.GetCreationSetting()
	if !cs.Enabled {
		respondJSONError(c, http.StatusForbidden, "creation_disabled", "创作中心未开启")
		return
	}

	userIdAny, exists := c.Get("id")
	if !exists {
		respondJSONError(c, http.StatusUnauthorized, "unauthorized", "请先登录")
		return
	}
	userId, ok := toInt(userIdAny)
	if !ok || userId <= 0 {
		respondJSONError(c, http.StatusUnauthorized, "unauthorized", "登录态无效")
		return
	}

	header, err := c.FormFile("file")
	if err != nil {
		respondJSONError(c, http.StatusBadRequest, "missing_file", "未携带文件")
		return
	}

	maxBytes := int64(cs.UploadMaxFileMB) * 1024 * 1024
	if maxBytes <= 0 {
		maxBytes = 10 * 1024 * 1024
	}
	if header.Size > maxBytes {
		respondJSONError(c, http.StatusRequestEntityTooLarge, "file_too_large",
			fmt.Sprintf("文件超过 %d MB 上限", cs.UploadMaxFileMB))
		return
	}

	src, err := header.Open()
	if err != nil {
		respondJSONError(c, http.StatusBadRequest, "open_file_failed", err.Error())
		return
	}
	defer src.Close()

	// 嗅探 MIME（基于文件首字节，不信任客户端 Content-Type）
	const sniffSize = 512
	headBuf := make([]byte, sniffSize)
	n, _ := io.ReadFull(src, headBuf)
	headBuf = headBuf[:n]
	mime := http.DetectContentType(headBuf)
	if mime == "application/octet-stream" {
		// 退化使用客户端声明
		if ct := header.Header.Get("Content-Type"); ct != "" {
			mime = ct
		}
	}
	if !cs.IsAllowedMimeType(mime) {
		respondJSONError(c, http.StatusUnsupportedMediaType, "mime_not_allowed",
			fmt.Sprintf("不支持的 MIME：%s", mime))
		return
	}

	// 重新打开文件流（已读了 sniff 头）
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		// 部分实现不支持 seek，重新 open
		_ = src.Close()
		src, err = header.Open()
		if err != nil {
			respondJSONError(c, http.StatusInternalServerError, "reopen_failed", err.Error())
			return
		}
		defer src.Close()
	}

	// 生成 key：{user_id}/{date}/{random}.{ext}
	rand, err := common.GenerateRandomCharsKey(20)
	if err != nil {
		respondJSONError(c, http.StatusInternalServerError, "random_failed", err.Error())
		return
	}
	ext := normalizeExt(header.Filename, mime)
	dateDir := time.Now().UTC().Format("20060102")
	key := fmt.Sprintf("%d/%s/%s%s", userId, dateDir, rand, ext)

	st, err := storage.Get()
	if err != nil {
		respondJSONError(c, http.StatusInternalServerError, "storage_init_failed", err.Error())
		return
	}

	publicURL, err := st.Put(c.Request.Context(), key, src, header.Size, storage.PutOptions{
		ContentType: mime,
	})
	if err != nil {
		common.SysError("upload image failed: " + err.Error())
		respondJSONError(c, http.StatusInternalServerError, "upload_failed", err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"url":        publicURL,
			"key":        key,
			"size_bytes": header.Size,
			"mime":       mime,
			"driver":     st.Driver(),
		},
	})
}

// ServeUploadedFile 仅供 local 驱动回源；S3 模式下不应走到这里。
// GET /api/upload/file/:user_id/:date/:filename
//
// 不强校验请求方身份：与公开图床惯例一致，凭 URL 即可访问；如需更严格请走 S3 + 私桶 + 签名 URL（v2）。
func ServeUploadedFile(c *gin.Context) {
	cs := system_setting.GetCreationSetting()
	if !cs.Enabled {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if cs.UploadDriver != "local" && cs.UploadDriver != "" {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	// 拼回完整 key（gin 的 :user_id/:date/:filename 已分别解析）
	key := strings.TrimPrefix(c.Param("path"), "/")
	if key == "" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if strings.Contains(key, "..") {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	st, err := storage.Get()
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	rc, contentType, err := st.Get(c.Request.Context(), key)
	if err != nil {
		if errors.Is(err, storage.ErrNoSuchKey) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	defer rc.Close()

	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "public, max-age=31536000")
	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, rc); err != nil {
		common.SysError("serve uploaded file io.Copy: " + err.Error())
	}
}

func normalizeExt(filename, mime string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != "" {
		return ext
	}
	switch strings.ToLower(mime) {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	}
	return ""
}

func toInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	}
	return 0, false
}

func respondJSONError(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{
		"success": false,
		"code":    code,
		"message": message,
	})
}
