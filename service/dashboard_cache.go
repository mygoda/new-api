package service

import (
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/cachex"

	"github.com/samber/hot"
)

const (
	dashboardCacheTTL = 30 * time.Second

	dashboardChannelNamespace     = "new-api:dashboard:channel:v1"
	dashboardModelPerfNamespace   = "new-api:dashboard:model_perf:v1"
	dashboardModelCrossNamespace  = "new-api:dashboard:model_cross:v1"
	dashboardQuotaDatesNamespace  = "new-api:dashboard:quota_dates:v1"
)

var (
	channelStatsCacheOnce sync.Once
	channelStatsCache     *cachex.HybridCache[[]model.ChannelStats]

	modelPerfCacheOnce sync.Once
	modelPerfCache     *cachex.HybridCache[[]model.ModelPerformanceStats]

	modelCrossCacheOnce sync.Once
	modelCrossCache     *cachex.HybridCache[[]model.ModelChannelCrossStats]

	quotaDatesCacheOnce sync.Once
	quotaDatesCache     *cachex.HybridCache[[]*model.QuotaData]
)

func redisOn() bool {
	return common.RedisEnabled && common.RDB != nil
}

func getChannelStatsCache() *cachex.HybridCache[[]model.ChannelStats] {
	channelStatsCacheOnce.Do(func() {
		channelStatsCache = cachex.NewHybridCache[[]model.ChannelStats](cachex.HybridCacheConfig[[]model.ChannelStats]{
			Namespace:    cachex.Namespace(dashboardChannelNamespace),
			Redis:        common.RDB,
			RedisCodec:   cachex.JSONCodec[[]model.ChannelStats]{},
			RedisEnabled: redisOn,
			Memory: func() *hot.HotCache[string, []model.ChannelStats] {
				return hot.NewHotCache[string, []model.ChannelStats](hot.LRU, 256).
					WithTTL(dashboardCacheTTL).
					WithJanitor().
					Build()
			},
		})
	})
	return channelStatsCache
}

func getModelPerfCache() *cachex.HybridCache[[]model.ModelPerformanceStats] {
	modelPerfCacheOnce.Do(func() {
		modelPerfCache = cachex.NewHybridCache[[]model.ModelPerformanceStats](cachex.HybridCacheConfig[[]model.ModelPerformanceStats]{
			Namespace:    cachex.Namespace(dashboardModelPerfNamespace),
			Redis:        common.RDB,
			RedisCodec:   cachex.JSONCodec[[]model.ModelPerformanceStats]{},
			RedisEnabled: redisOn,
			Memory: func() *hot.HotCache[string, []model.ModelPerformanceStats] {
				return hot.NewHotCache[string, []model.ModelPerformanceStats](hot.LRU, 512).
					WithTTL(dashboardCacheTTL).
					WithJanitor().
					Build()
			},
		})
	})
	return modelPerfCache
}

func getModelCrossCache() *cachex.HybridCache[[]model.ModelChannelCrossStats] {
	modelCrossCacheOnce.Do(func() {
		modelCrossCache = cachex.NewHybridCache[[]model.ModelChannelCrossStats](cachex.HybridCacheConfig[[]model.ModelChannelCrossStats]{
			Namespace:    cachex.Namespace(dashboardModelCrossNamespace),
			Redis:        common.RDB,
			RedisCodec:   cachex.JSONCodec[[]model.ModelChannelCrossStats]{},
			RedisEnabled: redisOn,
			Memory: func() *hot.HotCache[string, []model.ModelChannelCrossStats] {
				return hot.NewHotCache[string, []model.ModelChannelCrossStats](hot.LRU, 256).
					WithTTL(dashboardCacheTTL).
					WithJanitor().
					Build()
			},
		})
	})
	return modelCrossCache
}

func getQuotaDatesCache() *cachex.HybridCache[[]*model.QuotaData] {
	quotaDatesCacheOnce.Do(func() {
		quotaDatesCache = cachex.NewHybridCache[[]*model.QuotaData](cachex.HybridCacheConfig[[]*model.QuotaData]{
			Namespace:    cachex.Namespace(dashboardQuotaDatesNamespace),
			Redis:        common.RDB,
			RedisCodec:   cachex.JSONCodec[[]*model.QuotaData]{},
			RedisEnabled: redisOn,
			Memory: func() *hot.HotCache[string, []*model.QuotaData] {
				return hot.NewHotCache[string, []*model.QuotaData](hot.LRU, 512).
					WithTTL(dashboardCacheTTL).
					WithJanitor().
					Build()
			},
		})
	})
	return quotaDatesCache
}

func CachedGetChannelStats(startTs, endTs int64) ([]model.ChannelStats, error) {
	cache := getChannelStatsCache()
	key := fmt.Sprintf("%d:%d", startTs, endTs)
	if v, ok, _ := cache.Get(key); ok {
		return v, nil
	}
	v, err := model.GetChannelStats(startTs, endTs)
	if err != nil {
		return nil, err
	}
	_ = cache.SetWithTTL(key, v, dashboardCacheTTL)
	return v, nil
}

func CachedGetModelPerformanceStats(userId int, startTs, endTs int64) ([]model.ModelPerformanceStats, error) {
	cache := getModelPerfCache()
	key := fmt.Sprintf("%d:%d:%d", userId, startTs, endTs)
	if v, ok, _ := cache.Get(key); ok {
		return v, nil
	}
	v, err := model.GetModelPerformanceStats(userId, startTs, endTs)
	if err != nil {
		return nil, err
	}
	_ = cache.SetWithTTL(key, v, dashboardCacheTTL)
	return v, nil
}

func CachedGetModelChannelCrossStats(modelName string, startTs, endTs int64) ([]model.ModelChannelCrossStats, error) {
	cache := getModelCrossCache()
	key := fmt.Sprintf("%s:%d:%d", modelName, startTs, endTs)
	if v, ok, _ := cache.Get(key); ok {
		return v, nil
	}
	v, err := model.GetModelChannelCrossStats(modelName, startTs, endTs)
	if err != nil {
		return nil, err
	}
	_ = cache.SetWithTTL(key, v, dashboardCacheTTL)
	return v, nil
}

func CachedGetAllQuotaDates(startTs, endTs int64, username string) ([]*model.QuotaData, error) {
	cache := getQuotaDatesCache()
	key := fmt.Sprintf("%d:%d:%s", startTs, endTs, username)
	if v, ok, _ := cache.Get(key); ok {
		return v, nil
	}
	v, err := model.GetAllQuotaDates(startTs, endTs, username)
	if err != nil {
		return nil, err
	}
	_ = cache.SetWithTTL(key, v, dashboardCacheTTL)
	return v, nil
}
