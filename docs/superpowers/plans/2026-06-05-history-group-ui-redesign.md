# History Group UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the left History and Archived History group list into a smoother session inbox with collapsible groups, cleaner actions, and less visual clutter.

**Architecture:** Keep the existing backend and session grouping semantics. Move the UI from “flat virtual rows with always-visible group buttons” to a controlled grouped list where `App` owns per-view collapsed state and `TaskList` renders only expanded group tasks. Use Radix headless primitives for menu, checkbox, and collapsible-style behavior rather than hand-rolling edge-case-heavy interactions.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Virtual, Radix Tabs/Tooltip plus new Radix DropdownMenu/Checkbox/Collapsible dependencies, lucide-react icons, Vitest, Testing Library, Playwright, Go embedded static assets.

---

## Product Direction

The user cares about whether the workbench feels smooth and useful, not whether the implementation is clever. The left History area should feel like a session-organized inbox. Users should scan sessions first, expand the sessions they care about, collapse noise, and perform batch operations without seeing repeated icon clusters on every group.

Do not make the list card-heavy. This is an operational tool, not a landing page. Prefer a dense but orderly list: strong group hierarchy, low-noise controls, subtle separators, reliable keyboard/accessibility behavior from Radix primitives.

## Non-Negotiable Requirements

1. Use proven headless components for complex UI primitives:
   - Add `@radix-ui/react-dropdown-menu`.
   - Add `@radix-ui/react-checkbox`.
   - Add `@radix-ui/react-collapsible` if it improves structure or aria semantics.
   - Do not hand-roll dropdown menu focus management, escape handling, outside-click behavior, or indeterminate checkbox behavior.
2. History groups and Archived History groups must be collapsible.
3. History toolbar must support `Expand all` and `Collapse all`.
4. Archived History toolbar must support `Expand all` and `Collapse all`.
5. Pending may remain always expanded in the first implementation unless the implementer finds a very small shared implementation path. Do not hide pending work unexpectedly.
6. Common browsing state should show fewer controls:
   - Group header: chevron, display name, auto name/count/latest metadata, and one menu trigger.
   - Group-level select/export/archive/restore/rename actions move into a Radix dropdown menu.
7. Selection mode should remain clear:
   - Main History: selected count, Select all, Invert, Copy, Archive, Cancel.
   - Archived History: selected count, Select all, Invert, Restore, Cancel.
   - Group headers in selection mode should expose a group checkbox for currently loaded tasks.
8. Collapsed groups must still allow selecting the loaded group in selection mode.
9. Load more must respect existing collapse state:
   - Existing expanded group remains expanded.
   - Existing collapsed group remains collapsed.
   - Newly discovered History/Archived groups default collapsed.
10. Rename behavior must remain available and persisted through the existing API.
11. Grouping key remains `session_id`; display names may duplicate and must not merge groups.
12. No backend changes are expected.
13. Final build must sync `internal/webui/dist/**`.

## Current Files And Responsibilities

- `web/package.json`
  - Add Radix dependencies. Use `pnpm --dir web add ...` so `pnpm-lock.yaml` stays correct.
- `web/pnpm-lock.yaml`
  - Updated by pnpm only.
- `web/src/App.tsx`
  - Own History/Archived collapsed state.
  - Own toolbar actions: expand all, collapse all, enter selection mode, load archived, back.
  - Pass collapsed state and group control callbacks into `TaskList`.
  - Keep API, archive, restore, selection, load more, and active task behavior consistent.
- `web/src/features/tasks/TaskList.tsx`
  - Build session groups.
  - Render collapsible group headers with cleaner hierarchy.
  - Render task rows only when their group is expanded.
  - Render group checkbox in selection mode using Radix Checkbox.
  - Render group actions in Radix DropdownMenu.
  - Preserve virtualization.
- `web/src/App.css`
  - Replace cluttered group header styling with a session-inbox list style.
  - Add toolbar states and menu/checkbox styles.
  - Ensure desktop and narrow viewport layouts remain readable.
- `web/src/features/tasks/TaskList.test.tsx`
  - Unit tests for collapse rendering, group checkbox, menu actions, duplicate names, and archived restore group action.
- `web/src/App.test.tsx`
  - Tests for toolbar expand/collapse state, archived toolbar behavior, load more defaults, and selection mode if easiest at App level.
- `web/tests/askuser.spec.ts`
  - E2E for real browser History collapse/expand/all controls, Archived collapse/expand, menu actions, selection mode, and narrow viewport.
- `internal/webui/dist/**`
  - Updated only in final embed sync task.

## Commit Discipline

This is a nested git repo. All commits must be path-limited and must not include unrelated work:

```bash
git add <new tracked files if any>
git commit --only -m "<message>" -- <paths>
```

For new files, stage them first, then use `git commit --only`.

Each task must stop after its commit and wait for coordinator review. The coordinator must run verification and two-stage review before dispatching the next task.

## Verification Baseline

Use these commands as appropriate per task:

```bash
pnpm --dir web check
pnpm --dir web lint
pnpm --dir web test:coverage
pnpm --dir web build
pnpm --dir web sync:embed
pnpm --dir web test:e2e
go test ./...
./scripts/check_go_coverage.sh
```

Final verification must run all of them.

---

## Task 1: Add Headless UI Dependencies And Collapse Data Model

**Purpose:** Introduce the Radix primitives and make `TaskList` capable of rendering expanded/collapsed groups without changing visual design heavily yet.

**Files:**
- Modify: `web/package.json`
- Modify: `web/pnpm-lock.yaml`
- Modify: `web/src/features/tasks/TaskList.tsx`
- Modify: `web/src/features/tasks/TaskList.test.tsx`

- [ ] **Step 1: Add Radix dependencies**

Run:

```bash
pnpm --dir web add @radix-ui/react-dropdown-menu @radix-ui/react-checkbox @radix-ui/react-collapsible
```

Expected:
- `web/package.json` contains the three new dependencies.
- `web/pnpm-lock.yaml` is updated.

- [ ] **Step 2: Write failing TaskList collapse tests**

In `web/src/features/tasks/TaskList.test.tsx`, add tests that exercise the new public props before implementation.

Add a test equivalent to:

```tsx
it('hides task rows for collapsed history groups while keeping the group header visible', () => {
  const first = task({
    task_id: 'history-1',
    session_id: 'session-a',
    session_display_name: 'Spring',
    session_auto_name: 'S-SPR1',
    title: 'Spring history',
    status: 'completed',
    completed_at: '2026-06-05T02:00:00Z',
  });
  const second = task({
    task_id: 'history-2',
    session_id: 'session-b',
    session_display_name: 'Summer',
    session_auto_name: 'S-SUM1',
    title: 'Summer history',
    status: 'completed',
    completed_at: '2026-06-05T03:00:00Z',
  });

  renderTaskList({
    tasks: [first, second],
    mode: 'history',
    collapsedSessionIds: new Set(['session-a']),
  });

  expect(screen.getByRole('button', { name: /Expand Spring/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Open task Spring history/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Collapse Summer/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Open task Summer history/ })).toBeInTheDocument();
});
```

Add a second test equivalent to:

```tsx
it('calls the collapsed state callback when a group header toggle is clicked', async () => {
  const user = userEvent.setup();
  const onToggleGroupCollapsed = vi.fn();
  const current = task({
    task_id: 'history-1',
    session_id: 'session-a',
    session_display_name: 'Spring',
    session_auto_name: 'S-SPR1',
    status: 'completed',
    completed_at: '2026-06-05T02:00:00Z',
  });

  renderTaskList({
    tasks: [current],
    mode: 'history',
    collapsedSessionIds: new Set(),
    onToggleGroupCollapsed,
  });

  await user.click(screen.getByRole('button', { name: /Collapse Spring/ }));

  expect(onToggleGroupCollapsed).toHaveBeenCalledWith('session-a');
});
```

The local `renderTaskList` helper must accept optional `collapsedSessionIds` and `onToggleGroupCollapsed` props and forward them to `TaskList`.

- [ ] **Step 3: Run the focused failing tests**

Run:

```bash
pnpm --dir web test -- src/features/tasks/TaskList.test.tsx
```

Expected before implementation:
- Tests fail because `TaskList` does not accept collapse props or render expand/collapse controls.

- [ ] **Step 4: Implement collapse model in TaskList**

In `web/src/features/tasks/TaskList.tsx`, change `TaskListItem` and props.

Use this shape:

```ts
type TaskListItem =
  | { type: 'group'; group: TaskGroup; collapsed: boolean }
  | { type: 'task'; task: Task };

type TaskListProps = {
  tasks: Task[];
  activeTaskId?: string;
  mode: 'pending' | 'history' | 'archived';
  selectionMode?: boolean;
  submittingTaskId?: string;
  selectedIds: Set<string>;
  collapsedSessionIds?: Set<string>;
  onSelectTask: (task: Task) => void;
  onQuickReply: (task: Task, value: string) => Promise<void>;
  onRenameSession: (sessionId: string, displayName: string) => Promise<void>;
  onToggleTaskSelection: (taskId: string) => void;
  onToggleGroupSelection?: (sessionId: string, taskIds: string[]) => void;
  onToggleGroupCollapsed?: (sessionId: string) => void;
  onExportGroup?: (tasks: Task[]) => Promise<void>;
  onArchiveGroup?: (tasks: Task[]) => Promise<void>;
  onUnarchiveGroup?: (tasks: Task[]) => Promise<void>;
};
```

Replace `buildListItems(groups)` with:

```ts
function buildListItems(groups: TaskGroup[], collapsedSessionIds: Set<string>): TaskListItem[] {
  return groups.flatMap((group) => {
    const collapsed = collapsedSessionIds.has(group.sessionId);
    return [
      { type: 'group' as const, group, collapsed },
      ...(collapsed ? [] : group.tasks.map((task) => ({ type: 'task' as const, task }))),
    ];
  });
}
```

Inside `TaskList`, default missing collapse props:

```ts
const safeCollapsedSessionIds = collapsedSessionIds ?? new Set<string>();
const items = useMemo(
  () => buildListItems(groups, safeCollapsedSessionIds),
  [groups, safeCollapsedSessionIds],
);
```

Pass `collapsed={item.collapsed}` and `onToggleCollapsed={onToggleGroupCollapsed}` into `SessionGroupHeader`.

- [ ] **Step 5: Add a basic chevron toggle button**

Import `ChevronDown` and `ChevronRight` from `lucide-react`.

Inside `SessionGroupHeader`, add a first button:

```tsx
const toggleLabel = `${collapsed ? 'Expand' : 'Collapse'} ${group.displayName}`;

<button
  type="button"
  className="icon-button task-group-collapse-button"
  onClick={() => onToggleCollapsed?.(group.sessionId)}
  aria-expanded={!collapsed}
  aria-label={toggleLabel}
  title={toggleLabel}
>
  {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
</button>
```

Do not remove existing group action buttons in Task 1. This task should be a low-risk model change, not the full redesign.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --dir web test -- src/features/tasks/TaskList.test.tsx
```

Expected:
- TaskList tests pass.

- [ ] **Step 7: Run check**

Run:

```bash
pnpm --dir web check
```

Expected:
- Biome passes.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add web/package.json web/pnpm-lock.yaml
git commit --only -m "feat: add collapsible task groups foundation" -- web/package.json web/pnpm-lock.yaml web/src/features/tasks/TaskList.tsx web/src/features/tasks/TaskList.test.tsx
```

Stop for coordinator review.

---

## Task 2: Move Group Actions Into Radix Menus And Use Radix Checkbox

**Purpose:** Reduce visual noise by replacing always-visible group action clusters with a single menu trigger, and use Radix Checkbox for group selection including indeterminate state.

**Files:**
- Modify: `web/src/features/tasks/TaskList.tsx`
- Modify: `web/src/features/tasks/TaskList.test.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write tests for menu actions**

In `TaskList.test.tsx`, update existing group action tests so they open a menu before clicking actions.

Use accessible names:

```tsx
await user.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
await user.click(await screen.findByRole('menuitem', { name: 'Select loaded tasks' }));
expect(onToggleGroupSelection).toHaveBeenCalledWith('session-a', ['history-1']);

await user.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
await user.click(await screen.findByRole('menuitem', { name: 'Copy loaded group XML' }));
expect(onExportGroup).toHaveBeenCalledWith([groupTask]);

await user.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
await user.click(await screen.findByRole('menuitem', { name: 'Archive loaded group' }));
expect(onArchiveGroup).toHaveBeenCalledWith([groupTask]);
```

For archived mode:

```tsx
await user.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
await user.click(await screen.findByRole('menuitem', { name: 'Restore loaded group' }));
expect(onUnarchiveGroup).toHaveBeenCalledWith([archivedTask]);
```

- [ ] **Step 2: Write tests for group checkbox in selection mode**

Add:

```tsx
it('shows a group checkbox with selected count in history selection mode', async () => {
  const user = userEvent.setup();
  const onToggleGroupSelection = vi.fn();
  const first = task({
    task_id: 'history-1',
    session_id: 'session-a',
    session_display_name: 'Spring',
    session_auto_name: 'S-SPR1',
    title: 'First Spring',
    status: 'completed',
    completed_at: '2026-06-05T02:00:00Z',
  });
  const second = task({
    task_id: 'history-2',
    session_id: 'session-a',
    session_display_name: 'Spring',
    session_auto_name: 'S-SPR1',
    title: 'Second Spring',
    status: 'completed',
    completed_at: '2026-06-05T03:00:00Z',
  });

  renderTaskList({
    tasks: [first, second],
    mode: 'history',
    selectionMode: true,
    selectedIds: new Set(['history-1']),
    onToggleGroupSelection,
  });

  expect(screen.getByText('1/2 selected')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Select loaded tasks for Spring' }));
  expect(onToggleGroupSelection).toHaveBeenCalledWith('session-a', ['history-2', 'history-1']);
});
```

The task id order should match sorted group task order. If the sorted order is newest first, assert `['history-2', 'history-1']`.

- [ ] **Step 3: Run failing focused tests**

Run:

```bash
pnpm --dir web test -- src/features/tasks/TaskList.test.tsx
```

Expected:
- Tests fail because menu and group checkbox are not implemented.

- [ ] **Step 4: Implement Radix imports**

In `TaskList.tsx`, import:

```ts
import * as Checkbox from '@radix-ui/react-checkbox';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
```

Import icons:

```ts
import {
  Archive,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Clock3,
  MoreHorizontal,
  Pencil,
  RotateCcw,
} from 'lucide-react';
```

- [ ] **Step 5: Replace always-visible action cluster with menu**

In `SessionGroupHeader`, compute:

```ts
const selectedCount = group.tasks.filter((task) => selectedIds.has(task.task_id)).length;
const allGroupTasksSelected = group.tasks.length > 0 && selectedCount === group.tasks.length;
const partiallySelected = selectedCount > 0 && selectedCount < group.tasks.length;
const groupTaskIds = group.tasks.map((task) => task.task_id);
```

Pass `selectedIds` and `selectionMode` into `SessionGroupHeader` if not already available.

Render menu trigger:

```tsx
<DropdownMenu.Root>
  <DropdownMenu.Trigger asChild>
    <button
      type="button"
      className="icon-button task-group-menu-button"
      aria-label={`Open ${group.displayName} group actions`}
      title="Group actions"
    >
      <MoreHorizontal size={15} />
    </button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content className="group-action-menu" align="end" sideOffset={6}>
      <DropdownMenu.Item className="group-action-menu-item" onSelect={startEditing}>
        <Pencil size={14} />
        Rename session
      </DropdownMenu.Item>
      {(mode === 'history' || mode === 'archived') && onToggleGroupSelection ? (
        <DropdownMenu.Item
          className="group-action-menu-item"
          onSelect={() => onToggleGroupSelection(group.sessionId, groupTaskIds)}
        >
          <CheckSquare size={14} />
          Select loaded tasks
        </DropdownMenu.Item>
      ) : null}
      {mode === 'history' && onExportGroup ? (
        <DropdownMenu.Item
          className="group-action-menu-item"
          onSelect={() => void onExportGroup(group.tasks)}
        >
          <ClipboardCopy size={14} />
          Copy loaded group XML
        </DropdownMenu.Item>
      ) : null}
      {mode === 'history' && onArchiveGroup ? (
        <DropdownMenu.Item
          className="group-action-menu-item danger"
          onSelect={() => void onArchiveGroup(group.tasks)}
        >
          <Archive size={14} />
          Archive loaded group
        </DropdownMenu.Item>
      ) : null}
      {mode === 'archived' && onUnarchiveGroup ? (
        <DropdownMenu.Item
          className="group-action-menu-item"
          onSelect={() => void onUnarchiveGroup(group.tasks)}
        >
          <RotateCcw size={14} />
          Restore loaded group
        </DropdownMenu.Item>
      ) : null}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
```

Remove the old always-visible `.task-group-actions` buttons. Keep rename available only through the menu in non-editing state.

- [ ] **Step 6: Add Radix group checkbox in selection mode**

In `SessionGroupHeader`, when `selectionMode && (mode === 'history' || mode === 'archived')`, render before the title:

```tsx
<Checkbox.Root
  className="group-checkbox"
  checked={allGroupTasksSelected ? true : partiallySelected ? 'indeterminate' : false}
  onCheckedChange={() => onToggleGroupSelection?.(group.sessionId, groupTaskIds)}
  aria-label={`Select loaded tasks for ${group.displayName}`}
>
  <Checkbox.Indicator className="group-checkbox-indicator">
    {partiallySelected ? <Minus size={13} /> : <Check size={13} />}
  </Checkbox.Indicator>
</Checkbox.Root>
```

Import `Minus` from lucide-react.

Render selected count metadata in selection mode:

```tsx
<small>
  {selectionMode && (mode === 'history' || mode === 'archived')
    ? `${selectedCount}/${group.tasks.length} selected`
    : `${group.autoName} · ${group.tasks.length}`}
</small>
```

- [ ] **Step 7: Add menu and checkbox CSS**

In `App.css`, add:

```css
.task-group-menu-button,
.task-group-collapse-button {
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
}

.group-action-menu {
  z-index: 60;
  display: grid;
  min-width: 190px;
  gap: 2px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.group-action-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 5px;
  color: var(--text);
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.group-action-menu-item[data-highlighted] {
  background: var(--surface-selected);
  color: var(--accent);
}

.group-action-menu-item.danger {
  color: var(--danger);
}

.group-checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  min-width: 18px;
  height: 18px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: var(--surface);
  color: var(--accent);
}

.group-checkbox:focus-visible {
  outline: 2px solid rgb(37 99 235 / 25%);
  outline-offset: 2px;
}

.group-checkbox-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 8: Run focused tests and check**

Run:

```bash
pnpm --dir web test -- src/features/tasks/TaskList.test.tsx
pnpm --dir web check
```

Expected:
- Focused tests pass.
- Biome passes.

- [ ] **Step 9: Commit Task 2**

Run:

```bash
git commit --only -m "feat: move group actions into accessible menus" -- web/src/features/tasks/TaskList.tsx web/src/features/tasks/TaskList.test.tsx web/src/App.css
```

Stop for coordinator review.

---

## Task 3: Add App-Level Expand/Collapse Toolbar And Load-More Defaults

**Purpose:** Give users view-level control: expand all, collapse all, select, archived, and sensible defaults for newly loaded groups.

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write App tests for toolbar controls**

Because `App.test.tsx` mocks `TaskList`, extend the mock props:

```ts
collapsedSessionIds?: Set<string>;
onToggleGroupCollapsed?: (sessionId: string) => void;
```

Inside the mock list, show collapsed state:

```tsx
<div data-testid={`${mode}-collapsed-${sessionId}`}>
  {collapsedSessionIds?.has(sessionId) ? 'collapsed' : 'expanded'}
</div>
<button type="button" onClick={() => onToggleGroupCollapsed?.(sessionId)}>
  Toggle collapse {mode} {sessionId}
</button>
```

Add a test:

```tsx
it('expands and collapses all loaded main history groups from the toolbar', async () => {
  const user = userEvent.setup();
  const spring = task({
    task_id: 'history-spring',
    session_id: 'spring',
    session_display_name: 'Spring',
    status: 'completed',
    completed_at: '2026-06-05T03:00:00Z',
  });
  const summer = task({
    task_id: 'history-summer',
    session_id: 'summer',
    session_display_name: 'Summer',
    status: 'completed',
    completed_at: '2026-06-05T02:00:00Z',
  });
  apiMocks.fetchPendingTasks.mockResolvedValue([]);
  apiMocks.fetchHistory.mockResolvedValue([spring, summer]);
  apiMocks.connectTaskEvents.mockReturnValue(() => undefined);

  render(<App />);
  await user.click(await screen.findByRole('tab', { name: 'History' }));

  await user.click(screen.getByRole('button', { name: 'Collapse all groups' }));
  expect(screen.getByTestId('history-collapsed-spring')).toHaveTextContent('collapsed');
  expect(screen.getByTestId('history-collapsed-summer')).toHaveTextContent('collapsed');

  await user.click(screen.getByRole('button', { name: 'Expand all groups' }));
  expect(screen.getByTestId('history-collapsed-spring')).toHaveTextContent('expanded');
  expect(screen.getByTestId('history-collapsed-summer')).toHaveTextContent('expanded');
});
```

Add a test for archived toolbar:

```tsx
it('expands and collapses archived groups from the archived toolbar', async () => {
  const user = userEvent.setup();
  const archived = task({
    task_id: 'archived-winter',
    session_id: 'winter',
    session_display_name: 'Winter',
    status: 'completed',
    completed_at: '2026-06-05T02:00:00Z',
    archived_at: '2026-06-05T03:00:00Z',
  });
  apiMocks.fetchPendingTasks.mockResolvedValue([]);
  apiMocks.fetchHistory.mockResolvedValue([]);
  apiMocks.fetchArchivedHistory.mockResolvedValue([archived]);
  apiMocks.connectTaskEvents.mockReturnValue(() => undefined);

  render(<App />);
  await user.click(await screen.findByRole('tab', { name: 'History' }));
  await user.click(screen.getByRole('button', { name: 'Open archived history' }));

  await user.click(await screen.findByRole('button', { name: 'Collapse all groups' }));
  expect(screen.getByTestId('archived-collapsed-winter')).toHaveTextContent('collapsed');

  await user.click(screen.getByRole('button', { name: 'Expand all groups' }));
  expect(screen.getByTestId('archived-collapsed-winter')).toHaveTextContent('expanded');
});
```

- [ ] **Step 2: Write test for newly loaded groups defaulting collapsed**

Add:

```tsx
it('keeps existing collapse state and collapses newly loaded history groups', async () => {
  const user = userEvent.setup();
  const first = task({
    task_id: 'history-spring',
    session_id: 'spring',
    session_display_name: 'Spring',
    status: 'completed',
    completed_at: '2026-06-05T03:00:00Z',
  });
  const loaded = task({
    task_id: 'history-autumn',
    session_id: 'autumn',
    session_display_name: 'Autumn',
    status: 'completed',
    completed_at: '2026-06-05T01:00:00Z',
  });
  apiMocks.fetchPendingTasks.mockResolvedValue([]);
  apiMocks.fetchHistory.mockResolvedValueOnce([first]).mockResolvedValueOnce([loaded]);
  apiMocks.connectTaskEvents.mockReturnValue(() => undefined);

  render(<App />);
  await user.click(await screen.findByRole('tab', { name: 'History' }));
  expect(screen.getByTestId('history-collapsed-spring')).toHaveTextContent('expanded');

  await user.click(screen.getByRole('button', { name: 'Load more' }));
  expect(screen.getByTestId('history-collapsed-spring')).toHaveTextContent('expanded');
  expect(screen.getByTestId('history-collapsed-autumn')).toHaveTextContent('collapsed');
});
```

- [ ] **Step 3: Run failing App tests**

Run:

```bash
pnpm --dir web test -- src/App.test.tsx
```

Expected:
- Tests fail because App does not own collapse state or toolbar controls.

- [ ] **Step 4: Implement collapse state in App**

In `App.tsx`, add state:

```ts
const [collapsedHistorySessionIds, setCollapsedHistorySessionIds] = useState(() => new Set<string>());
const [collapsedArchivedSessionIds, setCollapsedArchivedSessionIds] = useState(() => new Set<string>());
```

Add helpers:

```ts
const loadedSessionIds = (tasks: Task[]) => Array.from(new Set(tasks.map((task) => task.session_id)));

const toggleHistoryGroupCollapsed = (sessionId: string) => {
  const setCollapsed =
    historyView === 'archived' ? setCollapsedArchivedSessionIds : setCollapsedHistorySessionIds;
  setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }
    return next;
  });
};

const expandAllGroups = () => {
  if (historyView === 'archived') {
    setCollapsedArchivedSessionIds(new Set());
  } else {
    setCollapsedHistorySessionIds(new Set());
  }
};

const collapseAllGroups = () => {
  const source = historyView === 'archived' ? archivedTasks : historyTasks;
  const sessionIds = loadedSessionIds(source);
  if (historyView === 'archived') {
    setCollapsedArchivedSessionIds(new Set(sessionIds));
  } else {
    setCollapsedHistorySessionIds(new Set(sessionIds));
  }
};
```

For `loadMoreHistory`, capture existing session ids before appending:

```ts
const existingSessionIds = new Set(source.map((task) => task.session_id));
const nextPage = await fetchHistory(...);
const newSessionIds = nextPage
  .map((task) => task.session_id)
  .filter((sessionId) => !existingSessionIds.has(sessionId));
setCollapsedHistorySessionIds((current) => new Set([...current, ...newSessionIds]));
```

Apply equivalent archived logic.

- [ ] **Step 5: Pass collapse props to TaskList**

For History:

```tsx
collapsedSessionIds={
  historyView === 'archived' ? collapsedArchivedSessionIds : collapsedHistorySessionIds
}
onToggleGroupCollapsed={toggleHistoryGroupCollapsed}
```

For Pending:

```tsx
collapsedSessionIds={emptySelection}
```

Do not provide toolbar buttons for Pending.

- [ ] **Step 6: Rework History toolbar labels**

Replace normal main History buttons:

```text
Export / Archive / Archived
```

with:

```tsx
<button type="button" className="tool-button" onClick={expandAllGroups} title="Expand all groups" aria-label="Expand all groups">
  <ChevronsDown size={15} />
  Expand all
</button>
<button type="button" className="tool-button" onClick={collapseAllGroups} title="Collapse all groups" aria-label="Collapse all groups">
  <ChevronsRight size={15} />
  Collapse all
</button>
<button type="button" className="tool-button" disabled={historyTasks.length === 0} onClick={enterHistorySelectionMode} title="Select history tasks">
  <CheckSquare size={15} />
  Select
</button>
<button type="button" className="tool-button" onClick={() => void openArchivedHistory()} title="Open archived history">
  <Archive size={15} />
  Archived
</button>
```

Use lucide `ChevronsDown` and `ChevronsRight`.

For archived view:

```tsx
Back | Archived History | Expand all | Collapse all | Select
```

Do not keep a normal-mode `Restore` button. Restore belongs to selection mode or group menu.

- [ ] **Step 7: Improve selection toolbar text**

Add a compact selected count:

```tsx
<span className="selection-count">{selectedIds.size} selected</span>
```

Keep Select all, Invert, Copy/Archive/Restore, Cancel.

- [ ] **Step 8: Run App tests and check**

Run:

```bash
pnpm --dir web test -- src/App.test.tsx
pnpm --dir web check
```

Expected:
- App tests pass.
- Biome passes.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git commit --only -m "feat: add history group expand collapse controls" -- web/src/App.tsx web/src/App.test.tsx web/src/App.css
```

Stop for coordinator review.

---

## Task 4: Redesign History List Visual Style

**Purpose:** Make the left panel feel like a session inbox rather than a pile of row blocks.

**Files:**
- Modify: `web/src/features/tasks/TaskList.tsx`
- Modify: `web/src/features/tasks/TaskList.test.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write tests for accessible group header structure**

In `TaskList.test.tsx`, add:

```tsx
it('exposes group headers as collapsible buttons with session metadata', () => {
  const current = task({
    task_id: 'history-1',
    session_id: 'session-a',
    session_display_name: 'Spring Review',
    session_auto_name: 'S-SPR1',
    status: 'completed',
    completed_at: '2026-06-05T02:00:00Z',
  });

  renderTaskList({ tasks: [current], mode: 'history' });

  expect(screen.getByRole('button', { name: /Collapse Spring Review/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(screen.getByText('S-SPR1 · 1 loaded')).toBeInTheDocument();
});
```

If Task 2/3 already uses `S-SPR1 · 1`, update it to `S-SPR1 · 1 loaded` for clarity that the count is loaded tasks.

- [ ] **Step 2: Add semantic class structure**

In `SessionGroupHeader`, structure the non-editing title area as:

```tsx
<div className="task-group-main">
  <button ... className="task-group-collapse-button">...</button>
  {selection checkbox if selection mode}
  <div className="task-group-copy">
    <strong className="task-group-name">{group.displayName}</strong>
    <span className="task-group-meta">
      {selectionMode ? `${selectedCount}/${group.tasks.length} selected` : `${group.autoName} · ${group.tasks.length} loaded`}
    </span>
  </div>
</div>
```

The menu trigger sits at the far right:

```tsx
<div className="task-group-end">
  {menu trigger}
</div>
```

Remove `h3.task-group-title` if it no longer fits. Use button/strong/span semantics; tests should query by accessible button names, not by `heading`.

- [ ] **Step 3: Update tests that query headings**

Existing tests that use `screen.getByRole('heading', ...)` should switch to visible text and collapse buttons:

```tsx
expect(screen.getByText('Spring')).toBeInTheDocument();
expect(screen.getByText('S-AAAAA · 2 loaded')).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Collapse Spring/ })).toBeInTheDocument();
```

Duplicate display name tests must still prove two session groups exist by checking both auto names:

```tsx
expect(screen.getByText('S-AAAAA · 2 loaded')).toBeInTheDocument();
expect(screen.getByText('S-BBBBB · 1 loaded')).toBeInTheDocument();
```

- [ ] **Step 4: Rewrite group and task CSS**

Replace the current `.task-group-row`, `.task-group-title`, `.task-group-actions`, and task row spacing with:

```css
.task-group-row {
  position: absolute;
  right: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 54px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-subtle) 82%, #ffffff);
}

.task-group-main {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.task-group-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.task-group-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-group-meta {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-group-end {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}

.task-row {
  position: absolute;
  right: 0;
  left: 0;
  display: block;
  min-height: 68px;
  padding: 10px 12px 10px 34px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 0;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.task-row.selected {
  background: var(--surface-selected);
  box-shadow: inset 2px 0 0 var(--accent);
}
```

Adjust row estimate in `TaskList.tsx`:

```ts
if (item?.type === 'group') return 54;
return mode === 'pending' ? 108 : 68;
```

If tests assert virtual offsets, update expected offsets accordingly.

- [ ] **Step 5: Improve toolbar wrapping**

In `App.css`, make the heading less cluttered:

```css
.history-heading-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  min-width: 0;
  gap: 6px;
}

.selection-count {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 6px;
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}
```

For very narrow widths:

```css
@media (max-width: 760px) {
  .panel-heading {
    align-items: flex-start;
  }

  .tabs-heading {
    flex-wrap: wrap;
  }

  .history-heading-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
```

- [ ] **Step 6: Run focused tests and check**

Run:

```bash
pnpm --dir web test -- src/features/tasks/TaskList.test.tsx src/App.test.tsx
pnpm --dir web check
```

Expected:
- Focused tests pass.
- Biome passes.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git commit --only -m "style: refine history group list layout" -- web/src/features/tasks/TaskList.tsx web/src/features/tasks/TaskList.test.tsx web/src/App.css
```

Stop for coordinator review.

---

## Task 5: E2E Coverage, Visual Regression Checks, Build, And Embed Sync

**Purpose:** Verify the redesigned workflow in a real browser and commit embedded assets.

**Files:**
- Modify: `web/tests/askuser.spec.ts`
- Modify: `internal/webui/dist/**`

- [ ] **Step 1: Update Playwright test setup for collapse workflow**

In `web/tests/askuser.spec.ts`, keep the existing session grouping/archive workflow and extend it.

Add assertions after entering History:

```ts
await expect(page.getByRole('button', { name: /Collapse 春天/ }).first()).toBeVisible();
await page.getByRole('button', { name: 'Collapse all groups' }).click();
await expect(page.getByRole('button', { name: /History grouped spring/ })).toHaveCount(0);
await page.getByRole('button', { name: 'Expand all groups' }).click();
await expect(page.getByRole('button', { name: /History grouped spring/ })).toBeVisible();
```

For single-group toggle:

```ts
await page.getByRole('button', { name: new RegExp(`Collapse ${renamedDisplayName}`) }).click();
await expect(page.getByRole('button', { name: /Pending from long session/ })).toHaveCount(0);
await page.getByRole('button', { name: new RegExp(`Expand ${renamedDisplayName}`) }).click();
await expect(page.getByRole('button', { name: /Pending from long session/ })).toBeVisible();
```

If Pending stays non-collapsible by design, do not add this Pending assertion. Use History groups only.

- [ ] **Step 2: Exercise group menu actions**

Replace direct old group action buttons with menu interactions:

```ts
const springGroupMenu = springGroups
  .filter({ hasText: springSession.auto_name })
  .getByRole('button', { name: 'Open 春天 group actions' });
await springGroupMenu.click();
await page.getByRole('menuitem', { name: 'Archive loaded group' }).click();
await expect(page.getByRole('button', { name: /History grouped spring/ })).toHaveCount(0);
```

If the accessible label includes the display name differently, use the exact implemented label. Do not use CSS-only clicks when a role/name exists.

- [ ] **Step 3: Exercise Archived collapse/expand and restore**

After opening Archived History:

```ts
await expect(page.getByText('Archived History')).toBeVisible();
await page.getByRole('button', { name: 'Collapse all groups' }).click();
await expect(page.getByRole('button', { name: /Archived winter task/ })).toHaveCount(0);
await page.getByRole('button', { name: 'Expand all groups' }).click();
await expect(page.getByRole('button', { name: /Archived winter task/ })).toBeVisible();
```

Then keep the existing Restore selected flow.

- [ ] **Step 4: Add narrow viewport layout assertions**

Reuse and update `expectGroupHeaderContentDoesNotOverlapControls` so it targets the new DOM:

```ts
const groupRowsHealthy = await page.locator('.task-group-row').evaluateAll((rows) =>
  rows.map((row) => {
    const rowBox = row.getBoundingClientRect();
    const name = row.querySelector('.task-group-name')?.getBoundingClientRect();
    const meta = row.querySelector('.task-group-meta')?.getBoundingClientRect();
    const end = row.querySelector('.task-group-end')?.getBoundingClientRect();
    if (!name || !meta || !end) return false;
    const epsilon = 1;
    return (
      name.left + epsilon >= rowBox.left &&
      meta.left + epsilon >= rowBox.left &&
      end.right <= rowBox.right + epsilon &&
      name.right <= end.left + epsilon &&
      meta.right <= end.left + epsilon
    );
  }),
);
expect(groupRowsHealthy.every(Boolean)).toBeTruthy();
```

This should run at `640x760` or similarly narrow width.

- [ ] **Step 5: Run e2e**

Run:

```bash
pnpm --dir web test:e2e
```

Expected:
- 2 Playwright tests pass.
- The command internally runs build and sync:embed.

- [ ] **Step 6: Run full frontend verification**

Run:

```bash
pnpm --dir web check
pnpm --dir web lint
pnpm --dir web test:coverage
pnpm --dir web build
pnpm --dir web sync:embed
pnpm --dir web test:e2e
```

Expected:
- All commands pass.
- `lint` may still report the existing `web/coverage/lcov-report/*` warnings with exit code 0.

- [ ] **Step 7: Commit Task 5**

If build output changed, commit e2e and embed:

```bash
git add internal/webui/dist
git commit --only -m "test: verify redesigned history groups end to end" -- web/tests/askuser.spec.ts internal/webui/dist
```

Stop for coordinator final review.

---

## Final Review Checklist

The coordinator must verify:

1. `git status --short` is clean.
2. Each task commit only touched allowed files.
3. All spec compliance reviews passed.
4. All code quality reviews passed.
5. Full verification passed:

```bash
go test ./...
./scripts/check_go_coverage.sh
pnpm --dir web check
pnpm --dir web lint
pnpm --dir web test:coverage
pnpm --dir web build
pnpm --dir web sync:embed
pnpm --dir web test:e2e
```

6. Real screenshots are checked at desktop and narrow viewport:
   - Main History with multiple groups.
   - Main History after Collapse all.
   - Main History selection mode.
   - Archived History with groups.
7. Generated embed whitespace warnings, if any, are identified as generated output and not hand-edited unless build output itself changes.

## Self-Review

- Spec coverage: This plan covers collapsible groups, expand/collapse all, Radix menus, Radix checkboxes, selection mode, archived view, load-more defaults, visual cleanup, e2e, and embed sync.
- Placeholder scan: No placeholder markers or unspecified “write tests” steps remain.
- Type consistency: Collapse props use `Set<string>` and `session_id` throughout. Group action callbacks reuse existing task-id/task-list contracts.
- Scope check: No backend work is included because the redesign only needs frontend state and presentation changes.
