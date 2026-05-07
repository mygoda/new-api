package helper

import (
	"bytes"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

// 文件用途:把「输入含视频」时的额外乘子(model.VideoInputRatio,admin 在
// 「模型管理」配置)统一应用到所有推理路径的预扣 / 结算上。
//
// 设计:
//   - 用 byte 子串扫描请求体判定是否含 video_url —— 比解析 JSON 便宜,跨格式
//     稳定(OpenAI / Volcengine / 阿里百炼 等多模态聊天通用 type=video_url)
//   - 命中后:priceData.OtherRatios["video_input"] = ratio,QuotaToPreConsume × ratio
//   - 结算阶段:service/text_quota.go 已经会把 OtherRatios 全部相乘进 quota,
//     所以只需正确写入 OtherRatios,无需改结算代码
//
// 触发 markers:OpenAI 兼容协议中的 message content 部分:
//   {"type":"video_url","video_url":{"url":"..."}}
// 也兼容带空格 / 引号位置变化的常见序列化变体。
var videoUrlContentMarkers = [][]byte{
	[]byte(`"type":"video_url"`),
	[]byte(`"type": "video_url"`),
	[]byte(`"type" : "video_url"`),
}

// HasVideoInputInBytes 检查给定 JSON 字节是否包含 type=video_url 的 content 项。
func HasVideoInputInBytes(body []byte) bool {
	if len(body) == 0 {
		return false
	}
	for _, m := range videoUrlContentMarkers {
		if bytes.Contains(body, m) {
			return true
		}
	}
	return false
}

// HasVideoInputInRequestBody 从 gin context 拿可重用 body storage,扫一次。
// 不会消费 body(BodyStorage 支持多次 Bytes())。
func HasVideoInputInRequestBody(c *gin.Context) bool {
	if c == nil {
		return false
	}
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return false
	}
	body, err := storage.Bytes()
	if err != nil {
		return false
	}
	return HasVideoInputInBytes(body)
}

// ApplyVideoInputRatioFromRequest 用于走 ModelPriceHelper / ModelPriceHelperPerCall
// 的所有推理路径(chat / image / responses / audio / mj / task)。
//
// 行为只做 1 件事:写 priceData.OtherRatios["video_input"] = ratio。
// 由调用方决定是否要把它进一步乘进 QuotaToPreConsume / Quota:
//   - 文本/聊天路径:在 ModelPriceHelper 里立即放大 QuotaToPreConsume
//     (text_quota.go 的最终结算会再次自动 ×OtherRatios,所以预扣阶段必须放大,
//      否则用户预扣不足)
//   - 任务路径:relay_task.go 已有"OtherRatios → Quota"统一乘法循环,这里不动
//
// 调用时机:ModelPriceHelper / ModelPriceHelperPerCall 末尾。免费模型直接跳过。
func ApplyVideoInputRatioFromRequest(c *gin.Context, info *relaycommon.RelayInfo, priceData *types.PriceData) {
	if priceData == nil || priceData.FreeModel || info == nil {
		return
	}
	ratio := model.GetModelVideoInputRatio(info.OriginModelName)
	if ratio <= 0 {
		return
	}
	if !HasVideoInputInRequestBody(c) {
		return
	}
	priceData.AddOtherRatio("video_input", ratio)
}

// ApplyVideoInputRatioFromBytes 由 task adapter 在拿到 taskData 后调用。
// 仅写 OtherRatios,Quota 乘法由调用方控制。
func ApplyVideoInputRatioFromBytes(modelName string, taskData []byte, priceData *types.PriceData) {
	if priceData == nil || priceData.FreeModel {
		return
	}
	ratio := model.GetModelVideoInputRatio(modelName)
	if ratio <= 0 {
		return
	}
	if !HasVideoInputInBytes(taskData) {
		return
	}
	priceData.AddOtherRatio("video_input", ratio)
}
