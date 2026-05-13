package doubao

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

// ============================
// Request / Response structures
// ============================

// ContentItem 对应 PDF "content" 数组中的一项。
// 单项最多承载一个媒体字段(image_url / video_url / audio_url / draft_task)。
type ContentItem struct {
	Type      string     `json:"type"`                  // text / image_url / video_url / audio_url / draft_task
	Text      string     `json:"text,omitempty"`        // type=text
	ImageURL  *MediaURL  `json:"image_url,omitempty"`   // type=image_url
	VideoURL  *MediaURL  `json:"video_url,omitempty"`   // type=video_url (Seedance 2.0)
	AudioURL  *MediaURL  `json:"audio_url,omitempty"`   // type=audio_url (Seedance 2.0)
	DraftTask *DraftTask `json:"draft_task,omitempty"`  // type=draft_task (Seedance 1.5 pro)
	Role      string     `json:"role,omitempty"`        // first_frame / last_frame / reference_image / reference_video / reference_audio
}

// MediaURL 统一承载 image_url / video_url / audio_url 对象。
// 字段语义对齐 PDF：url 可以是公网 URL、Base64 编码或 asset://<ID>。
type MediaURL struct {
	URL string `json:"url"`
}

// DraftTask 用于 Seedance 1.5 pro 基于样片任务 ID 生成正式视频。
type DraftTask struct {
	ID string `json:"id"`
}

// Tool 配置 Seedance 2.0 系列支持的工具调用(目前仅 web_search)。
type Tool struct {
	Type string `json:"type"`
}

type requestPayload struct {
	Model                 string         `json:"model"`
	Content               []ContentItem  `json:"content"`
	CallbackURL           string         `json:"callback_url,omitempty"`
	ReturnLastFrame       *dto.BoolValue `json:"return_last_frame,omitempty"`
	ServiceTier           string         `json:"service_tier,omitempty"`
	ExecutionExpiresAfter dto.IntValue   `json:"execution_expires_after,omitempty"`
	GenerateAudio         *dto.BoolValue `json:"generate_audio,omitempty"`
	Draft                 *dto.BoolValue `json:"draft,omitempty"`
	Tools                 []Tool         `json:"tools,omitempty"`             // Seedance 2.0 系列
	SafetyIdentifier      string         `json:"safety_identifier,omitempty"` // Seedance 2.0 系列
	Resolution            string         `json:"resolution,omitempty"`
	Ratio                 string         `json:"ratio,omitempty"`
	Duration              dto.IntValue   `json:"duration,omitempty"`
	Frames                dto.IntValue   `json:"frames,omitempty"`
	Seed                  dto.IntValue   `json:"seed,omitempty"`
	CameraFixed           *dto.BoolValue `json:"camera_fixed,omitempty"`
	Watermark             *dto.BoolValue `json:"watermark,omitempty"`
}

type responsePayload struct {
	ID string `json:"id"` // task_id
}

type responseTask struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Status  string `json:"status"`
	Content struct {
		VideoURL     string `json:"video_url"`
		LastFrameURL string `json:"last_frame_url,omitempty"` // 仅 return_last_frame=true 时返回
	} `json:"content"`
	Seed            int    `json:"seed"`
	Resolution      string `json:"resolution"`
	Duration        int    `json:"duration"`
	Ratio           string `json:"ratio"`
	FramesPerSecond int    `json:"framespersecond"`
	ServiceTier     string `json:"service_tier"`
	Usage           struct {
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
		// 仅 Seedance 2.0 + 启用 web_search 工具时返回;0 表示未实际触发搜索。
		// PDF 第 12 页:"实际搜索次数可通过查询视频生成任务 API 返回的
		// usage.tool_usage.web_search 字段获取"。
		ToolUsage struct {
			WebSearch int `json:"web_search,omitempty"`
		} `json:"tool_usage,omitempty"`
	} `json:"usage"`
	CreatedAt int64 `json:"created_at"`
	UpdatedAt int64 `json:"updated_at"`
}

// ============================
// Adaptor implementation
// ============================

type TaskAdaptor struct {
	taskcommon.BaseBilling
	ChannelType int
	apiKey      string
	baseURL     string
}

// 本适配器不重写 AdjustBillingOnSubmit / AdjustBillingOnComplete,
// 继承 taskcommon.BaseBilling 的默认空实现:
//   - AdjustBillingOnSubmit 返回 nil(不写 OtherRatios)
//   - AdjustBillingOnComplete 返回 0(走框架默认 token 重算逻辑)
//
// 即所有 Seedance 模型按 model_ratio.go 中配置的基准单价计费,
// 不再按 generate_audio / draft / resolution / 输入是否含视频做条件分价。
// 如需差异化定价,请在「模型管理」为每个具体 model 单独配置 ratio。

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.ChannelType = info.ChannelType
	a.baseURL = info.ChannelBaseUrl
	a.apiKey = info.ApiKey
}

// ValidateRequestAndSetAction parses body, validates fields and sets default action.
func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) (taskErr *dto.TaskError) {
	// Accept only POST /v1/video/generations as "generate" action.
	return relaycommon.ValidateBasicTaskRequest(c, info, constant.TaskActionGenerate)
}

// BuildRequestURL constructs the upstream URL.
func (a *TaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	return fmt.Sprintf("%s/api/v3/contents/generations/tasks", a.baseURL), nil
}

// BuildRequestHeader sets required headers.
func (a *TaskAdaptor) BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	return nil
}

// BuildRequestBody converts request into Doubao specific format.
func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil, err
	}

	body, err := a.convertToRequestPayload(&req)
	if err != nil {
		return nil, errors.Wrap(err, "convert request payload failed")
	}
	if info.IsModelMapped {
		body.Model = info.UpstreamModelName
	} else {
		info.UpstreamModelName = body.Model
	}
	data, err := common.Marshal(body)
	if err != nil {
		return nil, err
	}
	// 把最终请求体字节落到 RelayInfo,供 BaseBilling.AdjustBillingOnSubmit
	// 的条件分价 v2 维度提取(resolution / has_video_input / ...)读取。
	info.UpstreamRequestBody = data
	return bytes.NewReader(data), nil
}

// DoRequest delegates to common helper.
func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

// DoResponse handles upstream response, returns taskID etc.
func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, taskErr *dto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		taskErr = service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
		return
	}
	_ = resp.Body.Close()

	// Parse Doubao response
	var dResp responsePayload
	if err := common.Unmarshal(responseBody, &dResp); err != nil {
		taskErr = service.TaskErrorWrapper(errors.Wrapf(err, "body: %s", responseBody), "unmarshal_response_body_failed", http.StatusInternalServerError)
		return
	}

	if dResp.ID == "" {
		taskErr = service.TaskErrorWrapper(fmt.Errorf("task_id is empty"), "invalid_response", http.StatusInternalServerError)
		return
	}

	ov := dto.NewOpenAIVideo()
	ov.ID = info.PublicTaskID
	ov.TaskID = info.PublicTaskID
	ov.CreatedAt = time.Now().Unix()
	ov.Model = info.OriginModelName

	c.JSON(http.StatusOK, ov)
	return dResp.ID, responseBody, nil
}

// FetchTask fetch task status
func (a *TaskAdaptor) FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid task_id")
	}

	uri := fmt.Sprintf("%s/api/v3/contents/generations/tasks/%s", baseUrl, taskID)

	req, err := http.NewRequest(http.MethodGet, uri, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}

func (a *TaskAdaptor) GetModelList() []string {
	return ModelList
}

func (a *TaskAdaptor) GetChannelName() string {
	return ChannelName
}

func (a *TaskAdaptor) convertToRequestPayload(req *relaycommon.TaskSubmitReq) (*requestPayload, error) {
	r := requestPayload{
		Model:   req.Model,
		Content: []ContentItem{},
	}

	// 1. text
	if req.Prompt != "" {
		r.Content = append(r.Content, ContentItem{
			Type: "text",
			Text: req.Prompt,
		})
	}

	// 2. images (含 role:first_frame / last_frame / reference_image,role 可空,由调用方按需指定)
	if req.HasImage() {
		for i, imgURL := range req.Images {
			role := ""
			if i < len(req.ImageRoles) {
				role = req.ImageRoles[i]
			}
			r.Content = append(r.Content, ContentItem{
				Type:     "image_url",
				ImageURL: &MediaURL{URL: imgURL},
				Role:     role,
			})
		}
	}

	// 3. videos — Seedance 2.0 系列参考视频,role 固定 reference_video
	for _, vURL := range req.Videos {
		r.Content = append(r.Content, ContentItem{
			Type:     "video_url",
			VideoURL: &MediaURL{URL: vURL},
			Role:     "reference_video",
		})
	}

	// 4. audios — Seedance 2.0 系列参考音频,role 固定 reference_audio
	for _, aURL := range req.Audios {
		r.Content = append(r.Content, ContentItem{
			Type:     "audio_url",
			AudioURL: &MediaURL{URL: aURL},
			Role:     "reference_audio",
		})
	}

	// 5. metadata 整段反序列化覆盖。
	//    保留原有契约:用户可在 metadata 里传入完整 content 数组 / tools / safety_identifier
	//    等 PDF 字段以覆盖上面默认装配的内容。
	//    先把 metadata 里的字段塞进 r,再用顶层字段做兜底覆盖。
	metadata := req.Metadata
	if err := taskcommon.UnmarshalMetadata(metadata, &r); err != nil {
		return nil, errors.Wrap(err, "unmarshal metadata failed")
	}

	// 6. duration 兜底:前端 normalizer 在 body 顶层有 duration,而历史上这字段
	//    未必进 metadata。fall back 保证两端都能用。
	if req.Duration != 0 && r.Duration == 0 {
		r.Duration = dto.IntValue(req.Duration)
	}

	return &r, nil
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	resTask := responseTask{}
	if err := common.Unmarshal(respBody, &resTask); err != nil {
		return nil, errors.Wrap(err, "unmarshal task result failed")
	}

	taskResult := relaycommon.TaskInfo{
		Code: 0,
	}

	// Map Doubao status to internal status
	switch resTask.Status {
	case "pending", "queued":
		taskResult.Status = model.TaskStatusQueued
		taskResult.Progress = "10%"
	case "processing", "running":
		taskResult.Status = model.TaskStatusInProgress
		taskResult.Progress = "50%"
	case "succeeded":
		taskResult.Status = model.TaskStatusSuccess
		taskResult.Progress = "100%"
		taskResult.Url = resTask.Content.VideoURL
		// 解析 usage 信息用于按倍率计费
		taskResult.CompletionTokens = resTask.Usage.CompletionTokens
		taskResult.TotalTokens = resTask.Usage.TotalTokens
	case "failed":
		taskResult.Status = model.TaskStatusFailure
		taskResult.Progress = "100%"
		taskResult.Reason = "task failed"
	default:
		// Unknown status, treat as processing
		taskResult.Status = model.TaskStatusInProgress
		taskResult.Progress = "30%"
	}

	return &taskResult, nil
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(originTask *model.Task) ([]byte, error) {
	var dResp responseTask
	if err := common.Unmarshal(originTask.Data, &dResp); err != nil {
		return nil, errors.Wrap(err, "unmarshal doubao task data failed")
	}

	openAIVideo := dto.NewOpenAIVideo()
	openAIVideo.ID = originTask.TaskID
	openAIVideo.TaskID = originTask.TaskID
	openAIVideo.Status = originTask.Status.ToVideoStatus()
	openAIVideo.SetProgressStr(originTask.Progress)
	openAIVideo.SetMetadata("url", dResp.Content.VideoURL)
	// Seedance 扩展字段:return_last_frame=true 时上游回 last_frame_url,
	// 暴露给前端便于长视频拼接(下一段视频用本段尾帧做首帧)。
	if dResp.Content.LastFrameURL != "" {
		openAIVideo.SetMetadata("last_frame_url", dResp.Content.LastFrameURL)
	}
	// 联网搜索实际命中次数(仅 Seedance 2.0 + 启用 web_search 时);PDF 计费用,
	// 同时也方便用户回看是否真的触发了搜索。
	if dResp.Usage.ToolUsage.WebSearch > 0 {
		openAIVideo.SetMetadata("web_search_count", dResp.Usage.ToolUsage.WebSearch)
	}
	openAIVideo.CreatedAt = originTask.CreatedAt
	openAIVideo.CompletedAt = originTask.UpdatedAt
	openAIVideo.Model = originTask.Properties.OriginModelName

	if dResp.Status == "failed" {
		openAIVideo.Error = &dto.OpenAIVideoError{
			Message: "task failed",
			Code:    "failed",
		}
	}

	return common.Marshal(openAIVideo)
}
