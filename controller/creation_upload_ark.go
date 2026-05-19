package controller

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
)

// UploadCreationVolcAsset 把上传的文件转发到火山方舟 Files API,
// 拿到 file_id 返回给前端,前端用 asset://<file_id> 当 image_url.url 引用。
//
// 火山官方 SDK 的 /files 端点(volcenginesdkarkruntime/resources/files.py):
//   POST {channel.base_url}/api/v3/files
//   Authorization: Bearer {channel.api_key}
//   multipart/form-data:
//     - file:    本地文件
//     - purpose: user_data
//   单文件 ≤ 512 MB,默认存 7 天
//
// 渠道路由策略:
//   - 用户登录身份(UserAuth),拿到 user.Group
//   - 通过 model name 走 GetRandomSatisfiedChannel 选一个能跑该模型的渠道
//   - 用该渠道的 API Key Bearer 鉴权 + Base URL 拼端点
//
// 这样不需要额外 IAM AK/SK,与视频生成共用同一套渠道密钥。
//
// POST /api/creation/upload/volc-asset?model=doubao-seedance-2-0-260128
func UploadCreationVolcAsset(c *gin.Context) {
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

	modelName := strings.TrimSpace(c.Query("model"))
	if modelName == "" {
		respondJSONError(c, http.StatusBadRequest, "missing_model", "缺少 model 参数")
		return
	}

	// 1. 解析文件
	header, err := c.FormFile("file")
	if err != nil {
		respondJSONError(c, http.StatusBadRequest, "missing_file", "未携带文件")
		return
	}
	// 火山限制单文件 512 MB
	const maxBytes = 512 * 1024 * 1024
	if header.Size > maxBytes {
		respondJSONError(c, http.StatusRequestEntityTooLarge, "file_too_large",
			fmt.Sprintf("文件超过 %d MB 上限", maxBytes/1024/1024))
		return
	}

	// 2. 找用户和分组
	user, err := model.GetUserById(userId, false)
	if err != nil || user == nil {
		respondJSONError(c, http.StatusInternalServerError, "user_lookup_failed", "用户查询失败")
		return
	}
	group := user.Group
	if group == "" {
		group = "default"
	}

	// 3. 用 model name 路由到渠道
	allowedChannels := model.ParseAllowedChannels(common.GetContextKeyString(c, constant.ContextKeyUserAllowedChannels))
	channel, err := model.GetRandomSatisfiedChannel(group, modelName, 0, allowedChannels)
	if err != nil || channel == nil {
		respondJSONError(c, http.StatusBadGateway, "no_channel",
			fmt.Sprintf("找不到能服务 %s 的渠道:%v", modelName, err))
		return
	}
	keys := channel.GetKeys()
	if len(keys) == 0 {
		respondJSONError(c, http.StatusBadGateway, "channel_no_key", "渠道未配置密钥")
		return
	}
	apiKey := strings.TrimSpace(keys[0])
	baseURL := strings.TrimRight(channel.GetBaseURL(), "/")
	if baseURL == "" {
		respondJSONError(c, http.StatusBadGateway, "channel_no_baseurl", "渠道未配置 base URL")
		return
	}
	uploadURL := baseURL + "/api/v3/files"

	// 4. 重新打包 multipart body 转发
	src, err := header.Open()
	if err != nil {
		respondJSONError(c, http.StatusInternalServerError, "open_failed", err.Error())
		return
	}
	defer src.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if err := writer.WriteField("purpose", "user_data"); err != nil {
		respondJSONError(c, http.StatusInternalServerError, "build_multipart_failed", err.Error())
		return
	}
	part, err := writer.CreateFormFile("file", header.Filename)
	if err != nil {
		respondJSONError(c, http.StatusInternalServerError, "build_multipart_failed", err.Error())
		return
	}
	if _, err := io.Copy(part, src); err != nil {
		respondJSONError(c, http.StatusInternalServerError, "copy_failed", err.Error())
		return
	}
	if err := writer.Close(); err != nil {
		respondJSONError(c, http.StatusInternalServerError, "multipart_close_failed", err.Error())
		return
	}

	// 5. 转发到火山 Files API
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, uploadURL, body)
	if err != nil {
		respondJSONError(c, http.StatusInternalServerError, "build_request_failed", err.Error())
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		common.SysError("volc asset upload request failed: " + err.Error())
		respondJSONError(c, http.StatusBadGateway, "upstream_failed", err.Error())
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// 火山错误直接透传给客户端,便于排错
		common.SysError(fmt.Sprintf("volc asset upload upstream %d: %s", resp.StatusCode, string(respBody)))
		c.Data(resp.StatusCode, "application/json", respBody)
		return
	}

	// 6. 解析 FileObject + 包装本地友好响应
	var fo struct {
		ID         string `json:"id"`
		Bytes      int    `json:"bytes"`
		ExpireAt   int64  `json:"expire_at"`
		Filename   string `json:"filename"`
		Status     string `json:"status"`
		MimeType   string `json:"mime_type"`
		Object     string `json:"object"`
		Purpose    string `json:"purpose"`
	}
	if err := common.Unmarshal(respBody, &fo); err != nil {
		respondJSONError(c, http.StatusBadGateway, "parse_upstream_failed", err.Error())
		return
	}
	if fo.ID == "" {
		respondJSONError(c, http.StatusBadGateway, "upstream_no_id", "上游未返回 file id")
		return
	}

	// 拼成 asset:// URI(Doubao Seedance 文档明确的引用前缀)
	assetURI := "asset://" + fo.ID

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"id":         fo.ID,
			"asset_url":  assetURI,
			"bytes":      fo.Bytes,
			"expire_at":  fo.ExpireAt,
			"filename":   fo.Filename,
			"status":     fo.Status,
			"mime_type":  fo.MimeType,
			"channel_id": channel.Id,
		},
	})
}
