// Package storage 提供对象存储抽象，支持 local 文件系统与 S3 兼容存储。
//
// 接入的 S3 兼容服务包括但不限于：
//   - AWS S3
//   - 阿里云 OSS（设置 endpoint 为 https://oss-{region}.aliyuncs.com）
//   - 腾讯云 COS（设置 endpoint 为 https://cos.{region}.myqcloud.com）
//   - 火山引擎 TOS（设置 endpoint 为 https://tos-s3-{region}.volces.com）
//   - MinIO 自建（设置 path style = true）
package storage

import (
	"context"
	"errors"
	"io"
	"sync"

	"github.com/QuantumNous/new-api/setting/system_setting"
)

// PutOptions 上传可选项
type PutOptions struct {
	ContentType string
	// CacheControl 可选；默认 "public, max-age=31536000"
	CacheControl string
}

// Storage 存储后端接口。Key 不带前缀（前缀由实现自行加），调用方传入相对路径。
type Storage interface {
	// Put 写入对象，返回外部可访问的 URL
	Put(ctx context.Context, key string, body io.Reader, size int64, opts PutOptions) (publicURL string, err error)
	// Delete 删除对象
	Delete(ctx context.Context, key string) error
	// Exists 检查对象是否存在
	Exists(ctx context.Context, key string) (bool, error)
	// Get 读取对象（local 模式回源用；S3 模式可借助签名 URL，但当前未使用）
	Get(ctx context.Context, key string) (io.ReadCloser, string, error)
	// Driver 返回驱动名
	Driver() string
}

var (
	currentMu sync.RWMutex
	current   Storage
	loadedKey string // 用于检测设置变化
)

// ErrNoSuchKey 对象不存在
var ErrNoSuchKey = errors.New("storage: no such key")

// Get 返回当前生效的存储实例。每次调用都会按当前 system_setting 状态决定是否重建。
func Get() (Storage, error) {
	cs := system_setting.GetCreationSetting()
	key := configKey(cs)

	currentMu.RLock()
	if current != nil && key == loadedKey {
		s := current
		currentMu.RUnlock()
		return s, nil
	}
	currentMu.RUnlock()

	currentMu.Lock()
	defer currentMu.Unlock()
	// 双重检查
	if current != nil && key == loadedKey {
		return current, nil
	}

	s, err := newStorage(cs)
	if err != nil {
		return nil, err
	}
	current = s
	loadedKey = key
	return s, nil
}

// Reset 强制丢弃缓存，下次 Get 会重新构建
func Reset() {
	currentMu.Lock()
	current = nil
	loadedKey = ""
	currentMu.Unlock()
}

func configKey(cs *system_setting.CreationSetting) string {
	// 任何影响 client 构造的字段拼接进去；用 \x00 分隔避免歧义
	return cs.UploadDriver + "\x00" + cs.LocalUploadPath + "\x00" + cs.LocalPublicBaseURL +
		"\x00" + cs.S3Endpoint + "\x00" + cs.S3Region + "\x00" + cs.S3Bucket +
		"\x00" + cs.S3AccessKeyID + "\x00" + cs.S3AccessKeySecret +
		"\x00" + cs.S3PublicBaseURL + "\x00" + cs.S3KeyPrefix +
		"\x00" + boolStr(cs.S3UsePathStyle)
}

func boolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

func newStorage(cs *system_setting.CreationSetting) (Storage, error) {
	switch cs.UploadDriver {
	case "s3":
		return newS3Storage(cs)
	case "local", "":
		return newLocalStorage(cs)
	default:
		return nil, errors.New("storage: unknown upload driver: " + cs.UploadDriver)
	}
}
