package app

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/t103o/informuser-go/internal/domain"
	"github.com/t103o/informuser-go/internal/store"
)

type Clock interface {
	Now() time.Time
}

type RealClock struct{}

func (RealClock) Now() time.Time {
	return time.Now().UTC()
}

type Service struct {
	repository *store.TaskRepository
	clock      Clock
}

func NewService(repository *store.TaskRepository, clock Clock) *Service {
	if clock == nil {
		clock = RealClock{}
	}
	return &Service{repository: repository, clock: clock}
}

type CreateTaskStatus string

const (
	CreateTaskCreated   CreateTaskStatus = "created"
	CreateTaskExists    CreateTaskStatus = "exists"
	CreateTaskCompleted CreateTaskStatus = "completed"
)

type CreateTaskOutcome struct {
	Status           CreateTaskStatus
	Task             domain.Task
	SupersededTaskID string
}

type SubmitReplyRequest struct {
	TaskID      string
	UserInput   string
	ReplySource string
}

type HistoryTasksOutcome struct {
	Updated int
}

func (r SubmitReplyRequest) Validate() error {
	return domain.ReplyRequest{
		TaskID:      r.TaskID,
		UserInput:   r.UserInput,
		ReplySource: r.ReplySource,
	}.Validate()
}

func (s *Service) CreateTask(ctx context.Context, request domain.CreateTaskRequest) (CreateTaskOutcome, error) {
	if err := request.Validate(); err != nil {
		return CreateTaskOutcome{}, err
	}

	existing, found, err := s.repository.FindTaskByID(ctx, request.TaskID)
	if err != nil {
		return CreateTaskOutcome{}, err
	}
	if found {
		switch existing.Status {
		case domain.TaskStatusPending:
			return CreateTaskOutcome{Status: CreateTaskExists, Task: existing}, nil
		case domain.TaskStatusCompleted:
			return CreateTaskOutcome{Status: CreateTaskCompleted, Task: existing}, nil
		case domain.TaskStatusCancelled:
			return CreateTaskOutcome{Status: CreateTaskExists, Task: existing}, nil
		}
	}

	now := s.clock.Now()
	var supersededTaskID string
	pending, found, err := s.repository.FindPendingBySessionID(ctx, request.SessionID)
	if err != nil {
		return CreateTaskOutcome{}, err
	}
	if found {
		// A session is one agent conversation slot. When that conversation asks a
		// newer question, keeping the older pending question active creates stale
		// human checkpoints, so the service archives it as a superseded task.
		if err := s.repository.CancelTask(ctx, pending.TaskID, "superseded_by_new_task", now); err != nil {
			return CreateTaskOutcome{}, err
		}
		supersededTaskID = pending.TaskID
		now = s.clock.Now()
	}

	session, err := s.repository.EnsureSession(ctx, request.SessionID, now)
	if err != nil {
		return CreateTaskOutcome{}, err
	}
	task := domain.Task{
		TaskID:             request.TaskID,
		SessionID:          request.SessionID,
		SessionDisplayName: session.DisplayName,
		SessionAutoName:    session.AutoName,
		Title:              request.Title,
		Markdown:           request.Markdown,
		Status:             domain.TaskStatusPending,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if err := s.repository.InsertTask(ctx, task); err != nil {
		return CreateTaskOutcome{}, err
	}

	return CreateTaskOutcome{
		Status:           CreateTaskCreated,
		Task:             task,
		SupersededTaskID: supersededTaskID,
	}, nil
}

func (s *Service) SubmitReply(ctx context.Context, request SubmitReplyRequest) error {
	if err := request.Validate(); err != nil {
		return err
	}
	return s.repository.CompleteTask(ctx, request.TaskID, request.UserInput, request.ReplySource, s.clock.Now())
}

func (s *Service) RenameSession(ctx context.Context, sessionID string, displayName string) (domain.Session, error) {
	if sessionID == "" {
		return domain.Session{}, errors.New("session_id is required")
	}
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		return domain.Session{}, errors.New("display_name is required")
	}
	if err := s.repository.UpdateSessionDisplayName(ctx, sessionID, displayName, s.clock.Now()); err != nil {
		return domain.Session{}, err
	}
	session, found, err := s.repository.FindSession(ctx, sessionID)
	if err != nil {
		return domain.Session{}, err
	}
	if !found {
		return domain.Session{}, sql.ErrNoRows
	}
	return session, nil
}

func (s *Service) CancelTask(ctx context.Context, taskID string, reason string) error {
	if taskID == "" {
		return errors.New("task_id is required")
	}
	if reason == "" {
		reason = "cancelled_by_user"
	}
	return s.repository.CancelTask(ctx, taskID, reason, s.clock.Now())
}

func (s *Service) TaskResult(ctx context.Context, taskID string) (domain.TaskResult, error) {
	if taskID == "" {
		return domain.TaskResult{}, errors.New("task_id is required")
	}
	return s.repository.TaskResult(ctx, taskID)
}

func (s *Service) FindTask(ctx context.Context, taskID string) (domain.Task, bool, error) {
	if taskID == "" {
		return domain.Task{}, false, errors.New("task_id is required")
	}
	return s.repository.FindTaskByID(ctx, taskID)
}

func (s *Service) ListPending(ctx context.Context) ([]domain.Task, error) {
	return s.repository.ListPending(ctx)
}

func (s *Service) ListHistory(ctx context.Context, limit int, offset int) ([]domain.Task, error) {
	limit, offset = normalizeListBounds(limit, offset)
	return s.repository.ListHistory(ctx, limit, offset)
}

func (s *Service) ListArchivedHistory(ctx context.Context, limit int, offset int) ([]domain.Task, error) {
	limit, offset = normalizeListBounds(limit, offset)
	return s.repository.ListArchivedHistory(ctx, limit, offset)
}

func (s *Service) ArchiveHistoryTasks(ctx context.Context, taskIDs []string) (HistoryTasksOutcome, error) {
	if len(taskIDs) == 0 {
		return HistoryTasksOutcome{}, errors.New("task_ids is required")
	}
	updated, err := s.repository.ArchiveHistoryTasks(ctx, taskIDs, s.clock.Now())
	if err != nil {
		return HistoryTasksOutcome{}, err
	}
	return HistoryTasksOutcome{Updated: updated}, nil
}

func (s *Service) UnarchiveHistoryTasks(ctx context.Context, taskIDs []string) (HistoryTasksOutcome, error) {
	if len(taskIDs) == 0 {
		return HistoryTasksOutcome{}, errors.New("task_ids is required")
	}
	updated, err := s.repository.UnarchiveHistoryTasks(ctx, taskIDs)
	if err != nil {
		return HistoryTasksOutcome{}, err
	}
	return HistoryTasksOutcome{Updated: updated}, nil
}

func normalizeListBounds(limit int, offset int) (int, int) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

func IsNotFound(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}
