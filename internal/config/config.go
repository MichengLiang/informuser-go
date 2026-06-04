package config

import "os"

type DaemonConfig struct {
	Addr         string
	DatabasePath string
}

func DefaultDaemonConfig() DaemonConfig {
	return DaemonConfig{
		Addr:         "127.0.0.1:8765",
		DatabasePath: "askuser-popup.db",
	}
}

func DaemonConfigFromEnv() DaemonConfig {
	cfg := DefaultDaemonConfig()
	if value := os.Getenv("ASKUSER_ADDR"); value != "" {
		cfg.Addr = value
	}
	if value := os.Getenv("ASKUSER_DB"); value != "" {
		cfg.DatabasePath = value
	}
	return cfg
}
