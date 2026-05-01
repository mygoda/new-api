package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/QuantumNous/new-api/setting/system_setting"
)

type localStorage struct {
	rootPath      string
	publicBaseURL string // 例如 https://cdn.example.com/uploads；为空使用 /api/upload/file
}

func newLocalStorage(cs *system_setting.CreationSetting) (Storage, error) {
	root := cs.LocalUploadPath
	if root == "" {
		root = "./data/uploads"
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("storage local: resolve abs path: %w", err)
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, fmt.Errorf("storage local: ensure dir: %w", err)
	}
	return &localStorage{
		rootPath:      abs,
		publicBaseURL: strings.TrimRight(cs.LocalPublicBaseURL, "/"),
	}, nil
}

func (l *localStorage) Driver() string { return "local" }

func (l *localStorage) Put(ctx context.Context, key string, body io.Reader, _ int64, opts PutOptions) (string, error) {
	if err := validateKey(key); err != nil {
		return "", err
	}
	full := filepath.Join(l.rootPath, key)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return "", fmt.Errorf("storage local: mkdir: %w", err)
	}
	f, err := os.OpenFile(full, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return "", fmt.Errorf("storage local: open: %w", err)
	}
	defer f.Close()
	if _, err := io.Copy(f, body); err != nil {
		return "", fmt.Errorf("storage local: write: %w", err)
	}
	return l.PublicURL(key), nil
}

func (l *localStorage) Delete(_ context.Context, key string) error {
	if err := validateKey(key); err != nil {
		return err
	}
	full := filepath.Join(l.rootPath, key)
	if err := os.Remove(full); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("storage local: remove: %w", err)
	}
	return nil
}

func (l *localStorage) Exists(_ context.Context, key string) (bool, error) {
	if err := validateKey(key); err != nil {
		return false, err
	}
	full := filepath.Join(l.rootPath, key)
	_, err := os.Stat(full)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, err
}

func (l *localStorage) Get(_ context.Context, key string) (io.ReadCloser, string, error) {
	if err := validateKey(key); err != nil {
		return nil, "", err
	}
	full := filepath.Join(l.rootPath, key)
	f, err := os.Open(full)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, "", ErrNoSuchKey
		}
		return nil, "", err
	}
	return f, detectContentTypeFromExt(key), nil
}

// PublicURL 返回该 key 的对外 URL
func (l *localStorage) PublicURL(key string) string {
	if l.publicBaseURL != "" {
		return l.publicBaseURL + "/" + key
	}
	return "/api/upload/file/" + key
}

// validateKey 拒绝路径穿越
func validateKey(key string) error {
	if key == "" {
		return errors.New("storage: empty key")
	}
	if strings.Contains(key, "..") || strings.HasPrefix(key, "/") || strings.HasPrefix(key, "\\") {
		return errors.New("storage: invalid key")
	}
	return nil
}

func detectContentTypeFromExt(key string) string {
	ext := strings.ToLower(filepath.Ext(key))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	}
	return "application/octet-stream"
}
