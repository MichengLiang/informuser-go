# Changelog

All notable changes to AskUser Popup will be documented in this file.

The project follows semantic versioning once public releases begin.

## [Unreleased]

## [0.1.2] - 2026-06-24

### Added

- Message source reader can render task content as Markdown or AsciiDoc with a
  per-task temporary language override and a persistent default render language.
- Reader settings now include source-neutral layout controls for font size, line
  height, content width, and default render language.
- Browser coverage now verifies AsciiDoc rendering, source projection, toolbar
  wrapping, and reader overflow boundaries.

### Changed

- Reader UI copy now uses source-neutral wording such as "Copy source" and
  "Reader settings" while preserving the existing backend `markdown` API field.
- AsciiDoc output is rendered inside Shadow DOM so the official Asciidoctor
  stylesheet cannot leak into the workbench shell.

### Fixed

- AsciiDoc rendering now sanitizes passthrough HTML before inserting it into the
  Shadow DOM.
- Reader font-size settings now control AsciiDoc body text, lists, table cells,
  and code blocks rather than only affecting inherited or heading text.
- AsciiDoc tables and long code blocks stay inside reader overflow boundaries
  instead of causing page-level horizontal scrolling.
- Empty reader state messages now use source-neutral wording.

## [0.1.1] - 2026-06-10

### Added

- Task rows can copy their summary to the clipboard with a double-click.
- Task events now expose superseded task details so browser clients can retire
  stale rows immediately.

### Changed

- Reader focus now remains stable while realtime task updates arrive.
- Release artifacts now include SHA-256 checksums alongside the prebuilt
  archives.

### Fixed

- Reply submission now tolerates stale browser rows whose task was cancelled by
  a newer prompt, completing the original task when the user sends a late reply.
- Repeated replies to an already completed task now return success without
  overwriting the original answer.
- Embedded browser assets are synced with the current web build.
- Task row selection and virtual-list measurements remain stable during task
  updates.

## [0.1.0] - 2026-06-05

### Added

- Browser workbench for human-in-the-loop MCP prompts.
- Go popup daemon with embedded React web UI, SQLite persistence, and websocket updates.
- Stdio MCP server that registers questions with the daemon and waits for replies.
- Session/client grouping, renaming, history archive/restore, and grouped export workflows.
- Startup log URLs for local and LAN access.
- CI and release workflow definitions for open-source maintenance.

### Changed

- Default daemon binding is `0.0.0.0:8765` so LAN URLs printed at startup are usable.
- Frontend static analysis uses Biome as the single lint/check tool.
