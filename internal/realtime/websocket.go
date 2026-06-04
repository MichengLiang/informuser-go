package realtime

import (
	"net/http"

	"github.com/coder/websocket"
)

func WebSocketHandler(hub *Hub) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()

		events := hub.Subscribe()
		defer hub.Unsubscribe(events)

		for {
			select {
			case <-r.Context().Done():
				return
			case payload := <-events:
				if err := conn.Write(r.Context(), websocket.MessageText, payload); err != nil {
					return
				}
			}
		}
	})
}
