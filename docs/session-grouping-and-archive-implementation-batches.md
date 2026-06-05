# 会话分组与历史归档实施批次计划

本计划用于执行 `docs/session-grouping-and-archive-design.md`。实施者必须完整阅读设计文档，再按本计划分批实现。每一批必须完成代码、测试、验证和提交；审核通过后才能进入下一批。

## 全局约束

1. 工作目录是 `/home/t103o/workbench/projects/informuser-go`。
2. 本任务使用同一个工作树执行，不创建 fork，不创建 git worktree。
3. 当前工作树可能存在他人未提交改动。实施者不得修改、格式化、提交与当前批次无关的文件。
4. 提交必须使用路径限定，避免混入他人 staged 或 unstaged 内容。新文件先 `git add <path>`，再使用：

```bash
git commit --only -m "..." -- <paths>
```

5. 每批提交前必须运行该批指定验证命令。验证失败不得提交，除非提交内容是明确记录失败原因的文档变更；本实现批次不允许这种例外。
6. `session_id` 是唯一分组键。显示名允许重复。任何实现不得按显示名合并分组。
7. 会话显示名和归档状态必须由 daemon/SQLite 持久化。不得使用 localStorage 作为该功能的状态来源。
8. 整组导出、整组归档、整组恢复只作用于当前前端已加载 task，不代表数据库中该 session 的全部历史。

## 当前已知脏文件

启动实施前必须运行：

```bash
git status --short
```

截至本计划写入时，存在与本任务无关的前端 MarkdownReader 改动：

```text
M web/src/features/markdown/MarkdownReader.tsx
M web/src/features/markdown/MarkdownReader.test.tsx
```

这些文件不是第 1 批写入范围。第 1 批不得触碰它们。

## 批次 1：后端会话持久化基础

### 目标

建立后端会话实体，使 task 创建时自动确保 session 存在，并使 pending/history API 返回会话显示字段。该批不实现归档 API，不改前端。

### 写入范围

允许修改：

- `internal/domain/task.go`
- `internal/domain/task_test.go`
- `internal/store/schema.go`
- `internal/store/sqlite.go`
- `internal/store/task_repository.go`
- `internal/store/task_repository_test.go`
- `internal/app/service.go`
- `internal/app/service_test.go`
- `internal/httpapi/dto.go`
- `internal/httpapi/router_test.go`
- `internal/domain/event.go`
- `internal/domain/event_test.go`

如果需要新增后端文件，优先放在：

- `internal/domain/session.go`
- `internal/domain/session_test.go`
- `internal/store/session_repository.go`
- `internal/store/session_repository_test.go`

不得修改：

- `web/**`
- `cmd/**`
- `README.md`
- `docs/**`，除非记录实现中发现的设计文档错误；第 1 批正常不需要。

### 必须实现

1. 新增 session domain 对象，至少包含：
   - `SessionID`
   - `DisplayName`
   - `AutoName`
   - `CreatedAt`
   - `UpdatedAt`
   - `LastSeenAt`
2. 新增稳定自动名生成函数。输入同一个 `session_id` 必须输出同一个 `S-xxxxx` 形式短名。自动名不能作为唯一键。
3. SQLite 初始化创建 `sessions` 表和 `idx_sessions_last_seen` 索引。
4. SQLite 初始化为旧 `tasks.session_id` 补建 session 行。补建不得覆盖已有 session display name。
5. `Service.CreateTask` 在创建 task 前确保 session 存在。已有 session 再收到 task 时只更新 `last_seen_at`，不得覆盖 `display_name`。
6. pending/history/list/find task 返回对象必须带：
   - `session_display_name`
   - `session_auto_name`
7. `task_created` WebSocket 事件中的 task 必须带同等 session display fields，保证新消息能立即显示分组名。
8. 不改变现有同 session pending supersede 行为。

### 必须测试

新增或更新 Go 测试，覆盖：

1. 自动名生成稳定，输出非空且带 `S-` 前缀。
2. 创建 task 自动创建 session。
3. 已重命名 session 再创建 task 不覆盖 display name。
4. pending endpoint 返回 session display fields。
5. history endpoint 返回 session display fields。
6. 旧 task 补建 session 的迁移行为。
7. task created event 携带 session display fields。
8. 同 session pending supersede 测试仍通过。

### 验证命令

```bash
go test ./...
./scripts/check_go_coverage.sh
```

### 提交要求

提交消息：

```text
feat: persist session display metadata

Add backend session records keyed by session_id, stable automatic session labels, task creation session ensure logic, and task DTO/session event fields for grouped workbench display.

The implementation preserves session_id as the internal grouping key and keeps display names mutable and non-unique.
```

提交命令必须限定本批路径，例如：

```bash
git add internal/domain internal/store internal/app internal/httpapi
git commit --only -m "feat: persist session display metadata

Add backend session records keyed by session_id, stable automatic session labels, task creation session ensure logic, and task DTO/session event fields for grouped workbench display.

The implementation preserves session_id as the internal grouping key and keeps display names mutable and non-unique." -- internal/domain internal/store internal/app internal/httpapi
```

### 完成汇报

提交后停止，不进入第 2 批。汇报必须包含：

- 提交 SHA
- 修改文件列表
- 验证命令和结果
- 是否触碰了计划外文件
- 任何风险或未解决问题

## 批次 2：后端重命名与历史归档 API

### 目标

实现 session rename、主历史/归档历史分离、批量归档和批量恢复。该批仍不改前端。

### 写入范围

允许修改后端 domain/store/app/httpapi 测试与实现文件。不得修改 `web/**`。

### 必须实现

1. `PATCH /api/sessions/{session_id}`。
2. `GET /api/history` 只返回未归档 completed task。
3. `GET /api/history/archived` 只返回已归档 completed task。
4. `POST /api/history/archive` 批量归档 task ids。
5. `POST /api/history/unarchive` 批量恢复 task ids。
6. `tasks.archived_at` 迁移和持久化。
7. 重复归档已归档 task 按幂等成功处理。
8. 重复恢复未归档 task 按幂等成功处理。
9. pending/cancelled task 不能归档或恢复。

### 必须测试

覆盖设计文档“后端测试”中归档和重命名相关条目。

### 验证命令

```bash
go test ./...
./scripts/check_go_coverage.sh
```

### 提交要求

提交后停止等待审核。

## 批次 3：前端分组列表与会话重命名

### 目标

把 TaskList 从扁平虚拟列表改成按 session_id 聚合的分组虚拟列表，并实现分组标题重命名。该批不实现归档视图和归档操作。

### 写入范围

允许修改：

- `web/src/lib/api.ts`
- `web/src/App.tsx`
- `web/src/App.css`
- `web/src/features/tasks/TaskList.tsx`
- `web/src/features/tasks/TaskList.test.tsx`
- `web/src/App.test.tsx`
- `web/src/test/**`

必须注意当前可能存在他人改动的 `MarkdownReader.tsx` 和 `MarkdownReader.test.tsx`。除非审核者明确允许，否则本批不得提交这些文件。

### 必须实现

1. 前端 Task 类型包含 session display fields。
2. 新增 `renameSession` API。
3. Pending 按 `session_id` 分组。
4. History 按 `session_id` 聚合分组。
5. 同名不同 session 不合并。
6. 分组标题显示 display name、auto name、数量和 rename 按钮。
7. Inline rename 成功后更新已加载 Pending 和 History。
8. Quick paste、active task、history selection 现有功能不回归。

### 验证命令

```bash
pnpm --dir web check
pnpm --dir web test:coverage
pnpm --dir web build
```

### 提交要求

提交后停止等待审核。

## 批次 4：前端归档历史、整组导出、整组归档和整组恢复

### 目标

实现主 History 统一选择模式、Archived History 二级视图、整组导出、整组归档和整组恢复。

### 必须实现

1. `fetchArchivedHistory`、`archiveHistoryTasks`、`unarchiveHistoryTasks` API。
2. `historyExportMode` 重构为统一 `historySelectionMode` 或等价状态。
3. History selection toolbar 同时支持 Copy 和 Archive。
4. Archived History 默认隐藏，通过 History 内入口进入。
5. Archived History 支持 Back、Load more、Restore selected。
6. History group header 支持整组选择、整组导出、整组归档。
7. Archived group header 支持整组选择、整组恢复。
8. XML formatter 提取为纯函数，并被 selected export 与 group export 共用。
9. 整组操作仅作用于当前已加载 task。

### 验证命令

```bash
pnpm --dir web check
pnpm --dir web test:coverage
pnpm --dir web build
```

### 提交要求

提交后停止等待审核。

## 批次 5：集成验证、E2E 和嵌入资源

### 目标

补齐端到端验证，确认 Go 后端、React 前端、嵌入资源和浏览器行为一致。

### 必须实现

1. 更新或新增 Playwright e2e，覆盖分组、重命名、归档入口、恢复、整组导出或整组归档中的关键路径。
2. 运行完整验证命令。
3. 执行 `pnpm --dir web sync:embed`，提交嵌入资源变化。
4. 如 README 验证命令或用户文档需要更新，做最小文档更新。

### 完整验证命令

```bash
go test ./...
./scripts/check_go_coverage.sh
pnpm --dir web check
pnpm --dir web test:coverage
pnpm --dir web build
pnpm --dir web sync:embed
pnpm --dir web test:e2e
```

### 提交要求

提交后停止等待最终审核。

## 审核门槛

每批完成后，主协调者必须审核：

1. `git show --stat <sha>` 是否只包含本批允许文件。
2. `git show <sha>` 是否满足本批要求。
3. 测试输出是否真实运行且通过。
4. 是否误提交无关脏文件。
5. 是否违反设计文档中的核心规则。

审核通过后才能派发下一批。若审核发现问题，必须让实施者修复并追加提交，不能进入下一批。
