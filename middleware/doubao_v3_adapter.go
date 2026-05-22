package middleware

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

// DoubaoV3RequestConvert 把火山 Doubao 原生
//
//	POST /api/v3/contents/generations/tasks
//	{ "model": "...", "content": [...], "ratio": "16:9", "duration": 5, ... }
//
// 改写为 new-api 内部统一的 TaskSubmitReq 形态：
//
//	{ "model": "...", "prompt": "", "metadata": <原始 body 去掉 model> }
//
// 然后由 doubao TaskAdaptor.convertToRequestPayload 第 5 步 metadata
// 整段反序列化（已有逻辑），把 content / ratio / duration / seed / camera_fixed /
// watermark / generate_audio / callback_url / service_tier 等字段透传到上游。
//
// 此外做一道闸：v3 路径只接 doubao-seedance-* 系列模型，避免用户用 v3 路径调
// GPT / Claude / Sora 等其它模型，造成路由错位、错误难定位。
func DoubaoV3RequestConvert() func(c *gin.Context) {
	return func(c *gin.Context) {
		var originalReq map[string]interface{}
		if err := common.UnmarshalBodyReusable(c, &originalReq); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": gin.H{
					"code":    "invalid_request_body",
					"message": fmt.Sprintf("parse v3 body failed: %s", err.Error()),
				},
			})
			c.Abort()
			return
		}

		model, _ := originalReq["model"].(string)
		if model == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": gin.H{
					"code":    "missing_model",
					"message": "model is required",
				},
			})
			c.Abort()
			return
		}
		if !isDoubaoSeedanceModel(model) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": gin.H{
					"code":    "model_not_allowed",
					"message": fmt.Sprintf("model %q is not allowed on /api/v3/contents/generations/tasks; this endpoint only supports doubao-seedance models, use /v1/video/generations for others", model),
				},
			})
			c.Abort()
			return
		}

		// Build wrapped body: keep model at top level so distributor / model
		// resolution work; stuff everything else into metadata so the existing
		// doubao adaptor metadata-override branch handles passthrough.
		//
		// `prompt` 字段必须非空 — ValidateBasicTaskRequest 在统一管线里强制校验。
		// v3 原生 body 的文本提示词在 content[*].text 内,这里把第一段抽出来
		// 充当 prompt 占位;真正的 content 数组通过 metadata 透传给 doubao
		// adaptor convertToRequestPayload 第 5 步覆盖落地,提取出来的 prompt
		// 在适配器层不会被重复追加(因为 metadata.content 会整段覆盖)。
		extractedPrompt := extractFirstText(originalReq["content"])
		if extractedPrompt == "" {
			// 没有 text content(纯图/视频/音频参考场景)。塞一个占位避免被
			// validator 误拒;占位串不会进入上游请求体。
			extractedPrompt = "(v3 native passthrough)"
		}

		unifiedReq := map[string]interface{}{
			"model":    model,
			"prompt":   extractedPrompt,
			"metadata": originalReq, // includes model (harmless; doubao adaptor reads model from request body separately)
		}

		jsonData, err := common.Marshal(unifiedReq)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": gin.H{
					"code":    "marshal_failed",
					"message": err.Error(),
				},
			})
			c.Abort()
			return
		}

		// Remember the original path style so downstream (DoResponse /
		// RelayTaskFetch) can shape the response back to v3 native instead of
		// the OpenAI Video wrapper.
		c.Set(common.KeyRelayPathStyle, common.RelayPathStyleDoubaoV3)

		// Replace both the gin body reader AND the cached BodyStorage. We must
		// refresh KeyBodyStorage explicitly because UnmarshalBodyReusable above
		// already populated it from the original body; subsequent
		// ValidateBasicTaskRequest reads from KeyBodyStorage and would still
		// see the original (no top-level prompt) without this swap.
		newStorage, err := common.CreateBodyStorage(jsonData)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": gin.H{
					"code":    "rewrap_body_failed",
					"message": err.Error(),
				},
			})
			c.Abort()
			return
		}
		// Close the previous storage if one exists.
		if prev, exists := c.Get(common.KeyBodyStorage); exists && prev != nil {
			if bs, ok := prev.(common.BodyStorage); ok {
				bs.Close()
			}
		}
		c.Set(common.KeyBodyStorage, newStorage)
		c.Set(common.KeyRequestBody, jsonData)
		c.Request.Body = io.NopCloser(bytes.NewBuffer(jsonData))
		c.Request.ContentLength = int64(len(jsonData))

		c.Next()
	}
}

// isDoubaoSeedanceModel 仅放行火山 Doubao Seedance 系列模型走 v3 路径。
// 其它模型（gpt-/claude-/sora 等）必须走 /v1/video/generations。
func isDoubaoSeedanceModel(model string) bool {
	m := strings.ToLower(model)
	return strings.HasPrefix(m, "doubao-seedance-")
}

// extractFirstText 从 v3 content 数组里抽第一段 type=text 的 text 字段，
// 作为通用管线 ValidateBasicTaskRequest 所需的 prompt 占位。
// 找不到返回空串。
func extractFirstText(raw interface{}) string {
	arr, ok := raw.([]interface{})
	if !ok {
		return ""
	}
	for _, item := range arr {
		obj, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		if t, _ := obj["type"].(string); t != "text" {
			continue
		}
		if text, ok := obj["text"].(string); ok && strings.TrimSpace(text) != "" {
			return text
		}
	}
	return ""
}
