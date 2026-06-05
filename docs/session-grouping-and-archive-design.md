# AskUser Popup 会话分组与历史归档设计

## 目标

本设计定义 AskUser Popup 浏览器工作台的会话分组、会话显示名持久化、主历史归档、二级归档历史、整组导出和整组归档行为。该功能服务于用户同时运行多个工作会话的场景：多个会话会持续向同一个浏览器工作台发送 AskUser 消息，用户需要在 Pending 和 History 区域直接判断每条消息属于哪个工作话题。

本设计不把分组对象定义为 Codex、Claude Code、Cursor、IDE 或其他技术客户端类型。分组对象是工作会话。工作会话由现有 `session_id` 标识。`session_id` 是程序内部的唯一分组键；用户可编辑的显示名只用于阅读和操作，不参与唯一性判断。显示名允许重复，重复显示名不得导致两个不同 `session_id` 的分组被合并。

本设计要求后端持久化会话显示名和历史归档状态。浏览器本地存储不得作为该功能的唯一状态来源。刷新页面、重新打开浏览器工作台、打开另一个浏览器标签页时，已经保存的会话显示名和归档结果必须来自 daemon 的持久状态。

## 当前系统基线

当前项目是 `informuser-go`。`popup-mcp` 接收 MCP `AskUser` 工具调用，把任务注册到 `popupd` daemon。`popupd` 持有 SQLite 状态，提供 HTTP API，服务 React 浏览器工作台，并通过 WebSocket 推送任务事件。浏览器工作台的左侧区域包含 `Pending` 和 `History` 两个主 tab，中间区域显示 Markdown 和历史回复，回复模式会展开右侧回复面板。

当前 `Task` 已包含 `session_id`。Go domain、HTTP DTO、SQLite task 表、前端 TypeScript 类型和 WebSocket 事件都已携带该字段。后端 `CreateTask` 逻辑还使用 `session_id` 实现一个重要规则：同一 session 只保留一个 pending task。新 task 到来时，旧 pending task 被取消为 superseded。该规则说明 `session_id` 已经是系统里的工作会话槽位标识。

当前前端 `TaskList` 是扁平虚拟列表。它接收 `Task[]`，使用 TanStack Virtual 按 task 数量渲染行。Pending 行包含标题、时间和 quick paste 输入；History 行包含标题、时间，并在导出模式下显示 checkbox。History 当前已有导出模式：用户点击 Export 进入选择状态，可 Select all、Invert、Copy selected XML 或 Cancel。新增分组、整组导出和整组归档必须复用并扩展这个选择心智，而不是另起一套冲突的选择模式。

当前 HTTP API 包含：

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

当前 SQLite `tasks` 表没有会话显示名表，也没有归档字段。新增功能需要可重复执行的迁移，不能依赖用户删除旧数据库。

## 术语

### 工作会话

工作会话是 AskUser Popup 中用于区分并行工作上下文的持久对象。工作会话由 `session_id` 唯一标识。一个工作会话可以代表用户正在进行的一个话题、一段工作时间、一个项目上下文或一个临时任务流，例如“春天”“夏天”“秋天”“冬天”。

工作会话不是技术客户端类型。四个工作会话可以全部来自 Codex，也可以分别来自不同 MCP 客户端。UI 不需要把技术客户端类型作为主信息展示。

### 会话显示名

会话显示名是用户给工作会话设置的可读标签。它保存在后端，展示在 Pending、History 和 Archived History 的分组标题中。会话显示名允许重复。程序不得使用显示名作为分组键、查询键或唯一性约束。

### 会话自动名

会话自动名是 daemon 第一次见到某个 `session_id` 时生成的稳定短标识。它用于会话尚未被用户命名时的默认显示，也用于显示名重复时的辅助识别。会话自动名由 `session_id` 稳定生成，例如 `S-8Q2M`。同一个 `session_id` 的自动名必须稳定；不同 `session_id` 的自动名应尽量不同，但自动名不是数据库主键。

### 主历史

主历史是 History tab 默认展示的 completed task 集合。主历史只包含未归档的 completed task。主历史是用户日常查看和导出的历史区域。

### 归档历史

归档历史是 History 的二级区域。它包含已经归档的 completed task。归档历史默认隐藏，用户通过 History 区域里的低优先级入口进入。归档历史不是删除区；归档 task 可以查看，也可以恢复到主历史。

## 产品行为

### 会话分组行为

Pending、History 和 Archived History 都按 `session_id` 分组。分组键永远是 `session_id`。分组标题显示后端保存的 `session_display_name`，并以低视觉权重显示 `session_auto_name`。

两个不同 `session_id` 可以拥有相同 `session_display_name`。同名分组必须保持为两个分组。UI 可通过自动名辅助区分，例如：

```text
春天 · S-8Q2M
春天 · S-F7PA
```

新会话第一次出现时，daemon 创建 session 记录，并把 `display_name` 初始化为 `auto_name`。用户可在分组标题上重命名。重命名成功后，Pending、History 和 Archived History 中所有同 `session_id` 的可见 task 都必须立即显示新名字；刷新后仍显示新名字。

### Pending 分组

Pending 区域展示 pending task。当前后端保证同一 session 最多一个 pending task，因此常见形态是一个会话组下只有一条 pending task。UI 仍必须使用分组结构，因为用户要通过组名识别来源。

Pending 组顺序按组内最新 `created_at` 倒序排列。组内 task 也按 `created_at` 倒序排列。若未来同一 session 支持多个 pending task，该排序规则仍成立。

Pending 分组标题包含：

- `session_display_name`
- `session_auto_name`
- 重命名按钮

Pending task 行保留现有功能：

- 标题
- 创建时间
- quick paste 回复输入
- active task 选择
- submitting 状态

Pending 空状态保持现有含义：没有 pending task 时显示等待 agents 调用 AskUser 的空状态。

### History 分组

主 History 展示未归档 completed task。History 按 `session_id` 聚合分组，而不是只在全局时间流中插入相邻分组头。组顺序按组内最新 `completed_at` 倒序排列；组内 task 按 `completed_at` 倒序排列。

该规则使用户能在 History 中集中查看某个工作会话的已完成问答。`Load more` 加载更多主历史后，前端把新任务加入当前集合，并重新按 `session_id` 聚合分组。已有组会追加更旧的任务；新 session 会产生新组。

History 分组标题包含：

- `session_display_name`
- `session_auto_name`
- 组内已加载 task 数量
- 重命名按钮
- 整组选择/整组导出/整组归档入口

History task 行保留现有功能：

- 标题
- 完成时间
- active task 选择
- 在选择模式下显示 checkbox

History 的 reader 行为保持现有方向：选择历史 task 后，中间 reader 显示原始 Markdown 内容和用户回复。

### Archived History 分组

Archived History 是 History 的二级视图。它默认不展示 task 列表。用户通过 History 面板里的低优先级入口进入。进入后，左侧列表区域切换为归档历史视图，并显示返回主 History 的入口。

Archived History 只展示已归档 completed task。它同样按 `session_id` 聚合分组。组顺序建议按组内最新 `archived_at` 倒序排列；组内 task 按 `archived_at` 倒序排列。若需要让用户按完成时间理解归档内容，可以在 task 行中同时显示完成时间和归档时间；第一版至少必须显示一个明确时间，推荐显示完成时间并在 tooltip 或次要文本中保留归档时间。

Archived History 支持：

- 查看归档 task
- 按会话分组
- 重命名会话
- 选择单条 task
- 整组选择
- 恢复选中 task
- 整组恢复
- 加载更多归档历史

Archived History 不显示 quick paste。归档 task 已经是 completed task。

## 会话重命名 UX

会话重命名入口放在分组标题上。按钮使用图标按钮，推荐 lucide `Pencil` 或 `Edit2`。按钮需要有 `title="Rename session"` 或等价可访问文本。

点击重命名按钮后，分组标题进入 inline edit 状态。输入框显示当前 `session_display_name`，并自动聚焦。交互规则如下：

- `Enter` 保存。
- `Escape` 取消。
- 失焦保存。
- 空白名字不提交，并恢复进入编辑前的名字。
- 显示名最大长度建议为 40 个 Unicode 字符。
- 显示名允许中文、英文、数字、空格和常见符号。
- 显示名允许与其他 session 重复。

保存时调用后端 rename API。成功后，前端更新所有已加载 task 中相同 `session_id` 的 session display fields。失败时，显示现有 error banner，并保留用户输入，便于重试。

重命名是会话级操作，不是 task 级操作。重命名按钮不得放在 task 标题旁边造成“修改 task 标题”的误解。分组标题是正确位置。

## 整组选择、整组导出和整组归档

### 选择模型

History 和 Archived History 的选择状态仍以 task id 集合表示。现有 `selectedHistoryIds` 可以扩展为按视图区分的选择集合，例如主历史使用 `selectedHistoryIds`，归档历史使用 `selectedArchivedIds`。整组选择只是向集合中加入该组内所有已加载 task id；取消整组选择则从集合中移除该组内所有已加载 task id。

整组选择不意味着选择数据库中该 session 的全部历史。它只作用于当前列表已经加载到前端的 task。该边界必须在代码和测试中保持一致，因为当前 history API 是分页加载。若以后需要“选择该 session 的全部历史”，应新增后端按 session 查询或后端批量操作接口，不应让前端假装已选择未加载数据。

### 整组导出

主 History 支持整组导出。用户可以在某个 History 分组标题上直接点击导出组按钮，也可以先整组选择后使用现有 Copy selected。

整组导出范围是该组当前已加载的未归档 completed task。导出格式沿用现有 XML 格式：

```xml
<Assistant id="1">
...
</Assistant>

<User id="1">
...
</User>
```

整组导出排序按该组内 task 的 `completed_at` 升序排列，使导出内容保持对话历史的自然先后顺序。现有 `exportSelected` 已对选中项按 `completed_at` 升序排序；整组导出应复用同一排序规则。

整组导出完成后，应清空选择状态并退出选择模式，或在直接组导出场景中不进入选择模式。推荐直接组导出不改变选择模式：点击组 header 的导出按钮后直接复制该组 XML，并给出轻量成功反馈；若现有系统没有 toast，可以暂不加成功反馈，保持和当前 Copy selected 行为一致。

### 整组归档

主 History 支持整组归档。用户可以在某个 History 分组标题上点击归档组按钮，也可以先整组选择后点击 Archive selected。

整组归档范围是该组当前已加载的未归档 completed task。归档成功后，这些 task 从主 History 列表移除，并进入 Archived History。若当前 active task 被归档，前端应选择主 History 中下一个可见 task；如果主 History 没有可见 task，则 active task 置空或切回 Pending 中的第一条 task。

整组归档是批量操作。后端批量归档 API 接收 task id 列表。前端不得逐条调用单条归档 API 造成中间状态复杂化。后端应保证批量操作要么全部成功，要么返回错误；第一版不做部分成功。

### 整组恢复

Archived History 支持整组恢复。用户可以在归档历史分组标题上点击恢复组按钮，也可以先整组选择后点击 Restore selected。

整组恢复范围是该组当前已加载的已归档 completed task。恢复成功后，这些 task 从 Archived History 移除，并回到主 History。前端可以重新 fetch 主 History 和 Archived History 的当前页，保证分页状态与数据库一致。

## 归档 UX

### 主 History 工具栏

当前 History 已有 Export 按钮和导出模式。新增归档后，History header 的工具建议如下：

```text
Pending | History        [Export] [Archive] [Archived]
```

在普通模式下：

- `Export` 进入选择模式。
- `Archive` 进入选择模式，并把主要动作设为 Archive selected；或者直接进入一个统一 selection mode，同时显示 Copy 与 Archive 两个动作。
- `Archived` 进入归档历史二级视图。

为减少模式复杂度，推荐使用统一选择模式。进入选择模式后，工具栏显示：

```text
[Select all] [Invert]        [Copy (n)] [Archive (n)] [Cancel]
```

这样用户不需要区分“导出模式”和“归档模式”。Copy 和 Archive 都作用于当前选中的 task。当前代码已有 `historyExportMode`，实现时可重命名为 `historySelectionMode`，以反映它不再只服务导出。

### 分组标题动作

History 分组标题上提供低干扰的组动作：

- 选择整组
- 导出整组
- 归档整组
- 重命名会话

这些动作应使用图标按钮，按钮间距紧凑，并带 tooltip/title。分组标题不能变成拥挤工具条。推荐默认显示重命名和一个更多菜单；如果不引入菜单组件，则显示三个小图标按钮也可以，但必须保证窄宽度下不溢出。

当前依赖已有 Radix UI Primitives，但没有 Dropdown Menu。若不想新增依赖，可以使用按钮直接排列。若增加 `@radix-ui/react-dropdown-menu`，需要同步更新 `package.json`、lockfile 和测试。

### Archived History 入口

Archived History 入口是二级历史入口，不应与 Pending/History 同级抢占主导航。推荐放在 History header 右侧，使用 `Archive` 图标加短文字 `Archived`。默认不加载归档列表。用户点击后才调用 `GET /api/history/archived`。

Archived History 视图顶部显示：

```text
[Back] Archived History        [Select all] [Invert] [Restore (n)]
```

如果未进入选择模式，也可以只显示 `[Back] Archived History [Restore]`，点击 Restore 进入选择模式。为了和主 History 一致，推荐归档视图也使用统一选择模式。

## 数据库设计

### sessions 表

新增：

```sql
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
```

`display_name` 不加唯一约束。`auto_name` 也不加唯一约束。唯一约束只在 `session_id` 上。

### tasks 表新增字段

新增：

```sql
archived_at TEXT NOT NULL DEFAULT ''
```

新增索引：

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_history_active
ON tasks(status, completed_at DESC)
WHERE status = 'completed' AND archived_at = '';

CREATE INDEX IF NOT EXISTS idx_tasks_history_archived
ON tasks(status, archived_at DESC)
WHERE status = 'completed' AND archived_at <> '';
```

SQLite partial index 表达式需要与实际查询条件一致。实现时应根据 SQLite 支持和现有 modernc sqlite 行为验证索引语句。若 partial index 复杂度不必要，也可先保留现有 `idx_tasks_completed_at` 并增加 `idx_tasks_archived_at`。

### 迁移

store 初始化必须执行幂等迁移：

1. 执行现有 `schemaSQL`。
2. 创建 `sessions` 表。
3. 检查 `tasks` 表是否存在 `archived_at` 列；不存在时添加。
4. 为已有 tasks 中出现过的 `session_id` 补建 sessions 行。
5. 创建新增索引。

列检查可使用：

```sql
PRAGMA table_info(tasks);
```

补建 sessions 行时，不得覆盖已有 sessions 的 display_name。推荐使用 `INSERT OR IGNORE`。created_at 取该 session 最早 task 的 `created_at`，last_seen_at 取最大 `updated_at`，updated_at 可与 last_seen_at 相同。display_name 和 auto_name 使用相同自动名。

## 自动名生成

自动名由 `session_id` 稳定生成。推荐形式：

```text
S-8Q2M
```

生成规则可以是：

1. 对 `session_id` 计算 FNV-1a、CRC32 或 SHA-1。
2. 把结果编码为大写 base32 或十六进制。
3. 取 4 到 6 位。
4. 加 `S-` 前缀。

推荐 5 位 base32 后缀。它短、易读、碰撞概率足够低。即使发生自动名碰撞，系统仍以 `session_id` 为唯一键，功能不会错误合并；碰撞只影响辅助显示。

自动名生成应放在后端 domain/store 辅助函数中，并有单元测试保证同一输入稳定输出。前端不得自行重新实现一套不同自动名规则；前端应使用 API 返回的 `session_auto_name`。

## 后端 API

### Rename Session

```text
PATCH /api/sessions/{session_id}
Content-Type: application/json

{
  "display_name": "春天"
}
```

成功响应：

```json
{
  "session_id": "session-...",
  "display_name": "春天",
  "auto_name": "S-8Q2M",
  "created_at": "2026-06-05T01:00:00Z",
  "updated_at": "2026-06-05T02:00:00Z",
  "last_seen_at": "2026-06-05T01:30:00Z"
}
```

错误：

- session 不存在：404。
- display_name 为空白：400。
- JSON 无效：400。

### List Pending

`GET /api/tasks/pending` 返回 task DTO。每个 task DTO 新增：

```json
{
  "session_display_name": "春天",
  "session_auto_name": "S-8Q2M",
  "archived_at": ""
}
```

Pending task 的 `archived_at` 始终为空。

### List History

`GET /api/history?limit=80&offset=0` 只返回未归档 completed task：

```sql
WHERE status = 'completed' AND archived_at = ''
```

响应 task DTO 带 session display fields。

### List Archived History

```text
GET /api/history/archived?limit=80&offset=0
```

只返回已归档 completed task：

```sql
WHERE status = 'completed' AND archived_at <> ''
```

响应 task DTO 带 session display fields 和 `archived_at`。

### Archive History Tasks

```text
POST /api/history/archive
Content-Type: application/json

{
  "task_ids": ["task-1", "task-2"]
}
```

行为：

- `task_ids` 不能为空。
- 所有 task 必须存在。
- 所有 task 必须是 completed。
- 已归档 task 再次归档按幂等成功处理：该 task 保持原 `archived_at`，不阻止批量操作。
- 成功后返回更新数量。

响应：

```json
{
  "status": "ok",
  "updated": 2
}
```

### Unarchive History Tasks

```text
POST /api/history/unarchive
Content-Type: application/json

{
  "task_ids": ["task-1", "task-2"]
}
```

行为：

- `task_ids` 不能为空。
- 所有 task 必须存在。
- 所有 task 必须是 completed。
- 未归档 task 再次恢复按幂等成功处理。
- 成功后把 `archived_at` 置空。

响应：

```json
{
  "status": "ok",
  "updated": 2
}
```

## DTO 和事件

### Task DTO

`taskDTO` 新增字段：

```go
SessionDisplayName string `json:"session_display_name"`
SessionAutoName    string `json:"session_auto_name"`
ArchivedAt         string `json:"archived_at,omitempty"`
```

`ArchivedAt` 对未归档 task 可省略或返回空字符串。前端类型应允许 `archived_at?: string` 或 `archived_at: string`。为了和现有 optional `completed_at` 风格一致，可使用 optional。

### Task Event

`task_created` 事件必须携带包含 session display fields 的 task。当前事件直接包含 domain `Task`。实现时若 domain Task 不包含这些字段，需要调整事件构造，使 WebSocket 推送给前端的 task 与 `/api/tasks/pending` 中的 task DTO 具备同等展示信息。否则新 task 到来时前端无法立即渲染正确分组名。

`task_completed` 和 `task_cancelled` 事件可以保持轻量，只带 `task_id`、`session_id` 和时间。当前前端收到完成/取消后会重新 fetch history。归档操作不需要 WebSocket 事件，因为归档由当前浏览器主动发起；若未来多浏览器同步归档状态，可增加 `task_archived` 和 `task_unarchived` 事件。

## 前端结构

### API 类型

`web/src/lib/api.ts` 中 `Task` 类型新增：

```ts
session_display_name: string;
session_auto_name: string;
archived_at?: string;
```

新增 API 函数：

```ts
renameSession(sessionId: string, displayName: string): Promise<Session>;
fetchArchivedHistory(limit?: number, offset?: number): Promise<Task[]>;
archiveHistoryTasks(taskIds: string[]): Promise<void>;
unarchiveHistoryTasks(taskIds: string[]): Promise<void>;
```

新增 `Session` 类型：

```ts
export type Session = {
  session_id: string;
  display_name: string;
  auto_name: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};
```

### App 状态

当前 `historyExportMode` 应重命名或扩展为 `historySelectionMode`。新增：

```ts
const [historyView, setHistoryView] = useState<'main' | 'archived'>('main');
const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
const [selectedArchivedIds, setSelectedArchivedIds] = useState(() => new Set<string>());
const [archivedLoaded, setArchivedLoaded] = useState(false);
```

主 History 和 Archived History 应有独立选择集合。切换 tab 或切换 historyView 时，应清空当前视图不适用的选择集合，避免隐藏选择残留。

### TaskList 分组模型

`TaskList` 不再直接把 `tasks.length` 交给 virtualizer。它先构造分组，再构造 list items：

```ts
type TaskGroup = {
  sessionId: string;
  displayName: string;
  autoName: string;
  tasks: Task[];
};

type TaskListItem =
  | { type: 'group'; group: TaskGroup }
  | { type: 'task'; task: Task };
```

`useVirtualizer` 的 `count` 是 `items.length`。`estimateSize` 根据 item 类型返回不同高度：

- group header：40 到 48。
- pending task：112。
- history task：76。

如果 History task 在归档视图中显示两行时间，估算高度应相应增加。虚拟列表的测试 mock 也必须从 task count 改为 item count。

### TaskList props

`TaskList` 需要新增能力：

```ts
mode: 'pending' | 'history' | 'archived';
selectionMode?: boolean;
selectedIds: Set<string>;
onToggleTaskSelection: (taskId: string) => void;
onToggleGroupSelection?: (sessionId: string, taskIds: string[]) => void;
onRenameSession: (sessionId: string, displayName: string) => Promise<void>;
onExportGroup?: (tasks: Task[]) => Promise<void>;
onArchiveGroup?: (tasks: Task[]) => Promise<void>;
onUnarchiveGroup?: (tasks: Task[]) => Promise<void>;
```

具体 props 可在实现中整理，但组件必须显式区分主 history 和 archived history 的组动作。Pending 不显示导出、归档、恢复；History 显示导出和归档；Archived 显示恢复。

### XML 导出

导出仍使用现有 XML 格式。新增整组导出时，应复用相同 formatter，避免 selected export 和 group export 输出不一致。建议把 XML 构造提取为纯函数：

```ts
formatTasksAsXML(tasks: Task[]): string
```

该函数按 `completed_at` 升序排序。若 task 缺少 `completed_at`，使用空字符串 fallback，但 history 和 archived task 正常都有 completed_at。

## 错误处理

后端 API 返回错误时使用现有 `writeError` 风格：

```json
{ "error": "..." }
```

前端所有新增 API 函数必须读取错误 payload，并把错误显示在现有 error banner 中。

重命名失败时，不应丢失用户输入。归档失败时，不应从列表移除 task。恢复失败时，不应从归档列表移除 task。导出失败通常来自 clipboard，前端应显示错误。

批量归档和批量恢复推荐全成功或全失败。若后端采用幂等语义，已归档 task 再归档、未归档 task 再恢复不算失败。不存在 task、pending task、cancelled task 应失败。

## 非目标

本功能不要求显示技术客户端类型。UI 不需要标注 Codex、Claude Code 或 MCP client implementation name。

本功能不要求合并两个 session。即使两个 session 被用户命名为同一个显示名，它们仍是两个分组。

本功能不要求选择某个 session 的数据库全量历史。整组选择、整组导出、整组归档只作用于当前已加载任务。

本功能不要求删除历史。归档不是删除。

本功能不要求为归档历史实现搜索。归档历史第一版只需要列表、分组、加载更多和恢复。

本功能不要求多浏览器之间实时同步重命名或归档操作。刷新或重新 fetch 后必须一致。若要实时同步，可后续增加 WebSocket session renamed/task archived events。

## 测试要求

### 后端测试

必须覆盖：

1. 创建 task 时自动创建 session。
2. 已存在 session 再创建 task 时只更新 last_seen_at，不覆盖 display_name。
3. pending endpoint 返回 session_display_name 和 session_auto_name。
4. history endpoint 只返回未归档 completed task。
5. archived history endpoint 只返回已归档 completed task。
6. rename session 成功更新 display_name。
7. rename session 允许重复 display_name。
8. rename session 拒绝空白 display_name。
9. rename session 对不存在 session 返回 404。
10. archive history tasks 把 completed task 移出主 history。
11. unarchive history tasks 把 archived task 恢复到主 history。
12. archive/unarchive 拒绝不存在 task。
13. archive/unarchive 拒绝 pending 或 cancelled task。
14. 迁移能为旧 tasks 补建 sessions。
15. 迁移不会覆盖已有 session display_name。

### 前端测试

必须覆盖：

1. Pending 按 `session_id` 分组。
2. History 按 `session_id` 聚合分组。
3. 同名不同 session 不合并。
4. 分组标题显示 display name 和 auto name。
5. 重命名调用 API，成功后更新 Pending、History 和 Archived 中同 session 的展示。
6. 重命名失败显示 error banner。
7. History 选择模式支持单条选择、Select all、Invert。
8. 整组选择把当前组已加载 task 全部加入选择集合。
9. 整组导出输出该组 XML，排序正确。
10. Copy selected 继续输出选中 XML，排序正确。
11. Archive selected 调用批量归档 API，并从主 History 移除 task。
12. 整组归档调用批量归档 API。
13. Archived 入口默认不加载归档历史，进入后加载。
14. Archived History 按 session 分组。
15. Restore selected 调用批量恢复 API，并从 Archived 移除 task。
16. 整组恢复调用批量恢复 API。
17. quick paste 不受分组虚拟列表影响。
18. active task 选择不受分组 header 影响。
19. Load more 后重新分组。

### E2E/视觉验证

实现完成后需要用 Playwright 或等价浏览器验证：

1. 桌面宽度下 Pending 分组不挤压 quick paste。
2. 可调整宽度的 task panel 中，长中文会话名不会覆盖按钮。
3. 窄屏下分组 header、task row 和工具栏不重叠。
4. History 统一选择模式可完成 Copy 和 Archive。
5. Archived 二级视图可进入、返回、恢复。
6. 重名分组仍可通过 auto name 区分。
7. Reply mode 隐藏 task panel 时，恢复普通模式后分组状态仍正确。

## 验证命令

完成实现后至少运行：

```bash
go test ./...
./scripts/check_go_coverage.sh
pnpm --dir web check
pnpm --dir web test:coverage
pnpm --dir web build
pnpm --dir web sync:embed
pnpm --dir web test:e2e
```

若只完成文档，不运行实现验证命令。实现阶段必须运行上述命令，并记录任何无法运行的原因。

## 实施顺序建议

推荐按以下顺序实现：

1. 增加数据库迁移：sessions 表、archived_at 字段、旧数据补建 sessions。
2. 增加 store 层 session 和 archive/unarchive 方法。
3. 增加 app service 方法，并把 CreateTask 接入 EnsureSession。
4. 扩展 DTO，使 pending/history 返回 session display fields。
5. 增加 rename、archived history、archive、unarchive HTTP handlers 和路由。
6. 更新 Go 单元测试。
7. 扩展前端 API 类型和函数。
8. 提取 XML formatter。
9. 重构 TaskList 为分组虚拟列表。
10. 在 App 中加入 historyView、selection mode、archivedTasks 和批量操作。
11. 增加 session rename UI。
12. 增加 group export、group archive、group restore。
13. 更新前端测试。
14. 运行完整验证。

该顺序先建立后端稳定状态，再接 UI。不要先做 localStorage 版本再迁移到后端版本，因为用户已经明确要求后端持久化。

## 验收标准

该功能完成后，用户可以同时运行多个工作会话。每个会话在 Pending 中以独立分组出现。用户把某个分组改名为“春天”后，该名字保存到后端，并在 Pending、主 History 和 Archived History 中持续显示。另一个分组也可以叫“春天”，但它仍然保持独立分组，并显示不同自动名。

用户可以在主 History 中选择单条、选择全部、反选、选择整组、导出选中项、导出整组、归档选中项、归档整组。归档后的 task 不再显示在主 History。用户可以进入默认隐藏的 Archived History 二级视图，查看归档内容，选择单条或整组恢复。恢复后的 task 回到主 History。

所有新增状态由 daemon 和 SQLite 持久化。刷新页面不得丢失会话显示名，不得让已归档 task 回到主 History。现有 AskUser 注册、等待回复、quick paste、reply panel、Markdown reader、History XML 导出和 WebSocket 新任务提示不得回归。
