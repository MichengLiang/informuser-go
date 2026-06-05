# Changelog

All notable changes to AskUser Popup will be documented in this file.

The project follows semantic versioning once public releases begin.

## [Unreleased]

### Added

- Browser workbench for human-in-the-loop MCP prompts.
- Go popup daemon with embedded React web UI, SQLite persistence, and websocket updates.
- Stdio MCP server that registers questions with the daemon and waits for replies.
- Session/client grouping, renaming, history archive/restore, and grouped export workflows.
- Startup log URLs for local and LAN access.
- CI and release workflow definitions for open-source maintenance.

### Changed

- Default daemon binding is `0.0.0.0:8765` so LAN URLs printed at startup are usable.

