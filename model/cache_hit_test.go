package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestOtherInt(t *testing.T) {
	assert.Equal(t, 0, otherInt(nil, "cache_tokens"))
	assert.Equal(t, 0, otherInt(map[string]interface{}{}, "cache_tokens"))
	assert.Equal(t, 5, otherInt(map[string]interface{}{"cache_tokens": 5}, "cache_tokens"))         // in-process int
	assert.Equal(t, 7, otherInt(map[string]interface{}{"cache_tokens": float64(7)}, "cache_tokens")) // JSON round-trip
	assert.Equal(t, 0, otherInt(map[string]interface{}{"cache_tokens": "x"}, "cache_tokens"))        // garbage
}

func TestSumCacheHitTokensAndBackfill(t *testing.T) {
	truncateTables(t)
	now := time.Now().Unix()

	// Row written by the new path: cache_tokens column populated directly.
	require.NoError(t, DB.Create(&Log{
		Type: LogTypeConsume, CreatedAt: now, ModelName: "m", Username: "u",
		PromptTokens: 100, CacheTokens: 40,
	}).Error)
	// Legacy row: column still 0, value only lives in `other` JSON -> backfill target.
	require.NoError(t, DB.Create(&Log{
		Type: LogTypeConsume, CreatedAt: now, ModelName: "m", Username: "u",
		PromptTokens: 200, CacheTokens: 0, Other: `{"cache_tokens":50}`,
	}).Error)
	// Non-consume row must be ignored.
	require.NoError(t, DB.Create(&Log{
		Type: LogTypeTopup, CreatedAt: now, PromptTokens: 999, CacheTokens: 999,
	}).Error)

	// Before backfill: only the new-path row counts.
	hit, prompt, err := SumCacheHitTokens(0, 0, "", "", "", 0)
	require.NoError(t, err)
	assert.Equal(t, int64(40), hit)
	assert.Equal(t, int64(300), prompt)

	// Backfill is async (gopool); run its body inline for a deterministic test.
	backfillNow(t)

	hit, prompt, err = SumCacheHitTokens(0, 0, "", "", "", 0)
	require.NoError(t, err)
	assert.Equal(t, int64(90), hit)   // 40 + backfilled 50
	assert.Equal(t, int64(300), prompt)
}

// backfillNow runs the same per-row copy as backfillLogCacheTokens, synchronously.
func backfillNow(t *testing.T) {
	t.Helper()
	const where = "type = ? AND cache_tokens = 0 AND other LIKE ?"
	var batch []Log
	require.NoError(t, LOG_DB.Model(&Log{}).Select("id", "other").
		Where(where, LogTypeConsume, "%cache_tokens%").
		FindInBatches(&batch, 2000, func(_ *gorm.DB, _ int) error {
			for _, l := range batch {
				m, e := common.StrToMap(l.Other)
				if e != nil {
					continue
				}
				if ct := otherInt(m, "cache_tokens"); ct > 0 {
					require.NoError(t, LOG_DB.Model(&Log{}).Where("id = ?", l.Id).Update("cache_tokens", ct).Error)
				}
			}
			return nil
		}).Error)
}
