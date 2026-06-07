package service

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/gin-gonic/gin"
)

// creationAssetMaxURLLen 与 creation_assets.asset_url 列长度(varchar 2048)保持一致。
const creationAssetMaxURLLen = 2048

// isCreationRequest 判断本次请求是否来自创作中心。
// 主信号:创作中心前端在 relay 请求上携带的 X-NewAPI-Creation 头;
// 兼容信号:创作中心默认 token 名 creation-default(兼容尚未刷新拿到新头的旧前端缓存)。
func isCreationRequest(c *gin.Context) bool {
	if c.GetHeader("X-NewAPI-Creation") != "" {
		return true
	}
	return c.GetString("token_name") == "creation-default"
}

// SaveCreationImageAssetOnDisconnect 在「同步图片生成成功、但向客户端写响应时发生断连」的情况下,
// 由服务端兜底把生成的图片落库为创作资产,避免用户已付费的图因前端没收到响应而丢失、不显示。
//
// 设计上与前端落库互斥:客户端正常收到响应时不会进入本函数(未断连),由前端 createCloudAsset 落库;
// 仅在断连时服务端兜底,因此不会产生重复记录。全程 best-effort,任何失败只记日志,绝不影响主响应/计费。
func SaveCreationImageAssetOnDisconnect(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ImageRequest, imageN uint, quality string) {
	// 1. 仅在客户端断连时兜底;未断连说明前端已拿到响应并自行落库。
	if !common.GetContextKeyBool(c, constant.ContextKeyClientDisconnected) {
		return
	}
	// 2. 仅处理创作中心请求,避免污染普通 API 用户的作品库。
	if !isCreationRequest(c) {
		return
	}
	if request == nil {
		return
	}

	// 3. 解析已捕获的上游响应体,取出图片 URL / b64。
	content := common.GetContextKeyString(c, constant.ContextKeyResponseContent)
	if content == "" {
		return
	}
	var resp dto.ImageResponse
	if err := common.UnmarshalJsonStr(content, &resp); err != nil {
		logger.LogWarn(c, fmt.Sprintf("creation fallback: parse image response failed: %s", err.Error()))
		return
	}
	if len(resp.Data) == 0 {
		return
	}

	// 4. 组装参数(与前端 params 对齐:n / size / quality)。
	params := map[string]interface{}{
		"n":       imageN,
		"size":    request.Size,
		"quality": quality,
	}
	paramsJSON, _ := common.Marshal(params)

	// 5. 逐张落库。
	saved := 0
	for _, d := range resp.Data {
		url := d.Url
		if url == "" && d.B64Json != "" {
			dataURI := "data:image/png;base64," + d.B64Json
			if len(dataURI) > creationAssetMaxURLLen {
				logger.LogWarn(c, "creation fallback: skip b64 image exceeding asset_url length limit")
				continue
			}
			url = dataURI
		}
		if strings.TrimSpace(url) == "" {
			continue
		}
		asset := model.CreationAsset{
			UserID:    info.UserId,
			Modality:  "image",
			ModelName: info.OriginModelName,
			Prompt:    request.Prompt,
			AssetURL:  url,
			Status:    "success",
			Params:    string(paramsJSON),
		}
		if err := model.DB.Create(&asset).Error; err != nil {
			logger.LogWarn(c, fmt.Sprintf("creation fallback: save asset failed: %s", err.Error()))
			continue
		}
		saved++
	}
	if saved > 0 {
		logger.LogInfo(c, fmt.Sprintf("creation fallback: 客户端断连,服务端兜底落库 %d 张图片作品 (user=%d, model=%s)", saved, info.UserId, info.OriginModelName))
	}
}
