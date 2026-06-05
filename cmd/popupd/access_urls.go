package main

import (
	"fmt"
	"net"
	"net/netip"
	"slices"
	"strings"
)

type accessURLs struct {
	LocalURL string
	LANURLs  []string
	LANHint  string
}

type interfaceAddrsFunc func() ([]net.Addr, error)

func buildAccessURLs(addr string, interfaceAddrs interfaceAddrsFunc) accessURLs {
	host, port := splitListenAddr(addr)
	info := accessURLs{
		LocalURL: browserURL(localAccessHost(host), port),
	}

	if isWildcardHost(host) {
		info.LANURLs = lanURLsForPort(port, interfaceAddrs)
		if len(info.LANURLs) == 0 {
			info.LANHint = "No private LAN IPv4 address was detected."
		}
		return info
	}

	parsed, err := netip.ParseAddr(strings.Trim(host, "[]"))
	if err == nil && parsed.Is4() && !parsed.IsLoopback() && !parsed.IsLinkLocalUnicast() {
		info.LANURLs = []string{browserURL(host, port)}
		return info
	}

	if parsed.IsLoopback() || strings.EqualFold(host, "localhost") {
		info.LANHint = "LAN access is disabled while listening on loopback; set ASKUSER_ADDR=0.0.0.0:" + port
	}
	return info
}

func splitListenAddr(addr string) (string, string) {
	host, port, err := net.SplitHostPort(addr)
	if err == nil {
		return host, port
	}
	if strings.HasPrefix(addr, ":") {
		return "", strings.TrimPrefix(addr, ":")
	}
	return addr, ""
}

func localAccessHost(host string) string {
	if isWildcardHost(host) {
		return "127.0.0.1"
	}
	return host
}

func isWildcardHost(host string) bool {
	switch strings.Trim(host, "[]") {
	case "", "0.0.0.0", "::":
		return true
	default:
		return false
	}
}

func lanURLsForPort(port string, interfaceAddrs interfaceAddrsFunc) []string {
	addrs, err := interfaceAddrs()
	if err != nil {
		return nil
	}

	urls := make([]string, 0)
	seen := make(map[string]struct{})
	for _, addr := range addrs {
		prefix, err := netip.ParsePrefix(addr.String())
		if err != nil {
			continue
		}
		ip := prefix.Addr()
		if !isUsableLANIPv4(ip) {
			continue
		}
		host := ip.String()
		if _, ok := seen[host]; ok {
			continue
		}
		seen[host] = struct{}{}
		urls = append(urls, browserURL(host, port))
	}
	slices.Sort(urls)
	return urls
}

func isUsableLANIPv4(ip netip.Addr) bool {
	return ip.Is4() && ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast()
}

func browserURL(host string, port string) string {
	if port == "" {
		return fmt.Sprintf("http://%s/", host)
	}
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		host = "[" + host + "]"
	}
	return fmt.Sprintf("http://%s:%s/", host, port)
}
