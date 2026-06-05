package store

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/MichengLiang/informuser-go/internal/domain"
)

func TestEnsureSessionCreatesSessionAndPreservesRenamedDisplayName(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	later := now.Add(time.Hour)

	session, err := repository.EnsureSession(ctx, "session-1", now)
	if err != nil {
		t.Fatalf("ensure session: %v", err)
	}
	if session.SessionID != "session-1" {
		t.Fatalf("session id = %q, want session-1", session.SessionID)
	}
	if session.DisplayName == "" || session.DisplayName != session.AutoName {
		t.Fatalf("new session = %#v, want display name initialized to auto name", session)
	}

	if err := repository.UpdateSessionDisplayName(ctx, "session-1", "Spring", later); err != nil {
		t.Fatalf("rename session: %v", err)
	}
	ensured, err := repository.EnsureSession(ctx, "session-1", later.Add(time.Hour))
	if err != nil {
		t.Fatalf("ensure renamed session: %v", err)
	}
	if ensured.DisplayName != "Spring" {
		t.Fatalf("display name = %q, want Spring", ensured.DisplayName)
	}
	if !ensured.LastSeenAt.Equal(later.Add(time.Hour)) {
		t.Fatalf("last_seen_at = %s, want %s", ensured.LastSeenAt, later.Add(time.Hour))
	}
}

func TestFindAndUpdateSessionHandleMissingSession(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	now := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	session, found, err := repository.FindSession(ctx, "missing-session")
	if err != nil {
		t.Fatalf("find missing session: %v", err)
	}
	if found || session.SessionID != "" {
		t.Fatalf("missing session = %#v, found=%v", session, found)
	}

	err = repository.UpdateSessionDisplayName(ctx, "missing-session", "Spring", now)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("update missing session err = %v, want sql.ErrNoRows", err)
	}
}

func TestOpenBackfillsSessionsForExistingTasksWithoutOverwritingNames(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "tasks.db")
	repository, err := Open(ctx, dbPath)
	if err != nil {
		t.Fatalf("open repository: %v", err)
	}

	createdAt := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	updatedAt := createdAt.Add(time.Hour)
	if _, err := repository.db.ExecContext(ctx, `INSERT INTO tasks (
task_id, session_id, title, markdown, status, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"task-1", "session-1", "Need review", "body", domain.TaskStatusPending.String(),
		formatTime(createdAt), formatTime(updatedAt),
	); err != nil {
		t.Fatalf("insert legacy task: %v", err)
	}
	if _, err := repository.db.ExecContext(ctx, `INSERT INTO sessions (
session_id, display_name, auto_name, created_at, updated_at, last_seen_at
) VALUES (?, ?, ?, ?, ?, ?)`,
		"session-2", "Renamed", domain.AutomaticSessionName("session-2"),
		formatTime(createdAt), formatTime(updatedAt), formatTime(updatedAt),
	); err != nil {
		t.Fatalf("insert existing session: %v", err)
	}
	if _, err := repository.db.ExecContext(ctx, `INSERT INTO tasks (
task_id, session_id, title, markdown, status, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"task-2", "session-2", "Existing session", "body", domain.TaskStatusPending.String(),
		formatTime(createdAt), formatTime(updatedAt.Add(time.Hour)),
	); err != nil {
		t.Fatalf("insert task with existing session: %v", err)
	}
	if err := repository.Close(); err != nil {
		t.Fatalf("close initial repository: %v", err)
	}

	repository, err = Open(ctx, dbPath)
	if err != nil {
		t.Fatalf("open migrated repository: %v", err)
	}
	t.Cleanup(func() {
		if err := repository.Close(); err != nil {
			t.Fatalf("close repository: %v", err)
		}
	})

	backfilled, found, err := repository.FindSession(ctx, "session-1")
	if err != nil {
		t.Fatalf("find backfilled session: %v", err)
	}
	if !found {
		t.Fatal("backfilled session should be found")
	}
	if backfilled.DisplayName != domain.AutomaticSessionName("session-1") {
		t.Fatalf("backfilled display name = %q, want automatic name", backfilled.DisplayName)
	}

	existing, found, err := repository.FindSession(ctx, "session-2")
	if err != nil {
		t.Fatalf("find existing session: %v", err)
	}
	if !found {
		t.Fatal("existing session should be found")
	}
	if existing.DisplayName != "Renamed" {
		t.Fatalf("existing display name = %q, want Renamed", existing.DisplayName)
	}

	if _, err := os.Stat(dbPath); err != nil {
		t.Fatalf("database should remain at %s: %v", dbPath, err)
	}
}

func TestBackfillSessionsComputesTimestampsByParsedTime(t *testing.T) {
	ctx := context.Background()
	repository := newTestRepository(t)
	fractionalSecond := time.Date(2026, 6, 5, 1, 0, 0, 900000000, time.UTC)
	wholeSecond := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)

	if _, err := repository.db.ExecContext(ctx, `INSERT INTO tasks (
task_id, session_id, title, markdown, status, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
		"task-1", "session-lexical", "Earlier", "body", domain.TaskStatusPending.String(),
		formatTime(fractionalSecond), formatTime(fractionalSecond),
		"task-2", "session-lexical", "Later", "body", domain.TaskStatusCancelled.String(),
		formatTime(wholeSecond), formatTime(wholeSecond),
	); err != nil {
		t.Fatalf("insert tasks: %v", err)
	}
	if err := repository.BackfillSessions(ctx); err != nil {
		t.Fatalf("backfill sessions: %v", err)
	}

	session, found, err := repository.FindSession(ctx, "session-lexical")
	if err != nil {
		t.Fatalf("find session: %v", err)
	}
	if !found {
		t.Fatal("backfilled session should be found")
	}
	if !session.CreatedAt.Equal(wholeSecond) {
		t.Fatalf("created_at = %s, want %s", session.CreatedAt, wholeSecond)
	}
	if !session.LastSeenAt.Equal(fractionalSecond) {
		t.Fatalf("last_seen_at = %s, want %s", session.LastSeenAt, fractionalSecond)
	}
}

func TestBackfillSessionsRejectsMalformedTaskTimestamps(t *testing.T) {
	ctx := context.Background()
	tests := map[string]struct {
		createdAt string
		updatedAt string
	}{
		"created_at": {createdAt: "not-a-time", updatedAt: formatTime(time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC))},
		"updated_at": {createdAt: formatTime(time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)), updatedAt: "not-a-time"},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			repository := newTestRepository(t)
			if _, err := repository.db.ExecContext(ctx, `INSERT INTO tasks (
task_id, session_id, title, markdown, status, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				"task-"+name, "session-"+name, "Malformed", "body", domain.TaskStatusPending.String(),
				test.createdAt, test.updatedAt,
			); err != nil {
				t.Fatalf("insert malformed task: %v", err)
			}

			if err := repository.BackfillSessions(ctx); err == nil {
				t.Fatal("backfill malformed task timestamp returned nil error")
			}
		})
	}
}

func TestOpenMigratesPreSessionSchemaAndBackfillsTaskSessionFields(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy sqlite: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
  user_input TEXT NOT NULL DEFAULT '',
  reply_source TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_tasks_pending_session
ON tasks(session_id)
WHERE status = 'pending';
CREATE INDEX idx_tasks_status_created
ON tasks(status, created_at DESC);
CREATE INDEX idx_tasks_completed_at
ON tasks(completed_at DESC);
`); err != nil {
		_ = db.Close()
		t.Fatalf("create legacy schema: %v", err)
	}
	createdAt := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	updatedAt := createdAt.Add(time.Minute)
	if _, err := db.ExecContext(ctx, `INSERT INTO tasks (
task_id, session_id, title, markdown, status, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"task-legacy", "session-legacy", "Legacy", "body", domain.TaskStatusPending.String(),
		formatTime(createdAt), formatTime(updatedAt),
	); err != nil {
		_ = db.Close()
		t.Fatalf("insert legacy task: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close legacy sqlite: %v", err)
	}

	repository, err := Open(ctx, dbPath)
	if err != nil {
		t.Fatalf("open migrated repository: %v", err)
	}
	t.Cleanup(func() {
		if err := repository.Close(); err != nil {
			t.Fatalf("close repository: %v", err)
		}
	})

	session, found, err := repository.FindSession(ctx, "session-legacy")
	if err != nil {
		t.Fatalf("find migrated session: %v", err)
	}
	if !found {
		t.Fatal("migrated session should be found")
	}
	if session.DisplayName == "" || session.AutoName == "" {
		t.Fatalf("migrated session display fields should be populated: %#v", session)
	}

	task, found, err := repository.FindTaskByID(ctx, "task-legacy")
	if err != nil {
		t.Fatalf("find migrated task: %v", err)
	}
	if !found {
		t.Fatal("migrated task should be found")
	}
	if task.SessionDisplayName != session.DisplayName || task.SessionAutoName != session.AutoName {
		t.Fatalf("task session fields = %#v, session = %#v", task, session)
	}
	if !task.ArchivedAt.IsZero() {
		t.Fatalf("legacy task archived_at = %s, want zero", task.ArchivedAt)
	}
}

func TestOpenMigratesPreArchiveSchemaWithCompletedTaskAsActiveHistory(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "legacy-history.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy sqlite: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
  user_input TEXT NOT NULL DEFAULT '',
  reply_source TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_tasks_pending_session
ON tasks(session_id)
WHERE status = 'pending';
CREATE INDEX idx_tasks_status_created
ON tasks(status, created_at DESC);
CREATE INDEX idx_tasks_completed_at
ON tasks(completed_at DESC);
`); err != nil {
		_ = db.Close()
		t.Fatalf("create legacy schema: %v", err)
	}
	createdAt := time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)
	completedAt := createdAt.Add(time.Minute)
	if _, err := db.ExecContext(ctx, `INSERT INTO tasks (
task_id, session_id, title, markdown, status, user_input, created_at, completed_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		"task-completed", "session-legacy", "Legacy", "body", domain.TaskStatusCompleted.String(),
		"reply", formatTime(createdAt), formatTime(completedAt), formatTime(completedAt),
	); err != nil {
		_ = db.Close()
		t.Fatalf("insert completed legacy task: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close legacy sqlite: %v", err)
	}

	repository, err := Open(ctx, dbPath)
	if err != nil {
		t.Fatalf("open migrated repository: %v", err)
	}
	t.Cleanup(func() {
		if err := repository.Close(); err != nil {
			t.Fatalf("close repository: %v", err)
		}
	})

	history, err := repository.ListHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(history) != 1 || history[0].TaskID != "task-completed" || !history[0].ArchivedAt.IsZero() {
		t.Fatalf("active history = %#v", history)
	}
	archived, err := repository.ListArchivedHistory(ctx, 10, 0)
	if err != nil {
		t.Fatalf("list archived history: %v", err)
	}
	if len(archived) != 0 {
		t.Fatalf("archived history = %#v, want empty", archived)
	}
}
