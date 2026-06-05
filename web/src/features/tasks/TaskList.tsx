import * as Checkbox from '@radix-ui/react-checkbox';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Archive,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Clock3,
  Minus,
  MoreHorizontal,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../../lib/api';
import { QuickPasteReply } from '../reply/QuickPasteReply';

type TaskGroup = {
  sessionId: string;
  displayName: string;
  autoName: string;
  tasks: Task[];
  latestAt: string;
};

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

function taskSortTime(task: Task, mode: 'pending' | 'history' | 'archived') {
  if (mode === 'archived') {
    return task.archived_at ?? task.completed_at ?? task.created_at;
  }
  return mode === 'history' ? (task.completed_at ?? task.created_at) : task.created_at;
}

function buildTaskGroups(tasks: Task[], mode: 'pending' | 'history' | 'archived') {
  const groups = new Map<string, TaskGroup>();
  for (const task of tasks) {
    const latestAt = taskSortTime(task, mode);
    const group = groups.get(task.session_id);
    if (group) {
      group.tasks.push(task);
      if (latestAt > group.latestAt) {
        group.latestAt = latestAt;
      }
      continue;
    }
    groups.set(task.session_id, {
      sessionId: task.session_id,
      displayName: task.session_display_name,
      autoName: task.session_auto_name,
      tasks: [task],
      latestAt,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      tasks: group.tasks
        .slice()
        .sort((a, b) => taskSortTime(b, mode).localeCompare(taskSortTime(a, mode))),
    }))
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt) || b.sessionId.localeCompare(a.sessionId));
}

function buildListItems(groups: TaskGroup[], collapsedSessionIds: Set<string>): TaskListItem[] {
  return groups.flatMap((group) => {
    const collapsed = collapsedSessionIds.has(group.sessionId);
    return [
      { type: 'group' as const, group, collapsed },
      ...(collapsed ? [] : group.tasks.map((task) => ({ type: 'task' as const, task }))),
    ];
  });
}

export function TaskList({
  tasks,
  activeTaskId,
  mode,
  selectionMode = false,
  submittingTaskId,
  selectedIds,
  collapsedSessionIds,
  onSelectTask,
  onQuickReply,
  onRenameSession,
  onToggleTaskSelection,
  onToggleGroupSelection,
  onToggleGroupCollapsed,
  onExportGroup,
  onArchiveGroup,
  onUnarchiveGroup,
}: TaskListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const groups = useMemo(() => buildTaskGroups(tasks, mode), [tasks, mode]);
  const safeCollapsedSessionIds = collapsedSessionIds ?? new Set<string>();
  const items = useMemo(
    () => buildListItems(groups, safeCollapsedSessionIds),
    [groups, safeCollapsedSessionIds],
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = items[index];
      if (item?.type === 'group') {
        return 54;
      }
      return mode === 'pending' ? 108 : 68;
    },
    overscan: 8,
  });

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        {mode === 'pending' ? <Clock3 size={34} /> : <CheckCircle2 size={34} />}
        <strong>
          {mode === 'pending'
            ? 'No pending tasks'
            : mode === 'archived'
              ? 'No archived tasks'
              : 'No completed tasks'}
        </strong>
        <span>
          {mode === 'pending'
            ? 'Waiting for agents to call AskUser.'
            : mode === 'archived'
              ? 'Archived replies will appear here.'
              : 'Replies will appear here.'}
        </span>
      </div>
    );
  }

  return (
    <div className="task-list-scroll" ref={parentRef}>
      <div className="virtual-list" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (item.type === 'group') {
            return (
              <SessionGroupHeader
                key={`group-${item.group.sessionId}`}
                group={item.group}
                collapsed={item.collapsed}
                mode={mode}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onRenameSession={onRenameSession}
                onToggleGroupSelection={onToggleGroupSelection}
                onToggleCollapsed={onToggleGroupCollapsed}
                onExportGroup={onExportGroup}
                onArchiveGroup={onArchiveGroup}
                onUnarchiveGroup={onUnarchiveGroup}
                measureElement={virtualizer.measureElement}
                index={virtualRow.index}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              />
            );
          }
          const task = item.task;
          const selected = activeTaskId === task.task_id;
          const checked = selectedIds.has(task.task_id);
          return (
            <div
              key={task.task_id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className={`task-row ${selected ? 'selected' : ''}`}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <button
                type="button"
                className="task-row-hit-area"
                onClick={() => onSelectTask(task)}
                aria-label={`Open task ${task.title}`}
              />
              <div className="task-row-header">
                {(mode === 'history' || mode === 'archived') && selectionMode ? (
                  <input
                    type="checkbox"
                    checked={checked}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => {
                      onToggleTaskSelection(task.task_id);
                      onSelectTask(task);
                    }}
                    aria-label={
                      mode === 'archived' ? 'Select archived item' : 'Select history item'
                    }
                  />
                ) : null}
                <div className="task-row-select">
                  <strong>{task.title}</strong>
                  <time>{new Date(task.completed_at || task.created_at).toLocaleString()}</time>
                </div>
              </div>
              {mode === 'pending' ? (
                <QuickPasteReply
                  disabled={submittingTaskId === task.task_id}
                  onReply={(value) => onQuickReply(task, value)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionGroupHeader({
  group,
  collapsed,
  mode,
  selectionMode,
  selectedIds,
  onRenameSession,
  onToggleGroupSelection,
  onToggleCollapsed,
  onExportGroup,
  onArchiveGroup,
  onUnarchiveGroup,
  measureElement,
  index,
  style,
}: {
  group: TaskGroup;
  collapsed: boolean;
  mode: 'pending' | 'history' | 'archived';
  selectionMode: boolean;
  selectedIds: Set<string>;
  onRenameSession: (sessionId: string, displayName: string) => Promise<void>;
  onToggleGroupSelection?: (sessionId: string, taskIds: string[]) => void;
  onToggleCollapsed?: (sessionId: string) => void;
  onExportGroup?: (tasks: Task[]) => Promise<void>;
  onArchiveGroup?: (tasks: Task[]) => Promise<void>;
  onUnarchiveGroup?: (tasks: Task[]) => Promise<void>;
  measureElement?: (element: Element | null) => void;
  index: number;
  style: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(group.displayName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const committedNameRef = useRef(group.displayName);
  const closedRef = useRef(false);
  const savingRef = useRef(false);
  const preventMenuCloseFocusRef = useRef(false);

  const startEditing = () => {
    if (savingRef.current) {
      return;
    }
    closedRef.current = false;
    committedNameRef.current = group.displayName;
    preventMenuCloseFocusRef.current = true;
    setDraft(group.displayName);
    setEditing(true);
  };

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const cancelEditing = () => {
    closedRef.current = true;
    setDraft(committedNameRef.current);
    setEditing(false);
  };

  const save = async () => {
    if (closedRef.current || savingRef.current) {
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) {
      cancelEditing();
      return;
    }
    if (trimmed === committedNameRef.current) {
      closedRef.current = true;
      setEditing(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onRenameSession(group.sessionId, trimmed);
      closedRef.current = true;
      committedNameRef.current = trimmed;
      setEditing(false);
    } catch {
      // App owns the user-visible error banner; keeping edit mode preserves the draft for retry.
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const groupTaskIds = group.tasks.map((task) => task.task_id);
  const selectedCount = group.tasks.filter((task) => selectedIds.has(task.task_id)).length;
  const allGroupTasksSelected = group.tasks.length > 0 && selectedCount === group.tasks.length;
  const partiallySelected = selectedCount > 0 && selectedCount < group.tasks.length;
  const showGroupCheckbox = selectionMode && (mode === 'history' || mode === 'archived');
  const toggleLabel = `${collapsed ? 'Expand' : 'Collapse'} ${group.displayName}`;

  return (
    <div ref={measureElement} data-index={index} className="task-group-row" style={style}>
      <div className="task-group-main">
        <button
          type="button"
          className="icon-button task-group-collapse-button"
          onClick={() => onToggleCollapsed?.(group.sessionId)}
          disabled={!onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        {showGroupCheckbox ? (
          <Checkbox.Root
            className="group-checkbox"
            checked={allGroupTasksSelected ? true : partiallySelected ? 'indeterminate' : false}
            disabled={!onToggleGroupSelection}
            onCheckedChange={() => onToggleGroupSelection?.(group.sessionId, groupTaskIds)}
            aria-label={`Select loaded tasks for ${group.displayName}`}
          >
            <Checkbox.Indicator className="group-checkbox-indicator">
              {partiallySelected ? <Minus size={13} /> : <Check size={13} />}
            </Checkbox.Indicator>
          </Checkbox.Root>
        ) : null}
        {editing ? (
          <input
            ref={inputRef}
            className="session-rename-input"
            aria-label="Session display name"
            value={draft}
            maxLength={40}
            disabled={saving}
            onBlur={() => void save()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void save();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                cancelEditing();
              }
            }}
          />
        ) : (
          <div className="task-group-copy">
            <strong className="task-group-name">{group.displayName}</strong>
            <span className="task-group-meta">
              {showGroupCheckbox
                ? `${selectedCount}/${group.tasks.length} selected`
                : `${group.autoName} · ${group.tasks.length} loaded`}
            </span>
          </div>
        )}
      </div>
      <div className="task-group-end">
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="icon-button task-group-menu-button"
              aria-label={`Open ${group.displayName} ${group.autoName} group actions`}
              title="Group actions"
            >
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="group-action-menu"
              align="end"
              sideOffset={6}
              onCloseAutoFocus={(event) => {
                if (preventMenuCloseFocusRef.current) {
                  preventMenuCloseFocusRef.current = false;
                  event.preventDefault();
                }
              }}
            >
              <DropdownMenu.Item
                className="group-action-menu-item"
                onSelect={(event) => {
                  event.preventDefault();
                  startEditing();
                  setMenuOpen(false);
                }}
              >
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
      </div>
    </div>
  );
}
