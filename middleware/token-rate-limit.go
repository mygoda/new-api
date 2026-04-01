package middleware

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

const (
	tokenRLRPMPrefix = "tokenRL:rpm:"
	tokenRLTPMPrefix = "tokenRL:tpm:"
	tokenRLTTL       = 2 * time.Minute
)

func currentMinuteBucket() string {
	return time.Now().UTC().Format("200601021504")
}

// TokenRateLimit enforces per-API-key RPM and TPM limits.
// RPM is checked before the request proceeds.
// TPM is checked before the request (against already-accumulated usage) and
// the actual token count is recorded after the response completes.
func TokenRateLimit() func(c *gin.Context) {
	return func(c *gin.Context) {
		if !setting.TokenRateLimitEnabled {
			c.Next()
			return
		}

		tokenId := c.GetInt("token_id")
		if tokenId == 0 {
			c.Next()
			return
		}

		rpm := getEffectiveRPM(c)
		tpm := getEffectiveTPM(c)

		if rpm == 0 && tpm == 0 {
			c.Next()
			return
		}

		bucket := currentMinuteBucket()

		if common.RedisEnabled {
			tokenRateLimitRedis(c, tokenId, bucket, rpm, tpm)
		} else {
			tokenRateLimitMemory(c, tokenId, bucket, rpm, tpm)
		}
	}
}

func getEffectiveRPM(c *gin.Context) int {
	rpm, ok := common.GetContextKey(c, constant.ContextKeyTokenRPM)
	if ok {
		if v, ok2 := rpm.(int); ok2 && v > 0 {
			return v
		}
	}
	return setting.TokenRateLimitDefaultRPM
}

func getEffectiveTPM(c *gin.Context) int {
	tpm, ok := common.GetContextKey(c, constant.ContextKeyTokenTPM)
	if ok {
		if v, ok2 := tpm.(int); ok2 && v > 0 {
			return v
		}
	}
	return setting.TokenRateLimitDefaultTPM
}

// --- Redis implementation ---

func tokenRateLimitRedis(c *gin.Context, tokenId int, bucket string, rpm, tpm int) {
	ctx := context.Background()
	rdb := common.RDB

	// Check RPM
	if rpm > 0 {
		rpmKey := fmt.Sprintf("%s%d:%s", tokenRLRPMPrefix, tokenId, bucket)
		current, err := rdb.Get(ctx, rpmKey).Int64()
		if err != nil && err.Error() != "redis: nil" {
			abortWithOpenAiMessage(c, http.StatusInternalServerError, "rate limit check failed")
			return
		}
		if current >= int64(rpm) {
			abortWithOpenAiMessage(c, http.StatusTooManyRequests,
				fmt.Sprintf("该令牌已达到每分钟请求数限制 (RPM: %d)", rpm))
			return
		}
	}

	// Check TPM (against already-accumulated usage in this minute)
	if tpm > 0 {
		tpmKey := fmt.Sprintf("%s%d:%s", tokenRLTPMPrefix, tokenId, bucket)
		current, err := rdb.Get(ctx, tpmKey).Int64()
		if err != nil && err.Error() != "redis: nil" {
			abortWithOpenAiMessage(c, http.StatusInternalServerError, "rate limit check failed")
			return
		}
		if current >= int64(tpm) {
			abortWithOpenAiMessage(c, http.StatusTooManyRequests,
				fmt.Sprintf("该令牌已达到每分钟 Token 数限制 (TPM: %d)", tpm))
			return
		}
	}

	// Increment RPM counter
	if rpm > 0 {
		rpmKey := fmt.Sprintf("%s%d:%s", tokenRLRPMPrefix, tokenId, bucket)
		pipe := rdb.Pipeline()
		pipe.Incr(ctx, rpmKey)
		pipe.Expire(ctx, rpmKey, tokenRLTTL)
		if _, err := pipe.Exec(ctx); err != nil {
			abortWithOpenAiMessage(c, http.StatusInternalServerError, "rate limit record failed")
			return
		}
	}

	c.Next()

	// After request: record actual TPM usage
	if tpm > 0 && c.Writer.Status() < 400 {
		totalTokens := getResponseTotalTokens(c)
		if totalTokens > 0 {
			tpmKey := fmt.Sprintf("%s%d:%s", tokenRLTPMPrefix, tokenId, bucket)
			pipe := rdb.Pipeline()
			pipe.IncrBy(ctx, tpmKey, int64(totalTokens))
			pipe.Expire(ctx, tpmKey, tokenRLTTL)
			_, _ = pipe.Exec(ctx)
		}
	}
}

// --- In-memory implementation ---

var (
	tokenRLMemStore tokenRateLimitMemStore
)

type tokenRateLimitMemStore struct {
	mu      sync.Mutex
	rpm     map[string]int64 // key: "{tokenId}:{bucket}"
	tpm     map[string]int64
	lastGC  string
	inited  bool
}

func (s *tokenRateLimitMemStore) init() {
	if s.inited {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.inited {
		return
	}
	s.rpm = make(map[string]int64)
	s.tpm = make(map[string]int64)
	s.inited = true
}

func (s *tokenRateLimitMemStore) gc(currentBucket string) {
	if s.lastGC == currentBucket {
		return
	}
	s.lastGC = currentBucket
	for k := range s.rpm {
		if len(k) > 12 && k[len(k)-12:] != currentBucket {
			delete(s.rpm, k)
		}
	}
	for k := range s.tpm {
		if len(k) > 12 && k[len(k)-12:] != currentBucket {
			delete(s.tpm, k)
		}
	}
}

func tokenRateLimitMemory(c *gin.Context, tokenId int, bucket string, rpm, tpm int) {
	tokenRLMemStore.init()
	tokenRLMemStore.mu.Lock()

	tokenRLMemStore.gc(bucket)
	key := fmt.Sprintf("%d:%s", tokenId, bucket)

	// Check RPM
	if rpm > 0 {
		current := tokenRLMemStore.rpm[key]
		if current >= int64(rpm) {
			tokenRLMemStore.mu.Unlock()
			abortWithOpenAiMessage(c, http.StatusTooManyRequests,
				fmt.Sprintf("该令牌已达到每分钟请求数限制 (RPM: %d)", rpm))
			return
		}
	}

	// Check TPM
	if tpm > 0 {
		current := tokenRLMemStore.tpm[key]
		if current >= int64(tpm) {
			tokenRLMemStore.mu.Unlock()
			abortWithOpenAiMessage(c, http.StatusTooManyRequests,
				fmt.Sprintf("该令牌已达到每分钟 Token 数限制 (TPM: %d)", tpm))
			return
		}
	}

	// Increment RPM
	if rpm > 0 {
		tokenRLMemStore.rpm[key]++
	}
	tokenRLMemStore.mu.Unlock()

	c.Next()

	// After request: record actual TPM usage
	if tpm > 0 && c.Writer.Status() < 400 {
		totalTokens := getResponseTotalTokens(c)
		if totalTokens > 0 {
			tokenRLMemStore.mu.Lock()
			tokenRLMemStore.tpm[key] += int64(totalTokens)
			tokenRLMemStore.mu.Unlock()
		}
	}
}

// getResponseTotalTokens retrieves the total token count set by PostTextConsumeQuota / PostAudioConsumeQuota.
func getResponseTotalTokens(c *gin.Context) int {
	if v, exists := common.GetContextKey(c, constant.ContextKeyUsageTotalTokens); exists {
		if total, ok := v.(int); ok {
			return total
		}
	}
	return 0
}
