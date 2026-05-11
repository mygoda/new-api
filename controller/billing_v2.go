package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// 文件用途:账单页面 v2 的 user-facing 接口集合(/api/billing/v2/*)。
//
// 共 5 个 endpoint:
//   GET /api/billing/v2/overview      总览卡片(本期消费 / 上期同比 / 余额 / 调用次数)
//   GET /api/billing/v2/breakdown     按维度聚合(model | token)+ topN + others
//   GET /api/billing/v2/timeseries    时间序列(day | hour)
//   GET /api/billing/v2/anomalies     异常请求(P0:high_cost)
//   GET /api/billing/v2/details       明细分页(严格不带 channel)
//
// 关键约束:返回结构体严格使用 dto.BillingDetailUserDTO / BillingOverview 等
// 「user 视角」类型,不暴露 channel_id / channel_name / 上游 endpoint。
//
// 认证:挂在 UserAuth 路由组下,自动注入 user_id;controller 强制把 BillingFilter
// 的 UserId 设为当前用户,即便 query string 传了别的也忽略。

// ─── 时间窗口工具 ─────────────────────────────────────────

// resolveBillingPeriod 把 query 里的 period 参数解析为 [start, end) 时间窗口。
// period 可选值:
//   - "month"   (默认) 本月 1 日 00:00 ~ 现在
//   - "7d"      最近 7 天
//   - "30d"     最近 30 天
//   - "today"   今日 00:00 ~ 现在
// 如果 c.Query 里同时带了 start_time / end_time(YYYY-MM-DD HH:MM:SS),优先用它们。
func resolveBillingPeriod(c *gin.Context) (start, end time.Time, granularity string) {
	now := time.Now()

	if s := c.Query("start_time"); s != "" {
		if e := c.Query("end_time"); e != "" {
			if ts, err := time.ParseInLocation("2006-01-02 15:04:05", s, now.Location()); err == nil {
				if te, err := time.ParseInLocation("2006-01-02 15:04:05", e, now.Location()); err == nil {
					return ts, te, defaultGranularity(te.Sub(ts))
				}
			}
		}
	}

	period := c.DefaultQuery("period", "month")
	switch period {
	case "today":
		start = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		end = now
		granularity = "hour"
	case "7d":
		start = now.AddDate(0, 0, -7)
		end = now
		granularity = "day"
	case "30d":
		start = now.AddDate(0, 0, -30)
		end = now
		granularity = "day"
	default: // "month"
		start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		end = now
		granularity = "day"
	}
	return
}

func defaultGranularity(d time.Duration) string {
	if d <= 48*time.Hour {
		return "hour"
	}
	return "day"
}

// fmtTime 把 time.Time 格式化成 Doris 接受的字符串。
func fmtTime(t time.Time) string {
	return t.Format("2006-01-02 15:04:05")
}

// userBillingFilter 构造一个仅查询当前用户、并带上时间窗口与可选筛选的 BillingFilter。
// 由 controller 强制注入 user_id,防止越权读其他用户数据。
//
// 多选支持:接受重复参数 model_name=a&model_name=b&token_name=x&token_name=y,
// 单值也兼容(c.QueryArray 单值时返回 [a],c.Query 取首项)。
func userBillingFilter(c *gin.Context, start, end time.Time) service.BillingFilter {
	uid := c.GetInt("id") // gin auth middleware sets this

	models := dedupNonEmpty(c.QueryArray("model_name"))
	tokens := dedupNonEmpty(c.QueryArray("token_name"))

	f := service.BillingFilter{
		UserId:    uid,
		StartTime: fmtTime(start),
		EndTime:   fmtTime(end),
	}
	switch len(models) {
	case 0:
		// noop
	case 1:
		f.ModelName = models[0]
	default:
		f.ModelNames = models
	}
	switch len(tokens) {
	case 0:
		// noop
	case 1:
		f.TokenName = tokens[0]
	default:
		f.TokenNames = tokens
	}
	return f
}

// dedupNonEmpty 去掉空字符串和重复项,保留顺序。
func dedupNonEmpty(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

// ─── 1. Overview ─────────────────────────────────────────

// GetBillingV2Overview 返回总览卡片所需的全部数字。
// 算法:
//   - current = SUM(quota) WHERE created_at IN [start, end)
//   - prev    = SUM(quota) WHERE created_at IN [start - period_len, start)
//   - estimated = current × period_len / elapsed
//   - balance = users.quota
func GetBillingV2Overview(c *gin.Context) {
	start, end, _ := resolveBillingPeriod(c)
	periodLen := end.Sub(start)

	cur, err := service.QueryBillingV2Overview(userBillingFilter(c, start, end))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	prevStart := start.Add(-periodLen)
	prev, err := service.QueryBillingV2Overview(userBillingFilter(c, prevStart, start))
	if err != nil {
		// 同比失败不阻塞,降级为 0
		prev = &service.BillingV2OverviewMetrics{}
	}

	// 预测:用「目前为止的速率」线性外推到周期末
	estimated := cur.Quota
	if periodLen > 0 {
		elapsed := time.Since(start)
		if elapsed > 0 && elapsed < periodLen {
			estimated = int(float64(cur.Quota) * float64(periodLen) / float64(elapsed))
		}
	}

	// 余额从 user 表
	uid := c.GetInt("id")
	balance := 0
	if q, err := model.GetUserQuota(uid, false); err == nil {
		balance = q
	}

	resp := dto.BillingOverview{
		CurrentQuota:     cur.Quota,
		PrevQuota:        prev.Quota,
		EstimatedTotal:   estimated,
		RequestCount:     cur.RequestCount,
		PrevRequestCount: prev.RequestCount,
		Balance:          balance,
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": resp})
}

// ─── 2. Breakdown ────────────────────────────────────────

// GetBillingV2Breakdown 按 dim 聚合 + topN + others。
// 参数:dim=model|token (default: model), top=10 (default)
func GetBillingV2Breakdown(c *gin.Context) {
	dim := c.DefaultQuery("dim", "model")
	if dim != "model" && dim != "token" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "dim must be model or token"})
		return
	}
	topN, _ := strconv.Atoi(c.DefaultQuery("top", "10"))
	if topN <= 0 || topN > 100 {
		topN = 10
	}

	start, end, _ := resolveBillingPeriod(c)
	rows, totalQuota, err := service.QueryBillingV2Breakdown(userBillingFilter(c, start, end), dim)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	items := make([]dto.BillingBreakdownItem, 0, topN+1)
	otherQuota := 0
	otherReq := 0
	otherTokens := 0
	for i, r := range rows {
		percent := 0.0
		if totalQuota > 0 {
			percent = float64(r.Quota) * 100.0 / float64(totalQuota)
		}
		if i < topN {
			items = append(items, dto.BillingBreakdownItem{
				Key:          r.Key,
				Label:        r.Key,
				Quota:        r.Quota,
				RequestCount: r.RequestCount,
				TotalTokens:  r.TotalTokens,
				Percent:      percent,
			})
		} else {
			otherQuota += r.Quota
			otherReq += r.RequestCount
			otherTokens += r.TotalTokens
		}
	}
	if otherQuota > 0 {
		percent := 0.0
		if totalQuota > 0 {
			percent = float64(otherQuota) * 100.0 / float64(totalQuota)
		}
		items = append(items, dto.BillingBreakdownItem{
			Key:          "__others__",
			Label:        "其他",
			Quota:        otherQuota,
			RequestCount: otherReq,
			TotalTokens:  otherTokens,
			Percent:      percent,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": dto.BillingBreakdownResponse{
		Dimension:  dim,
		TotalQuota: totalQuota,
		Items:      items,
	}})
}

// ─── 3. Timeseries ───────────────────────────────────────

func GetBillingV2Timeseries(c *gin.Context) {
	start, end, defaultGran := resolveBillingPeriod(c)
	gran := c.DefaultQuery("granularity", defaultGran)
	if gran != "day" && gran != "hour" {
		gran = defaultGran
	}

	rows, err := service.QueryBillingV2Timeseries(userBillingFilter(c, start, end), gran)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	points := make([]dto.BillingTimeseriesPoint, 0, len(rows))
	for _, r := range rows {
		points = append(points, dto.BillingTimeseriesPoint{
			Date:         r.Bucket,
			Quota:        r.Quota,
			RequestCount: r.RequestCount,
			TotalTokens:  r.TotalTokens,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": dto.BillingTimeseriesResponse{
		Granularity: gran,
		Points:      points,
	}})
}

// ─── 4. Anomalies ────────────────────────────────────────

func GetBillingV2Anomalies(c *gin.Context) {
	start, end, _ := resolveBillingPeriod(c)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	rows, total, err := service.QueryBillingV2HighCostAnomalies(userBillingFilter(c, start, end), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	items := make([]dto.BillingAnomalyItem, 0, len(rows))
	for _, r := range rows {
		hint := "单次消费显著高于近期均值,建议复查 prompt 长度或上下文是否过大"
		severity := "medium"
		if r.P99x2 > 0 && r.Quota > r.P99x2*2 {
			severity = "high"
		}
		items = append(items, dto.BillingAnomalyItem{
			RequestId:    r.RequestId,
			CreatedAt:    r.CreatedAt,
			ModelName:    r.ModelName,
			TokenName:    r.TokenName,
			PromptTokens: r.PromptTokens,
			Quota:        r.Quota,
			Type:         "high_cost",
			Severity:     severity,
			HintMessage:  hint,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": dto.BillingAnomalyResponse{
		Total: total,
		Items: items,
	}})
}

// ─── 5. Details ──────────────────────────────────────────

// GetBillingV2Details 复用 service.QueryBillingRecords,然后在本函数把
// 「全字段」BillingRecord 转成「user 视角」BillingDetailUserDTO,严格 strip
// channel_id / channel_name / token_key 等敏感字段。
func GetBillingV2Details(c *gin.Context) {
	start, end, _ := resolveBillingPeriod(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 50
	}

	res, err := service.QueryBillingRecords(userBillingFilter(c, start, end), page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	items := make([]dto.BillingDetailUserDTO, 0, len(res.Items))
	for _, r := range res.Items {
		// !! 关键约束 !!
		// 这里只复制白名单字段,channel_id / channel_name / token_key 永不出现。
		items = append(items, dto.BillingDetailUserDTO{
			RequestId:        r.RequestId,
			CreatedAt:        r.CreatedAt,
			ModelName:        r.ModelName,
			TokenName:        r.TokenName,
			UserGroup:        r.UserGroup,
			PromptTokens:     r.PromptTokens,
			CompletionTokens: r.CompletionTokens,
			TotalTokens:      r.TotalTokens,
			CacheTokens:      r.CacheTokens,
			CacheCreationTokens: r.CacheCreationTokens,
			Quota:            r.Quota,
			ModelRatio:       r.ModelRatio,
			GroupRatio:       r.GroupRatio,
			IsSuccess:        r.IsSuccess,
			UseTimeMs:        r.UseTimeMs,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": dto.BillingDetailListResponse{
		Total: res.Total,
		Items: items,
	}})
}
