package store

import (
	"context"
	"testing"
	"time"

	"github.com/t103o/informuser-go/internal/domain"
)

func newTestRepository(t *testing.T) *TaskRepository {
	t.Helper()

	repository, err := Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("open repository: %v", err)
	}
	t.Cleanup(func() {
		if err := repository.Close(); err != nil {
			t.Fatalf("close repository: %v", err)
		}
	})

	return repository
}

func sampleTask(id string, sessionID string, createdAt time.Time) domain.Task {
	return domain.Task{
		TaskID:    id,
		SessionID: sessionID,
		Title:     "Need review",
		Markdown:  "# Review this",
		Status:    domain.TaskStatusPending,
		CreatedAt: createdAt,
		UpdatedAt: createdAt,
	}
}

func TestInsertAndFindTaskByID(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	task, found, err := repository.FindTaskByID(ctx, "task-1")
	if err != nil {
		t.Fatalf("find task: %v", err)
	}
	if !found {
		t.Fatal("task should be found")
	}
	if task.TaskID != "task-1" || task.SessionID != "session-1" {
		t.Fatalf("unexpected task: %#v", task)
	}
}

func TestInsertTaskRejectsDuplicateTaskID(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert first task: %v", err)
	}

	err := repository.InsertTask(ctx, sampleTask("task-1", "session-2", now))
	if err == nil {
		t.Fatal("duplicate task id returned nil error")
	}
}

func TestFindPendingBySessionID(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	task, found, err := repository.FindPendingBySessionID(ctx, "session-1")
	if err != nil {
		t.Fatalf("find pending: %v", err)
	}
	if !found {
		t.Fatal("pending task should be found")
	}
	if task.TaskID != "task-1" {
		t.Fatalf("task id = %q, want task-1", task.TaskID)
	}
}

func TestPendingSessionUniquenessIsEnforced(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert first task: %v", err)
	}

	err := repository.InsertTask(ctx, sampleTask("task-2", "session-1", now))
	if err == nil {
		t.Fatal("second pending task in same session returned nil error")
	}
}

func TestCancelTaskClearsPendingSessionSlot(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	later := now.Add(time.Minute)

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert task: %v", err)
	}
	if err := repository.CancelTask(ctx, "task-1", "superseded", later); err != nil {
		t.Fatalf("cancel task: %v", err)
	}
	if err := repository.InsertTask(ctx, sampleTask("task-2", "session-1", later)); err != nil {
		t.Fatalf("insert replacement task: %v", err)
	}

	cancelled, found, err := repository.FindTaskByID(ctx, "task-1")
	if err != nil {
		t.Fatalf("find cancelled task: %v", err)
	}
	if !found || cancelled.Status != domain.TaskStatusCancelled {
		t.Fatalf("cancelled task = %#v, found=%v", cancelled, found)
	}
}

func TestCompleteTaskStoresReplyAndResult(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	completedAt := now.Add(time.Minute)

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert task: %v", err)
	}
	if err := repository.CompleteTask(ctx, "task-1", "reply", "quick_paste", completedAt); err != nil {
		t.Fatalf("complete task: %v", err)
	}

	result, err := repository.TaskResult(ctx, "task-1")
	if err != nil {
		t.Fatalf("task result: %v", err)
	}
	if !result.Found || result.UserInput != "reply" {
		t.Fatalf("result = %#v", result)
	}
}

func TestListPendingAndHistory(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert pending task: %v", err)
	}
	if err := repository.InsertTask(ctx, sampleTask("task-2", "session-2", now.Add(time.Second))); err != nil {
		t.Fatalf("insert completed task: %v", err)
	}
	if err := repository.CompleteTask(ctx, "task-2", "reply", "reply_panel", now.Add(time.Minute)); err != nil {
		t.Fatalf("complete task: %v", err)
	}

	pending, err := repository.ListPending(ctx)
	if err != nil {
		t.Fatalf("list pending: %v", err)
	}
	if len(pending) != 1 || pending[0].TaskID != "task-1" {
		t.Fatalf("pending = %#v", pending)
	}

	history, err := repository.ListHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(history) != 1 || history[0].TaskID != "task-2" {
		t.Fatalf("history = %#v", history)
	}
}
