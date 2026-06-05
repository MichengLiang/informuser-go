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
    measureElement,
  }: {
    count: number;
    estimateSize: (index: number) => number;
    getScrollElement: () => Element | null;
    measureElement?: (element: Element | null) => void;
  }) => {
    getScrollElement();
    const starts = Array.from({ length: count }, (_, index) =>
      Array.from({ length: index }, (_unused, previousIndex) => estimateSize(previousIndex)).reduce(
        (total, size) => total + size,
        0,
      ),
    );
    return {
      measureElement,
      getTotalSize: () =>
        Array.from({ length: count }, (_unused, index) => estimateSize(index)).reduce(
          (total, size) => total + size,
          0,
        ),
      getVirtualItems: () =>
        Array.from({ length: count }, (_, index) => ({
          index,
          start: starts[index],
        })),
    };
  },
}));

describe('TaskList', () => {
  const defaultProps = {
    selectedIds: new Set<string>(),
    onSelectTask: vi.fn(),
    onQuickReply: vi.fn(),
    onToggleTaskSelection: vi.fn(),
    onRenameSession: vi.fn(),
  };

  function renderTaskList(props: {
    tasks: Task[];
    mode: 'pending' | 'history' | 'archived';
    activeTaskId?: string;
    selectionMode?: boolean;
    submittingTaskId?: string;
    selectedIds?: Set<string>;
    collapsedSessionIds?: Set<string>;
    onSelectTask?: (task: Task) => void;
    onQuickReply?: (task: Task, value: string) => Promise<void>;
    onToggleTaskSelection?: (taskId: string) => void;
    onToggleGroupSelection?: (sessionId: string, taskIds: string[]) => void;
    onToggleGroupCollapsed?: (sessionId: string) => void;
    onRenameSession?: (sessionId: string, displayName: string) => Promise<void>;
    onExportGroup?: (tasks: Task[]) => Promise<void>;
    onArchiveGroup?: (tasks: Task[]) => Promise<void>;
    onUnarchiveGroup?: (tasks: Task[]) => Promise<void>;
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
      selectionMode: false,
      selectedIds: new Set(['task-1']),
      onSelectTask,
      onToggleTaskSelection: onToggleHistorySelection,
    });

    expect(screen.queryByPlaceholderText('Paste here to send')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Select history item')).not.toBeInTheDocument();

    rerender(
      <TaskList
        {...defaultProps}
        tasks={[currentTask]}
        activeTaskId="task-1"
        mode="history"
        selectionMode={true}
        selectedIds={new Set(['task-1'])}
        onSelectTask={onSelectTask}
        onToggleTaskSelection={onToggleHistorySelection}
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
      selectionMode: true,
      onSelectTask,
      onToggleTaskSelection: onToggleHistorySelection,
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

    rerender(<TaskList {...props} mode="archived" />);
    expect(screen.getByText('No archived tasks')).toBeInTheDocument();
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

  it('uses separate virtual offsets for group headers and task rows', () => {
    const first = task({
      task_id: 'task-1',
      session_id: 'session-a',
      session_display_name: 'Spring',
    });
    const second = task({
      task_id: 'task-2',
      session_id: 'session-b',
      session_display_name: 'Summer',
    });

    renderTaskList({ tasks: [first, second], mode: 'pending' });

    const groups = screen.getAllByRole('heading');
    expect(groups[0]?.closest('.task-group-row')).toHaveStyle({ transform: 'translateY(0px)' });
    expect(
      screen.getAllByRole('button', { name: /Open task/ })[0]?.closest('.task-row'),
    ).toHaveStyle({
      transform: 'translateY(48px)',
    });
    expect(groups[1]?.closest('.task-group-row')).toHaveStyle({ transform: 'translateY(160px)' });
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
    expect(screen.getAllByRole('button', { name: 'Open Spring group actions' })).toHaveLength(2);
  });

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
    expect(
      screen.queryByRole('button', { name: /Open task Spring history/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collapse Summer/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open task Summer history/ })).toBeInTheDocument();
  });

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

  it('shows loaded group actions for main history groups', async () => {
    const user = userEvent.setup();
    const groupTask = task({
      task_id: 'history-1',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      session_id: 'session-a',
      session_display_name: 'Spring',
    });
    const onToggleGroupSelection = vi.fn();
    const onExportGroup = vi.fn().mockResolvedValue(undefined);
    const onArchiveGroup = vi.fn().mockResolvedValue(undefined);

    renderTaskList({
      tasks: [groupTask],
      mode: 'history',
      onToggleGroupSelection,
      onExportGroup,
      onArchiveGroup,
    });

    await user.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Select loaded tasks' }));
    expect(onToggleGroupSelection).toHaveBeenCalledWith('session-a', ['history-1']);

    await user.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Copy loaded group XML' }));
    expect(onExportGroup).toHaveBeenCalledWith([groupTask]);

    await user.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive loaded group' }));
    expect(onArchiveGroup).toHaveBeenCalledWith([groupTask]);
  });

  it('shows loaded group actions for archived groups', async () => {
    const user = userEvent.setup();
    const archivedTask = task({
      task_id: 'archived-1',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      archived_at: '2026-06-05T03:00:00Z',
      session_id: 'session-a',
      session_display_name: 'Spring',
    });
    const onToggleGroupSelection = vi.fn();
    const onUnarchiveGroup = vi.fn().mockResolvedValue(undefined);

    renderTaskList({
      tasks: [archivedTask],
      mode: 'archived',
      onToggleGroupSelection,
      onUnarchiveGroup,
    });

    await user.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Select loaded tasks' }));
    expect(onToggleGroupSelection).toHaveBeenCalledWith('session-a', ['archived-1']);

    await user.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Restore loaded group' }));
    expect(onUnarchiveGroup).toHaveBeenCalledWith([archivedTask]);
  });

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

  it('renames sessions inline with enter', async () => {
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

    await userEvent.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename session' }));
    const input = await screen.findByLabelText('Session display name');
    await userEvent.clear(input);
    await userEvent.type(input, ' New Spring ');
    await userEvent.keyboard('{Enter}');
    expect(onRenameSession).toHaveBeenCalledWith('session-1', 'New Spring');
    await waitFor(() =>
      expect(screen.queryByLabelText('Session display name')).not.toBeInTheDocument(),
    );
  });

  it('does not submit twice when enter is followed by blur', async () => {
    let resolveRename: (() => void) | undefined;
    const onRenameSession = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve;
        }),
    );
    renderTaskList({
      tasks: [task({ session_display_name: 'Spring' })],
      mode: 'pending',
      onRenameSession,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename session' }));
    const input = await screen.findByLabelText('Session display name');
    await userEvent.clear(input);
    await userEvent.type(input, 'New Spring');
    await userEvent.keyboard('{Enter}');
    input.blur();

    await waitFor(() => expect(onRenameSession).toHaveBeenCalledTimes(1));
    resolveRename?.();
    await waitFor(() =>
      expect(screen.queryByLabelText('Session display name')).not.toBeInTheDocument(),
    );
  });

  it('does not save when escape is followed by blur', async () => {
    const onRenameSession = vi.fn().mockResolvedValue(undefined);
    renderTaskList({
      tasks: [task({ session_display_name: 'Spring' })],
      mode: 'pending',
      onRenameSession,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename session' }));
    const input = await screen.findByLabelText('Session display name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Should not save');
    await userEvent.keyboard('{Escape}');
    input.blur();

    expect(onRenameSession).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Session display name')).not.toBeInTheDocument();
  });

  it('does not submit blank names on blur', async () => {
    const onRenameSession = vi.fn().mockResolvedValue(undefined);
    renderTaskList({
      tasks: [task({ session_display_name: 'Spring' })],
      mode: 'pending',
      onRenameSession,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename session' }));
    const blankInput = await screen.findByLabelText('Session display name');
    await userEvent.clear(blankInput);
    blankInput.blur();
    expect(onRenameSession).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByLabelText('Session display name')).not.toBeInTheDocument(),
    );
  });

  it('keeps edited rename text after rejected saves for retry', async () => {
    const onRenameSession = vi.fn().mockRejectedValue(new Error('rename failed'));
    renderTaskList({
      tasks: [task({ session_display_name: 'Spring' })],
      mode: 'pending',
      onRenameSession,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Open Spring group actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename session' }));
    const input = await screen.findByLabelText('Session display name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Retry Name');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(onRenameSession).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Session display name')).toHaveValue('Retry Name');
  });
});
