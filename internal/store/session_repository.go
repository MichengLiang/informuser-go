package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/t103o/informuser-go/internal/domain"
)

func (r *TaskRepository) EnsureSession(ctx context.Context, sessionID string, seenAt time.Time) (domain.Session, error) {
	autoName := domain.AutomaticSessionName(sessionID)
	_, err := r.db.ExecContext(
		ctx,
		`INSERT INTO sessions (
			session_id, display_name, auto_name, created_at, updated_at, last_seen_at
		) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
		sessionID,
		autoName,
		autoName,
		formatTime(seenAt),
		formatTime(seenAt),
		formatTime(seenAt),
	)
	if err != nil {
		return domain.Session{}, err
	}

	session, found, err := r.FindSession(ctx, sessionID)
	if err != nil {
		return domain.Session{}, err
	}
	if !found {
		return domain.Session{}, sql.ErrNoRows
	}
	return session, nil
}

func (r *TaskRepository) FindSession(ctx context.Context, sessionID string) (domain.Session, bool, error) {
	var session domain.Session
	var createdAtText string
	var updatedAtText string
	var lastSeenAtText string
	err := r.db.QueryRowContext(
		ctx,
		`SELECT session_id, display_name, auto_name, created_at, updated_at, last_seen_at
		FROM sessions
		WHERE session_id = ?`,
		sessionID,
	).Scan(
		&session.SessionID,
		&session.DisplayName,
		&session.AutoName,
		&createdAtText,
		&updatedAtText,
		&lastSeenAtText,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Session{}, false, nil
	}
	if err != nil {
		return domain.Session{}, false, err
	}

	createdAt, err := parseRequiredTime(createdAtText)
	if err != nil {
		return domain.Session{}, false, err
	}
	updatedAt, err := parseRequiredTime(updatedAtText)
	if err != nil {
		return domain.Session{}, false, err
	}
	lastSeenAt, err := parseRequiredTime(lastSeenAtText)
	if err != nil {
		return domain.Session{}, false, err
	}

	session.CreatedAt = createdAt
	session.UpdatedAt = updatedAt
	session.LastSeenAt = lastSeenAt
	return session, true, nil
}

func (r *TaskRepository) UpdateSessionDisplayName(
	ctx context.Context,
	sessionID string,
	displayName string,
	updatedAt time.Time,
) error {
	result, err := r.db.ExecContext(
		ctx,
		`UPDATE sessions
		SET display_name = ?, updated_at = ?
		WHERE session_id = ?`,
		displayName,
		formatTime(updatedAt),
		sessionID,
	)
	if err != nil {
		return err
	}
	return requireAffected(result)
}

func (r *TaskRepository) EnsureArchiveMigration(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `PRAGMA table_info(tasks)`)
	if err != nil {
		return err
	}

	hasArchivedAt := false
	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			_ = rows.Close()
			return err
		}
		if name == "archived_at" {
			hasArchivedAt = true
		}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}

	if !hasArchivedAt {
		if _, err := r.db.ExecContext(ctx, `ALTER TABLE tasks ADD COLUMN archived_at TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}
	_, err = r.db.ExecContext(ctx, `
CREATE INDEX IF NOT EXISTS idx_tasks_history_active
ON tasks(status, completed_at DESC)
WHERE status = 'completed' AND archived_at = '';

CREATE INDEX IF NOT EXISTS idx_tasks_history_archived
ON tasks(status, archived_at DESC)
WHERE status = 'completed' AND archived_at <> '';
`)
	return err
}

func (r *TaskRepository) BackfillSessions(ctx context.Context) error {
	rows, err := r.db.QueryContext(
		ctx,
		`SELECT session_id, created_at, updated_at
		FROM tasks`,
	)
	if err != nil {
		return err
	}

	type backfillSession struct {
		sessionID  string
		createdAt  time.Time
		lastSeenAt time.Time
	}
	sessionsByID := make(map[string]backfillSession)
	for rows.Next() {
		var sessionID string
		var createdAtText string
		var updatedAtText string
		if err := rows.Scan(&sessionID, &createdAtText, &updatedAtText); err != nil {
			_ = rows.Close()
			return err
		}
		createdAt, err := parseRequiredTime(createdAtText)
		if err != nil {
			_ = rows.Close()
			return err
		}
		updatedAt, err := parseRequiredTime(updatedAtText)
		if err != nil {
			_ = rows.Close()
			return err
		}

		session, found := sessionsByID[sessionID]
		if !found {
			sessionsByID[sessionID] = backfillSession{
				sessionID:  sessionID,
				createdAt:  createdAt,
				lastSeenAt: updatedAt,
			}
			continue
		}
		if createdAt.Before(session.createdAt) {
			session.createdAt = createdAt
		}
		if updatedAt.After(session.lastSeenAt) {
			session.lastSeenAt = updatedAt
		}
		sessionsByID[sessionID] = session
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}

	for _, session := range sessionsByID {
		autoName := domain.AutomaticSessionName(session.sessionID)
		if _, err := r.db.ExecContext(
			ctx,
			`INSERT OR IGNORE INTO sessions (
				session_id, display_name, auto_name, created_at, updated_at, last_seen_at
			) VALUES (?, ?, ?, ?, ?, ?)`,
			session.sessionID,
			autoName,
			autoName,
			formatTime(session.createdAt),
			formatTime(session.lastSeenAt),
			formatTime(session.lastSeenAt),
		); err != nil {
			return err
		}
	}
	return nil
}
