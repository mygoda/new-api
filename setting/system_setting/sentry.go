package system_setting

import "github.com/QuantumNous/new-api/setting/config"

type SentrySettings struct {
	Enabled          bool    `json:"enabled"`
	DSN              string  `json:"dsn"`
	Environment      string  `json:"environment"`
	SampleRate       float64 `json:"sample_rate"`
	EnableTracing    bool    `json:"enable_tracing"`
	TracesSampleRate float64 `json:"traces_sample_rate"`
}

var defaultSentrySettings = SentrySettings{
	SampleRate:       1.0,
	TracesSampleRate: 0.1,
}

func init() {
	config.GlobalConfig.Register("sentry", &defaultSentrySettings)
}

func GetSentrySettings() *SentrySettings {
	return &defaultSentrySettings
}
