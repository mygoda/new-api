package service

import "testing"

func TestIsDomesticModel(t *testing.T) {
	domestic := []struct{ vendor, name string }{
		{"DeepSeek", "deepseek-chat"},
		{"阿里云", "qwen-max"},
		{"", "wanx2.1-t2i"},          // Wan pattern
		{"智谱", "glm-4"},              // glm pattern
		{"", "chatglm3-6b"},          // Zhipu keyword
		{"Moonshot", "kimi-k2"},
		{"", "doubao-seedance-2.0"},
		{"腾讯", "hunyuan-turbo"},
		{"百度", "ernie-4.5"},
		{"360", "360gpt-pro"},        // 360 优先于 GPT
		{"", "step-tts-mini"},        // StepFun 优先于 OpenAI tts- fallback
		{"", "text-embedding-v3"},    // Qwen 优先于 OpenAI text-embedding- fallback
		{"", "bge-m3"},               // BAAI
		{"零一万物", "some-alias"},       // 中文兜底
	}
	overseas := []struct{ vendor, name string }{
		{"OpenAI", "gpt-4o"},
		{"OpenAI", "o3-mini"},
		{"Anthropic", "claude-sonnet-4"},
		{"Google", "gemini-2.5-pro"},
		{"Meta", "llama-3.1-70b"},
		{"Mistral", "mistral-large"},
		{"Cohere", "command-r-plus"},
		{"Perplexity", "sonar-pro"},   // sonar 优先于 Llama 家族
		{"", "flux.1-dev"},
		{"", "unknown-model-xyz"},      // 无法识别 → 非国产
	}
	for _, m := range domestic {
		if !isDomesticModel(m.vendor, m.name) {
			t.Errorf("expected domestic: %q / %q", m.vendor, m.name)
		}
	}
	for _, m := range overseas {
		if isDomesticModel(m.vendor, m.name) {
			t.Errorf("expected overseas: %q / %q", m.vendor, m.name)
		}
	}
}

func TestResolveModelProvider(t *testing.T) {
	cases := []struct {
		name     string
		provider string
	}{
		{"gpt-4o", "OpenAI"},
		{"o1-preview", "OpenAI"},
		{"claude-3-5-sonnet", "Anthropic"},
		{"qwen2.5-72b", "Qwen"},
		{"text-embedding-v3", "Qwen"},
		{"glm-4-plus", "Zhipu"},
		{"360gpt-pro", "360 AI"},
		{"sonar-reasoning", "Perplexity"},
		{"nemotron-70b", "NVIDIA"},
	}
	for _, c := range cases {
		got, _, ok := resolveModelProvider(c.name)
		if !ok || got != c.provider {
			t.Errorf("%q: got %q (ok=%v), want %q", c.name, got, ok, c.provider)
		}
	}
}
