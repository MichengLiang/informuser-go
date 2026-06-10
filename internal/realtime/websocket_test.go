package realtime

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestWebSocketHandlerStreamsPublishedEvents(t *testing.T) {
	hub := NewHub(4)
	server := httptest.NewServer(WebSocketHandler(hub))
	defer server.Close()

	url := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.Dial(context.Background(), url, nil)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.CloseNow()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	done := make(chan struct{})
	defer close(done)

	go func() {
		ticker := time.NewTicker(10 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				hub.Publish(map[string]string{"type": "task_created"})
			}
		}
	}()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read websocket event: %v", err)
	}
	if string(payload) != `{"type":"task_created"}` {
		t.Fatalf("payload = %s", payload)
	}
}
