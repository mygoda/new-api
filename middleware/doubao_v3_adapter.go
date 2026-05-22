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
		unifiedReq := map[string]interface{}{
			"model":    model,
			"prompt":   "",
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

		c.Request.Body = io.NopCloser(bytes.NewBuffer(jsonData))
		c.Request.ContentLength = int64(len(jsonData))
		c.Set(common.KeyRequestBody, jsonData)

		c.Next()
	}
}

// isDoubaoSeedanceModel 仅放行火山 Doubao Seedance 系列模型走 v3 路径。
// 其它模型（gpt-/claude-/sora 等）必须走 /v1/video/generations。
func isDoubaoSeedanceModel(model string) bool {
	m := strings.ToLower(model)
	return strings.HasPrefix(m, "doubao-seedance-")
}
