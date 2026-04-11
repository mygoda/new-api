package types

import (
	"errors"
	"testing"
)

func TestSanitizeForUser_Nil(t *testing.T) {
	var e *NewAPIError
	e.SanitizeForUser() // should not panic
}

func TestSanitizeForUser_UserVisibleErrorCodes(t *testing.T) {
	visibleCodes := []ErrorCode{
		ErrorCodeInvalidRequest,
		ErrorCodeBadRequestBody,
		ErrorCodeReadRequestBodyFailed,
		ErrorCodeConvertRequestFailed,
		ErrorCodeInsufficientUserQuota,
		ErrorCodePreConsumeTokenQuotaFailed,
		ErrorCodeModelNotFound,
		ErrorCodePromptBlocked,
		ErrorCodeEmptyResponse,
		ErrorCodeSensitiveWordsDetected,
		ErrorCodeAccessDenied,
		ErrorCodeViolationFeeGrokCSAM,
		ErrorCodeCountTokenFailed,
		ErrorCodeModelPriceError,
	}
	for _, code := range visibleCodes {
		t.Run(string(code), func(t *testing.T) {
			original := "original detailed error message"
			e := &NewAPIError{
				Err:       errors.New(original),
				errorCode: code,
				errorType: ErrorTypeNewAPIError,
			}
			e.SanitizeForUser()
			if e.Error() != original {
				t.Errorf("expected message to be preserved for code %s, got %q", code, e.Error())
			}
		})
	}
}

func TestSanitizeForUser_InternalErrorCodes(t *testing.T) {
	tests := []struct {
		code    ErrorCode
		wantMsg string
	}{
		{ErrorCodeChannelNoAvailableKey, "请求处理失败，请稍后重试或联系管理员"},
		{ErrorCodeChannelParamOverrideInvalid, "请求处理失败，请稍后重试或联系管理员"},
		{ErrorCodeChannelModelMappedError, "请求处理失败，请稍后重试或联系管理员"},
		{ErrorCodeChannelAwsClientError, "请求处理失败，请稍后重试或联系管理员"},
		{ErrorCodeChannelInvalidKey, "请求处理失败，请稍后重试或联系管理员"},
		{ErrorCodeDoRequestFailed, "请求上游服务失败，请稍后重试"},
		{ErrorCodeGetChannelFailed, "当前无可用渠道，请稍后重试"},
		{ErrorCodeGenRelayInfoFailed, "请求处理失败，请稍后重试或联系管理员"},
		{ErrorCodeReadResponseBodyFailed, "上游服务响应异常，请稍后重试"},
		{ErrorCodeBadResponse, "上游服务响应异常，请稍后重试"},
		{ErrorCodeBadResponseBody, "上游服务响应异常，请稍后重试"},
		{ErrorCodeAwsInvokeError, "请求上游服务失败，请稍后重试"},
	}
	for _, tt := range tests {
		t.Run(string(tt.code), func(t *testing.T) {
			e := &NewAPIError{
				Err:       errors.New("Incorrect API key provided: sk-xxxx"),
				errorCode: tt.code,
				errorType: ErrorTypeNewAPIError,
			}
			e.SanitizeForUser()
			if e.Error() != tt.wantMsg {
				t.Errorf("code %s: got %q, want %q", tt.code, e.Error(), tt.wantMsg)
			}
		})
	}
}

func TestSanitizeForUser_UpstreamStatus401(t *testing.T) {
	e := WithOpenAIError(OpenAIError{
		Message: "Incorrect API key provided: sk-proj-xxx",
		Type:    "authentication_error",
		Code:    "invalid_api_key",
	}, 401)
	e.SanitizeForUser()
	if e.Error() == "Incorrect API key provided: sk-proj-xxx" {
		t.Error("expected message to be sanitized for 401 upstream error")
	}
	want := "上游服务认证失败，请联系管理员"
	if e.Error() != want {
		t.Errorf("got %q, want %q", e.Error(), want)
	}
}

func TestSanitizeForUser_UpstreamStatus429(t *testing.T) {
	original := "Rate limit exceeded: too many requests"
	e := WithOpenAIError(OpenAIError{
		Message: original,
		Type:    "rate_limit_error",
		Code:    "rate_limit_exceeded",
	}, 429)
	e.SanitizeForUser()
	if e.Error() != original {
		t.Errorf("429 rate limit message should be preserved, got %q", e.Error())
	}
}

func TestSanitizeForUser_UpstreamStatus500(t *testing.T) {
	e := WithOpenAIError(OpenAIError{
		Message: "Internal server error at api.openai.com",
		Type:    "server_error",
		Code:    "server_error",
	}, 500)
	e.SanitizeForUser()
	want := "上游服务暂时不可用，请稍后重试"
	if e.Error() != want {
		t.Errorf("got %q, want %q", e.Error(), want)
	}
}

func TestSanitizeForUser_UpstreamStatus400_UserError(t *testing.T) {
	original := "This model's maximum context length is 128000 tokens"
	e := WithOpenAIError(OpenAIError{
		Message: original,
		Type:    "invalid_request_error",
		Code:    "context_length_exceeded",
	}, 400)
	e.SanitizeForUser()
	if e.Error() != original {
		t.Errorf("400 user error should be preserved, got %q", e.Error())
	}
}

func TestSanitizeForUser_UpstreamAuthErrorAs400(t *testing.T) {
	// Some providers return auth errors as 400 with authentication_error type
	e := WithOpenAIError(OpenAIError{
		Message: "Your API key is not valid for this organization",
		Type:    "authentication_error",
		Code:    "invalid_api_key",
	}, 400)
	e.SanitizeForUser()
	if e.Error() == "Your API key is not valid for this organization" {
		t.Error("auth error disguised as 400 should still be sanitized")
	}
}

func TestSanitizeForUser_UpstreamStatus403(t *testing.T) {
	e := WithOpenAIError(OpenAIError{
		Message: "You have been blocked by the provider",
		Type:    "permission_error",
		Code:    "forbidden",
	}, 403)
	e.SanitizeForUser()
	want := "上游服务认证失败，请联系管理员"
	if e.Error() != want {
		t.Errorf("got %q, want %q", e.Error(), want)
	}
}

func TestSanitizeForUser_RelayErrorAlsoSanitized(t *testing.T) {
	e := WithOpenAIError(OpenAIError{
		Message: "Incorrect API key provided",
		Type:    "authentication_error",
		Code:    "invalid_api_key",
	}, 401)
	e.SanitizeForUser()
	oaiErr := e.ToOpenAIError()
	if oaiErr.Message == "Incorrect API key provided" {
		t.Error("RelayError OpenAIError.Message should also be sanitized")
	}
}

func TestSanitizeForUser_MetadataCleared(t *testing.T) {
	e := WithOpenAIError(OpenAIError{
		Message:  "error from openrouter",
		Type:     "authentication_error",
		Code:     "invalid_api_key",
		Metadata: []byte(`{"provider": "openai"}`),
	}, 401)
	e.SanitizeForUser()
	if e.Metadata != nil {
		t.Error("Metadata should be cleared for internal errors")
	}
	oaiErr, ok := e.RelayError.(OpenAIError)
	if ok && oaiErr.Metadata != nil {
		t.Error("RelayError.Metadata should be cleared for internal errors")
	}
}

func TestSanitizeForUser_ClaudeError(t *testing.T) {
	e := WithClaudeError(ClaudeError{
		Message: "Your API key does not have access",
		Type:    "authentication_error",
	}, 401)
	e.SanitizeForUser()
	want := "上游服务认证失败，请联系管理员"
	if e.Error() != want {
		t.Errorf("got %q, want %q", e.Error(), want)
	}
	claudeErr, ok := e.RelayError.(ClaudeError)
	if ok && claudeErr.Message != want {
		t.Errorf("ClaudeError.Message: got %q, want %q", claudeErr.Message, want)
	}
}

func TestSanitizeForUser_UpstreamTimeout(t *testing.T) {
	for _, code := range []int{408, 504, 524} {
		t.Run("status_"+string(rune('0'+code/100))+string(rune('0'+code%100/10))+string(rune('0'+code%10)), func(t *testing.T) {
			e := WithOpenAIError(OpenAIError{
				Message: "Request timed out connecting to upstream",
				Type:    "upstream_error",
				Code:    "timeout",
			}, code)
			e.SanitizeForUser()
			want := "上游服务响应超时，请稍后重试"
			if e.Error() != want {
				t.Errorf("status %d: got %q, want %q", code, e.Error(), want)
			}
		})
	}
}
