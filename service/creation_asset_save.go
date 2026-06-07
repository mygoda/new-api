package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service/storage"

	"github.com/gin-gonic/gin"
)

// isCreationRequest 判断本次请求是否来自创作中心。
// 主信号:创作中心前端在 relay 请求上携带的 X-NewAPI-Creation 头;
// 兼容信号:创作中心默认 token 名 creation-default(兼容尚未刷新拿到新头的旧前端缓存)。
func isCreationRequest(c *gin.Context) bool {
	if c.GetHeader("X-NewAPI-Creation") != "" {
		return true
	}
	return c.GetString("token_name") == "creation-default"
}

// SaveCreationImageAsset 在同步图片生成成功后,由服务端把生成结果落库为创作资产。
//
// 服务端是创作中心同步图的唯一落库方(前端不再为同步图重复落库),因此:
//   - 客户端断连(前端拿不到响应)时,图也不会丢;
//   - gpt-image 等只返回 base64 的模型,由服务端把 b64 存进对象存储后落库短 URL,
//     避免超长 data URI 撑爆 creation_assets.asset_url(varchar 2048)。
//
// 全程 best-effort:任何失败只记日志,绝不影响主响应/计费。
func SaveCreationImageAsset(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ImageRequest, imageN uint, quality string) {
	// 仅处理创作中心请求,避免污染普通 API 用户的作品库。
	if !isCreationRequest(c) || request == nil {
		return
	}

	// 解析已捕获的上游响应体,取出图片 URL / b64。
	content := common.GetContextKeyString(c, constant.ContextKeyResponseContent)
	if content == "" {
		return
	}
	var resp dto.ImageResponse
	if err := common.UnmarshalJsonStr(content, &resp); err != nil {
		logger.LogWarn(c, fmt.Sprintf("creation save: parse image response failed: %s", err.Error()))
		return
	}
	if len(resp.Data) == 0 {
		return
	}

	// 参数(与前端 params 对齐:n / size / quality)。
	params := map[string]interface{}{
		"n":       imageN,
		"size":    request.Size,
		"quality": quality,
	}
	paramsJSON, _ := common.Marshal(params)

	userId := info.UserId
	saved := 0
	for _, d := range resp.Data {
		url := strings.TrimSpace(d.Url)
		if url == "" && d.B64Json != "" {
			stored, err := storeBase64Image(userId, d.B64Json)
			if err != nil {
				logger.LogWarn(c, fmt.Sprintf("creation save: store b64 image failed: %s", err.Error()))
				continue
			}
			url = stored
		}
		if url == "" {
			continue
		}
		asset := model.CreationAsset{
			UserID:    userId,
			Modality:  "image",
			ModelName: info.OriginModelName,
			Prompt:    request.Prompt,
			AssetURL:  url,
			Status:    "success",
			Params:    string(paramsJSON),
		}
		if err := model.DB.Create(&asset).Error; err != nil {
			logger.LogWarn(c, fmt.Sprintf("creation save: insert asset failed: %s", err.Error()))
			continue
		}
		saved++
	}
	if saved > 0 {
		logger.LogInfo(c, fmt.Sprintf("creation save: 服务端落库 %d 张图片作品 (user=%d, model=%s)", saved, userId, info.OriginModelName))
	}
}

// storeBase64Image 把一张 base64 图片解码后写入对象存储(local / s3),返回外部可访问 URL。
// 复用与 /api/upload/image 相同的 storage 抽象与 key 规则。
func storeBase64Image(userId int, b64 string) (string, error) {
	// 兼容 data URI 前缀(data:image/png;base64,xxxx)。
	if strings.HasPrefix(b64, "data:") {
		if idx := strings.Index(b64, ","); idx != -1 {
			b64 = b64[idx+1:]
		}
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
	if err != nil {
		return "", err
	}
	if len(data) == 0 {
		return "", fmt.Errorf("empty image data")
	}

	mime := http.DetectContentType(data)
	ext := extFromImageMime(mime)
	rand, err := common.GenerateRandomCharsKey(20)
	if err != nil {
		return "", err
	}
	dateDir := time.Now().UTC().Format("20060102")
	key := fmt.Sprintf("%d/%s/%s%s", userId, dateDir, rand, ext)

	st, err := storage.Get()
	if err != nil {
		return "", err
	}
	// 用 context.Background():落库可能晚于请求结束,不能用会被取消的请求 context。
	return st.Put(context.Background(), key, bytes.NewReader(data), int64(len(data)), storage.PutOptions{
		ContentType: mime,
	})
}

func extFromImageMime(mime string) string {
	switch {
	case strings.Contains(mime, "jpeg"):
		return ".jpg"
	case strings.Contains(mime, "webp"):
		return ".webp"
	case strings.Contains(mime, "gif"):
		return ".gif"
	default:
		return ".png"
	}
}
