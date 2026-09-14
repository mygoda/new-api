package service

import "testing"

func TestIsDomesticModel(t *testing.T) {
	domestic := []struct{ vendor, name string }{
		{"DeepSeek", "deepseek-chat"},
		{"阿里云", "qwen-max"},
		{"智谱", "glm-4"},
		{"Moonshot", "kimi-k2"},
		{"", "doubao-seedance-2.0"},
		{"腾讯", "hunyuan-turbo"},
		{"百度", "ernie-4.5"},
	}
	overseas := []struct{ vendor, name string }{
		{"OpenAI", "gpt-4o"},
		{"Anthropic", "claude-sonnet-4"},
		{"Google", "gemini-2.5-pro"},
		{"Meta", "llama-3.1"},
		{"Mistral", "mistral-large"},
	}
	for _, m := range domestic {
		if !isDomesticModel(m.vendor, m.name) {
			t.Errorf("expected domestic: %s / %s", m.vendor, m.name)
		}
	}
	for _, m := range overseas {
		if isDomesticModel(m.vendor, m.name) {
			t.Errorf("expected overseas: %s / %s", m.vendor, m.name)
		}
	}
}
