package main

import (
	"net"
	"reflect"
	"testing"
)

type stubAddr string

func (addr stubAddr) Network() string { return "ip+net" }
func (addr stubAddr) String() string  { return string(addr) }

func TestBuildAccessURLsForLoopbackListener(t *testing.T) {
	info := buildAccessURLs("127.0.0.1:8765", func() ([]net.Addr, error) {
		return []net.Addr{stubAddr("192.168.1.20/24")}, nil
	})

	if info.LocalURL != "http://127.0.0.1:8765/" {
		t.Fatalf("local url = %q, want clickable loopback URL", info.LocalURL)
	}
	if len(info.LANURLs) != 0 {
		t.Fatalf("LAN URLs = %#v, want none for loopback-only listener", info.LANURLs)
	}
	if info.LANHint == "" {
		t.Fatal("loopback listener should explain how to enable LAN access")
	}
}

func TestBuildAccessURLsForWildcardListener(t *testing.T) {
	info := buildAccessURLs(":8765", func() ([]net.Addr, error) {
		return []net.Addr{
			stubAddr("127.0.0.1/8"),
			stubAddr("169.254.10.20/16"),
			stubAddr("192.168.1.20/24"),
			stubAddr("10.0.0.8/24"),
		}, nil
	})

	if info.LocalURL != "http://127.0.0.1:8765/" {
		t.Fatalf("local url = %q, want clickable loopback URL", info.LocalURL)
	}
	wantLAN := []string{"http://10.0.0.8:8765/", "http://192.168.1.20:8765/"}
	if !reflect.DeepEqual(info.LANURLs, wantLAN) {
		t.Fatalf("LAN URLs = %#v, want %#v", info.LANURLs, wantLAN)
	}
	if info.LANHint != "" {
		t.Fatalf("LAN hint = %q, want empty when LAN URLs are available", info.LANHint)
	}
}

func TestBuildAccessURLsForSpecificLANListener(t *testing.T) {
	info := buildAccessURLs("192.168.1.20:8765", func() ([]net.Addr, error) {
		return []net.Addr{stubAddr("10.0.0.8/24")}, nil
	})

	if info.LocalURL != "http://192.168.1.20:8765/" {
		t.Fatalf("local url = %q, want listener URL", info.LocalURL)
	}
	wantLAN := []string{"http://192.168.1.20:8765/"}
	if !reflect.DeepEqual(info.LANURLs, wantLAN) {
		t.Fatalf("LAN URLs = %#v, want %#v", info.LANURLs, wantLAN)
	}
}
