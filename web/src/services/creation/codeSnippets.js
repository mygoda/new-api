// services/creation/codeSnippets.js
//
// 把 normalize 后的请求 (req = { url, method, body }) 渲染成多语言代码片段。
// req.url 是相对路径如 /v1/images/generations
// 会自动拼接当前 window.location.origin 作为完整 URL。

const KEY_PLACEHOLDER = '<YOUR_API_KEY>';

function fullUrl(req) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return origin + req.url;
}

function jsonBodyText(req) {
  return JSON.stringify(req.body || {}, null, 2);
}

export function buildCurl(req, token) {
  const url = fullUrl(req);
  const key = token || KEY_PLACEHOLDER;
  const body = JSON.stringify(req.body || {}).replace(/'/g, `'\\''`);
  return [
    `curl -X ${req.method} '${url}' \\`,
    `  -H 'Authorization: Bearer ${key}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${body}'`,
  ].join('\n');
}

export function buildPython(req, token) {
  const url = fullUrl(req);
  const key = token || KEY_PLACEHOLDER;
  return [
    `import requests`,
    ``,
    `url = "${url}"`,
    `headers = {`,
    `    "Authorization": "Bearer ${key}",`,
    `    "Content-Type": "application/json",`,
    `}`,
    `payload = ${jsonBodyText(req)}`,
    ``,
    `resp = requests.${req.method.toLowerCase()}(url, headers=headers, json=payload)`,
    `resp.raise_for_status()`,
    `print(resp.json())`,
  ].join('\n');
}

export function buildJavaScript(req, token) {
  const url = fullUrl(req);
  const key = token || KEY_PLACEHOLDER;
  return [
    `const url = "${url}";`,
    `const payload = ${jsonBodyText(req)};`,
    ``,
    `const res = await fetch(url, {`,
    `  method: "${req.method}",`,
    `  headers: {`,
    `    "Authorization": "Bearer ${key}",`,
    `    "Content-Type": "application/json",`,
    `  },`,
    `  body: JSON.stringify(payload),`,
    `});`,
    `const data = await res.json();`,
    `console.log(data);`,
  ].join('\n');
}

export function buildGo(req, token) {
  const url = fullUrl(req);
  const key = token || KEY_PLACEHOLDER;
  // 用反引号原样嵌入 JSON
  const body = jsonBodyText(req);
  return [
    `package main`,
    ``,
    `import (`,
    `    "bytes"`,
    `    "fmt"`,
    `    "io"`,
    `    "net/http"`,
    `)`,
    ``,
    `func main() {`,
    `    url := "${url}"`,
    `    payload := []byte(\`${body}\`)`,
    ``,
    `    req, _ := http.NewRequest("${req.method}", url, bytes.NewReader(payload))`,
    `    req.Header.Set("Authorization", "Bearer ${key}")`,
    `    req.Header.Set("Content-Type", "application/json")`,
    ``,
    `    resp, err := http.DefaultClient.Do(req)`,
    `    if err != nil { panic(err) }`,
    `    defer resp.Body.Close()`,
    `    body, _ := io.ReadAll(resp.Body)`,
    `    fmt.Println(string(body))`,
    `}`,
  ].join('\n');
}

export function buildJava(req, token) {
  const url = fullUrl(req);
  const key = token || KEY_PLACEHOLDER;
  // Java 字符串里 JSON 转义太多，用 text block 简化（Java 15+）。
  // 旧版本可手动拼接，这里给 Java 17+ 写法。
  const body = jsonBodyText(req);
  return [
    `import java.net.URI;`,
    `import java.net.http.HttpClient;`,
    `import java.net.http.HttpRequest;`,
    `import java.net.http.HttpResponse;`,
    ``,
    `public class Demo {`,
    `    public static void main(String[] args) throws Exception {`,
    `        String payload = """`,
    `${body
      .split('\n')
      .map((l) => '            ' + l)
      .join('\n')}`,
    `            """;`,
    ``,
    `        HttpRequest req = HttpRequest.newBuilder()`,
    `            .uri(URI.create("${url}"))`,
    `            .header("Authorization", "Bearer ${key}")`,
    `            .header("Content-Type", "application/json")`,
    `            .${req.method.toLowerCase()}(HttpRequest.BodyPublishers.ofString(payload))`,
    `            .build();`,
    ``,
    `        HttpResponse<String> resp = HttpClient.newHttpClient()`,
    `            .send(req, HttpResponse.BodyHandlers.ofString());`,
    `        System.out.println(resp.body());`,
    `    }`,
    `}`,
  ].join('\n');
}

export const CODE_LANGS = [
  { key: 'curl', label: 'cURL', build: buildCurl, hl: 'bash' },
  { key: 'python', label: 'Python', build: buildPython, hl: 'python' },
  { key: 'javascript', label: 'JavaScript', build: buildJavaScript, hl: 'javascript' },
  { key: 'go', label: 'Go', build: buildGo, hl: 'go' },
  { key: 'java', label: 'Java', build: buildJava, hl: 'java' },
];
