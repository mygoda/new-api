package claude

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"

	"github.com/tidwall/sjson"
)

// 有些逆向/中转 Claude 上游不返回结构化的 tool_use 内容块，而是把工具调用吐成老式文本格式：
//
//	<function_calls>
//	<invoke name="Bash">
//	<parameter name="command">echo hi</parameter>
//	</invoke>
//	</function_calls>
//
// 前端（如 Claude Code）无法把这段文本识别成工具调用，只能渲染成裸 XML。
// 本文件在 Claude 中继响应里检测这种文本格式并转换成结构化 tool_use（流式 + 非流式）。
// 兼容可选的 antml: 命名空间前缀，兼容缺失 <function_calls> 外层包裹、多个 <invoke>。

var (
	invokeRe    = regexp.MustCompile(`(?s)<(?:antml:)?invoke\s+name="([^"]+)"\s*>(.*?)</(?:antml:)?invoke>`)
	paramRe     = regexp.MustCompile(`(?s)<(?:antml:)?parameter\s+name="([^"]+)"\s*>(.*?)</(?:antml:)?parameter>`)
	toolMarker  = regexp.MustCompile(`<(?:antml:)?(?:function_calls|invoke)\b`)
	markerHeads = []string{"<function_calls", "<invoke", "<function_calls", "<invoke"}
)

// coerceParamValue 把文本参数值尽量还原成 JSON 类型（bool/number/object/array），否则按字符串。
func coerceParamValue(s string) any {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return s
	}
	switch trimmed[0] {
	case '{', '[', 't', 'f', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9':
		var v any
		if err := common.UnmarshalJsonStr(trimmed, &v); err == nil {
			switch v.(type) {
			case bool, float64, map[string]any, []any:
				return v
			}
		}
	}
	return s
}

// parseTextInvokes 从文本里解析出所有 <invoke> 工具调用，转成 tool_use 内容块。
func parseTextInvokes(text string) ([]dto.ClaudeMediaMessage, bool) {
	matches := invokeRe.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return nil, false
	}
	blocks := make([]dto.ClaudeMediaMessage, 0, len(matches))
	for _, m := range matches {
		name := m[1]
		body := m[2]
		input := map[string]any{}
		for _, p := range paramRe.FindAllStringSubmatch(body, -1) {
			input[p[1]] = coerceParamValue(p[2])
		}
		blocks = append(blocks, dto.ClaudeMediaMessage{
			Type:  "tool_use",
			Id:    "toolu_" + common.GetRandomString(24),
			Name:  name,
			Input: input,
		})
	}
	return blocks, true
}

// convertClaudeTextToolCalls 非流式：把整条 message 响应里含文本工具调用的 text 块替换成 tool_use 块。
func convertClaudeTextToolCalls(resp *dto.ClaudeResponse) bool {
	if resp.Type != "message" || len(resp.Content) == 0 {
		return false
	}
	changed := false
	newContent := make([]dto.ClaudeMediaMessage, 0, len(resp.Content))
	for _, block := range resp.Content {
		if block.Type == "text" && block.Text != nil {
			if blocks, ok := parseTextInvokes(*block.Text); ok {
				// 保留工具调用前的正常文本（若有）
				if loc := toolMarker.FindStringIndex(*block.Text); loc != nil && loc[0] > 0 {
					if lead := strings.TrimRight((*block.Text)[:loc[0]], " \n\t"); lead != "" {
						lt := lead
						newContent = append(newContent, dto.ClaudeMediaMessage{Type: "text", Text: &lt})
					}
				}
				newContent = append(newContent, blocks...)
				changed = true
				continue
			}
		}
		newContent = append(newContent, block)
	}
	if changed {
		resp.Content = newContent
		resp.StopReason = "tool_use"
	}
	return changed
}

// ---- 流式 filter ----

type claudeEmit struct {
	event string
	data  string
}

// claudeTextToolFilter 流式拦截：正常文本几乎零改动（只在末尾出现可能是标记前缀的 "<..." 时短暂 hold），
// 一旦检测到 <function_calls>/<invoke> 标记就进入捕获模式，累积到 content_block_stop 再解析成 tool_use 事件。
type claudeTextToolFilter struct {
	inText    bool
	capturing bool
	tail      string          // 当前 text 块里尚未下发的尾巴
	capBuf    strings.Builder // 捕获中的工具调用 XML
	converted bool            // 是否已转换出 tool_use（用于把 message_delta 的 stop_reason 改成 tool_use）
	curIndex  int             // 当前 text 块的 index
	nextIndex int             // 下一个合成 tool_use 块要用的 index
}

// markerPrefixHold 返回 s 末尾「可能是标记开头」的部分长度（如结尾是 "<inv"），用于 hold 住避免跨 delta 漏检。
func markerPrefixHold(s string) int {
	lt := strings.LastIndexByte(s, '<')
	if lt < 0 {
		return 0
	}
	cand := s[lt:]
	for _, m := range markerHeads {
		if len(cand) < len(m) && strings.HasPrefix(m, cand) {
			return len(cand)
		}
	}
	return 0
}

func (f *claudeTextToolFilter) process(resp *dto.ClaudeResponse, raw string) []claudeEmit {
	passthrough := []claudeEmit{{resp.Type, raw}}
	switch resp.Type {
	case "content_block_start":
		idx := resp.GetIndex()
		if idx >= f.nextIndex {
			f.nextIndex = idx + 1
		}
		if resp.ContentBlock != nil && resp.ContentBlock.Type == "text" {
			f.inText = true
			f.capturing = false
			f.tail = ""
			f.capBuf.Reset()
			f.curIndex = idx
		}
		return passthrough

	case "content_block_delta":
		if !f.inText || resp.Delta == nil || resp.Delta.Type != "text_delta" || resp.Delta.Text == nil {
			return passthrough
		}
		if f.capturing {
			f.capBuf.WriteString(*resp.Delta.Text)
			return nil // 捕获中，抑制原始文本下发
		}
		f.tail += *resp.Delta.Text
		var emits []claudeEmit
		if loc := toolMarker.FindStringIndex(f.tail); loc != nil {
			if before := f.tail[:loc[0]]; before != "" {
				emits = append(emits, textDeltaEmit(f.curIndex, before))
			}
			f.capBuf.WriteString(f.tail[loc[0]:])
			f.tail = ""
			f.capturing = true
			return emits
		}
		hold := markerPrefixHold(f.tail)
		if hold < len(f.tail) {
			emits = append(emits, textDeltaEmit(f.curIndex, f.tail[:len(f.tail)-hold]))
			f.tail = f.tail[len(f.tail)-hold:]
		}
		return emits

	case "content_block_stop":
		if !f.inText {
			return passthrough
		}
		f.inText = false
		if !f.capturing {
			var emits []claudeEmit
			if f.tail != "" {
				emits = append(emits, textDeltaEmit(f.curIndex, f.tail))
				f.tail = ""
			}
			return append(emits, claudeEmit{resp.Type, raw})
		}
		f.capturing = false
		blocks, ok := parseTextInvokes(f.capBuf.String())
		if !ok {
			// 解析失败：原样把捕获到的文本吐出去（不比现状更糟），再关闭文本块
			return []claudeEmit{
				textDeltaEmit(f.curIndex, f.capBuf.String()),
				{resp.Type, raw},
			}
		}
		emits := []claudeEmit{{"content_block_stop", stopData(f.curIndex)}}
		for _, b := range blocks {
			idx := f.nextIndex
			f.nextIndex++
			emits = append(emits, toolUseStartEmit(idx, b), inputJsonDeltaEmit(idx, b.Input), claudeEmit{"content_block_stop", stopData(idx)})
		}
		f.converted = true
		return emits

	case "message_delta":
		if f.converted {
			if newRaw, err := sjson.Set(raw, "delta.stop_reason", "tool_use"); err == nil {
				return []claudeEmit{{resp.Type, newRaw}}
			}
		}
		return passthrough

	default:
		return passthrough
	}
}

func marshalEmit(resp dto.ClaudeResponse) string {
	b, _ := common.Marshal(resp)
	return string(b)
}

func textDeltaEmit(index int, text string) claudeEmit {
	i := index
	t := text
	return claudeEmit{"content_block_delta", marshalEmit(dto.ClaudeResponse{
		Type:  "content_block_delta",
		Index: &i,
		Delta: &dto.ClaudeMediaMessage{Type: "text_delta", Text: &t},
	})}
}

func stopData(index int) string {
	i := index
	return marshalEmit(dto.ClaudeResponse{Type: "content_block_stop", Index: &i})
}

func toolUseStartEmit(index int, b dto.ClaudeMediaMessage) claudeEmit {
	i := index
	return claudeEmit{"content_block_start", marshalEmit(dto.ClaudeResponse{
		Type:  "content_block_start",
		Index: &i,
		ContentBlock: &dto.ClaudeMediaMessage{
			Type:  "tool_use",
			Id:    b.Id,
			Name:  b.Name,
			Input: json.RawMessage("{}"),
		},
	})}
}

func inputJsonDeltaEmit(index int, input any) claudeEmit {
	i := index
	js, _ := common.Marshal(input)
	pj := string(js)
	return claudeEmit{"content_block_delta", marshalEmit(dto.ClaudeResponse{
		Type:  "content_block_delta",
		Index: &i,
		Delta: &dto.ClaudeMediaMessage{Type: "input_json_delta", PartialJson: &pj},
	})}
}
