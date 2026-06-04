import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, Clock3 } from 'lucide-react';
import { useRef } from 'react';
import type { Task } from '../../lib/api';
import { QuickPasteReply } from '../reply/QuickPasteReply';

type TaskListProps = {
  tasks: Task[];
  activeTaskId?: string;
  mode: 'pending' | 'history';
  submittingTaskId?: string;
  selectedHistoryIds: Set<string>;
  onSelectTask: (task: Task) => void;
  onQuickReply: (task: Task, value: string) => Promise<void>;
  onToggleHistorySelection: (taskId: string) => void;
};

export function TaskList({
  tasks,
  activeTaskId,
  mode,
  submittingTaskId,
  selectedHistoryIds,
  onSelectTask,
  onQuickReply,
  onToggleHistorySelection,
}: TaskListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (mode === 'pending' ? 112 : 76),
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
          const task = tasks[virtualRow.index];
          const selected = activeTaskId === task.task_id;
          const historyChecked = selectedHistoryIds.has(task.task_id);
          return (
            <button
              type="button"
              key={task.task_id}
              className={`task-row ${selected ? 'selected' : ''}`}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
              onClick={() => {
                if (mode === 'history') {
                  onToggleHistorySelection(task.task_id);
                }
                onSelectTask(task);
              }}
            >
              <div className="task-row-header">
                {mode === 'history' ? (
                  <input
                    type="checkbox"
                    checked={historyChecked}
                    onChange={() => onToggleHistorySelection(task.task_id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label="Select history item"
                  />
                ) : null}
                <strong>{task.title}</strong>
              </div>
              <time>{new Date(task.completed_at || task.created_at).toLocaleString()}</time>
              {mode === 'pending' ? (
                <QuickPasteReply
                  disabled={submittingTaskId === task.task_id}
                  onReply={(value) => onQuickReply(task, value)}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
