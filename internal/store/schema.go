package store

const schemaSQL = `
CREATE TABLE IF NOT EXISTS tasks (
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
  archived_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- A session represents one agent conversation slot. Keeping only one pending
-- task per session prevents stale questions from remaining active after the
-- agent has moved on to a newer human checkpoint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_pending_session
ON tasks(session_id)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_status_created
ON tasks(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
ON tasks(completed_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  auto_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_seen
ON sessions(last_seen_at DESC);
`
