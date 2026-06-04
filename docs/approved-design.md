# AskUser Popup Go Rewrite Design

## Goal

AskUser Popup is a local human-in-the-loop channel for code agents. A code agent
calls the MCP tool `AskUser`, the question appears in a browser UI, the user
replies, and the tool call returns the reply string.

This rewrite keeps the proven user experience from the old Python project while
discarding its implementation baggage:

- Keep MCP-side polling rather than backend-to-MCP push.
- Keep no application-level timeout for human replies.
- Keep quick paste reply as submit-on-paste.
- Keep a full reply panel for in-place drafting.
- Keep auto-append suffix support.
- Keep Markdown raw/rendered views and XML export.
- Do not migrate old JSON history.
- Do not build a native desktop shell.

## Product Shape

The project is a local personal tool, not a multi-user product. It is optimized
for one user coordinating with Codex, Claude Code, and other MCP-capable agents.

Names:

- Product name: `AskUser Popup`
- MCP server name: `popup`
- MCP tool name: `AskUser`
- Project directory: `/home/t103o/workbench/projects/informuser-go`

## Runtime Components

### Popup Daemon

`popupd` is a Go HTTP daemon. It owns local durable state, serves the browser UI,
accepts replies, and exposes polling endpoints to the MCP stdio process.

Responsibilities:

- Receive task registrations from the MCP server.
- Persist pending and completed tasks.
- Serve the React web UI.
- Broadcast task events to connected browsers.
- Accept replies from the browser UI.
- Return completed replies to polling MCP calls.

It does not implement MCP protocol details.

### Popup MCP Server

`popup-mcp` is a Go MCP stdio server. It exposes `AskUser`.

Responsibilities:

- Accept MCP tool calls over stdio.
- Convert tool arguments into daemon task registrations.
- Retry registration while the local daemon is unavailable.
- Poll the daemon every 2 seconds until a reply is available.
- Return the user reply as a string.

It does not own UI or database state.

### Web UI

The web UI is a React and TypeScript browser workbench.

Responsibilities:

- Show pending tasks and history.
- Render Markdown safely.
- Provide adjustable reading settings.
- Provide full reply and quick paste reply flows.
- Persist UI preferences and drafts locally.
- Export selected completed conversations as XML.

## Technology Choices

Backend:

- Go `net/http`
- `github.com/go-chi/chi/v5`
- SQLite
- `modernc.org/sqlite`
- `github.com/coder/websocket`
- Go standard `log/slog`

MCP:

- `github.com/modelcontextprotocol/go-sdk/mcp`

Frontend:

- React 19
- TypeScript
- Vite
- Biome
- Radix UI Primitives
- TanStack Virtual
- `react-markdown`
- `remark-gfm`
- `rehype-sanitize`
- `lucide-react`

## State Model

The core state is a single SQLite-backed task table:

```sql
CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
  user_input TEXT,
  reply_source TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_tasks_pending_session
ON tasks(session_id)
WHERE status = 'pending';

CREATE INDEX idx_tasks_status_created
ON tasks(status, created_at DESC);

CREATE INDEX idx_tasks_completed_at
ON tasks(completed_at DESC);
```

Important semantics:

- `task_id` is the MCP call idempotency key.
- `session_id` is the current agent conversation slot.
- A session has at most one pending task.
- A new pending task for an occupied session supersedes the older pending task.
- Superseded tasks become `cancelled`, not deleted.
- Polling by `task_id` is a primary-key lookup.

## MCP Behavior

`AskUser` accepts:

```json
{
  "abstract": "short task title",
  "content": "Markdown body"
}
```

It returns:

```text
user reply string
```

Behavior:

1. Generate a task id.
2. Read MCP session id when available; otherwise generate a fallback session id.
3. Register the task with the daemon.
4. Retry registration forever while the daemon is unavailable.
5. Poll every 2 seconds for a completed result.
6. Return `user_input` when found.
7. Exit only when the MCP request context is cancelled or stdio closes.

There is intentionally no application-level timeout.

## Web UI Experience

The desktop layout is a compact three-pane workbench:

```text
Top status bar
Left: pending/history task stream
Middle: Markdown reader
Right: reply panel
```

The UI is tool-like, quiet, dense, and stable. It avoids marketing-page visual
patterns and decorative layouts.

### Quick Paste Reply

Quick paste is submit-on-paste by design. It is not a normal textarea. It exists
for replies composed elsewhere, where paste is the commit action. The full reply
panel remains the place for in-place drafting and review.

Guardrails:

- Only paste triggers submission.
- Empty pasted content is ignored.
- The row enters a submitting state while the request is in flight.
- Failed submissions restore the row input.

### Full Reply Panel

The full reply panel supports:

- Large textarea.
- `Ctrl+Enter` submission.
- Auto-append suffix.
- Per-task draft persistence in `localStorage`.
- Draft cleanup after completion.
- Collapsible panel.

### Markdown Reader

The Markdown reader owns its overflow boundaries:

- Safe Markdown rendering.
- GFM tables and task lists.
- Raw/rendered toggle.
- Adjustable font size.
- Adjustable line height.
- Adjustable content width.
- Long URLs, paths, hashes, and generated identifiers cannot create page-level
  horizontal scroll.
- Code blocks and wide tables scroll internally.

## HTTP API

Initial API:

```text
POST /api/tasks
GET /api/tasks/pending
GET /api/tasks/{task_id}
GET /api/tasks/{task_id}/result
POST /api/tasks/{task_id}/reply
POST /api/tasks/{task_id}/cancel
GET /api/history
GET /api/events/ws
GET /api/health
```

MCP uses only:

```text
POST /api/tasks
GET /api/tasks/{task_id}/result
```

The web UI uses the remaining UI endpoints.

## Required Comments

Comments are required where code alone does not explain the product reason:

- No timeout in `AskUser`.
- Infinite daemon registration retry.
- MCP polling instead of WebSocket callback.
- Session supersede behavior.
- Quick paste submit-on-paste.
- Markdown reader overflow boundaries.
- SQLite partial unique index.
- Auto-append suffix spacing.
- Local draft cleanup after task completion.

## Verification Targets

Required verification before completion:

- `go test ./...`
- `pnpm --dir web check`
- `pnpm --dir web build`
- Playwright checks for desktop, narrow viewport, long Markdown, wide tables,
  long code blocks, quick paste, full reply, and history scrolling.
