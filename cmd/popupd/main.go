package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/t103o/informuser-go/internal/app"
	"github.com/t103o/informuser-go/internal/config"
	"github.com/t103o/informuser-go/internal/httpapi"
	"github.com/t103o/informuser-go/internal/realtime"
	"github.com/t103o/informuser-go/internal/store"
	"github.com/t103o/informuser-go/internal/webui"
)

func main() {
	if err := run(); err != nil {
		slog.Error("popup daemon stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.DaemonConfigFromEnv()
	ctx := context.Background()

	repository, err := store.Open(ctx, cfg.DatabasePath)
	if err != nil {
		return err
	}
	defer repository.Close()

	hub := realtime.NewHub(32)
	service := app.NewService(repository, app.RealClock{})
	router := httpapi.NewRouter(
		service,
		hub,
		realtime.WebSocketHandler(hub),
		httpapi.StaticHandler(webui.Files()),
	)

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	errs := make(chan error, 1)
	go func() {
		access := buildAccessURLs(cfg.Addr, net.InterfaceAddrs)
		slog.Info(
			"AskUser Popup daemon listening",
			"addr",
			cfg.Addr,
			"local_url",
			access.LocalURL,
			"lan_urls",
			access.LANURLs,
			"lan_hint",
			access.LANHint,
			"database",
			cfg.DatabasePath,
		)
		errs <- server.ListenAndServe()
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)

	select {
	case sig := <-signals:
		slog.Info("shutdown signal received", "signal", sig.String())
	case err := <-errs:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}
