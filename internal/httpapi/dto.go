package httpapi

import (
	"time"

	"github.com/MichengLiang/informuser-go/internal/app"
	"github.com/MichengLiang/informuser-go/internal/domain"
)

type createTaskRequest struct {
	TaskID    string `json:"task_id"`
	SessionID string `json:"session_id"`
	Abstract  string `json:"abstract"`
	Content   string `json:"content"`
	Title     string `json:"title"`
	Markdown  string `json:"markdown"`
}

func (r createTaskRequest) domainRequest() domain.CreateTaskRequest {
	title := r.Title
	if title == "" {
		title = r.Abstract
	}
	markdown := r.Markdown
	if markdown == "" {
		markdown = r.Content
	}
	return domain.CreateTaskRequest{
		TaskID:    r.TaskID,
		SessionID: r.SessionID,
		Title:     title,
		Markdown:  markdown,
	}
}

type createTaskResponse struct {
	Status           string   `json:"status"`
	Task             taskDTO  `json:"task"`
	SupersededTaskID string   `json:"superseded_task_id,omitempty"`
	Events           []string `json:"events,omitempty"`
}

func newCreateTaskResponse(outcome app.CreateTaskOutcome) createTaskResponse {
	return createTaskResponse{
		Status:           string(outcome.Status),
		Task:             newTaskDTO(outcome.Task),
		SupersededTaskID: outcome.SupersededTaskID,
	}
}

type submitReplyRequest struct {
	UserInput   string `json:"user_input"`
	ReplySource string `json:"reply_source"`
}

type renameSessionRequest struct {
	DisplayName string `json:"display_name"`
}

type sessionDTO struct {
	SessionID   string `json:"session_id"`
	DisplayName string `json:"display_name"`
	AutoName    string `json:"auto_name"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	LastSeenAt  string `json:"last_seen_at"`
}

func newSessionDTO(session domain.Session) sessionDTO {
	return sessionDTO{
		SessionID:   session.SessionID,
		DisplayName: session.DisplayName,
		AutoName:    session.AutoName,
		CreatedAt:   formatJSONTime(session.CreatedAt),
		UpdatedAt:   formatJSONTime(session.UpdatedAt),
		LastSeenAt:  formatJSONTime(session.LastSeenAt),
	}
}

type historyTasksRequest struct {
	TaskIDs []string `json:"task_ids"`
}

type historyTasksResponse struct {
	Status  string `json:"status"`
	Updated int    `json:"updated"`
}

func newHistoryTasksResponse(outcome app.HistoryTasksOutcome) historyTasksResponse {
	return historyTasksResponse{
		Status:  "ok",
		Updated: outcome.Updated,
	}
}

type taskResultResponse struct {
	Status      string `json:"status"`
	UserInput   string `json:"user_input,omitempty"`
	CompletedAt string `json:"completed_at,omitempty"`
}

func newTaskResultResponse(result domain.TaskResult) taskResultResponse {
	if !result.Found {
		return taskResultResponse{Status: "not_found"}
	}
	return taskResultResponse{
		Status:      "found",
		UserInput:   result.UserInput,
		CompletedAt: formatJSONTime(result.CompletedAt),
	}
}

type listTasksResponse struct {
	Tasks []taskDTO `json:"tasks"`
}

func newListTasksResponse(tasks []domain.Task) listTasksResponse {
	items := make([]taskDTO, 0, len(tasks))
	for _, task := range tasks {
		items = append(items, newTaskDTO(task))
	}
	return listTasksResponse{Tasks: items}
}

type taskDTO struct {
	TaskID             string `json:"task_id"`
	SessionID          string `json:"session_id"`
	SessionDisplayName string `json:"session_display_name"`
	SessionAutoName    string `json:"session_auto_name"`
	Title              string `json:"title"`
	Markdown           string `json:"markdown"`
	Status             string `json:"status"`
	UserInput          string `json:"user_input,omitempty"`
	ReplySource        string `json:"reply_source,omitempty"`
	CancelReason       string `json:"cancel_reason,omitempty"`
	CreatedAt          string `json:"created_at"`
	CompletedAt        string `json:"completed_at,omitempty"`
	ArchivedAt         string `json:"archived_at,omitempty"`
	UpdatedAt          string `json:"updated_at"`
}

func newTaskDTO(task domain.Task) taskDTO {
	return taskDTO{
		TaskID:             task.TaskID,
		SessionID:          task.SessionID,
		SessionDisplayName: task.SessionDisplayName,
		SessionAutoName:    task.SessionAutoName,
		Title:              task.Title,
		Markdown:           task.Markdown,
		Status:             task.Status.String(),
		UserInput:          task.UserInput,
		ReplySource:        task.ReplySource,
		CancelReason:       task.CancelReason,
		CreatedAt:          formatJSONTime(task.CreatedAt),
		CompletedAt:        formatOptionalJSONTime(task.CompletedAt),
		ArchivedAt:         formatOptionalJSONTime(task.ArchivedAt),
		UpdatedAt:          formatJSONTime(task.UpdatedAt),
	}
}

func formatJSONTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func formatOptionalJSONTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return formatJSONTime(value)
}
