package store

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/MichengLiang/informuser-go/internal/domain"
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

func TestListHistoryUsesStableTaskIDTieBreaker(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	completedAt := now.Add(time.Minute)

	for _, taskID := range []string{"task-a", "task-c", "task-b"} {
		if err := repository.InsertTask(ctx, sampleTask(taskID, "session-"+taskID, now)); err != nil {
			t.Fatalf("insert %s: %v", taskID, err)
		}
		if err := repository.CompleteTask(ctx, taskID, "reply", "reply_panel", completedAt); err != nil {
			t.Fatalf("complete %s: %v", taskID, err)
		}
	}

	firstPage, err := repository.ListHistory(ctx, 2, 0)
	if err != nil {
		t.Fatalf("list first history page: %v", err)
	}
	secondPage, err := repository.ListHistory(ctx, 2, 2)
	if err != nil {
		t.Fatalf("list second history page: %v", err)
	}

	got := append(taskIDs(firstPage), taskIDs(secondPage)...)
	want := []string{"task-c", "task-b", "task-a"}
	if !equalStrings(got, want) {
		t.Fatalf("history order = %v, want %v", got, want)
	}
}

func TestArchiveAndUnarchiveHistoryTasks(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	completedAt := now.Add(time.Minute)
	archivedAt := completedAt.Add(time.Minute)

	if _, err := repository.EnsureSession(ctx, "session-1", now); err != nil {
		t.Fatalf("ensure session: %v", err)
	}
	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert task: %v", err)
	}
	if err := repository.CompleteTask(ctx, "task-1", "reply", "reply_panel", completedAt); err != nil {
		t.Fatalf("complete task: %v", err)
	}

	updated, err := repository.ArchiveHistoryTasks(ctx, []string{"task-1"}, archivedAt)
	if err != nil {
		t.Fatalf("archive task: %v", err)
	}
	if updated != 1 {
		t.Fatalf("archive updated = %d, want 1", updated)
	}
	history, err := repository.ListHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(history) != 0 {
		t.Fatalf("active history = %#v, want empty", history)
	}
	archived, err := repository.ListArchivedHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list archived history: %v", err)
	}
	if len(archived) != 1 || archived[0].TaskID != "task-1" || !archived[0].ArchivedAt.Equal(archivedAt) {
		t.Fatalf("archived history = %#v", archived)
	}

	updated, err = repository.ArchiveHistoryTasks(ctx, []string{"task-1"}, archivedAt.Add(time.Minute))
	if err != nil {
		t.Fatalf("repeat archive task: %v", err)
	}
	if updated != 0 {
		t.Fatalf("repeat archive updated = %d, want 0", updated)
	}

	updated, err = repository.UnarchiveHistoryTasks(ctx, []string{"task-1"}, archivedAt.Add(time.Minute))
	if err != nil {
		t.Fatalf("unarchive task: %v", err)
	}
	if updated != 1 {
		t.Fatalf("unarchive updated = %d, want 1", updated)
	}
	history, err = repository.ListHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list restored history: %v", err)
	}
	if len(history) != 1 || history[0].TaskID != "task-1" || !history[0].ArchivedAt.IsZero() {
		t.Fatalf("restored history = %#v", history)
	}

	updated, err = repository.UnarchiveHistoryTasks(ctx, []string{"task-1"}, archivedAt.Add(2*time.Minute))
	if err != nil {
		t.Fatalf("repeat unarchive task: %v", err)
	}
	if updated != 0 {
		t.Fatalf("repeat unarchive updated = %d, want 0", updated)
	}
}

func TestListArchivedHistoryUsesStableTieBreakers(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	completedAt := now.Add(time.Minute)
	archivedAt := completedAt.Add(time.Minute)

	for _, taskID := range []string{"task-a", "task-c", "task-b"} {
		if err := repository.InsertTask(ctx, sampleTask(taskID, "session-"+taskID, now)); err != nil {
			t.Fatalf("insert %s: %v", taskID, err)
		}
		if err := repository.CompleteTask(ctx, taskID, "reply", "reply_panel", completedAt); err != nil {
			t.Fatalf("complete %s: %v", taskID, err)
		}
	}
	if _, err := repository.ArchiveHistoryTasks(ctx, []string{"task-a", "task-c", "task-b"}, archivedAt); err != nil {
		t.Fatalf("archive tasks: %v", err)
	}

	firstPage, err := repository.ListArchivedHistory(ctx, 2, 0)
	if err != nil {
		t.Fatalf("list first archived page: %v", err)
	}
	secondPage, err := repository.ListArchivedHistory(ctx, 2, 2)
	if err != nil {
		t.Fatalf("list second archived page: %v", err)
	}

	got := append(taskIDs(firstPage), taskIDs(secondPage)...)
	want := []string{"task-c", "task-b", "task-a"}
	if !equalStrings(got, want) {
		t.Fatalf("archived history order = %v, want %v", got, want)
	}
}

func TestArchiveAndUnarchiveDeduplicateTaskIDsAndUnarchiveUpdatesTimestamp(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	completedAt := now.Add(time.Minute)
	archivedAt := completedAt.Add(time.Minute)
	unarchivedAt := archivedAt.Add(time.Minute)

	if err := repository.InsertTask(ctx, sampleTask("task-1", "session-1", now)); err != nil {
		t.Fatalf("insert task: %v", err)
	}
	if err := repository.CompleteTask(ctx, "task-1", "reply", "reply_panel", completedAt); err != nil {
		t.Fatalf("complete task: %v", err)
	}
	updated, err := repository.ArchiveHistoryTasks(ctx, []string{"task-1", "task-1"}, archivedAt)
	if err != nil {
		t.Fatalf("archive duplicate ids: %v", err)
	}
	if updated != 1 {
		t.Fatalf("archive duplicate updated = %d, want 1", updated)
	}

	updated, err = repository.UnarchiveHistoryTasks(ctx, []string{"task-1", "task-1"}, unarchivedAt)
	if err != nil {
		t.Fatalf("unarchive duplicate ids: %v", err)
	}
	if updated != 1 {
		t.Fatalf("unarchive duplicate updated = %d, want 1", updated)
	}
	task, found, err := repository.FindTaskByID(ctx, "task-1")
	if err != nil {
		t.Fatalf("find unarchived task: %v", err)
	}
	if !found {
		t.Fatal("task should be found")
	}
	if !task.UpdatedAt.Equal(unarchivedAt) {
		t.Fatalf("unarchived updated_at = %s, want %s", task.UpdatedAt, unarchivedAt)
	}
}

func TestArchiveAndUnarchiveAreAtomicForMixedValidAndInvalidIDs(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	completedAt := now.Add(time.Minute)
	archivedAt := completedAt.Add(time.Minute)

	if err := repository.InsertTask(ctx, sampleTask("valid-task", "session-1", now)); err != nil {
		t.Fatalf("insert valid task: %v", err)
	}
	if err := repository.CompleteTask(ctx, "valid-task", "reply", "reply_panel", completedAt); err != nil {
		t.Fatalf("complete valid task: %v", err)
	}
	if _, err := repository.ArchiveHistoryTasks(ctx, []string{"valid-task", "missing-task"}, archivedAt); err == nil {
		t.Fatal("archive mixed valid and missing ids returned nil error")
	}
	task, found, err := repository.FindTaskByID(ctx, "valid-task")
	if err != nil {
		t.Fatalf("find valid task after failed archive: %v", err)
	}
	if !found {
		t.Fatal("valid task should be found")
	}
	if !task.ArchivedAt.IsZero() {
		t.Fatalf("valid task archived_at = %s after failed archive, want zero", task.ArchivedAt)
	}

	if _, err := repository.ArchiveHistoryTasks(ctx, []string{"valid-task"}, archivedAt); err != nil {
		t.Fatalf("archive valid task: %v", err)
	}
	if _, err := repository.UnarchiveHistoryTasks(ctx, []string{"valid-task", "missing-task"}, archivedAt.Add(time.Minute)); err == nil {
		t.Fatal("unarchive mixed valid and missing ids returned nil error")
	}
	task, found, err = repository.FindTaskByID(ctx, "valid-task")
	if err != nil {
		t.Fatalf("find valid task after failed unarchive: %v", err)
	}
	if !found {
		t.Fatal("valid task should be found")
	}
	if task.ArchivedAt.IsZero() {
		t.Fatal("valid task should remain archived after failed unarchive")
	}
}

func TestArchiveAndUnarchiveRejectMissingAndNonCompletedTasks(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if err := repository.InsertTask(ctx, sampleTask("pending-task", "session-1", now)); err != nil {
		t.Fatalf("insert pending task: %v", err)
	}
	if err := repository.InsertTask(ctx, sampleTask("cancelled-task", "session-2", now)); err != nil {
		t.Fatalf("insert cancelled task: %v", err)
	}
	if err := repository.CancelTask(ctx, "cancelled-task", "manual_cancel", now.Add(time.Minute)); err != nil {
		t.Fatalf("cancel task: %v", err)
	}

	for _, ids := range [][]string{{"missing-task"}, {"pending-task"}, {"cancelled-task"}} {
		if _, err := repository.ArchiveHistoryTasks(ctx, ids, now.Add(time.Hour)); err == nil {
			t.Fatalf("archive ids %v returned nil error", ids)
		}
		if _, err := repository.UnarchiveHistoryTasks(ctx, ids, now.Add(time.Hour)); err == nil {
			t.Fatalf("unarchive ids %v returned nil error", ids)
		}
	}
}

func taskIDs(tasks []domain.Task) []string {
	ids := make([]string, 0, len(tasks))
	for _, task := range tasks {
		ids = append(ids, task.TaskID)
	}
	return ids
}

func equalStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}
