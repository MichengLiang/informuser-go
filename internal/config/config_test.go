package config

import "testing"

func TestDefaultDaemonConfig(t *testing.T) {
	cfg := DefaultDaemonConfig()

	if cfg.Addr != "0.0.0.0:8765" {
		t.Fatalf("addr = %q, want 0.0.0.0:8765", cfg.Addr)
	}
	if cfg.DatabasePath == "" {
		t.Fatal("database path should not be empty")
	}
}

func TestDaemonConfigFromEnv(t *testing.T) {
	t.Setenv("ASKUSER_ADDR", "127.0.0.1:9999")
	t.Setenv("ASKUSER_DB", "/tmp/askuser.db")

	cfg := DaemonConfigFromEnv()

	if cfg.Addr != "127.0.0.1:9999" {
		t.Fatalf("addr = %q, want env value", cfg.Addr)
	}
	if cfg.DatabasePath != "/tmp/askuser.db" {
		t.Fatalf("database path = %q, want env value", cfg.DatabasePath)
	}
}
