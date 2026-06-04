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

func TestHubUsesDefaultBufferSize(t *testing.T) {
	hub := NewHub(0)
	subscriber := hub.Subscribe()
	defer hub.Unsubscribe(subscriber)

	for i := 0; i < 8; i++ {
		hub.Publish(map[string]int{"i": i})
	}

	received := 0
	for {
		select {
		case <-subscriber:
			received++
		default:
			if received != 8 {
				t.Fatalf("received = %d, want default buffer size 8", received)
			}
			return
		}
	}
}

func TestHubDropsEventsForFullSubscribers(t *testing.T) {
	hub := NewHub(1)
	subscriber := hub.Subscribe()
	defer hub.Unsubscribe(subscriber)

	hub.Publish(map[string]int{"i": 1})
	hub.Publish(map[string]int{"i": 2})

	received := 0
	for {
		select {
		case <-subscriber:
			received++
		default:
			if received != 1 {
				t.Fatalf("received = %d, want one buffered event", received)
			}
			return
		}
	}
}

func TestHubIgnoresUnserializableEvents(t *testing.T) {
	hub := NewHub(1)
	subscriber := hub.Subscribe()
	defer hub.Unsubscribe(subscriber)

	hub.Publish(func() {})

	select {
	case payload := <-subscriber:
		t.Fatalf("unexpected unserializable payload: %s", payload)
	case <-time.After(20 * time.Millisecond):
	}
}
