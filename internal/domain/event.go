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
	Type        EventType `json:"type"`
	Task        Task      `json:"task,omitempty"`
	TaskID      string    `json:"task_id,omitempty"`
	SessionID   string    `json:"session_id,omitempty"`
	CompletedAt time.Time `json:"completed_at,omitempty"`
}

func (e TaskEvent) MarshalJSON() ([]byte, error) {
	type taskEventJSON struct {
		Type        EventType  `json:"type"`
		Task        *Task      `json:"task,omitempty"`
		TaskID      string     `json:"task_id,omitempty"`
		SessionID   string     `json:"session_id,omitempty"`
		CompletedAt *time.Time `json:"completed_at,omitempty"`
	}
	value := taskEventJSON{
		Type:      e.Type,
		TaskID:    e.TaskID,
		SessionID: e.SessionID,
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

func NewTaskCompletedEvent(taskID string, sessionID string, completedAt time.Time) TaskEvent {
	return TaskEvent{
		Type:        EventTypeTaskCompleted,
		TaskID:      taskID,
		SessionID:   sessionID,
		CompletedAt: completedAt,
	}
}

func NewTaskCancelledEvent(taskID string, sessionID string) TaskEvent {
	return TaskEvent{
		Type:      EventTypeTaskCancelled,
		TaskID:    taskID,
		SessionID: sessionID,
	}
}
