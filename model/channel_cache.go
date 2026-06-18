package model

import (
	"errors"
	"fmt"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

type CachedAbility struct {
	ChannelId int
	Priority  int64
	Weight    int
}

var group2model2channels map[string]map[string][]CachedAbility // enabled channel abilities
var channelsIDM map[int]*Channel                               // all channels include disabled
var channelSyncLock sync.RWMutex

func InitChannelCache() {
	if !common.MemoryCacheEnabled {
		return
	}
	newChannelId2channel := make(map[int]*Channel)
	var channels []*Channel
	DB.Find(&channels)
	for _, channel := range channels {
		newChannelId2channel[channel.Id] = channel
	}
	var abilities []*Ability
	DB.Find(&abilities)

	newGroup2model2channels := make(map[string]map[string][]CachedAbility)
	for _, ability := range abilities {
		if !ability.Enabled {
			continue
		}
		// skip if channel doesn't exist or is disabled
		ch, ok := newChannelId2channel[ability.ChannelId]
		if !ok || ch.Status != common.ChannelStatusEnabled {
			continue
		}
		if _, ok := newGroup2model2channels[ability.Group]; !ok {
			newGroup2model2channels[ability.Group] = make(map[string][]CachedAbility)
		}
		priority := int64(0)
		if ability.Priority != nil {
			priority = *ability.Priority
		}
		ca := CachedAbility{
			ChannelId: ability.ChannelId,
			Priority:  priority,
			Weight:    int(ability.Weight),
		}
		newGroup2model2channels[ability.Group][ability.Model] = append(
			newGroup2model2channels[ability.Group][ability.Model], ca,
		)
	}

	// sort by priority (descending)
	for group, model2channels := range newGroup2model2channels {
		for model, cas := range model2channels {
			sort.Slice(cas, func(i, j int) bool {
				return cas[i].Priority > cas[j].Priority
			})
			newGroup2model2channels[group][model] = cas
		}
	}

	channelSyncLock.Lock()
	group2model2channels = newGroup2model2channels
	//channelsIDM = newChannelId2channel
	for i, channel := range newChannelId2channel {
		if channel.ChannelInfo.IsMultiKey {
			channel.Keys = channel.GetKeys()
			if channel.ChannelInfo.MultiKeyMode == constant.MultiKeyModePolling {
				if oldChannel, ok := channelsIDM[i]; ok {
					// 存在旧的渠道，如果是多key且轮询，保留轮询索引信息
					if oldChannel.ChannelInfo.IsMultiKey && oldChannel.ChannelInfo.MultiKeyMode == constant.MultiKeyModePolling {
						channel.ChannelInfo.MultiKeyPollingIndex = oldChannel.ChannelInfo.MultiKeyPollingIndex
					}
				}
			}
		}
	}
	channelsIDM = newChannelId2channel
	channelSyncLock.Unlock()
	common.SysLog("channels synced from database")
}

func SyncChannelCache(frequency int) {
	for {
		time.Sleep(time.Duration(frequency) * time.Second)
		common.SysLog("syncing channels from database")
		InitChannelCache()
	}
}

func GetRandomSatisfiedChannel(group string, model string, retry int, allowedChannels map[int]struct{}, excludedChannels map[int]struct{}) (*Channel, error) {
	// if memory cache is disabled, get channel directly from database
	if !common.MemoryCacheEnabled {
		return GetChannel(group, model, retry, allowedChannels, excludedChannels)
	}

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	// First, try to find channels with the exact model name.
	cachedAbilities := group2model2channels[group][model]

	// If no channels found, try to find channels with the normalized model name.
	if len(cachedAbilities) == 0 {
		normalizedModel := ratio_setting.FormatMatchingModelName(model)
		cachedAbilities = group2model2channels[group][normalizedModel]
	}

	// 应用用户级渠道白名单。allowedChannels=nil 视为不限制；非空时仅保留命中的候选。
	// 性能：单个 (group, model) 桶通常 < 20 个候选，map[int]struct{} lookup ≈ ns 级。
	if len(allowedChannels) > 0 {
		filtered := make([]CachedAbility, 0, len(cachedAbilities))
		for _, ca := range cachedAbilities {
			if _, ok := allowedChannels[ca.ChannelId]; ok {
				filtered = append(filtered, ca)
			}
		}
		cachedAbilities = filtered
	}

	// 重试时排除本次请求已尝试过的渠道(优先换渠道)。
	// 关键：若排除后已无候选,则保留排除前的列表(回退到允许重试同渠道),
	// 以免单渠道模型/全部渠道已试过时直接无渠道可用——保留瞬时错误的恢复能力。
	if len(excludedChannels) > 0 {
		filtered := make([]CachedAbility, 0, len(cachedAbilities))
		for _, ca := range cachedAbilities {
			if _, used := excludedChannels[ca.ChannelId]; !used {
				filtered = append(filtered, ca)
			}
		}
		if len(filtered) > 0 {
			cachedAbilities = filtered
		}
	}

	if len(cachedAbilities) == 0 {
		return nil, nil
	}

	if len(cachedAbilities) == 1 {
		if channel, ok := channelsIDM[cachedAbilities[0].ChannelId]; ok {
			return channel, nil
		}
		return nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", cachedAbilities[0].ChannelId)
	}

	uniquePriorities := make(map[int64]bool)
	for _, ca := range cachedAbilities {
		uniquePriorities[ca.Priority] = true
	}
	var sortedUniquePriorities []int64
	for priority := range uniquePriorities {
		sortedUniquePriorities = append(sortedUniquePriorities, priority)
	}
	sort.Slice(sortedUniquePriorities, func(i, j int) bool {
		return sortedUniquePriorities[i] > sortedUniquePriorities[j]
	})

	if retry >= len(uniquePriorities) {
		retry = len(uniquePriorities) - 1
	}
	targetPriority := sortedUniquePriorities[retry]

	// get channels at target priority
	var sumWeight = 0
	type targetEntry struct {
		channel *Channel
		weight  int
	}
	var targetChannels []targetEntry
	for _, ca := range cachedAbilities {
		if ca.Priority == targetPriority {
			if channel, ok := channelsIDM[ca.ChannelId]; ok {
				sumWeight += ca.Weight
				targetChannels = append(targetChannels, targetEntry{channel: channel, weight: ca.Weight})
			} else {
				return nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", ca.ChannelId)
			}
		}
	}

	if len(targetChannels) == 0 {
		return nil, errors.New(fmt.Sprintf("no channel found, group: %s, model: %s, priority: %d", group, model, targetPriority))
	}

	// smoothing factor and adjustment
	smoothingFactor := 1
	smoothingAdjustment := 0

	if sumWeight == 0 {
		sumWeight = len(targetChannels) * 100
		smoothingAdjustment = 100
	} else if sumWeight/len(targetChannels) < 10 {
		smoothingFactor = 100
	}

	totalWeight := sumWeight * smoothingFactor
	randomWeight := rand.Intn(totalWeight)

	for _, entry := range targetChannels {
		randomWeight -= entry.weight*smoothingFactor + smoothingAdjustment
		if randomWeight < 0 {
			return entry.channel, nil
		}
	}
	return nil, errors.New("channel not found")
}

func CacheGetChannel(id int) (*Channel, error) {
	if !common.MemoryCacheEnabled {
		return GetChannelById(id, true)
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	c, ok := channelsIDM[id]
	if !ok {
		return nil, fmt.Errorf("渠道# %d，已不存在", id)
	}
	return c, nil
}

func CacheGetChannelInfo(id int) (*ChannelInfo, error) {
	if !common.MemoryCacheEnabled {
		channel, err := GetChannelById(id, true)
		if err != nil {
			return nil, err
		}
		return &channel.ChannelInfo, nil
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	c, ok := channelsIDM[id]
	if !ok {
		return nil, fmt.Errorf("渠道# %d，已不存在", id)
	}
	return &c.ChannelInfo, nil
}

func CacheUpdateChannelStatus(id int, status int) {
	if !common.MemoryCacheEnabled {
		return
	}
	channelSyncLock.Lock()
	defer channelSyncLock.Unlock()
	if channel, ok := channelsIDM[id]; ok {
		channel.Status = status
	}
	if status != common.ChannelStatusEnabled {
		// delete the channel from group2model2channels
		for group, model2channels := range group2model2channels {
			for model, cas := range model2channels {
				for i, ca := range cas {
					if ca.ChannelId == id {
						// remove the entry from the slice
						group2model2channels[group][model] = append(cas[:i], cas[i+1:]...)
						break
					}
				}
			}
		}
	}
}

func CacheUpdateChannel(channel *Channel) {
	if !common.MemoryCacheEnabled {
		return
	}
	channelSyncLock.Lock()
	defer channelSyncLock.Unlock()
	if channel == nil {
		return
	}

	println("CacheUpdateChannel:", channel.Id, channel.Name, channel.Status, channel.ChannelInfo.MultiKeyPollingIndex)

	println("before:", channelsIDM[channel.Id].ChannelInfo.MultiKeyPollingIndex)
	channelsIDM[channel.Id] = channel
	println("after :", channelsIDM[channel.Id].ChannelInfo.MultiKeyPollingIndex)
}

// ParseAllowedChannels 把逗号分隔的渠道ID列表（"3,7,12"）解析成 lookup map。
// 空字符串或全部条目无效时返回 nil，调用方以 nil 判定「不限制」。
// 每次请求解析一次（开销 < 1µs），无需缓存。
func ParseAllowedChannels(csv string) map[int]struct{} {
	csv = strings.TrimSpace(csv)
	if csv == "" {
		return nil
	}
	out := make(map[int]struct{}, 4)
	for _, part := range strings.Split(csv, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if id, err := strconv.Atoi(part); err == nil && id > 0 {
			out[id] = struct{}{}
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
