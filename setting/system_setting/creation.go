package system_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// CreationSetting 创作中心相关系统设置：上传图床 & 上游 URL 镜像
//
// 字段命名约定：
//   - 上传相关字段以 Upload 开头
//   - S3 / S3 兼容存储字段以 S3 开头（适用于 AWS S3、阿里 OSS、腾讯 COS、火山 TOS、MinIO 等）
//   - 镜像相关字段以 Mirror 开头
type CreationSetting struct {
	// 全局开关：关闭后侧边栏「创作中心」入口隐藏，所有相关接口返回 404
	Enabled bool `json:"enabled"`

	// 上传驱动："local" 或 "s3"
	UploadDriver string `json:"upload_driver"`
	// 单文件最大体积（MB）
	UploadMaxFileMB int `json:"upload_max_file_mb"`
	// 允许的 MIME 类型，逗号分隔；为空则使用默认列表
	UploadAllowedMimeTypes []string `json:"upload_allowed_mime_types"`
	// 单用户每日上传额度（MB），<= 0 表示不限
	UploadDailyQuotaMB int `json:"upload_daily_quota_mb"`

	// === local 驱动 ===
	// 本地存储根目录；为空使用 ./data/uploads
	LocalUploadPath string `json:"local_upload_path"`
	// 本地驱动下，对外可访问的 URL 前缀。为空时使用 /api/upload/file/ 反向代理路径。
	LocalPublicBaseURL string `json:"local_public_base_url"`

	// === S3 / S3 兼容驱动 ===
	S3Endpoint        string `json:"s3_endpoint"`         // 自定义 endpoint，例如 https://oss-cn-hangzhou.aliyuncs.com，AWS 留空
	S3Region          string `json:"s3_region"`           // AWS region；OSS/COS/TOS/MinIO 任意值（如 cn-beijing）
	S3Bucket          string `json:"s3_bucket"`           // 桶名
	S3AccessKeyID     string `json:"s3_access_key_id"`    // AK
	S3AccessKeySecret string `json:"s3_access_key_secret"` // SK
	S3UsePathStyle    bool   `json:"s3_use_path_style"`   // MinIO/部分私有部署需要 true；公有云大多 false
	S3PublicBaseURL   string `json:"s3_public_base_url"`  // 自定义 CDN/公网 URL 前缀（结尾不带 /）；为空则按 endpoint 拼
	S3KeyPrefix       string `json:"s3_key_prefix"`       // 所有对象 key 前缀，例如 "creation/"

	// S3PrivateBucket=true 时：
	//   - 上传不加 PublicRead ACL（兼容禁止公共 ACL 的私有 bucket）
	//   - 返回的访问 URL 改为 GET 预签名 URL（带 X-Amz-Signature），客户端浏览器可拉取
	// 注意：预签名 URL 有过期时间，超期后图片会 403。配合 S3PresignExpireSeconds 调整。
	S3PrivateBucket bool `json:"s3_private_bucket"`
	// 预签名 URL 有效期（秒）。<=0 时使用默认 86400（24 小时）。
	// AWS 上限 7 天（604800）；多数 S3 兼容服务也接受这个范围。
	S3PresignExpireSeconds int `json:"s3_presign_expire_seconds"`

	// === 上游 URL 镜像 ===
	// 火山方舟 / 可灵 / Hailuo / Vidu / 阿里 等多数视频/图像生成接口返回的是 24 小时内有效的临时 URL。
	// 默认 false：直接展示原始上游 URL；设为 true：任务成功后异步把资源拉到本地存储，回写 ResultURL。
	MirrorUpstreamUrls bool `json:"mirror_upstream_urls"`
	// 镜像下载超时（秒）
	MirrorDownloadTimeoutSec int `json:"mirror_download_timeout_sec"`
	// 镜像最大文件体积（MB），超过则放弃镜像、保留上游 URL
	MirrorMaxFileMB int `json:"mirror_max_file_mb"`

	// === 云端作品库 ===
	// 启用后前端自动同步作品到 creation_assets 表；关闭则仅使用 localStorage
	CloudGalleryEnabled bool `json:"cloud_gallery_enabled"`
}

var defaultCreationSetting = CreationSetting{
	Enabled:         true,
	UploadDriver:    "local",
	UploadMaxFileMB: 50,
	UploadAllowedMimeTypes: []string{
		// 图片
		"image/jpeg", "image/png", "image/webp", "image/gif",
		"image/bmp", "image/tiff", "image/heic", "image/heif",
		// 视频(Seedance 2.0 参考视频)
		"video/mp4", "video/quicktime",
		// 音频(Seedance 2.0 参考音频)
		"audio/mpeg", "audio/wav", "audio/x-wav", "audio/wave",
	},
	UploadDailyQuotaMB:       2000,
	LocalUploadPath:          "./data/uploads",
	LocalPublicBaseURL:       "",
	S3Endpoint:               "",
	S3Region:                 "us-east-1",
	S3Bucket:                 "",
	S3AccessKeyID:            "",
	S3AccessKeySecret:        "",
	S3UsePathStyle:           false,
	S3PublicBaseURL:          "",
	S3KeyPrefix:              "creation/",
	S3PrivateBucket:          false,
	S3PresignExpireSeconds:   86400,
	MirrorUpstreamUrls:       false,
	MirrorDownloadTimeoutSec: 60,
	MirrorMaxFileMB:          100,
	CloudGalleryEnabled:      false,
}

func init() {
	config.GlobalConfig.Register("creation_setting", &defaultCreationSetting)
}

func GetCreationSetting() *CreationSetting {
	return &defaultCreationSetting
}

// IsAllowedMimeType 判断 MIME 是否在白名单内
func (s *CreationSetting) IsAllowedMimeType(mime string) bool {
	if len(s.UploadAllowedMimeTypes) == 0 {
		return true
	}
	mime = strings.ToLower(strings.TrimSpace(mime))
	for _, allowed := range s.UploadAllowedMimeTypes {
		if strings.EqualFold(mime, strings.TrimSpace(allowed)) {
			return true
		}
	}
	return false
}
