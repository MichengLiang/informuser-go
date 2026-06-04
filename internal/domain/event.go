package domain

import "time"

type EventType string

const (
	EventTypeTaskCreated   EventType = "task_created"
	EventTypeTaskCompleted EventType = "task_completed"
	EventTypeTaskCancelled EventType = "task_cancelled"
)

type TaskEvent struct {
	Type        EventType
	Task        Task
	TaskID      string
	SessionID   string
	CompletedAt time.Time
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
