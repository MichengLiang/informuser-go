package domain

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestTaskCreatedEvent(t *testing.T) {
	createdAt := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	task := Task{
		TaskID:             "task-1",
		SessionID:          "session-1",
		Title:              "Need review",
		Markdown:           "# Review",
		Status:             TaskStatusPending,
		SessionDisplayName: "Spring",
		SessionAutoName:    "S-ABCDE",
		CreatedAt:          createdAt,
		UpdatedAt:          createdAt,
	}

	event := NewTaskCreatedEvent(task)

	if event.Type != EventTypeTaskCreated {
		t.Fatalf("event type = %q, want %q", event.Type, EventTypeTaskCreated)
	}
	if event.Task.TaskID != "task-1" {
		t.Fatalf("event task id = %q, want task-1", event.Task.TaskID)
	}
	if event.Task.SessionDisplayName != "Spring" || event.Task.SessionAutoName != "S-ABCDE" {
		t.Fatalf("event task session fields = %#v", event.Task)
	}
}

func TestTaskCreatedEventJSONOmitsZeroArchivedAt(t *testing.T) {
	createdAt := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	event := NewTaskCreatedEvent(Task{
		TaskID:             "task-1",
		SessionID:          "session-1",
		Title:              "Need review",
		Markdown:           "# Review",
		Status:             TaskStatusPending,
		SessionDisplayName: "Spring",
		SessionAutoName:    "S-ABCDE",
		CreatedAt:          createdAt,
		UpdatedAt:          createdAt,
	})

	payload, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}

	if strings.Contains(string(payload), "0001-01-01") {
		t.Fatalf("task_created payload contains truthy zero time: %s", payload)
	}
	if strings.Contains(string(payload), `"archived_at"`) {
		t.Fatalf("pending task_created payload should omit archived_at: %s", payload)
	}
}

func TestTaskCompletedEvent(t *testing.T) {
	completedAt := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	event := NewTaskCompletedEvent("task-1", "session-1", completedAt)

	if event.Type != EventTypeTaskCompleted {
		t.Fatalf("event type = %q, want %q", event.Type, EventTypeTaskCompleted)
	}
	if event.TaskID != "task-1" {
		t.Fatalf("event task id = %q, want task-1", event.TaskID)
	}
	if event.SessionID != "session-1" {
		t.Fatalf("event session id = %q, want session-1", event.SessionID)
	}
	if !event.CompletedAt.Equal(completedAt) {
		t.Fatalf("completed_at = %s, want %s", event.CompletedAt, completedAt)
	}
}

func TestTaskCancelledEvent(t *testing.T) {
	event := NewTaskCancelledEvent("task-1", "session-1")

	if event.Type != EventTypeTaskCancelled {
		t.Fatalf("event type = %q, want %q", event.Type, EventTypeTaskCancelled)
	}
	if event.TaskID != "task-1" {
		t.Fatalf("event task id = %q, want task-1", event.TaskID)
	}
	if event.SessionID != "session-1" {
		t.Fatalf("event session id = %q, want session-1", event.SessionID)
	}
}
