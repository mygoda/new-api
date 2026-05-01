package storage

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
)

func TestLocalStorage_PutGetExistsDelete(t *testing.T) {
	tmp := t.TempDir()
	cs := system_setting.GetCreationSetting()
	original := *cs
	defer func() { *cs = original; Reset() }()

	cs.UploadDriver = "local"
	cs.LocalUploadPath = tmp
	cs.LocalPublicBaseURL = ""
	Reset()

	st, err := Get()
	if err != nil {
		t.Fatalf("Get(): %v", err)
	}
	if st.Driver() != "local" {
		t.Fatalf("driver = %s, want local", st.Driver())
	}

	ctx := context.Background()
	key := "1/20260501/abc.png"
	body := strings.NewReader("hello world")

	url, err := st.Put(ctx, key, body, int64(body.Len()), PutOptions{ContentType: "image/png"})
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if url == "" {
		t.Fatalf("Put returned empty url")
	}
	if !strings.HasPrefix(url, "/api/upload/file/") {
		t.Errorf("expected proxy URL prefix, got %q", url)
	}

	exists, err := st.Exists(ctx, key)
	if err != nil || !exists {
		t.Fatalf("Exists: %v exists=%v", err, exists)
	}

	rc, ct, err := st.Get(ctx, key)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if string(data) != "hello world" {
		t.Errorf("got %q, want hello world", string(data))
	}
	if ct != "image/png" {
		t.Errorf("content type = %q", ct)
	}

	if err := st.Delete(ctx, key); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	exists, _ = st.Exists(ctx, key)
	if exists {
		t.Errorf("expected deleted, still exists")
	}
}

func TestValidateKey(t *testing.T) {
	bad := []string{"", "..", "../etc/passwd", "/abs/path", "foo/../bar"}
	for _, k := range bad {
		if err := validateKey(k); err == nil {
			t.Errorf("validateKey(%q) should fail", k)
		}
	}
	ok := []string{"a", "a/b/c.png", "1/20260501/x.jpg", "user-1/abc_def-2.webp"}
	for _, k := range ok {
		if err := validateKey(k); err != nil {
			t.Errorf("validateKey(%q) unexpected err: %v", k, err)
		}
	}
}

func TestPublicBaseURL_OverridesDefault(t *testing.T) {
	tmp := t.TempDir()
	cs := system_setting.GetCreationSetting()
	original := *cs
	defer func() { *cs = original; Reset() }()

	cs.UploadDriver = "local"
	cs.LocalUploadPath = tmp
	cs.LocalPublicBaseURL = "https://cdn.example.com/up/"
	Reset()

	st, err := Get()
	if err != nil {
		t.Fatalf("Get(): %v", err)
	}
	url, err := st.Put(context.Background(), "k.txt", strings.NewReader("x"), 1, PutOptions{ContentType: "text/plain"})
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if !strings.HasPrefix(url, "https://cdn.example.com/up/") {
		t.Errorf("expected base URL prefix, got %q", url)
	}
}
