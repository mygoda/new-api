package types

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type OpenAIError struct {
	Message  string          `json:"message"`
	Type     string          `json:"type"`
	Param    string          `json:"param"`
	Code     any             `json:"code"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
}

type ClaudeError struct {
	Type    string `json:"type,omitempty"`
	Message string `json:"message,omitempty"`
}

type ErrorType string

const (
	ErrorTypeNewAPIError     ErrorType = "new_api_error"
	ErrorTypeOpenAIError     ErrorType = "openai_error"
	ErrorTypeClaudeError     ErrorType = "claude_error"
	ErrorTypeMidjourneyError ErrorType = "midjourney_error"
	ErrorTypeGeminiError     ErrorType = "gemini_error"
	ErrorTypeRerankError     ErrorType = "rerank_error"
	ErrorTypeUpstreamError   ErrorType = "upstream_error"
)

type ErrorCode string

const (
	ErrorCodeInvalidRequest         ErrorCode = "invalid_request"
	ErrorCodeSensitiveWordsDetected ErrorCode = "sensitive_words_detected"
	ErrorCodeViolationFeeGrokCSAM   ErrorCode = "violation_fee.grok.csam"

	// new api error
	ErrorCodeCountTokenFailed   ErrorCode = "count_token_failed"
	ErrorCodeModelPriceError    ErrorCode = "model_price_error"
	ErrorCodeInvalidApiType     ErrorCode = "invalid_api_type"
	ErrorCodeJsonMarshalFailed  ErrorCode = "json_marshal_failed"
	ErrorCodeDoRequestFailed    ErrorCode = "do_request_failed"
	ErrorCodeGetChannelFailed   ErrorCode = "get_channel_failed"
	ErrorCodeGenRelayInfoFailed ErrorCode = "gen_relay_info_failed"

	// channel error
	ErrorCodeChannelNoAvailableKey        ErrorCode = "channel:no_available_key"
	ErrorCodeChannelParamOverrideInvalid  ErrorCode = "channel:param_override_invalid"
	ErrorCodeChannelHeaderOverrideInvalid ErrorCode = "channel:header_override_invalid"
	ErrorCodeChannelModelMappedError      ErrorCode = "channel:model_mapped_error"
	ErrorCodeChannelAwsClientError        ErrorCode = "channel:aws_client_error"
	ErrorCodeChannelInvalidKey            ErrorCode = "channel:invalid_key"
	ErrorCodeChannelResponseTimeExceeded  ErrorCode = "channel:response_time_exceeded"

	// client request error
	ErrorCodeReadRequestBodyFailed ErrorCode = "read_request_body_failed"
	ErrorCodeConvertRequestFailed  ErrorCode = "convert_request_failed"
	ErrorCodeAccessDenied          ErrorCode = "access_denied"

	// request error
	ErrorCodeBadRequestBody ErrorCode = "bad_request_body"

	// response error
	ErrorCodeReadResponseBodyFailed ErrorCode = "read_response_body_failed"
	ErrorCodeBadResponseStatusCode  ErrorCode = "bad_response_status_code"
	ErrorCodeBadResponse            ErrorCode = "bad_response"
	ErrorCodeBadResponseBody        ErrorCode = "bad_response_body"
	ErrorCodeEmptyResponse          ErrorCode = "empty_response"
	ErrorCodeAwsInvokeError         ErrorCode = "aws_invoke_error"
	ErrorCodeModelNotFound          ErrorCode = "model_not_found"
	ErrorCodePromptBlocked          ErrorCode = "prompt_blocked"

	// sql error
	ErrorCodeQueryDataError  ErrorCode = "query_data_error"
	ErrorCodeUpdateDataError ErrorCode = "update_data_error"

	// quota error
	ErrorCodeInsufficientUserQuota      ErrorCode = "insufficient_user_quota"
	ErrorCodePreConsumeTokenQuotaFailed ErrorCode = "pre_consume_token_quota_failed"
)

type NewAPIError struct {
	Err            error
	RelayError     any
	skipRetry      bool
	recordErrorLog *bool
	errorType      ErrorType
	errorCode      ErrorCode
	StatusCode     int
	Metadata       json.RawMessage
}

// Unwrap enables errors.Is / errors.As to work with NewAPIError by exposing the underlying error.
func (e *NewAPIError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func (e *NewAPIError) GetErrorCode() ErrorCode {
	if e == nil {
		return ""
	}
	return e.errorCode
}

func (e *NewAPIError) GetErrorType() ErrorType {
	if e == nil {
		return ""
	}
	return e.errorType
}

func (e *NewAPIError) Error() string {
	if e == nil {
		return ""
	}
	if e.Err == nil {
		// fallback message when underlying error is missing
		return string(e.errorCode)
	}
	return e.Err.Error()
}

func (e *NewAPIError) ErrorWithStatusCode() string {
	if e == nil {
		return ""
	}
	msg := e.Error()
	if e.StatusCode == 0 {
		return msg
	}
	if msg == "" {
		return fmt.Sprintf("status_code=%d", e.StatusCode)
	}
	return fmt.Sprintf("status_code=%d, %s", e.StatusCode, msg)
}

func (e *NewAPIError) MaskSensitiveError() string {
	if e == nil {
		return ""
	}
	if e.Err == nil {
		return string(e.errorCode)
	}
	errStr := e.Err.Error()
	if e.errorCode == ErrorCodeCountTokenFailed {
		return errStr
	}
	return common.MaskSensitiveInfo(errStr)
}

func (e *NewAPIError) MaskSensitiveErrorWithStatusCode() string {
	if e == nil {
		return ""
	}
	msg := e.MaskSensitiveError()
	if e.StatusCode == 0 {
		return msg
	}
	if msg == "" {
		return fmt.Sprintf("status_code=%d", e.StatusCode)
	}
	return fmt.Sprintf("status_code=%d, %s", e.StatusCode, msg)
}

func (e *NewAPIError) SetMessage(message string) {
	e.Err = errors.New(message)
}

func (e *NewAPIError) ToOpenAIError() OpenAIError {
	var result OpenAIError
	switch e.errorType {
	case ErrorTypeOpenAIError:
		if openAIError, ok := e.RelayError.(OpenAIError); ok {
			result = openAIError
		}
	case ErrorTypeClaudeError:
		if claudeError, ok := e.RelayError.(ClaudeError); ok {
			result = OpenAIError{
				Message: e.Error(),
				Type:    claudeError.Type,
				Param:   "",
				Code:    e.errorCode,
			}
		}
	default:
		result = OpenAIError{
			Message: e.Error(),
			Type:    string(e.errorType),
			Param:   "",
			Code:    e.errorCode,
		}
	}
	if e.errorCode != ErrorCodeCountTokenFailed {
		result.Message = common.MaskSensitiveInfo(result.Message)
	}
	if result.Message == "" {
		result.Message = string(e.errorType)
	}
	return result
}

func (e *NewAPIError) ToClaudeError() ClaudeError {
	var result ClaudeError
	switch e.errorType {
	case ErrorTypeOpenAIError:
		if openAIError, ok := e.RelayError.(OpenAIError); ok {
			result = ClaudeError{
				Message: e.Error(),
				Type:    fmt.Sprintf("%v", openAIError.Code),
			}
		}
	case ErrorTypeClaudeError:
		if claudeError, ok := e.RelayError.(ClaudeError); ok {
			result = claudeError
		}
	default:
		result = ClaudeError{
			Message: e.Error(),
			Type:    string(e.errorType),
		}
	}
	if e.errorCode != ErrorCodeCountTokenFailed {
		result.Message = common.MaskSensitiveInfo(result.Message)
	}
	if result.Message == "" {
		result.Message = string(e.errorType)
	}
	return result
}

type NewAPIErrorOptions func(*NewAPIError)

func NewError(err error, errorCode ErrorCode, ops ...NewAPIErrorOptions) *NewAPIError {
	var newErr *NewAPIError
	// 保留深层传递的 new err
	if errors.As(err, &newErr) {
		for _, op := range ops {
			op(newErr)
		}
		return newErr
	}
	e := &NewAPIError{
		Err:        err,
		RelayError: nil,
		errorType:  ErrorTypeNewAPIError,
		StatusCode: http.StatusInternalServerError,
		errorCode:  errorCode,
	}
	for _, op := range ops {
		op(e)
	}
	return e
}

func NewOpenAIError(err error, errorCode ErrorCode, statusCode int, ops ...NewAPIErrorOptions) *NewAPIError {
	var newErr *NewAPIError
	// 保留深层传递的 new err
	if errors.As(err, &newErr) {
		if newErr.RelayError == nil {
			openaiError := OpenAIError{
				Message: newErr.Error(),
				Type:    string(errorCode),
				Code:    errorCode,
			}
			newErr.RelayError = openaiError
		}
		for _, op := range ops {
			op(newErr)
		}
		return newErr
	}
	openaiError := OpenAIError{
		Message: err.Error(),
		Type:    string(errorCode),
		Code:    errorCode,
	}
	return WithOpenAIError(openaiError, statusCode, ops...)
}

func InitOpenAIError(errorCode ErrorCode, statusCode int, ops ...NewAPIErrorOptions) *NewAPIError {
	openaiError := OpenAIError{
		Type: string(errorCode),
		Code: errorCode,
	}
	return WithOpenAIError(openaiError, statusCode, ops...)
}

func NewErrorWithStatusCode(err error, errorCode ErrorCode, statusCode int, ops ...NewAPIErrorOptions) *NewAPIError {
	e := &NewAPIError{
		Err: err,
		RelayError: OpenAIError{
			Message: err.Error(),
			Type:    string(errorCode),
		},
		errorType:  ErrorTypeNewAPIError,
		StatusCode: statusCode,
		errorCode:  errorCode,
	}
	for _, op := range ops {
		op(e)
	}

	return e
}

func WithOpenAIError(openAIError OpenAIError, statusCode int, ops ...NewAPIErrorOptions) *NewAPIError {
	code, ok := openAIError.Code.(string)
	if !ok {
		if openAIError.Code != nil {
			code = fmt.Sprintf("%v", openAIError.Code)
		} else {
			code = "unknown_error"
		}
	}
	if openAIError.Type == "" {
		openAIError.Type = "upstream_error"
	}
	e := &NewAPIError{
		RelayError: openAIError,
		errorType:  ErrorTypeOpenAIError,
		StatusCode: statusCode,
		Err:        errors.New(openAIError.Message),
		errorCode:  ErrorCode(code),
	}
	// OpenRouter
	if len(openAIError.Metadata) > 0 {
		openAIError.Message = fmt.Sprintf("%s (%s)", openAIError.Message, openAIError.Metadata)
		e.Metadata = openAIError.Metadata
		e.RelayError = openAIError
		e.Err = errors.New(openAIError.Message)
	}
	for _, op := range ops {
		op(e)
	}
	return e
}

func WithClaudeError(claudeError ClaudeError, statusCode int, ops ...NewAPIErrorOptions) *NewAPIError {
	if claudeError.Type == "" {
		claudeError.Type = "upstream_error"
	}
	e := &NewAPIError{
		RelayError: claudeError,
		errorType:  ErrorTypeClaudeError,
		StatusCode: statusCode,
		Err:        errors.New(claudeError.Message),
		errorCode:  ErrorCode(claudeError.Type),
	}
	for _, op := range ops {
		op(e)
	}
	return e
}

func IsChannelError(err *NewAPIError) bool {
	if err == nil {
		return false
	}
	return strings.HasPrefix(string(err.errorCode), "channel:")
}

func IsSkipRetryError(err *NewAPIError) bool {
	if err == nil {
		return false
	}

	return err.skipRetry
}

func ErrOptionWithSkipRetry() NewAPIErrorOptions {
	return func(e *NewAPIError) {
		e.skipRetry = true
	}
}

func ErrOptionWithNoRecordErrorLog() NewAPIErrorOptions {
	return func(e *NewAPIError) {
		e.recordErrorLog = common.GetPointer(false)
	}
}

func ErrOptionWithHideErrMsg(replaceStr string) NewAPIErrorOptions {
	return func(e *NewAPIError) {
		if common.DebugEnabled {
			fmt.Printf("ErrOptionWithHideErrMsg: %s, origin error: %s", replaceStr, e.Err)
		}
		e.Err = errors.New(replaceStr)
	}
}

// SanitizeForUser 对返回给用户的错误进行脱敏处理。
// 用户可操作的错误（参数错误、限流、配额不足等）保留原始消息；
// 内部实现错误（渠道配置、上游认证、网络故障等）替换为通用提示。
// 注意：必须在日志记录之后调用，确保原始错误已被记录。
func (e *NewAPIError) SanitizeForUser() {
	if e == nil {
		return
	}
	if isUserVisibleError(e) {
		return
	}
	msg := genericMessageForError(e)
	e.Err = errors.New(msg)
	// 同时替换 RelayError 中的 Message，防止 ToOpenAIError/ToClaudeError 使用原始消息
	switch re := e.RelayError.(type) {
	case OpenAIError:
		re.Message = msg
		re.Metadata = nil
		e.RelayError = re
	case ClaudeError:
		re.Message = msg
		e.RelayError = re
	}
	e.Metadata = nil
}

// isUserVisibleError 判断该错误是否应当对用户可见。
func isUserVisibleError(e *NewAPIError) bool {
	// 1. 白名单：已知的用户可操作错误码，无条件对用户可见
	if isUserVisibleErrorCode(e.errorCode) {
		return true
	}
	// 2. 黑名单：已知的内部错误码，无条件隐藏
	if isInternalErrorCode(e.errorCode) {
		return false
	}
	// 3. 其余情况（包括上游 provider 返回的错误码，如 "invalid_api_key", "rate_limit_exceeded" 等）
	//    按 provider error type/code 和 HTTP 状态码分类
	return isUserVisibleUpstreamError(e)
}

// isUserVisibleErrorCode 白名单：这些错误码的消息对用户有意义，应当保留。
func isUserVisibleErrorCode(code ErrorCode) bool {
	switch code {
	case ErrorCodeInvalidRequest,
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
		ErrorCodeModelPriceError:
		return true
	default:
		return false
	}
}

// isInternalErrorCode 黑名单：这些错误码属于内部实现细节，不应暴露给用户。
func isInternalErrorCode(code ErrorCode) bool {
	if strings.HasPrefix(string(code), "channel:") {
		return true
	}
	switch code {
	case ErrorCodeDoRequestFailed,
		ErrorCodeGetChannelFailed,
		ErrorCodeGenRelayInfoFailed,
		ErrorCodeInvalidApiType,
		ErrorCodeJsonMarshalFailed,
		ErrorCodeReadResponseBodyFailed,
		ErrorCodeBadResponse,
		ErrorCodeBadResponseBody,
		ErrorCodeAwsInvokeError,
		ErrorCodeQueryDataError,
		ErrorCodeUpdateDataError:
		return true
	default:
		return false
	}
}

// isUserVisibleUpstreamError 对 bad_response_status_code 类错误做进一步分类。
// 先按上游返回的 error type / code 判断，再按 HTTP 状态码兜底。
func isUserVisibleUpstreamError(e *NewAPIError) bool {
	// 1. 按上游 error type 判断
	if oaiErr, ok := e.RelayError.(OpenAIError); ok {
		switch oaiErr.Type {
		case "authentication_error", "permission_error", "insufficient_quota":
			return false
		case "invalid_request_error", "rate_limit_error":
			return true
		}
		// 2. 按上游 error code 判断
		codeStr := fmt.Sprintf("%v", oaiErr.Code)
		switch codeStr {
		case "invalid_api_key", "account_deactivated", "billing_not_active":
			return false
		}
	}
	if claudeErr, ok := e.RelayError.(ClaudeError); ok {
		switch claudeErr.Type {
		case "authentication_error", "permission_error", "not_found_error":
			return false
		case "invalid_request_error", "rate_limit_error":
			return true
		}
	}
	// 3. 按 HTTP 状态码兜底
	switch {
	case e.StatusCode == 400, e.StatusCode == 404,
		e.StatusCode == 413, e.StatusCode == 422,
		e.StatusCode == 429:
		return true
	case e.StatusCode == 401, e.StatusCode == 403:
		return false
	case e.StatusCode >= 500:
		return false
	default:
		return false
	}
}

// genericMessageForError 根据错误类型返回对应的通用提示消息。
func genericMessageForError(e *NewAPIError) string {
	if strings.HasPrefix(string(e.errorCode), "channel:") {
		return "请求处理失败，请稍后重试或联系管理员"
	}
	switch e.errorCode {
	case ErrorCodeDoRequestFailed:
		return "请求上游服务失败，请稍后重试"
	case ErrorCodeGetChannelFailed:
		return "当前无可用渠道，请稍后重试"
	case ErrorCodeReadResponseBodyFailed, ErrorCodeBadResponse, ErrorCodeBadResponseBody:
		return "上游服务响应异常，请稍后重试"
	case ErrorCodeAwsInvokeError:
		return "请求上游服务失败，请稍后重试"
	case ErrorCodeBadResponseStatusCode:
		return genericMessageForUpstreamStatus(e.StatusCode)
	default:
		// 对于上游 provider 返回的错误码（如 "invalid_api_key"、"server_error" 等），
		// 根据 HTTP 状态码生成通用提示
		if e.StatusCode >= 400 {
			return genericMessageForUpstreamStatus(e.StatusCode)
		}
		return "请求处理失败，请稍后重试或联系管理员"
	}
}

// genericMessageForUpstreamStatus 根据上游 HTTP 状态码返回通用提示。
func genericMessageForUpstreamStatus(statusCode int) string {
	switch {
	case statusCode == 401 || statusCode == 403:
		return "上游服务认证失败，请联系管理员"
	case statusCode == 408 || statusCode == 504 || statusCode == 524:
		return "上游服务响应超时，请稍后重试"
	case statusCode >= 500:
		return "上游服务暂时不可用，请稍后重试"
	default:
		return "上游服务请求失败，请稍后重试"
	}
}

func IsRecordErrorLog(e *NewAPIError) bool {
	if e == nil {
		return false
	}
	if e.recordErrorLog == nil {
		// default to true if not set
		return true
	}
	return *e.recordErrorLog
}
