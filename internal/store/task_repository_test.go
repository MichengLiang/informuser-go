package store

import (
	"context"
	"database/sql"
	"errors"
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

func TestFindTaskByIDAndPendingReturnNotFound(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)

	task, found, err := repository.FindTaskByID(ctx, "missing")
	if err != nil {
		t.Fatalf("find missing task: %v", err)
	}
	if found || task.TaskID != "" {
		t.Fatalf("missing task = %#v, found=%v", task, found)
	}

	task, found, err = repository.FindPendingBySessionID(ctx, "missing-session")
	if err != nil {
		t.Fatalf("find missing pending: %v", err)
	}
	if found || task.TaskID != "" {
		t.Fatalf("missing pending = %#v, found=%v", task, found)
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

func TestCancelTaskRejectsMissingAndCompletedTasks(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if err := repository.CancelTask(ctx, "missing", "reason", now); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("cancel missing err = %v, want sql.ErrNoRows", err)
	}

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert task: %v", err)
	}
	if err := repository.CompleteTask(ctx, "task-1", "reply", "reply_panel", now.Add(time.Minute)); err != nil {
		t.Fatalf("complete task: %v", err)
	}
	if err := repository.CancelTask(ctx, "task-1", "reason", now.Add(2*time.Minute)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("cancel completed err = %v, want sql.ErrNoRows", err)
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

func TestCompleteTaskRejectsMissingAndCancelledTasks(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if err := repository.CompleteTask(ctx, "missing", "reply", "reply_panel", now); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("complete missing err = %v, want sql.ErrNoRows", err)
	}

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert task: %v", err)
	}
	if err := repository.CancelTask(ctx, "task-1", "reason", now.Add(time.Minute)); err != nil {
		t.Fatalf("cancel task: %v", err)
	}
	if err := repository.CompleteTask(ctx, "task-1", "reply", "reply_panel", now.Add(2*time.Minute)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("complete cancelled err = %v, want sql.ErrNoRows", err)
	}
}

func TestTaskResultReturnsNotFoundForPendingAndMissingTasks(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	pending, err := repository.TaskResult(ctx, "task-1")
	if err != nil {
		t.Fatalf("pending result: %v", err)
	}
	if pending.Found {
		t.Fatalf("pending result = %#v, want not found", pending)
	}

	missing, err := repository.TaskResult(ctx, "missing")
	if err != nil {
		t.Fatalf("missing result: %v", err)
	}
	if missing.Found {
		t.Fatalf("missing result = %#v, want not found", missing)
	}
}

func TestListPendingAndHistory(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if _, err := repository.EnsureSession(ctx, "session-1", now); err != nil {
		t.Fatalf("ensure pending session: %v", err)
	}
	if _, err := repository.EnsureSession(ctx, "session-2", now); err != nil {
		t.Fatalf("ensure history session: %v", err)
	}
	if err := repository.UpdateSessionDisplayName(ctx, "session-2", "History Session", now); err != nil {
		t.Fatalf("rename history session: %v", err)
	}
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
	if pending[0].SessionDisplayName == "" || pending[0].SessionAutoName == "" {
		t.Fatalf("pending session display fields should be populated: %#v", pending[0])
	}

	history, err := repository.ListHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(history) != 1 || history[0].TaskID != "task-2" {
		t.Fatalf("history = %#v", history)
	}
	if history[0].SessionDisplayName != "History Session" || history[0].SessionAutoName == "" {
		t.Fatalf("history session display fields should be populated: %#v", history[0])
	}
}
