package app

import (
	"context"
	"database/sql"
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
	service, _ := newTestServiceWithRepository(t)
	return service
}

func newTestServiceWithRepository(t *testing.T) (*Service, *store.TaskRepository) {
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

	return NewService(repository, &stepClock{next: time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)}), repository
}

func TestCreateTaskCreatesPendingTask(t *testing.T) {
	ctx := context.Background()
	service, repository := newTestServiceWithRepository(t)

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
	if outcome.Task.SessionDisplayName == "" || outcome.Task.SessionAutoName == "" {
		t.Fatalf("task session display fields should be populated: %#v", outcome.Task)
	}

	session, found, err := repository.FindSession(ctx, "session-1")
	if err != nil {
		t.Fatalf("find session: %v", err)
	}
	if !found {
		t.Fatal("session should be created with task")
	}
	if session.DisplayName != session.AutoName {
		t.Fatalf("new session = %#v, want display name initialized to auto name", session)
	}
}

func TestCreateTaskDoesNotOverwriteRenamedSessionDisplayName(t *testing.T) {
	ctx := context.Background()
	service, repository := newTestServiceWithRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if _, err := repository.EnsureSession(ctx, "session-1", now); err != nil {
		t.Fatalf("ensure session: %v", err)
	}
	if err := repository.UpdateSessionDisplayName(ctx, "session-1", "Spring", now.Add(time.Minute)); err != nil {
		t.Fatalf("rename session: %v", err)
	}

	outcome, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Need review",
		Markdown:  "body",
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	if outcome.Task.SessionDisplayName != "Spring" {
		t.Fatalf("task session display name = %q, want Spring", outcome.Task.SessionDisplayName)
	}
	session, found, err := repository.FindSession(ctx, "session-1")
	if err != nil {
		t.Fatalf("find session: %v", err)
	}
	if !found {
		t.Fatal("session should be found")
	}
	if session.DisplayName != "Spring" {
		t.Fatalf("session display name = %q, want Spring", session.DisplayName)
	}
}

func TestRenameSessionUpdatesDisplayNameAndAllowsDuplicates(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)

	if _, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Need review",
		Markdown:  "body",
	}); err != nil {
		t.Fatalf("create first task: %v", err)
	}
	if _, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-2",
		SessionID: "session-2",
		Title:     "Need review",
		Markdown:  "body",
	}); err != nil {
		t.Fatalf("create second task: %v", err)
	}

	first, err := service.RenameSession(ctx, "session-1", "  Spring  ")
	if err != nil {
		t.Fatalf("rename first session: %v", err)
	}
	second, err := service.RenameSession(ctx, "session-2", "Spring")
	if err != nil {
		t.Fatalf("rename second session: %v", err)
	}

	if first.DisplayName != "Spring" || second.DisplayName != "Spring" {
		t.Fatalf("renamed sessions = %#v and %#v, want duplicate display names", first, second)
	}
	if first.SessionID == second.SessionID {
		t.Fatalf("distinct sessions should remain distinct: %#v and %#v", first, second)
	}
}

func TestRenameSessionRejectsBlankAndMissingSession(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)

	if _, err := service.RenameSession(ctx, "session-1", " \t\n "); err == nil {
		t.Fatal("blank display name returned nil error")
	}
	if _, err := service.RenameSession(ctx, "missing-session", "Spring"); !IsNotFound(err) {
		t.Fatalf("rename missing session err = %v, want not found", err)
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

func TestCreateTaskIsIdempotentForCancelledTaskID(t *testing.T) {
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
	if err := service.CancelTask(ctx, "task-1", "manual_cancel"); err != nil {
		t.Fatalf("cancel task: %v", err)
	}
	outcome, err := service.CreateTask(ctx, request)
	if err != nil {
		t.Fatalf("replay cancelled task: %v", err)
	}

	if outcome.Status != CreateTaskExists {
		t.Fatalf("status = %q, want %q", outcome.Status, CreateTaskExists)
	}
	if outcome.Task.Status != domain.TaskStatusCancelled {
		t.Fatalf("task status = %q, want cancelled", outcome.Task.Status)
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

func TestCancelTaskUsesDefaultReason(t *testing.T) {
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
	if err := service.CancelTask(ctx, "task-1", ""); err != nil {
		t.Fatalf("cancel task: %v", err)
	}

	task, found, err := service.FindTask(ctx, "task-1")
	if err != nil {
		t.Fatalf("find cancelled task: %v", err)
	}
	if !found {
		t.Fatal("cancelled task should be found")
	}
	if task.Status != domain.TaskStatusCancelled || task.CancelReason != "cancelled_by_user" {
		t.Fatalf("cancelled task = %#v", task)
	}
}

func TestServiceRejectsInvalidOperations(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)

	if err := service.CancelTask(ctx, "", "reason"); err == nil {
		t.Fatal("cancel with empty task id returned nil error")
	}
	if _, err := service.TaskResult(ctx, ""); err == nil {
		t.Fatal("task result with empty task id returned nil error")
	}
	if _, _, err := service.FindTask(ctx, ""); err == nil {
		t.Fatal("find task with empty task id returned nil error")
	}
	if err := service.SubmitReply(ctx, SubmitReplyRequest{TaskID: "task-1"}); err == nil {
		t.Fatal("invalid submit reply returned nil error")
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

func TestListHistoryNormalizesBounds(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)

	if _, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Complete me",
		Markdown:  "body",
	}); err != nil {
		t.Fatalf("create task: %v", err)
	}
	if err := service.SubmitReply(ctx, SubmitReplyRequest{
		TaskID:      "task-1",
		UserInput:   "reply",
		ReplySource: "reply_panel",
	}); err != nil {
		t.Fatalf("submit reply: %v", err)
	}

	history, err := service.ListHistory(ctx, 0, -10)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(history) != 1 || history[0].TaskID != "task-1" {
		t.Fatalf("history = %#v", history)
	}
}

func TestArchiveAndUnarchiveHistoryTasksMoveCompletedTasksBetweenHistoryViews(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)

	if _, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Complete me",
		Markdown:  "body",
	}); err != nil {
		t.Fatalf("create task: %v", err)
	}
	if err := service.SubmitReply(ctx, SubmitReplyRequest{
		TaskID:      "task-1",
		UserInput:   "reply",
		ReplySource: "reply_panel",
	}); err != nil {
		t.Fatalf("submit reply: %v", err)
	}

	archive, err := service.ArchiveHistoryTasks(ctx, []string{"task-1"})
	if err != nil {
		t.Fatalf("archive task: %v", err)
	}
	if archive.Updated != 1 {
		t.Fatalf("archive updated = %d, want 1", archive.Updated)
	}
	history, err := service.ListHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(history) != 0 {
		t.Fatalf("active history = %#v, want empty", history)
	}
	archived, err := service.ListArchivedHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list archived history: %v", err)
	}
	if len(archived) != 1 || archived[0].TaskID != "task-1" || archived[0].ArchivedAt.IsZero() {
		t.Fatalf("archived history = %#v", archived)
	}

	repeatArchive, err := service.ArchiveHistoryTasks(ctx, []string{"task-1"})
	if err != nil {
		t.Fatalf("repeat archive task: %v", err)
	}
	if repeatArchive.Updated != 0 {
		t.Fatalf("repeat archive updated = %d, want 0", repeatArchive.Updated)
	}

	restore, err := service.UnarchiveHistoryTasks(ctx, []string{"task-1"})
	if err != nil {
		t.Fatalf("unarchive task: %v", err)
	}
	if restore.Updated != 1 {
		t.Fatalf("unarchive updated = %d, want 1", restore.Updated)
	}
	history, err = service.ListHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list restored history: %v", err)
	}
	if len(history) != 1 || history[0].TaskID != "task-1" || !history[0].ArchivedAt.IsZero() {
		t.Fatalf("restored history = %#v", history)
	}

	repeatRestore, err := service.UnarchiveHistoryTasks(ctx, []string{"task-1"})
	if err != nil {
		t.Fatalf("repeat unarchive task: %v", err)
	}
	if repeatRestore.Updated != 0 {
		t.Fatalf("repeat unarchive updated = %d, want 0", repeatRestore.Updated)
	}
}

func TestArchiveAndUnarchiveRejectInvalidTaskSets(t *testing.T) {
	ctx := context.Background()
	service := newTestService(t)

	if _, err := service.ArchiveHistoryTasks(ctx, nil); err == nil {
		t.Fatal("archive empty task ids returned nil error")
	}
	if _, err := service.UnarchiveHistoryTasks(ctx, nil); err == nil {
		t.Fatal("unarchive empty task ids returned nil error")
	}
	if _, err := service.ArchiveHistoryTasks(ctx, []string{"missing"}); err == nil {
		t.Fatal("archive missing task returned nil error")
	}
	if _, err := service.UnarchiveHistoryTasks(ctx, []string{"missing"}); err == nil {
		t.Fatal("unarchive missing task returned nil error")
	}

	if _, err := service.CreateTask(ctx, domain.CreateTaskRequest{
		TaskID:    "pending-task",
		SessionID: "session-1",
		Title:     "Pending",
		Markdown:  "body",
	}); err != nil {
		t.Fatalf("create pending task: %v", err)
	}
	if _, err := service.ArchiveHistoryTasks(ctx, []string{"pending-task"}); err == nil {
		t.Fatal("archive pending task returned nil error")
	}
	if _, err := service.UnarchiveHistoryTasks(ctx, []string{"pending-task"}); err == nil {
		t.Fatal("unarchive pending task returned nil error")
	}

	if err := service.CancelTask(ctx, "pending-task", "manual_cancel"); err != nil {
		t.Fatalf("cancel pending task: %v", err)
	}
	if _, err := service.ArchiveHistoryTasks(ctx, []string{"pending-task"}); err == nil {
		t.Fatal("archive cancelled task returned nil error")
	}
	if _, err := service.UnarchiveHistoryTasks(ctx, []string{"pending-task"}); err == nil {
		t.Fatal("unarchive cancelled task returned nil error")
	}
}

func TestNewServiceUsesRealClockWhenClockIsNil(t *testing.T) {
	repository, err := store.Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("open repository: %v", err)
	}
	t.Cleanup(func() {
		if err := repository.Close(); err != nil {
			t.Fatalf("close repository: %v", err)
		}
	})

	service := NewService(repository, nil)
	outcome, err := service.CreateTask(context.Background(), domain.CreateTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Need reply",
		Markdown:  "body",
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}
	if outcome.Task.CreatedAt.IsZero() {
		t.Fatal("real clock produced zero created_at")
	}
}

func TestIsNotFoundRecognizesSQLNoRows(t *testing.T) {
	if !IsNotFound(sql.ErrNoRows) {
		t.Fatal("sql.ErrNoRows should be recognized as not found")
	}
	if IsNotFound(context.Canceled) {
		t.Fatal("context.Canceled should not be recognized as not found")
	}
}
