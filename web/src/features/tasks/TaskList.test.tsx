import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../../lib/api';
import { task } from '../../test/fixtures';
import { TaskList } from './TaskList';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
    getScrollElement,
  }: {
    count: number;
    estimateSize: () => number;
    getScrollElement: () => Element | null;
  }) => {
    getScrollElement();
    return {
      getTotalSize: () => count * estimateSize(),
      getVirtualItems: () =>
        Array.from({ length: count }, (_, index) => ({
          index,
          start: index * estimateSize(),
        })),
    };
  },
}));

describe('TaskList', () => {
  const defaultProps = {
    selectedHistoryIds: new Set<string>(),
    onSelectTask: vi.fn(),
    onQuickReply: vi.fn(),
    onToggleHistorySelection: vi.fn(),
    onRenameSession: vi.fn(),
  };

  function renderTaskList(props: {
    tasks: Task[];
    mode: 'pending' | 'history';
    activeTaskId?: string;
    exportMode?: boolean;
    submittingTaskId?: string;
    selectedHistoryIds?: Set<string>;
    onSelectTask?: (task: Task) => void;
    onQuickReply?: (task: Task, value: string) => Promise<void>;
    onToggleHistorySelection?: (taskId: string) => void;
    onRenameSession?: (sessionId: string, displayName: string) => Promise<void>;
  }) {
    return render(
      <TaskList
        {...defaultProps}
        {...props}
        onQuickReply={props.onQuickReply ?? vi.fn().mockResolvedValue(undefined)}
        onRenameSession={props.onRenameSession ?? vi.fn().mockResolvedValue(undefined)}
      />,
    );
  }

  it('renders pending tasks and sends quick paste replies', async () => {
    const currentTask = task();
    const onSelectTask = vi.fn();
    const onQuickReply = vi.fn().mockResolvedValue(undefined);

    renderTaskList({
      tasks: [currentTask],
      activeTaskId: 'task-1',
      mode: 'pending',
      onSelectTask,
      onQuickReply,
    });

    await userEvent.click(screen.getByRole('button', { name: /need review/i }));
    expect(onSelectTask).toHaveBeenCalledWith(currentTask);

    fireEvent.paste(screen.getByPlaceholderText('Paste here to send'), {
      clipboardData: { getData: () => 'quick reply' },
    });
    await waitFor(() => expect(onQuickReply).toHaveBeenCalledWith(currentTask, 'quick reply'));
  });

  it('keeps history selection controls hidden until export mode is enabled', async () => {
    const currentTask = task({ status: 'completed', completed_at: '2026-06-05T02:00:00Z' });
    const onSelectTask = vi.fn();
    const onToggleHistorySelection = vi.fn();

    const { rerender } = renderTaskList({
      tasks: [currentTask],
      activeTaskId: 'task-1',
      mode: 'history',
      exportMode: false,
      selectedHistoryIds: new Set(['task-1']),
      onSelectTask,
      onToggleHistorySelection,
    });

    expect(screen.queryByPlaceholderText('Paste here to send')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Select history item')).not.toBeInTheDocument();

    rerender(
      <TaskList
        {...defaultProps}
        tasks={[currentTask]}
        activeTaskId="task-1"
        mode="history"
        exportMode={true}
        selectedHistoryIds={new Set(['task-1'])}
        onSelectTask={onSelectTask}
        onToggleHistorySelection={onToggleHistorySelection}
        onQuickReply={vi.fn().mockResolvedValue(undefined)}
        onRenameSession={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const checkbox = screen.getByLabelText('Select history item');
    expect(checkbox).toBeChecked();

    await userEvent.click(checkbox);
    expect(onToggleHistorySelection).toHaveBeenCalledWith('task-1');
    expect(onSelectTask).toHaveBeenCalledWith(currentTask);
  });

  it('selects a history task from the full visible row area', async () => {
    const currentTask = task({ status: 'completed', completed_at: '2026-06-05T02:00:00Z' });
    const onSelectTask = vi.fn();

    renderTaskList({
      tasks: [currentTask],
      activeTaskId: 'other-task',
      mode: 'history',
      onSelectTask,
    });

    await userEvent.click(screen.getByRole('button', { name: /open task need review/i }));
    expect(onSelectTask).toHaveBeenCalledTimes(1);
    expect(onSelectTask).toHaveBeenCalledWith(currentTask);
  });

  it('does not select a history task twice when toggling export selection', async () => {
    const currentTask = task({ status: 'completed', completed_at: '2026-06-05T02:00:00Z' });
    const onSelectTask = vi.fn();
    const onToggleHistorySelection = vi.fn();

    renderTaskList({
      tasks: [currentTask],
      activeTaskId: 'other-task',
      mode: 'history',
      exportMode: true,
      onSelectTask,
      onToggleHistorySelection,
    });

    await userEvent.click(screen.getByLabelText('Select history item'));
    expect(onToggleHistorySelection).toHaveBeenCalledWith('task-1');
    expect(onSelectTask).toHaveBeenCalledTimes(1);
    expect(onSelectTask).toHaveBeenCalledWith(currentTask);
  });

  it('renders mode-specific empty states', () => {
    const props = {
      tasks: [],
      ...defaultProps,
      onQuickReply: vi.fn().mockResolvedValue(undefined),
      onRenameSession: vi.fn().mockResolvedValue(undefined),
    };

    const { rerender } = render(<TaskList {...props} mode="pending" />);
    expect(screen.getByText('No pending tasks')).toBeInTheDocument();

    rerender(<TaskList {...props} mode="history" />);
    expect(screen.getByText('No completed tasks')).toBeInTheDocument();
  });

  it('groups pending tasks by session and shows display metadata', () => {
    const first = task({
      task_id: 'task-1',
      session_id: 'session-a',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    const second = task({
      task_id: 'task-2',
      session_id: 'session-b',
      session_display_name: 'Summer',
      session_auto_name: 'S-SUMMR',
    });

    renderTaskList({ tasks: [first, second], mode: 'pending' });

    expect(screen.getByRole('heading', { name: /Spring · S-SPRNG · 1/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Summer · S-SUMMR · 1/ })).toBeInTheDocument();
  });

  it('aggregates history by session id and keeps duplicate display names separate', () => {
    const sameSessionNewer = task({
      task_id: 'history-2',
      session_id: 'session-a',
      session_display_name: 'Spring',
      session_auto_name: 'S-AAAAA',
      title: 'Second Spring',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
    });
    const sameSessionOlder = task({
      task_id: 'history-1',
      session_id: 'session-a',
      session_display_name: 'Spring',
      session_auto_name: 'S-AAAAA',
      title: 'First Spring',
      status: 'completed',
      completed_at: '2026-06-05T01:00:00Z',
    });
    const duplicateNameOtherSession = task({
      task_id: 'history-3',
      session_id: 'session-b',
      session_display_name: 'Spring',
      session_auto_name: 'S-BBBBB',
      title: 'Other Spring',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
    });

    renderTaskList({
      tasks: [sameSessionNewer, duplicateNameOtherSession, sameSessionOlder],
      mode: 'history',
    });

    expect(screen.getByRole('heading', { name: /Spring · S-AAAAA · 2/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Spring · S-BBBBB · 1/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Rename session' })).toHaveLength(2);
  });

  it('renames sessions inline with enter, escape, blur, and blank cancellation', async () => {
    const onRenameSession = vi.fn().mockResolvedValue(undefined);
    const currentTask = task({
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });

    renderTaskList({
      tasks: [currentTask],
      mode: 'pending',
      onRenameSession,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Rename session' }));
    const input = screen.getByLabelText('Session display name');
    await userEvent.clear(input);
    await userEvent.type(input, ' New Spring ');
    await userEvent.keyboard('{Enter}');
    expect(onRenameSession).toHaveBeenCalledWith('session-1', 'New Spring');

    await userEvent.click(screen.getByRole('button', { name: 'Rename session' }));
    await userEvent.clear(screen.getByLabelText('Session display name'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('Session display name')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Rename session' }));
    const blankInput = screen.getByLabelText('Session display name');
    await userEvent.clear(blankInput);
    blankInput.blur();
    expect(onRenameSession).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByLabelText('Session display name')).not.toBeInTheDocument(),
    );
  });
});
