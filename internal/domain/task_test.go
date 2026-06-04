package domain

import (
	"testing"
	"time"
)

func TestTaskStatusValues(t *testing.T) {
	tests := map[TaskStatus]string{
		TaskStatusPending:   "pending",
		TaskStatusCompleted: "completed",
		TaskStatusCancelled: "cancelled",
	}

	for status, want := range tests {
		if got := status.String(); got != want {
			t.Fatalf("status %q string = %q, want %q", status, got, want)
		}
	}
}

func TestCreateTaskRequestValidation(t *testing.T) {
	request := CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Need approval",
		Markdown:  "# Please review",
	}

	if err := request.Validate(); err != nil {
		t.Fatalf("valid request returned error: %v", err)
	}
}

func TestCreateTaskRequestValidationRejectsMissingFields(t *testing.T) {
	tests := map[string]CreateTaskRequest{
		"task id":    {SessionID: "session-1", Title: "title", Markdown: "body"},
		"session id": {TaskID: "task-1", Title: "title", Markdown: "body"},
		"title":      {TaskID: "task-1", SessionID: "session-1", Markdown: "body"},
		"markdown":   {TaskID: "task-1", SessionID: "session-1", Title: "title"},
	}

	for name, request := range tests {
		if err := request.Validate(); err == nil {
			t.Fatalf("missing %s returned nil error", name)
		}
	}
}

func TestReplyRequestValidation(t *testing.T) {
	request := ReplyRequest{
		TaskID:      "task-1",
		UserInput:   "approved",
		ReplySource: "quick_paste",
	}

	if err := request.Validate(); err != nil {
		t.Fatalf("valid reply returned error: %v", err)
	}
}

func TestReplyRequestValidationRejectsMissingFields(t *testing.T) {
	tests := map[string]ReplyRequest{
		"task id":    {UserInput: "approved"},
		"user input": {TaskID: "task-1"},
		"blank":      {TaskID: " \t", UserInput: " \n"},
	}

	for name, request := range tests {
		if err := request.Validate(); err == nil {
			t.Fatalf("missing %s returned nil error", name)
		}
	}
}

func TestTaskResultFound(t *testing.T) {
	completedAt := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	result := FoundTaskResult("reply", completedAt)

	if !result.Found {
		t.Fatal("result should be found")
	}
	if result.UserInput != "reply" {
		t.Fatalf("user input = %q, want reply", result.UserInput)
	}
	if !result.CompletedAt.Equal(completedAt) {
		t.Fatalf("completed_at = %s, want %s", result.CompletedAt, completedAt)
	}
}

func TestTaskResultNotFound(t *testing.T) {
	result := NotFoundTaskResult()

	if result.Found {
		t.Fatal("result should not be found")
	}
	if result.UserInput != "" {
		t.Fatalf("user input = %q, want empty", result.UserInput)
	}
	if !result.CompletedAt.IsZero() {
		t.Fatalf("completed_at = %s, want zero", result.CompletedAt)
	}
}
