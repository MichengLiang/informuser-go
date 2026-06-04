package store

import (
	"context"
	"database/sql"

	_ "modernc.org/sqlite"
)

type TaskRepository struct {
	db *sql.DB
}

func Open(ctx context.Context, dataSourceName string) (*TaskRepository, error) {
	db, err := sql.Open("sqlite", dataSourceName)
	if err != nil {
		return nil, err
	}

	if _, err := db.ExecContext(ctx, schemaSQL); err != nil {
		_ = db.Close()
		return nil, err
	}

	repository := &TaskRepository{db: db}
	if err := repository.BackfillSessions(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	return repository, nil
}

func (r *TaskRepository) Close() error {
	return r.db.Close()
}
