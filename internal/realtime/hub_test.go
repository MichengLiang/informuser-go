package realtime

import (
	"testing"
	"time"
)

func TestHubPublishesToSubscribers(t *testing.T) {
	hub := NewHub(4)
	subscriber := hub.Subscribe()
	defer hub.Unsubscribe(subscriber)

	hub.Publish(map[string]string{"type": "task_created"})

	select {
	case payload := <-subscriber:
		if string(payload) != `{"type":"task_created"}` {
			t.Fatalf("payload = %s", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
	}
}

func TestHubUnsubscribeStopsDelivery(t *testing.T) {
	hub := NewHub(4)
	subscriber := hub.Subscribe()
	hub.Unsubscribe(subscriber)

	hub.Publish(map[string]string{"type": "task_created"})

	select {
	case payload := <-subscriber:
		t.Fatalf("unexpected payload after unsubscribe: %s", payload)
	case <-time.After(20 * time.Millisecond):
	}
}
