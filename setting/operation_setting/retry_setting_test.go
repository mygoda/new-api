package operation_setting

import "testing"

func TestIsNonRetryableClientStatus(t *testing.T) {
	skip := []int{400, 413, 422}
	for _, c := range skip {
		if !IsNonRetryableClientStatus(c) {
			t.Fatalf("status %d should be non-retryable client error", c)
		}
	}
	retry := []int{404, 408, 409, 425, 429, 500, 502, 503, 504, 524, 200}
	for _, c := range retry {
		if IsNonRetryableClientStatus(c) {
			t.Fatalf("status %d should NOT be treated as non-retryable client error", c)
		}
	}
}
