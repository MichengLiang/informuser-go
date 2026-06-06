package domain

import (
	"encoding/json"
	"time"
)

type EventType string

const (
	EventTypeTaskCreated   EventType = "task_created"
	EventTypeTaskCompleted EventType = "task_completed"
	EventTypeTaskCancelled EventType = "task_cancelled"
)

type TaskEvent struct {
	Type              EventType `json:"type"`
	Task              Task      `json:"task,omitempty"`
	TaskID            string    `json:"task_id,omitempty"`
	SessionID         string    `json:"session_id,omitempty"`
	CompletedAt       time.Time `json:"completed_at,omitempty"`
	ReplySource       string    `json:"reply_source,omitempty"`
	CancelReason      string    `json:"cancel_reason,omitempty"`
	ReplacementTaskID string    `json:"replacement_task_id,omitempty"`
}

func (e TaskEvent) MarshalJSON() ([]byte, error) {
	type taskEventJSON struct {
		Type              EventType  `json:"type"`
		Task              *Task      `json:"task,omitempty"`
		TaskID            string     `json:"task_id,omitempty"`
		SessionID         string     `json:"session_id,omitempty"`
		CompletedAt       *time.Time `json:"completed_at,omitempty"`
		ReplySource       string     `json:"reply_source,omitempty"`
		CancelReason      string     `json:"cancel_reason,omitempty"`
		ReplacementTaskID string     `json:"replacement_task_id,omitempty"`
	}
	value := taskEventJSON{
		Type:              e.Type,
		TaskID:            e.TaskID,
		SessionID:         e.SessionID,
		ReplySource:       e.ReplySource,
		CancelReason:      e.CancelReason,
		ReplacementTaskID: e.ReplacementTaskID,
	}
	if e.Task.TaskID != "" {
		value.Task = &e.Task
	}
	if !e.CompletedAt.IsZero() {
		value.CompletedAt = &e.CompletedAt
	}
	return json.Marshal(value)
}

func NewTaskCreatedEvent(task Task) TaskEvent {
	return TaskEvent{
		Type: EventTypeTaskCreated,
		Task: task,
	}
}

func NewTaskCompletedEvent(taskID string, sessionID string, completedAt time.Time, replySource string) TaskEvent {
	return TaskEvent{
		Type:        EventTypeTaskCompleted,
		TaskID:      taskID,
		SessionID:   sessionID,
		CompletedAt: completedAt,
		ReplySource: replySource,
	}
}

func NewTaskCancelledEvent(taskID string, sessionID string, cancelReason string, replacementTaskID string) TaskEvent {
	return TaskEvent{
		Type:              EventTypeTaskCancelled,
		TaskID:            taskID,
		SessionID:         sessionID,
		CancelReason:      cancelReason,
		ReplacementTaskID: replacementTaskID,
	}
}
