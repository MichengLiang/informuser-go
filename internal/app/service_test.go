package app

import (
	"context"
	"testing"
	"time"

	"github.com/t103o/informuser-go/internal/domain"
	"github.com/t103o/informuser-go/internal/store"
)

type stepClock struct {
	next time.Time
}

func (c *stepClock) Now() time.Time {
	current := c.next
	c.next = c.next.Add(time.Minute)
	return current
}

func newTestService(t *testing.T) *Service {
	t.Helper()

	repository, err := store.Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("open repository: %v", err)
	}
	t.Cleanup(func() {
		if err := repository.Close(); err != nil {
			t.Fatalf("close repository: %v", err)
		}
	})

	return NewService(repository, &stepClock{next: time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)})
}

func TestCreateTaskCreatesPendingTask(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)

	outcome, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Need review",
		Markdown:  "# Review",
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	if outcome.Status != CreateTaskCreated {
		t.Fatalf("status = %q, want %q", outcome.Status, CreateTaskCreated)
	}
	if outcome.Task.TaskID != "task-1" || outcome.Task.Status != domain.TaskStatusPending {
		t.Fatalf("unexpected task: %#v", outcome.Task)
	}
}

func TestCreateTaskIsIdempotentForExistingPendingTaskID(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)
	request := domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Original",
		Markdown:  "original",
	}

	if _, err := service.CreateTask(ctx, request); err != nil {
		t.Fatalf("create first task: %v", err)
	}
	outcome, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Replay should not overwrite",
		Markdown:  "replay",
	})
	if err != nil {
		t.Fatalf("replay task: %v", err)
	}

	if outcome.Status != CreateTaskExists {
		t.Fatalf("status = %q, want %q", outcome.Status, CreateTaskExists)
	}
	if outcome.Task.Title != "Original" {
		t.Fatalf("title = %q, want Original", outcome.Task.Title)
	}
}

func TestCreateTaskIsIdempotentForCompletedTaskID(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)
	request := domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Original",
		Markdown:  "original",
	}

	if _, err := service.CreateTask(ctx, request); err != nil {
		t.Fatalf("create task: %v", err)
	}
	if err := service.SubmitReply(ctx, SubmitReplyRequest{
		TaskID:      "task-1",
		UserInput:   "reply",
		ReplySource: "reply_panel",
	}); err != nil {
		t.Fatalf("submit reply: %v", err)
	}
	outcome, err := service.CreateTask(ctx, request)
	if err != nil {
		t.Fatalf("replay completed task: %v", err)
	}

	if outcome.Status != CreateTaskCompleted {
		t.Fatalf("status = %q, want %q", outcome.Status, CreateTaskCompleted)
	}
}

func TestCreateTaskSupersedesOlderPendingTaskInSameSession(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)

	if _, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Old",
		Markdown:  "old",
	}); err != nil {
		t.Fatalf("create old task: %v", err)
	}
	outcome, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-2",
		SessionID: "session-1",
		Title:     "New",
		Markdown:  "new",
	})
	if err != nil {
		t.Fatalf("create new task: %v", err)
	}

	if outcome.Status != CreateTaskCreated {
		t.Fatalf("status = %q, want %q", outcome.Status, CreateTaskCreated)
	}
	if outcome.SupersededTaskID != "task-1" {
		t.Fatalf("superseded task = %q, want task-1", outcome.SupersededTaskID)
	}

	result, err := service.TaskResult(ctx, "task-1")
	if err != nil {
		t.Fatalf("old task result: %v", err)
	}
	if result.Found {
		t.Fatal("cancelled superseded task should not produce a reply result")
	}
}

func TestSubmitReplyCompletesTask(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)

	if _, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Need reply",
		Markdown:  "body",
	}); err != nil {
		t.Fatalf("create task: %v", err)
	}
	if err := service.SubmitReply(ctx, SubmitReplyRequest{
		TaskID:      "task-1",
		UserInput:   "reply",
		ReplySource: "quick_paste",
	}); err != nil {
		t.Fatalf("submit reply: %v", err)
	}

	result, err := service.TaskResult(ctx, "task-1")
	if err != nil {
		t.Fatalf("task result: %v", err)
	}
	if !result.Found || result.UserInput != "reply" {
		t.Fatalf("result = %#v", result)
	}
}

func TestListPendingAndHistory(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)

	if _, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Pending",
		Markdown:  "body",
	}); err != nil {
		t.Fatalf("create pending: %v", err)
	}
	if _, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-2",
		SessionID: "session-2",
		Title:     "Complete me",
		Markdown:  "body",
	}); err != nil {
		t.Fatalf("create completed: %v", err)
	}
	if err := service.SubmitReply(ctx, SubmitReplyRequest{
		TaskID:      "task-2",
		UserInput:   "reply",
		ReplySource: "reply_panel",
	}); err != nil {
		t.Fatalf("submit reply: %v", err)
	}

	pending, err := service.ListPending(ctx)
	if err != nil {
		t.Fatalf("list pending: %v", err)
	}
	if len(pending) != 1 || pending[0].TaskID != "task-1" {
		t.Fatalf("pending = %#v", pending)
	}

	history, err := service.ListHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(history) != 1 || history[0].TaskID != "task-2" {
		t.Fatalf("history = %#v", history)
	}
}
