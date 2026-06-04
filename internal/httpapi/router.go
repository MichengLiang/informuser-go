package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/t103o/informuser-go/internal/app"
)

type EventPublisher interface {
	Publish(v any)
}

func NewRouter(service *app.Service, publisher EventPublisher) http.Handler {
	handlers := &Handlers{service: service, publisher: publisher}

	router := chi.NewRouter()
	router.Get("/api/health", handlers.health)
	router.Post("/api/tasks", handlers.createTask)
	router.Get("/api/tasks/pending", handlers.listPending)
	router.Get("/api/tasks/{task_id}", handlers.findTask)
	router.Get("/api/tasks/{task_id}/result", handlers.taskResult)
	router.Post("/api/tasks/{task_id}/reply", handlers.submitReply)
	router.Post("/api/tasks/{task_id}/cancel", handlers.cancelTask)
	router.Get("/api/history", handlers.listHistory)
	return router
}
