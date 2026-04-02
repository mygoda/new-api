package service

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

var dorisEndpointLogOnce sync.Once

type dorisEndpoint struct {
	host      string
	httpPort  int
	queryPort int
}

func resolveDorisEndpoint() dorisEndpoint {
	rawHost := strings.TrimSpace(common.DorisHost)
	host := rawHost
	httpPort := common.DorisPort
	queryPort := common.DorisQueryPort
	changed := false

	if host == "" {
		return dorisEndpoint{
			host:      host,
			httpPort:  httpPort,
			queryPort: queryPort,
		}
	}

	if strings.Contains(host, "://") {
		if u, err := url.Parse(host); err == nil && u.Host != "" {
			host = u.Host
			changed = true
		}
	}
	if at := strings.LastIndex(host, "@"); at >= 0 {
		host = host[at+1:]
		changed = true
	}
	host = strings.TrimSpace(host)

	if h, p, ok := splitHostAndPort(host); ok {
		host = h
		if os.Getenv("DORIS_PORT") == "" {
			httpPort = p
		}
		changed = true
	}
	host = strings.Trim(strings.TrimSpace(host), "[]")

	if httpPort == 8040 {
		httpPort = 8030
		changed = true
	}

	if isLoopbackHost(host) {
		serviceName := strings.TrimSpace(os.Getenv("DORIS_DOCKER_SERVICE_NAME"))
		if serviceName != "" {
			host = serviceName
			changed = true
		} else if inDocker() {
			host = "doris"
			changed = true
		}
	}

	if changed {
		finalHost := host
		finalHTTPPort := httpPort
		dorisEndpointLogOnce.Do(func() {
			common.SysLog(fmt.Sprintf(
				"Doris endpoint normalized for runtime: %q -> %q:%d (query port %d)",
				rawHost, finalHost, finalHTTPPort, queryPort,
			))
		})
	}

	return dorisEndpoint{
		host:      host,
		httpPort:  httpPort,
		queryPort: queryPort,
	}
}

func splitHostAndPort(input string) (string, int, bool) {
	if h, p, err := net.SplitHostPort(input); err == nil {
		port, convErr := strconv.Atoi(strings.TrimSpace(p))
		if convErr != nil || port <= 0 {
			return "", 0, false
		}
		return h, port, true
	}

	if strings.Count(input, ":") == 1 {
		idx := strings.LastIndex(input, ":")
		if idx > 0 && idx < len(input)-1 {
			port, convErr := strconv.Atoi(strings.TrimSpace(input[idx+1:]))
			if convErr == nil && port > 0 {
				return input[:idx], port, true
			}
		}
	}

	return "", 0, false
}

func isLoopbackHost(host string) bool {
	switch strings.ToLower(strings.TrimSpace(host)) {
	case "127.0.0.1", "localhost", "::1":
		return true
	default:
		return false
	}
}

func inDocker() bool {
	_, err := os.Stat("/.dockerenv")
	return err == nil
}
