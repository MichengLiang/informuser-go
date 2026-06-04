package store

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/t103o/informuser-go/internal/domain"
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
