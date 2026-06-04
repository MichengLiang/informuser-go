# AskUser Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development
> or executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Build a clean Go-native AskUser Popup project with a Go MCP stdio
server, SQLite-backed daemon, and React/TypeScript web UI.

**Architecture:** `popupd` owns local HTTP, SQLite state, static UI serving, and
browser events. `popup-mcp` owns MCP stdio and polls `popupd` for replies. The
React UI is a browser workbench for pending tasks, Markdown reading, replies,
history, and export.

**Tech Stack:** Go, chi, SQLite via modernc, coder/websocket, official MCP Go
SDK, React 19, TypeScript, Vite, Biome, Radix UI, TanStack Virtual,
react-markdown, remark-gfm, rehype-sanitize, lucide-react.

---

## File Map

- `cmd/popupd/main.go`: daemon entrypoint.
- `cmd/popup-mcp/main.go`: MCP stdio entrypoint.
- `internal/domain/task.go`: task entities, statuses, request/result types.
- `internal/domain/event.go`: browser event payloads.
- `internal/store/schema.go`: SQLite schema.
- `internal/store/sqlite.go`: SQLite connection and migration setup.
- `internal/store/task_repository.go`: task persistence operations.
- `internal/app/service.go`: application service and clock abstraction.
- `internal/app/create_task.go`: create/idempotency/supersede behavior.
- `internal/app/submit_reply.go`: reply and cancel behavior.
- `internal/app/query.go`: pending/history/result queries.
- `internal/httpapi/router.go`: route registration.
- `internal/httpapi/handlers.go`: JSON handlers.
- `internal/httpapi/dto.go`: HTTP DTO mapping.
- `internal/realtime/hub.go`: WebSocket browser event hub.
- `internal/mcpbridge/server.go`: `AskUser` MCP tool registration.
- `internal/mcpbridge/client.go`: daemon HTTP client.
- `internal/mcpbridge/polling.go`: no-timeout retry and polling loop.
- `internal/config/config.go`: config defaults and env parsing.
- `web/`: React/TypeScript frontend.
- `docs/approved-design.md`: approved design contract.
- `README.md`: local usage and MCP configuration.

## Task 1: Repository Documentation Baseline

- [x] Create independent Git repository at
  `/home/t103o/workbench/projects/informuser-go`.
- [x] Rename the default branch to `main`.
- [x] Save the approved design to `docs/approved-design.md`.
- [x] Save this implementation plan to `docs/implementation-plan.md`.
- [x] Commit the documentation baseline.

## Task 2: Go Module and Domain Model

- [x] Initialize Go module `github.com/t103o/informuser-go`.
- [x] Add domain tests for task statuses and result states.
- [x] Verify the tests fail before implementation.
- [x] Implement `internal/domain/task.go` and `event.go`.
- [x] Run targeted tests, then commit.

## Task 3: SQLite Store

- [x] Add repository tests for create, duplicate task id, completed lookup,
  pending session uniqueness, supersede, submit reply, cancel, pending list, and
  paginated history.
- [x] Verify repository tests fail before implementation.
- [x] Add `modernc.org/sqlite`.
- [x] Implement schema, connection setup, and repository methods.
- [x] Run store tests, then commit.

## Task 4: Application Service

- [x] Add service tests for idempotent create, session supersede, reply,
  polling result, pending list, history list, and cancel.
- [x] Verify service tests fail before implementation.
- [x] Implement application service methods.
- [x] Run app tests, then commit.

## Task 5: HTTP API and WebSocket Hub

- [x] Add `httptest` coverage for all API endpoints.
- [x] Add hub tests for event subscription and stale connection cleanup where
  practical.
- [x] Verify tests fail before implementation.
- [x] Add chi and coder/websocket.
- [x] Implement router, DTOs, handlers, and hub.
- [x] Run HTTP tests, then commit.

## Task 6: MCP Bridge

- [x] Add tests for daemon registration retry, no-timeout polling, found result,
  and cancellation using `httptest`.
- [x] Verify tests fail before implementation.
- [x] Add official MCP Go SDK.
- [x] Implement daemon HTTP client, polling loop, and `AskUser` tool server.
- [x] Run MCP bridge tests, then commit.

## Task 7: Frontend Scaffold

- [x] Create Vite React TypeScript app under `web/`.
- [x] Add Biome configuration.
- [x] Add Radix, TanStack Virtual, react-markdown, remark-gfm, rehype-sanitize,
  and lucide-react.
- [x] Replace starter UI with the AskUser app shell.
- [x] Run `pnpm --dir web biome check .` and `pnpm --dir web build`, then commit.

## Task 8: Frontend Task Flow

- [x] Implement API client and WebSocket event client.
- [x] Implement pending/history task state.
- [x] Implement virtualized task list.
- [x] Implement quick paste submit-on-paste with comments explaining its role.
- [x] Implement full reply panel, suffix, drafts, and Ctrl+Enter.
- [x] Run frontend checks, then commit.

## Task 9: Markdown Reader and Export

- [x] Implement safe Markdown reader with raw/render toggle.
- [x] Implement font size, line height, content width, and code size settings.
- [x] Implement long-token, wide-table, and code-block overflow boundaries.
- [x] Implement history selection and XML copy export.
- [x] Run frontend checks, then commit.

## Task 10: Integrated Build and Browser Verification

- [x] Embed frontend build output in `popupd`.
- [x] Add README usage and MCP config examples.
- [x] Add Playwright smoke tests for core flows and layout overflow.
- [x] Run `go test ./...`.
- [x] Run `pnpm --dir web biome check .`.
- [x] Run `pnpm --dir web build`.
- [x] Run Playwright tests.
- [x] Commit final integration.
