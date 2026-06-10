package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/MichengLiang/informuser-go/internal/domain"
)

var ErrTaskNotCompleted = errors.New("task is not completed")

func (r *TaskRepository) InsertTask(ctx context.Context, task domain.Task) error {
	_, err := r.db.ExecContext(
		ctx,
		`INSERT INTO tasks (
			task_id, session_id, title, markdown, status, user_input, reply_source,
			cancel_reason, created_at, completed_at, archived_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		task.TaskID,
		task.SessionID,
		task.Title,
		task.Markdown,
		task.Status.String(),
		task.UserInput,
		task.ReplySource,
		task.CancelReason,
		formatTime(task.CreatedAt),
		formatOptionalTime(task.CompletedAt),
		formatOptionalTime(task.ArchivedAt),
		formatTime(task.UpdatedAt),
	)
	return err
}

func (r *TaskRepository) FindTaskByID(ctx context.Context, taskID string) (domain.Task, bool, error) {
	return r.scanTask(r.db.QueryRowContext(
		ctx,
		`SELECT t.task_id, t.session_id, COALESCE(s.display_name, ''), COALESCE(s.auto_name, ''),
			t.title, t.markdown, t.status, t.user_input, t.reply_source,
			t.cancel_reason, t.created_at, t.completed_at, t.archived_at, t.updated_at
		FROM tasks t
		LEFT JOIN sessions s ON s.session_id = t.session_id
		WHERE t.task_id = ?`,
		taskID,
	))
}

func (r *TaskRepository) FindPendingBySessionID(ctx context.Context, sessionID string) (domain.Task, bool, error) {
	return r.scanTask(r.db.QueryRowContext(
		ctx,
		`SELECT t.task_id, t.session_id, COALESCE(s.display_name, ''), COALESCE(s.auto_name, ''),
			t.title, t.markdown, t.status, t.user_input, t.reply_source,
			t.cancel_reason, t.created_at, t.completed_at, t.archived_at, t.updated_at
		FROM tasks t
		LEFT JOIN sessions s ON s.session_id = t.session_id
		WHERE t.session_id = ? AND t.status = ?
		LIMIT 1`,
		sessionID,
		domain.TaskStatusPending.String(),
	))
}

func (r *TaskRepository) CancelTask(ctx context.Context, taskID string, reason string, updatedAt time.Time) error {
	result, err := r.db.ExecContext(
		ctx,
		`UPDATE tasks
		SET status = ?, cancel_reason = ?, updated_at = ?
		WHERE task_id = ? AND status = ?`,
		domain.TaskStatusCancelled.String(),
		reason,
		formatTime(updatedAt),
		taskID,
		domain.TaskStatusPending.String(),
	)
	if err != nil {
		return err
	}
	return requireAffected(result)
}

func (r *TaskRepository) CompleteTask(
	ctx context.Context,
	taskID string,
	userInput string,
	replySource string,
	completedAt time.Time,
) error {
	result, err := r.db.ExecContext(
		ctx,
		`UPDATE tasks
		SET status = ?, user_input = ?, reply_source = ?, cancel_reason = '', completed_at = ?, updated_at = ?
		WHERE task_id = ? AND status IN (?, ?)`,
		domain.TaskStatusCompleted.String(),
		userInput,
		replySource,
		formatTime(completedAt),
		formatTime(completedAt),
		taskID,
		domain.TaskStatusPending.String(),
		domain.TaskStatusCancelled.String(),
	)
	if err != nil {
		return err
	}
	return requireAffected(result)
}

func (r *TaskRepository) TaskResult(ctx context.Context, taskID string) (domain.TaskResult, error) {
	var userInput string
	var completedAtText string
	err := r.db.QueryRowContext(
		ctx,
		`SELECT user_input, completed_at
		FROM tasks
		WHERE task_id = ? AND status = ?`,
		taskID,
		domain.TaskStatusCompleted.String(),
	).Scan(&userInput, &completedAtText)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.NotFoundTaskResult(), nil
	}
	if err != nil {
		return domain.TaskResult{}, err
	}

	completedAt, err := parseOptionalTime(completedAtText)
	if err != nil {
		return domain.TaskResult{}, err
	}
	return domain.FoundTaskResult(userInput, completedAt), nil
}

func (r *TaskRepository) ListPending(ctx context.Context) ([]domain.Task, error) {
	rows, err := r.db.QueryContext(
		ctx,
		`SELECT t.task_id, t.session_id, COALESCE(s.display_name, ''), COALESCE(s.auto_name, ''),
			t.title, t.markdown, t.status, t.user_input, t.reply_source,
			t.cancel_reason, t.created_at, t.completed_at, t.archived_at, t.updated_at
		FROM tasks t
		LEFT JOIN sessions s ON s.session_id = t.session_id
		WHERE t.status = ?
		ORDER BY t.created_at DESC`,
		domain.TaskStatusPending.String(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanTasks(rows)
}

func (r *TaskRepository) ListHistory(ctx context.Context, limit int, offset int) ([]domain.Task, error) {
	rows, err := r.db.QueryContext(
		ctx,
		`SELECT t.task_id, t.session_id, COALESCE(s.display_name, ''), COALESCE(s.auto_name, ''),
			t.title, t.markdown, t.status, t.user_input, t.reply_source,
			t.cancel_reason, t.created_at, t.completed_at, t.archived_at, t.updated_at
		FROM tasks t
		LEFT JOIN sessions s ON s.session_id = t.session_id
		WHERE t.status = ? AND t.archived_at = ''
		ORDER BY t.completed_at DESC, t.task_id DESC
		LIMIT ? OFFSET ?`,
		domain.TaskStatusCompleted.String(),
		limit,
		offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanTasks(rows)
}

func (r *TaskRepository) ListArchivedHistory(ctx context.Context, limit int, offset int) ([]domain.Task, error) {
	rows, err := r.db.QueryContext(
		ctx,
		`SELECT t.task_id, t.session_id, COALESCE(s.display_name, ''), COALESCE(s.auto_name, ''),
			t.title, t.markdown, t.status, t.user_input, t.reply_source,
			t.cancel_reason, t.created_at, t.completed_at, t.archived_at, t.updated_at
		FROM tasks t
		LEFT JOIN sessions s ON s.session_id = t.session_id
		WHERE t.status = ? AND t.archived_at <> ''
		ORDER BY t.archived_at DESC, t.completed_at DESC, t.task_id DESC
		LIMIT ? OFFSET ?`,
		domain.TaskStatusCompleted.String(),
		limit,
		offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanTasks(rows)
}

func (r *TaskRepository) ArchiveHistoryTasks(ctx context.Context, taskIDs []string, archivedAt time.Time) (int, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	uniqueTaskIDs := uniqueTaskIDs(taskIDs)
	archivedStates, err := validateCompletedTasks(ctx, tx, uniqueTaskIDs)
	if err != nil {
		return 0, err
	}

	updated := 0
	for _, taskID := range uniqueTaskIDs {
		alreadyArchived := archivedStates[taskID]
		if alreadyArchived {
			continue
		}
		result, err := tx.ExecContext(
			ctx,
			`UPDATE tasks
			SET archived_at = ?, updated_at = ?
			WHERE task_id = ? AND archived_at = ''`,
			formatTime(archivedAt),
			formatTime(archivedAt),
			taskID,
		)
		if err != nil {
			return 0, err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return 0, err
		}
		updated += int(affected)
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return updated, nil
}

func (r *TaskRepository) UnarchiveHistoryTasks(ctx context.Context, taskIDs []string, updatedAt time.Time) (int, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	uniqueTaskIDs := uniqueTaskIDs(taskIDs)
	archivedStates, err := validateCompletedTasks(ctx, tx, uniqueTaskIDs)
	if err != nil {
		return 0, err
	}

	updated := 0
	for _, taskID := range uniqueTaskIDs {
		alreadyArchived := archivedStates[taskID]
		if !alreadyArchived {
			continue
		}
		result, err := tx.ExecContext(
			ctx,
			`UPDATE tasks
			SET archived_at = '', updated_at = ?
			WHERE task_id = ? AND archived_at <> ''`,
			formatTime(updatedAt),
			taskID,
		)
		if err != nil {
			return 0, err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return 0, err
		}
		updated += int(affected)
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return updated, nil
}

func uniqueTaskIDs(taskIDs []string) []string {
	seen := make(map[string]struct{}, len(taskIDs))
	unique := make([]string, 0, len(taskIDs))
	for _, taskID := range taskIDs {
		if _, found := seen[taskID]; found {
			continue
		}
		seen[taskID] = struct{}{}
		unique = append(unique, taskID)
	}
	return unique
}

type taskScanner interface {
	Scan(dest ...any) error
}

func (r *TaskRepository) scanTask(row taskScanner) (domain.Task, bool, error) {
	task, err := scanTask(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Task{}, false, nil
	}
	if err != nil {
		return domain.Task{}, false, err
	}
	return task, true, nil
}

func scanTasks(rows *sql.Rows) ([]domain.Task, error) {
	var tasks []domain.Task
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return tasks, nil
}

func scanTask(scanner taskScanner) (domain.Task, error) {
	var task domain.Task
	var status string
	var createdAtText string
	var completedAtText string
	var archivedAtText string
	var updatedAtText string

	err := scanner.Scan(
		&task.TaskID,
		&task.SessionID,
		&task.SessionDisplayName,
		&task.SessionAutoName,
		&task.Title,
		&task.Markdown,
		&status,
		&task.UserInput,
		&task.ReplySource,
		&task.CancelReason,
		&createdAtText,
		&completedAtText,
		&archivedAtText,
		&updatedAtText,
	)
	if err != nil {
		return domain.Task{}, err
	}

	createdAt, err := parseRequiredTime(createdAtText)
	if err != nil {
		return domain.Task{}, err
	}
	completedAt, err := parseOptionalTime(completedAtText)
	if err != nil {
		return domain.Task{}, err
	}
	archivedAt, err := parseOptionalTime(archivedAtText)
	if err != nil {
		return domain.Task{}, err
	}
	updatedAt, err := parseRequiredTime(updatedAtText)
	if err != nil {
		return domain.Task{}, err
	}

	task.Status = domain.TaskStatus(status)
	if task.SessionAutoName == "" {
		task.SessionAutoName = domain.AutomaticSessionName(task.SessionID)
	}
	if task.SessionDisplayName == "" {
		task.SessionDisplayName = task.SessionAutoName
	}
	task.CreatedAt = createdAt
	task.CompletedAt = completedAt
	task.ArchivedAt = archivedAt
	task.UpdatedAt = updatedAt
	return task, nil
}

func validateCompletedTasks(ctx context.Context, tx *sql.Tx, taskIDs []string) (map[string]bool, error) {
	archivedStates := make(map[string]bool, len(taskIDs))
	for _, taskID := range taskIDs {
		var status string
		var archivedAt string
		err := tx.QueryRowContext(
			ctx,
			`SELECT status, archived_at FROM tasks WHERE task_id = ?`,
			taskID,
		).Scan(&status, &archivedAt)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		if err != nil {
			return nil, err
		}
		if domain.TaskStatus(status) != domain.TaskStatusCompleted {
			return nil, ErrTaskNotCompleted
		}
		archivedStates[taskID] = archivedAt != ""
	}
	return archivedStates, nil
}

func requireAffected(result sql.Result) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func formatOptionalTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return formatTime(value)
}

func parseRequiredTime(value string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, value)
}

func parseOptionalTime(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, nil
	}
	return parseRequiredTime(value)
}
