package claude

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

func TestParseTextInvokes(t *testing.T) {
	text := "<function_calls>\n" +
		"<invoke name=\"Bash\">\n" +
		"<parameter name=\"command\">echo hi</parameter>\n" +
		"<parameter name=\"dangerouslyDisableSandbox\">true</parameter>\n" +
		"</invoke>\n</function_calls>"
	blocks, ok := parseTextInvokes(text)
	if !ok || len(blocks) != 1 {
		t.Fatalf("expected 1 block, got ok=%v n=%d", ok, len(blocks))
	}
	b := blocks[0]
	if b.Type != "tool_use" || b.Name != "Bash" || !strings.HasPrefix(b.Id, "toolu_") {
		t.Fatalf("bad block: %+v", b)
	}
	input := b.Input.(map[string]any)
	if input["command"] != "echo hi" {
		t.Fatalf("command=%v", input["command"])
	}
	if input["dangerouslyDisableSandbox"] != true { // bool coercion
		t.Fatalf("bool not coerced: %#v", input["dangerouslyDisableSandbox"])
	}
}

func TestParseTextInvokes_AntmlPrefixAndMultiple(t *testing.T) {
	// 用拼接构造 antml: 命名空间变体，避免源码里出现可被误解析的完整标记
	p := "antml:"
	inv := func(name, inner string) string {
		return "<" + p + "invoke name=\"" + name + "\">" + inner + "</" + p + "invoke>"
	}
	par := func(name, val string) string {
		return "<" + p + "parameter name=\"" + name + "\">" + val + "</" + p + "parameter>"
	}
	text := "pre " + inv("A", par("x", "1")) + "\n" + inv("B", par("y", "hello"))
	blocks, ok := parseTextInvokes(text)
	if !ok || len(blocks) != 2 {
		t.Fatalf("expected 2 blocks, got ok=%v n=%d", ok, len(blocks))
	}
	if blocks[0].Name != "A" || blocks[1].Name != "B" {
		t.Fatalf("names: %s %s", blocks[0].Name, blocks[1].Name)
	}
	if blocks[0].Input.(map[string]any)["x"] != float64(1) { // number coercion
		t.Fatalf("x not coerced to number: %#v", blocks[0].Input)
	}
	if blocks[1].Input.(map[string]any)["y"] != "hello" {
		t.Fatalf("y=%v", blocks[1].Input)
	}
}

func TestParseTextInvokes_NoMatch(t *testing.T) {
	if _, ok := parseTextInvokes("just some normal text with < and > chars"); ok {
		t.Fatal("should not match")
	}
}

func TestConvertClaudeTextToolCalls(t *testing.T) {
	txt := "I'll run it.\n<function_calls>\n<invoke name=\"Bash\">\n<parameter name=\"command\">echo hi</parameter>\n</invoke>\n</function_calls>"
	resp := &dto.ClaudeResponse{
		Type:    "message",
		Content: []dto.ClaudeMediaMessage{{Type: "text", Text: &txt}},
	}
	if !convertClaudeTextToolCalls(resp) {
		t.Fatal("expected conversion")
	}
	if resp.StopReason != "tool_use" {
		t.Fatalf("stop_reason=%s", resp.StopReason)
	}
	// 期望：一个保留的前置文本块 + 一个 tool_use 块
	if len(resp.Content) != 2 || resp.Content[0].Type != "text" || resp.Content[1].Type != "tool_use" {
		t.Fatalf("content=%+v", resp.Content)
	}
	if resp.Content[1].Name != "Bash" {
		t.Fatalf("tool name=%s", resp.Content[1].Name)
	}
}

// feedFilter 把一串事件喂给 filter，返回所有下发数据拼接后的字符串。
func feedFilter(f *claudeTextToolFilter, events []dto.ClaudeResponse) string {
	var sb strings.Builder
	for _, ev := range events {
		raw, _ := common.Marshal(ev)
		for _, e := range f.process(&ev, string(raw)) {
			sb.WriteString("event:" + e.event + "|" + e.data + "\n")
		}
	}
	return sb.String()
}

func idxp(i int) *int { return &i }
func strp(s string) *string { return &s }

func TestFilterStreamConvertsTextToolUse(t *testing.T) {
	f := &claudeTextToolFilter{}
	xml := "<function_calls>\n<invoke name=\"Bash\">\n<parameter name=\"command\">echo hi</parameter>\n</invoke>\n</function_calls>"
	events := []dto.ClaudeResponse{
		{Type: "message_start"},
		{Type: "content_block_start", Index: idxp(0), ContentBlock: &dto.ClaudeMediaMessage{Type: "text", Text: strp("")}},
		{Type: "content_block_delta", Index: idxp(0), Delta: &dto.ClaudeMediaMessage{Type: "text_delta", Text: strp(xml)}},
		{Type: "content_block_stop", Index: idxp(0)},
		{Type: "message_delta", Delta: &dto.ClaudeMediaMessage{Type: "message_delta", StopReason: strp("end_turn")}},
		{Type: "message_stop"},
	}
	out := feedFilter(f, events)
	if !strings.Contains(out, "\"type\":\"tool_use\"") {
		t.Fatalf("no tool_use block emitted:\n%s", out)
	}
	if !strings.Contains(out, "\"name\":\"Bash\"") {
		t.Fatalf("no tool name emitted:\n%s", out)
	}
	if !strings.Contains(out, "input_json_delta") || !strings.Contains(out, "echo hi") {
		t.Fatalf("no input json delta:\n%s", out)
	}
	if !strings.Contains(out, "\"stop_reason\":\"tool_use\"") {
		t.Fatalf("stop_reason not rewritten to tool_use:\n%s", out)
	}
	// 原始 XML 不应作为文本泄漏
	if strings.Contains(out, "text_delta") && strings.Contains(out, "function_calls") {
		t.Fatalf("raw xml leaked as text:\n%s", out)
	}
}

func TestFilterPassthroughNormalText(t *testing.T) {
	f := &claudeTextToolFilter{}
	events := []dto.ClaudeResponse{
		{Type: "content_block_start", Index: idxp(0), ContentBlock: &dto.ClaudeMediaMessage{Type: "text", Text: strp("")}},
		{Type: "content_block_delta", Index: idxp(0), Delta: &dto.ClaudeMediaMessage{Type: "text_delta", Text: strp("Hello, ")}},
		{Type: "content_block_delta", Index: idxp(0), Delta: &dto.ClaudeMediaMessage{Type: "text_delta", Text: strp("world!")}},
		{Type: "content_block_stop", Index: idxp(0)},
	}
	out := feedFilter(f, events)
	if !strings.Contains(out, "Hello, ") || !strings.Contains(out, "world!") {
		t.Fatalf("normal text not passed through:\n%s", out)
	}
	if strings.Contains(out, "tool_use") {
		t.Fatalf("unexpected tool_use for normal text:\n%s", out)
	}
}
