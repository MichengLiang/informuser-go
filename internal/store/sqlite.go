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

	return &TaskRepository{db: db}, nil
}

func (r *TaskRepository) Close() error {
	return r.db.Close()
}
