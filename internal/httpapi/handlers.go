package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/t103o/informuser-go/internal/app"
	"github.com/t103o/informuser-go/internal/domain"
)

type Handlers struct {
	service   *app.Service
	publisher EventPublisher
}

func (h *Handlers) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handlers) createTask(w http.ResponseWriter, r *http.Request) {
	var request createTaskRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	outcome, err := h.service.CreateTask(r.Context(), request.domainRequest())
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	if h.publisher != nil {
		if outcome.SupersededTaskID != "" {
			h.publisher.Publish(domain.NewTaskCancelledEvent(outcome.SupersededTaskID, request.SessionID))
		}
		if outcome.Status == app.CreateTaskCreated {
			h.publisher.Publish(domain.NewTaskCreatedEvent(outcome.Task))
		}
	}
	writeJSON(w, http.StatusOK, newCreateTaskResponse(outcome))
}

func (h *Handlers) listPending(w http.ResponseWriter, r *http.Request) {
	tasks, err := h.service.ListPending(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, newListTasksResponse(tasks))
}

func (h *Handlers) findTask(w http.ResponseWriter, r *http.Request) {
	task, found, err := h.service.FindTask(r.Context(), chi.URLParam(r, "task_id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, errors.New("task not found"))
		return
	}
	writeJSON(w, http.StatusOK, newTaskDTO(task))
}

func (h *Handlers) taskResult(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.TaskResult(r.Context(), chi.URLParam(r, "task_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, newTaskResultResponse(result))
}

func (h *Handlers) submitReply(w http.ResponseWriter, r *http.Request) {
	var request submitReplyRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	taskID := chi.URLParam(r, "task_id")
	task, found, err := h.service.FindTask(r.Context(), taskID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, errors.New("task not found"))
		return
	}

	err = h.service.SubmitReply(r.Context(), app.SubmitReplyRequest{
		TaskID:      taskID,
		UserInput:   request.UserInput,
		ReplySource: request.ReplySource,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	result, err := h.service.TaskResult(r.Context(), taskID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if h.publisher != nil && result.Found {
		h.publisher.Publish(domain.NewTaskCompletedEvent(taskID, task.SessionID, result.CompletedAt))
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handlers) cancelTask(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "task_id")
	task, found, err := h.service.FindTask(r.Context(), taskID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, errors.New("task not found"))
		return
	}
	if err := h.service.CancelTask(r.Context(), taskID, "cancelled_by_user"); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if h.publisher != nil {
		h.publisher.Publish(domain.NewTaskCancelledEvent(taskID, task.SessionID))
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handlers) listHistory(w http.ResponseWriter, r *http.Request) {
	limit := parseIntDefault(r.URL.Query().Get("limit"), 50)
	offset := parseIntDefault(r.URL.Query().Get("offset"), 0)

	tasks, err := h.service.ListHistory(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, newListTasksResponse(tasks))
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func parseIntDefault(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
