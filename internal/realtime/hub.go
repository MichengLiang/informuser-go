package realtime

import (
	"encoding/json"
	"sync"
)

type Hub struct {
	mu          sync.RWMutex
	bufferSize  int
	subscribers map[chan []byte]struct{}
}

func NewHub(bufferSize int) *Hub {
	if bufferSize <= 0 {
		bufferSize = 8
	}
	return &Hub{
		bufferSize:  bufferSize,
		subscribers: make(map[chan []byte]struct{}),
	}
}

func (h *Hub) Subscribe() chan []byte {
	h.mu.Lock()
	defer h.mu.Unlock()

	ch := make(chan []byte, h.bufferSize)
	h.subscribers[ch] = struct{}{}
	return ch
}

func (h *Hub) Unsubscribe(ch chan []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	delete(h.subscribers, ch)
}

func (h *Hub) Publish(v any) {
	payload, err := json.Marshal(v)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for subscriber := range h.subscribers {
		// Browser events are a UI freshness projection, not the durable MCP
		// response path. A slow browser tab must not block task creation or reply
		// submission, so stale subscribers may drop intermediate events.
		select {
		case subscriber <- payload:
		default:
		}
	}
}
