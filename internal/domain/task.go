package domain

import (
	"errors"
	"strings"
	"time"
)

type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusCancelled TaskStatus = "cancelled"
)

func (s TaskStatus) String() string {
	return string(s)
}

type Task struct {
	TaskID             string     `json:"task_id"`
	SessionID          string     `json:"session_id"`
	SessionDisplayName string     `json:"session_display_name"`
	SessionAutoName    string     `json:"session_auto_name"`
	Title              string     `json:"title"`
	Markdown           string     `json:"markdown"`
	Status             TaskStatus `json:"status"`
	UserInput          string     `json:"user_input,omitempty"`
	ReplySource        string     `json:"reply_source,omitempty"`
	CancelReason       string     `json:"cancel_reason,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	CompletedAt        time.Time  `json:"completed_at,omitempty"`
	ArchivedAt         time.Time  `json:"archived_at,omitempty"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type CreateTaskRequest struct {
	TaskID    string
	SessionID string
	Title     string
	Markdown  string
}

func (r CreateTaskRequest) Validate() error {
	switch {
	case strings.TrimSpace(r.TaskID) == "":
		return errors.New("task_id is required")
	case strings.TrimSpace(r.SessionID) == "":
		return errors.New("session_id is required")
	case strings.TrimSpace(r.Title) == "":
		return errors.New("title is required")
	case strings.TrimSpace(r.Markdown) == "":
		return errors.New("markdown is required")
	default:
		return nil
	}
}

type ReplyRequest struct {
	TaskID      string
	UserInput   string
	ReplySource string
}

func (r ReplyRequest) Validate() error {
	switch {
	case strings.TrimSpace(r.TaskID) == "":
		return errors.New("task_id is required")
	case strings.TrimSpace(r.UserInput) == "":
		return errors.New("user_input is required")
	default:
		return nil
	}
}

type TaskResult struct {
	Found       bool
	UserInput   string
	CompletedAt time.Time
}

func FoundTaskResult(userInput string, completedAt time.Time) TaskResult {
	return TaskResult{
		Found:       true,
		UserInput:   userInput,
		CompletedAt: completedAt,
	}
}

func NotFoundTaskResult() TaskResult {
	return TaskResult{}
}
