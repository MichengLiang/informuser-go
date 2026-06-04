import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, Clock3, Pencil } from 'lucide-react';
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

type TaskListItem = { type: 'group'; group: TaskGroup } | { type: 'task'; task: Task };

type TaskListProps = {
  tasks: Task[];
  activeTaskId?: string;
  mode: 'pending' | 'history';
  exportMode?: boolean;
  submittingTaskId?: string;
  selectedHistoryIds: Set<string>;
  onSelectTask: (task: Task) => void;
  onQuickReply: (task: Task, value: string) => Promise<void>;
  onRenameSession: (sessionId: string, displayName: string) => Promise<void>;
  onToggleHistorySelection: (taskId: string) => void;
};

function taskSortTime(task: Task, mode: 'pending' | 'history') {
  return mode === 'history' ? (task.completed_at ?? task.created_at) : task.created_at;
}

function buildTaskGroups(tasks: Task[], mode: 'pending' | 'history') {
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

function buildListItems(groups: TaskGroup[]): TaskListItem[] {
  return groups.flatMap((group) => [
    { type: 'group' as const, group },
    ...group.tasks.map((task) => ({ type: 'task' as const, task })),
  ]);
}

export function TaskList({
  tasks,
  activeTaskId,
  mode,
  exportMode = false,
  submittingTaskId,
  selectedHistoryIds,
  onSelectTask,
  onQuickReply,
  onRenameSession,
  onToggleHistorySelection,
}: TaskListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const groups = useMemo(() => buildTaskGroups(tasks, mode), [tasks, mode]);
  const items = useMemo(() => buildListItems(groups), [groups]);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = items[index];
      if (item?.type === 'group') {
        return 48;
      }
      return mode === 'pending' ? 112 : 76;
    },
    overscan: 8,
  });

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        {mode === 'pending' ? <Clock3 size={34} /> : <CheckCircle2 size={34} />}
        <strong>{mode === 'pending' ? 'No pending tasks' : 'No completed tasks'}</strong>
        <span>
          {mode === 'pending' ? 'Waiting for agents to call AskUser.' : 'Replies will appear here.'}
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
                onRenameSession={onRenameSession}
                measureElement={virtualizer.measureElement}
                index={virtualRow.index}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              />
            );
          }
          const task = item.task;
          const selected = activeTaskId === task.task_id;
          const historyChecked = selectedHistoryIds.has(task.task_id);
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
                {mode === 'history' && exportMode ? (
                  <input
                    type="checkbox"
                    checked={historyChecked}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => {
                      onToggleHistorySelection(task.task_id);
                      onSelectTask(task);
                    }}
                    aria-label="Select history item"
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
  onRenameSession,
  measureElement,
  index,
  style,
}: {
  group: TaskGroup;
  onRenameSession: (sessionId: string, displayName: string) => Promise<void>;
  measureElement?: (element: Element | null) => void;
  index: number;
  style: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.displayName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const committedNameRef = useRef(group.displayName);
  const closedRef = useRef(false);
  const savingRef = useRef(false);

  const startEditing = () => {
    if (savingRef.current) {
      return;
    }
    closedRef.current = false;
    committedNameRef.current = group.displayName;
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

  return (
    <div ref={measureElement} data-index={index} className="task-group-row" style={style}>
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
        <h3
          className="task-group-title"
          aria-label={`${group.displayName} · ${group.autoName} · ${group.tasks.length}`}
        >
          <span>{group.displayName} ·</span>
          <small>
            {group.autoName} · {group.tasks.length}
          </small>
        </h3>
      )}
      <button
        type="button"
        className="icon-button session-rename-button"
        onClick={startEditing}
        title="Rename session"
        aria-label="Rename session"
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}
