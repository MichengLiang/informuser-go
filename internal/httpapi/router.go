package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/t103o/informuser-go/internal/app"
)

type EventPublisher interface {
	Publish(v any)
}

func NewRouter(
	service *app.Service,
	publisher EventPublisher,
	eventHandler ...http.Handler,
) http.Handler {
	handlers := &Handlers{service: service, publisher: publisher}

	router := chi.NewRouter()
	router.Get("/api/health", handlers.health)
	router.Post("/api/tasks", handlers.createTask)
	router.Get("/api/tasks/pending", handlers.listPending)
	router.Get("/api/tasks/{task_id}", handlers.findTask)
	router.Get("/api/tasks/{task_id}/result", handlers.taskResult)
	router.Post("/api/tasks/{task_id}/reply", handlers.submitReply)
	router.Post("/api/tasks/{task_id}/cancel", handlers.cancelTask)
	router.Patch("/api/sessions/{session_id}", handlers.renameSession)
	router.Get("/api/history", handlers.listHistory)
	router.Get("/api/history/archived", handlers.listArchivedHistory)
	router.Post("/api/history/archive", handlers.archiveHistoryTasks)
	router.Post("/api/history/unarchive", handlers.unarchiveHistoryTasks)
	if len(eventHandler) > 0 && eventHandler[0] != nil {
		router.Handle("/api/events/ws", eventHandler[0])
	}
	if len(eventHandler) > 1 && eventHandler[1] != nil {
		router.Handle("/*", eventHandler[1])
	}
	return router
}
