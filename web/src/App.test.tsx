import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { TaskEvent } from './lib/api';
import { task } from './test/fixtures';

const apiMocks = vi.hoisted(() => ({
  archiveHistoryTasks: vi.fn(),
  connectTaskEvents: vi.fn(),
  fetchArchivedHistory: vi.fn(),
  fetchHistory: vi.fn(),
  fetchPendingTasks: vi.fn(),
  renameSession: vi.fn(),
  submitReply: vi.fn(),
  unarchiveHistoryTasks: vi.fn(),
}));

vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>();
  return {
    ...actual,
    archiveHistoryTasks: apiMocks.archiveHistoryTasks,
    connectTaskEvents: apiMocks.connectTaskEvents,
    fetchArchivedHistory: apiMocks.fetchArchivedHistory,
    fetchHistory: apiMocks.fetchHistory,
    fetchPendingTasks: apiMocks.fetchPendingTasks,
    renameSession: apiMocks.renameSession,
    submitReply: apiMocks.submitReply,
    unarchiveHistoryTasks: apiMocks.unarchiveHistoryTasks,
  };
});

vi.mock('./features/tasks/TaskList', () => ({
  TaskList: ({
    tasks,
    mode,
    onSelectTask,
    onQuickReply,
    onRenameSession,
    onToggleTaskSelection,
    selectedIds,
    selectionMode,
    onToggleGroupSelection,
    onExportGroup,
    onArchiveGroup,
    onUnarchiveGroup,
  }: MockTaskListProps) => {
    const groups = new Map<string, MockTask[]>();
    for (const item of tasks) {
      groups.set(item.session_id, [...(groups.get(item.session_id) ?? []), item]);
    }
    return (
      <div data-testid={`task-list-${mode}`}>
        {Array.from(groups.entries()).map(([sessionId, groupTasks]) => (
          <div data-testid={`${mode}-group-${sessionId}`} key={sessionId}>
            <button
              type="button"
              onClick={() =>
                onToggleGroupSelection?.(
                  sessionId,
                  groupTasks.map((item) => item.task_id),
                )
              }
            >
              Select group {mode} {sessionId}
            </button>
            {mode === 'history' ? (
              <>
                <button type="button" onClick={() => onExportGroup?.(groupTasks)}>
                  Export group {sessionId}
                </button>
                <button type="button" onClick={() => onArchiveGroup?.(groupTasks)}>
                  Archive group {sessionId}
                </button>
              </>
            ) : null}
            {mode === 'archived' ? (
              <button type="button" onClick={() => onUnarchiveGroup?.(groupTasks)}>
                Restore group {sessionId}
              </button>
            ) : null}
            {groupTasks.map((item) => (
              <div data-testid={`${mode}-${item.task_id}`} key={item.task_id}>
                <span>
                  {item.session_display_name} · {item.session_auto_name}
                </span>
                <button type="button" onClick={() => onSelectTask(item)}>
                  Select {item.title}
                </button>
                {mode === 'pending' ? (
                  <button type="button" onClick={() => onQuickReply(item, 'quick reply')}>
                    Quick reply {item.task_id}
                  </button>
                ) : selectionMode ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.task_id)}
                      onChange={() => onToggleTaskSelection(item.task_id)}
                    />
                    Select {mode} {item.task_id}
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void onRenameSession(item.session_id, 'Renamed').catch(() => undefined);
                  }}
                >
                  Rename {mode} {item.session_id}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('./features/markdown/MarkdownReader', () => ({
  MarkdownReader: ({
    markdown,
    userInput,
    canReply,
    settings,
    onSettingsChange,
    onOpenReply,
    onCopyMarkdown,
  }: MockMarkdownReaderProps) => (
    <section data-testid="markdown-reader">
      <div>{markdown}</div>
      {userInput ? <pre>{userInput}</pre> : null}
      <div>font {settings.fontSize}</div>
      <button type="button" onClick={() => onCopyMarkdown?.(markdown)}>
        Copy Markdown
      </button>
      {canReply ? (
        <button type="button" onClick={onOpenReply}>
          Open reply
        </button>
      ) : null}
      <button type="button" onClick={() => onSettingsChange({ ...settings, fontSize: 18 })}>
        Larger text
      </button>
    </section>
  ),
}));

vi.mock('./features/reply/ReplyPanel', () => ({
  ReplyPanel: ({
    task,
    suffix,
    suffixEnabled,
    onSuffixChange,
    onSuffixEnabledChange,
    onSubmit,
  }: MockReplyPanelProps) => (
    <aside data-testid="reply-panel">
      <div>{task ? task.title : 'no pending task'}</div>
      <div>{suffixEnabled ? `suffix: ${suffix}` : 'suffix disabled'}</div>
      <button type="button" onClick={() => onSuffixEnabledChange(true)}>
        Enable suffix
      </button>
      <button type="button" onClick={() => onSuffixChange('agent note')}>
        Set suffix
      </button>
      <button
        type="button"
        disabled={!task}
        onClick={() => task && onSubmit(task, 'panel reply', 'reply_panel')}
      >
        Submit panel reply
      </button>
    </aside>
  ),
}));

type MockTask = ReturnType<typeof task>;

type MockTaskListProps = {
  tasks: MockTask[];
  mode: 'pending' | 'history' | 'archived';
  onSelectTask: (task: MockTask) => void;
  onQuickReply: (task: MockTask, value: string) => Promise<void>;
  onRenameSession: (sessionId: string, displayName: string) => Promise<void>;
  onToggleTaskSelection: (taskId: string) => void;
  selectedIds: Set<string>;
  selectionMode?: boolean;
  onToggleGroupSelection?: (sessionId: string, taskIds: string[]) => void;
  onExportGroup?: (tasks: MockTask[]) => Promise<void>;
  onArchiveGroup?: (tasks: MockTask[]) => Promise<void>;
  onUnarchiveGroup?: (tasks: MockTask[]) => Promise<void>;
};

type MockMarkdownSettings = {
  fontSize: number;
  lineHeight: 'compact' | 'normal' | 'relaxed';
  contentWidth: 'full' | 'reading' | 'narrow';
  raw: boolean;
};

type MockMarkdownReaderProps = {
  markdown: string;
  userInput?: string;
  canReply?: boolean;
  settings: MockMarkdownSettings;
  onSettingsChange: (settings: MockMarkdownSettings) => void;
  onOpenReply?: () => void;
  onCopyMarkdown?: (markdown: string) => Promise<void>;
};

type MockReplyPanelProps = {
  task?: MockTask;
  suffix: string;
  suffixEnabled: boolean;
  onSuffixChange: (suffix: string) => void;
  onSuffixEnabledChange: (enabled: boolean) => void;
  onSubmit: (task: MockTask, value: string, source: string) => Promise<void>;
};

describe('App', () => {
  let eventHandler: ((event: TaskEvent) => void) | undefined;
  let cleanupEvents: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    apiMocks.fetchPendingTasks.mockReset();
    apiMocks.fetchHistory.mockReset();
    apiMocks.fetchArchivedHistory.mockReset();
    apiMocks.archiveHistoryTasks.mockReset();
    apiMocks.unarchiveHistoryTasks.mockReset();
    apiMocks.submitReply.mockReset();
    apiMocks.renameSession.mockReset();
    apiMocks.connectTaskEvents.mockReset();
    cleanupEvents = vi.fn();
    eventHandler = undefined;
    apiMocks.connectTaskEvents.mockImplementation((onEvent, onStatus) => {
      eventHandler = onEvent;
      onStatus('connected');
      return cleanupEvents;
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('loads tasks, applies events, and submits quick replies', async () => {
    const pending = task({ task_id: 'task-1', title: 'Pending one' });
    const history = task({
      task_id: 'task-history',
      title: 'History one',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      user_input: 'done',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([pending]);
    apiMocks.fetchHistory.mockResolvedValue([history]);
    apiMocks.submitReply.mockResolvedValue(undefined);

    render(<App />);

    expect(await screen.findByRole('button', { name: /Pending one/ })).toBeInTheDocument();
    expect(screen.getByText('1 pending')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Quick reply task-1' }));
    await waitFor(() =>
      expect(apiMocks.submitReply).toHaveBeenCalledWith('task-1', 'quick reply', 'quick_paste'),
    );

    const created = task({ task_id: 'task-2', title: 'Event task' });
    eventHandler?.({ type: 'task_created', task: created });
    expect(await screen.findByRole('button', { name: /Event task/ })).toBeInTheDocument();

    apiMocks.fetchHistory.mockResolvedValueOnce([history]);
    eventHandler?.({
      type: 'task_completed',
      task_id: 'task-2',
      session_id: 'session-1',
      completed_at: 'now',
    });
    await waitFor(() => expect(apiMocks.fetchHistory).toHaveBeenCalledTimes(3));
  });

  it('removes cancelled pending tasks from events without adding history', async () => {
    const pending = task({ task_id: 'task-cancelled', title: 'Cancel me' });
    apiMocks.fetchPendingTasks.mockResolvedValue([pending]);
    apiMocks.fetchHistory.mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByRole('button', { name: /Cancel me/ })).toBeInTheDocument();

    eventHandler?.({
      type: 'task_cancelled',
      task_id: 'task-cancelled',
      session_id: 'session-1',
    });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Cancel me/ })).not.toBeInTheDocument(),
    );
    expect(apiMocks.fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('combines reply panel suffixes and persists markdown settings', async () => {
    localStorage.setItem('askuser.markdownSettings', '{');
    apiMocks.fetchPendingTasks.mockResolvedValue([task({ title: 'Needs panel reply' })]);
    apiMocks.fetchHistory.mockResolvedValue([]);
    apiMocks.submitReply.mockResolvedValue(undefined);

    render(<App />);

    expect(await screen.findByRole('button', { name: /Needs panel reply/ })).toBeInTheDocument();
    expect(screen.queryByTestId('reply-panel')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enable suffix' }));
    await userEvent.click(screen.getByRole('button', { name: 'Set suffix' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit panel reply' }));

    await waitFor(() =>
      expect(apiMocks.submitReply).toHaveBeenCalledWith(
        'task-1',
        'panel reply\n\nagent note',
        'reply_panel',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(localStorage.getItem('askuser.markdownSettings')).toContain('"fontSize":18');
  });

  it('copies the active task raw Markdown from the reader toolbar', async () => {
    apiMocks.fetchPendingTasks.mockResolvedValue([
      task({ markdown: '# Raw task\n\nDo not render before copying.' }),
    ]);
    apiMocks.fetchHistory.mockResolvedValue([]);

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Copy Markdown' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '# Raw task\n\nDo not render before copying.',
    );
  });

  it('shows empty reader fallback and disables reply submission when no task is active', async () => {
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([]);

    render(<App />);

    expect(
      await screen.findByText('Select a task to read its Markdown content.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open reply' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByTestId('task-list-history')).toBeInTheDocument();
  });

  it('exports selected history and loads more history', async () => {
    const first = task({
      task_id: 'history-1',
      title: 'First history',
      markdown: 'assistant one',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      user_input: 'user one',
    });
    const second = task({
      task_id: 'history-2',
      title: 'Second history',
      markdown: 'assistant two',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
      user_input: 'user two',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValueOnce([first, second]).mockResolvedValueOnce([]);

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    expect(await screen.findByText('user one')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Copy selected history as XML'));
    const historyList = screen.getByTestId('task-list-history');
    await userEvent.click(within(historyList).getByLabelText('Select history history-2'));
    await userEvent.click(within(historyList).getByLabelText('Select history history-2'));
    await userEvent.click(within(historyList).getByLabelText('Select history history-2'));
    await userEvent.click(screen.getByRole('button', { name: /copy \(1\)/i }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '<Assistant id="1">\nassistant two\n</Assistant>\n\n<User id="1">\nuser two\n</User>',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(apiMocks.fetchHistory).toHaveBeenLastCalledWith(80, 2));
  });

  it('archives selected history tasks from the unified selection toolbar', async () => {
    const first = task({
      task_id: 'history-1',
      title: 'First history',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      user_input: 'user one',
    });
    const second = task({
      task_id: 'history-2',
      title: 'Second history',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
      user_input: 'user two',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([first, second]);
    apiMocks.archiveHistoryTasks.mockResolvedValue(undefined);

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByTitle('Archive selected history'));
    const historyList = screen.getByTestId('task-list-history');
    await userEvent.click(within(historyList).getByLabelText('Select history history-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Archive (1)' }));

    await waitFor(() => expect(apiMocks.archiveHistoryTasks).toHaveBeenCalledWith(['history-1']));
    expect(screen.queryByTestId('history-history-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('history-history-2')).toBeInTheDocument();
  });

  it('falls back to the next visible task after archiving the active history task', async () => {
    const active = task({
      task_id: 'history-active',
      title: 'Active history',
      markdown: 'active markdown',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
      user_input: 'active reply',
    });
    const next = task({
      task_id: 'history-next',
      title: 'Next history',
      markdown: 'next markdown',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      user_input: 'next reply',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([active, next]);
    apiMocks.archiveHistoryTasks.mockResolvedValue(undefined);

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    expect(await screen.findByText('active markdown')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Archive selected history'));
    const historyList = screen.getByTestId('task-list-history');
    await userEvent.click(within(historyList).getByLabelText('Select history history-active'));
    await userEvent.click(screen.getByRole('button', { name: 'Archive (1)' }));

    await waitFor(() =>
      expect(apiMocks.archiveHistoryTasks).toHaveBeenCalledWith(['history-active']),
    );
    expect(await screen.findByText('next markdown')).toBeInTheDocument();
  });

  it('falls back to an empty reader after archiving the only visible history task', async () => {
    const pending = task({
      task_id: 'pending-1',
      title: 'Pending fallback',
      markdown: 'pending markdown',
    });
    const active = task({
      task_id: 'history-active',
      title: 'Active history',
      markdown: 'active markdown',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
      user_input: 'active reply',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([pending]);
    apiMocks.fetchHistory.mockResolvedValue([active]);
    apiMocks.archiveHistoryTasks.mockResolvedValue(undefined);

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    expect(await screen.findByText('active markdown')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Archive selected history'));
    const historyList = screen.getByTestId('task-list-history');
    await userEvent.click(within(historyList).getByLabelText('Select history history-active'));
    await userEvent.click(screen.getByRole('button', { name: 'Archive (1)' }));

    await waitFor(() =>
      expect(apiMocks.archiveHistoryTasks).toHaveBeenCalledWith(['history-active']),
    );
    expect(
      await screen.findByText('Select a task to read its Markdown content.'),
    ).toBeInTheDocument();
  });

  it('selects all, inverts, cancels, and surfaces archive errors without removing history', async () => {
    const first = task({
      task_id: 'history-1',
      title: 'First history',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      user_input: 'user one',
    });
    const second = task({
      task_id: 'history-2',
      title: 'Second history',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
      user_input: 'user two',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([first, second]);
    apiMocks.archiveHistoryTasks.mockRejectedValue(new Error('archive failed'));

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByTitle('Archive selected history'));
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Archive (2)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Invert' }));
    expect(screen.getByRole('button', { name: 'Archive (0)' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive (2)' }));

    expect(await screen.findByText('archive failed')).toBeInTheDocument();
    expect(screen.getByTestId('history-history-1')).toBeInTheDocument();
    expect(screen.getByTestId('history-history-2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Archive (2)' })).not.toBeInTheDocument();
  });

  it('selects, exports, and archives only currently loaded group history tasks', async () => {
    const springOlder = task({
      task_id: 'spring-old',
      title: 'Spring older',
      markdown: 'assistant older',
      status: 'completed',
      completed_at: '2026-06-05T01:00:00Z',
      user_input: 'user older',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    const springNewer = task({
      task_id: 'spring-new',
      title: 'Spring newer',
      markdown: 'assistant newer',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
      user_input: 'user newer',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    const autumn = task({
      task_id: 'autumn-1',
      title: 'Autumn',
      markdown: 'assistant autumn',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      user_input: 'user autumn',
      session_id: 'session-autumn',
      session_display_name: 'Autumn',
      session_auto_name: 'S-AUTMN',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([springNewer, autumn, springOlder]);
    apiMocks.archiveHistoryTasks.mockResolvedValue(undefined);

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export group session-spring' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '<Assistant id="1">\nassistant older\n</Assistant>\n\n<User id="1">\nuser older\n</User>\n\n<Assistant id="2">\nassistant newer\n</Assistant>\n\n<User id="2">\nuser newer\n</User>',
      ),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Select group history session-spring' }),
    );
    expect(screen.getByRole('button', { name: 'Copy (2)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archive group session-spring' }));

    await waitFor(() =>
      expect(apiMocks.archiveHistoryTasks).toHaveBeenCalledWith(['spring-new', 'spring-old']),
    );
    expect(screen.queryByTestId('history-spring-new')).not.toBeInTheDocument();
    expect(screen.queryByTestId('history-spring-old')).not.toBeInTheDocument();
    expect(screen.getByTestId('history-autumn-1')).toBeInTheDocument();
  });

  it('shows clipboard errors without changing history groups', async () => {
    const history = task({
      task_id: 'history-1',
      title: 'History one',
      markdown: 'assistant one',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      user_input: 'user one',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([history]);
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('copy failed')) },
    });

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export group session-spring' }));

    expect(await screen.findByText('copy failed')).toBeInTheDocument();
    expect(screen.getByTestId('history-history-1')).toBeInTheDocument();
  });

  it('loads archived history only after entering the secondary view and paginates it', async () => {
    const archived = task({
      task_id: 'archived-1',
      title: 'Archived one',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      archived_at: '2026-06-05T04:00:00Z',
      session_id: 'session-archive',
      session_display_name: 'Archive',
      session_auto_name: 'S-ARCHV',
    });
    const olderArchived = task({
      task_id: 'archived-2',
      title: 'Archived two',
      status: 'completed',
      completed_at: '2026-06-05T01:00:00Z',
      archived_at: '2026-06-05T03:00:00Z',
      session_id: 'session-archive',
      session_display_name: 'Archive',
      session_auto_name: 'S-ARCHV',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([]);
    apiMocks.fetchArchivedHistory
      .mockResolvedValueOnce([archived])
      .mockResolvedValueOnce([olderArchived]);

    render(<App />);

    await waitFor(() => expect(apiMocks.fetchHistory).toHaveBeenCalledWith(80));
    expect(apiMocks.fetchArchivedHistory).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByTitle('Open archived history'));
    expect(await screen.findByText('Archived History')).toBeInTheDocument();
    expect(await screen.findByTestId('archived-archived-1')).toHaveTextContent('Archive · S-ARCHV');
    await waitFor(() => expect(apiMocks.fetchArchivedHistory).toHaveBeenCalledWith(80));

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(apiMocks.fetchArchivedHistory).toHaveBeenLastCalledWith(80, 1));
    expect(await screen.findByTestId('archived-archived-2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    await userEvent.click(screen.getByTitle('Open archived history'));
    expect(apiMocks.fetchArchivedHistory).toHaveBeenCalledTimes(2);
  });

  it('restores selected and grouped archived history tasks', async () => {
    const first = task({
      task_id: 'archived-1',
      title: 'Archived one',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      archived_at: '2026-06-05T04:00:00Z',
      session_id: 'session-archive',
      session_display_name: 'Archive',
      session_auto_name: 'S-ARCHV',
    });
    const second = task({
      task_id: 'archived-2',
      title: 'Archived two',
      status: 'completed',
      completed_at: '2026-06-05T01:00:00Z',
      archived_at: '2026-06-05T03:00:00Z',
      session_id: 'session-archive',
      session_display_name: 'Archive',
      session_auto_name: 'S-ARCHV',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([]);
    apiMocks.fetchArchivedHistory.mockResolvedValue([first, second]);
    apiMocks.unarchiveHistoryTasks.mockResolvedValue(undefined);

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByTitle('Open archived history'));
    const archivedList = await screen.findByTestId('task-list-archived');

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await userEvent.click(within(archivedList).getByLabelText('Select archived archived-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Restore (1)' }));
    await waitFor(() =>
      expect(apiMocks.unarchiveHistoryTasks).toHaveBeenCalledWith(['archived-1']),
    );
    expect(screen.queryByTestId('archived-archived-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('archived-archived-2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Restore group session-archive' }));
    await waitFor(() =>
      expect(apiMocks.unarchiveHistoryTasks).toHaveBeenLastCalledWith(['archived-2']),
    );
    expect(screen.queryByTestId('archived-archived-2')).not.toBeInTheDocument();
  });

  it('falls back to the next visible archived task after restoring the active item', async () => {
    const active = task({
      task_id: 'archived-active',
      title: 'Archived active',
      markdown: 'archived active markdown',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      archived_at: '2026-06-05T04:00:00Z',
    });
    const next = task({
      task_id: 'archived-next',
      title: 'Archived next',
      markdown: 'archived next markdown',
      status: 'completed',
      completed_at: '2026-06-05T01:00:00Z',
      archived_at: '2026-06-05T03:00:00Z',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([]);
    apiMocks.fetchArchivedHistory.mockResolvedValue([active, next]);
    apiMocks.unarchiveHistoryTasks.mockResolvedValue(undefined);

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByTitle('Open archived history'));
    expect(await screen.findByText('archived active markdown')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const archivedList = await screen.findByTestId('task-list-archived');
    await userEvent.click(within(archivedList).getByLabelText('Select archived archived-active'));
    await userEvent.click(screen.getByRole('button', { name: 'Restore (1)' }));

    await waitFor(() =>
      expect(apiMocks.unarchiveHistoryTasks).toHaveBeenCalledWith(['archived-active']),
    );
    expect(await screen.findByText('archived next markdown')).toBeInTheDocument();
  });

  it('falls back to an empty archived reader after restoring the only visible item', async () => {
    const archived = task({
      task_id: 'archived-active',
      title: 'Archived active',
      markdown: 'archived active markdown',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      archived_at: '2026-06-05T04:00:00Z',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([]);
    apiMocks.fetchArchivedHistory.mockResolvedValue([archived]);
    apiMocks.unarchiveHistoryTasks.mockResolvedValue(undefined);

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByTitle('Open archived history'));
    expect(await screen.findByText('archived active markdown')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const archivedList = await screen.findByTestId('task-list-archived');
    await userEvent.click(within(archivedList).getByLabelText('Select archived archived-active'));
    await userEvent.click(screen.getByRole('button', { name: 'Restore (1)' }));

    await waitFor(() =>
      expect(apiMocks.unarchiveHistoryTasks).toHaveBeenCalledWith(['archived-active']),
    );
    expect(
      await screen.findByText('Select a task to read its Markdown content.'),
    ).toBeInTheDocument();
  });

  it('selects all, inverts, and surfaces restore errors without removing archived history', async () => {
    const first = task({
      task_id: 'archived-1',
      title: 'Archived one',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      archived_at: '2026-06-05T04:00:00Z',
    });
    const second = task({
      task_id: 'archived-2',
      title: 'Archived two',
      status: 'completed',
      completed_at: '2026-06-05T01:00:00Z',
      archived_at: '2026-06-05T03:00:00Z',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([]);
    apiMocks.fetchArchivedHistory.mockResolvedValue([first, second]);
    apiMocks.unarchiveHistoryTasks.mockRejectedValue(new Error('restore failed'));

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByTitle('Open archived history'));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Restore (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy (2)' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Invert' }));
    expect(screen.getByRole('button', { name: 'Restore (0)' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restore (2)' }));

    expect(await screen.findByText('restore failed')).toBeInTheDocument();
    expect(screen.getByTestId('archived-archived-1')).toBeInTheDocument();
    expect(screen.getByTestId('archived-archived-2')).toBeInTheDocument();
  });

  it('renames sessions from archived history and updates all loaded views', async () => {
    const pending = task({
      task_id: 'pending-1',
      title: 'Pending spring',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    const history = task({
      task_id: 'history-1',
      title: 'History spring',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    const archived = task({
      task_id: 'archived-1',
      title: 'Archived spring',
      status: 'completed',
      completed_at: '2026-06-05T01:00:00Z',
      archived_at: '2026-06-05T03:00:00Z',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([pending]);
    apiMocks.fetchHistory.mockResolvedValue([history]);
    apiMocks.fetchArchivedHistory.mockResolvedValue([archived]);
    apiMocks.renameSession.mockResolvedValue({
      session_id: 'session-spring',
      display_name: 'Renamed',
      auto_name: 'S-SPRNG',
      created_at: '2026-06-05T01:00:00Z',
      updated_at: '2026-06-05T03:00:00Z',
      last_seen_at: '2026-06-05T02:00:00Z',
    });

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByTitle('Open archived history'));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rename archived session-spring' }),
    );

    await waitFor(() =>
      expect(apiMocks.renameSession).toHaveBeenCalledWith('session-spring', 'Renamed'),
    );
    expect(screen.getByTestId('archived-archived-1')).toHaveTextContent('Renamed · S-SPRNG');

    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByTestId('history-history-1')).toHaveTextContent('Renamed · S-SPRNG');
    await userEvent.click(screen.getByRole('tab', { name: 'Pending' }));
    expect(screen.getByTestId('pending-pending-1')).toHaveTextContent('Renamed · S-SPRNG');
  });

  it('renames sessions and updates loaded pending and history tasks', async () => {
    const pending = task({
      task_id: 'pending-1',
      title: 'Pending spring',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    const history = task({
      task_id: 'history-1',
      title: 'History spring',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([pending]);
    apiMocks.fetchHistory.mockResolvedValue([history]);
    apiMocks.renameSession.mockResolvedValue({
      session_id: 'session-spring',
      display_name: 'Renamed',
      auto_name: 'S-SPRNG',
      created_at: '2026-06-05T01:00:00Z',
      updated_at: '2026-06-05T03:00:00Z',
      last_seen_at: '2026-06-05T02:00:00Z',
    });

    render(<App />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Rename pending session-spring' }),
    );

    await waitFor(() =>
      expect(apiMocks.renameSession).toHaveBeenCalledWith('session-spring', 'Renamed'),
    );
    expect(
      await screen.findByRole('button', { name: 'Rename pending session-spring' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByTestId('history-history-1')).toHaveTextContent('Renamed');
  });

  it('keeps loaded-more history tasks grouped by session metadata', async () => {
    const first = task({
      task_id: 'history-1',
      title: 'First history',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    const older = task({
      task_id: 'history-2',
      title: 'Older history',
      status: 'completed',
      completed_at: '2026-06-05T01:00:00Z',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValueOnce([first]).mockResolvedValueOnce([older]);

    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: 'History' }));
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByTestId('history-history-2')).toHaveTextContent('Spring · S-SPRNG');
    await waitFor(() => expect(apiMocks.fetchHistory).toHaveBeenLastCalledWith(80, 1));
  });

  it('shows rename errors without changing loaded task names', async () => {
    const pending = task({
      task_id: 'pending-1',
      title: 'Pending spring',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([pending]);
    apiMocks.fetchHistory.mockResolvedValue([]);
    apiMocks.renameSession.mockRejectedValue(new Error('rename failed'));

    render(<App />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Rename pending session-spring' }),
    );

    expect(await screen.findByText('rename failed')).toBeInTheDocument();
    expect(screen.getByTestId('pending-pending-1')).toHaveTextContent('Spring');
  });

  it('shows non-error rename failures through the error banner', async () => {
    const pending = task({
      task_id: 'pending-1',
      title: 'Pending spring',
      session_id: 'session-spring',
      session_display_name: 'Spring',
      session_auto_name: 'S-SPRNG',
    });
    apiMocks.fetchPendingTasks.mockResolvedValue([pending]);
    apiMocks.fetchHistory.mockResolvedValue([]);
    apiMocks.renameSession.mockRejectedValue('plain rename failure');

    render(<App />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Rename pending session-spring' }),
    );

    expect(await screen.findByText('plain rename failure')).toBeInTheDocument();
  });

  it('shows load, submit, load-more, and permission errors', async () => {
    apiMocks.fetchPendingTasks.mockRejectedValue(new Error('load failed'));
    apiMocks.fetchHistory.mockResolvedValue([]);
    apiMocks.submitReply.mockRejectedValue('submit failed');
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    render(<App />);

    expect(await screen.findByText('load failed')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Toggle browser notifications'));
    expect(
      await screen.findByText('Browser notification permission was not granted.'),
    ).toBeInTheDocument();

    eventHandler?.({ type: 'task_created', task: task({ title: 'Reply will fail' }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Quick reply task-1' }));
    expect(await screen.findByText('submit failed')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    apiMocks.fetchHistory.mockRejectedValueOnce(new Error('more failed'));
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('more failed')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('shows non-error initial load failures', async () => {
    apiMocks.fetchPendingTasks.mockRejectedValue('plain load failed');
    apiMocks.fetchHistory.mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByText('plain load failed')).toBeInTheDocument();
  });

  it('enables notifications and sound cues for new task events', async () => {
    const createOscillator = vi.fn(() => ({
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }));
    const createGain = vi.fn(() => ({
      gain: { value: 0 },
      connect: vi.fn(),
    }));
    class FakeAudioContext {
      currentTime = 1;
      destination = {};
      createOscillator = createOscillator;
      createGain = createGain;
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const notification = vi.fn() as unknown as typeof Notification & ReturnType<typeof vi.fn>;
    Object.assign(notification, {
      permission: 'default',
      requestPermission: vi.fn().mockImplementation(async () => {
        Object.defineProperty(notification, 'permission', {
          configurable: true,
          value: 'granted',
        });
        return 'granted';
      }),
    });
    vi.stubGlobal('Notification', notification);
    apiMocks.fetchPendingTasks.mockResolvedValue([]);
    apiMocks.fetchHistory.mockResolvedValue([]);

    render(<App />);

    await userEvent.click(screen.getByTitle('Toggle browser notifications'));
    await userEvent.click(screen.getByTitle('Toggle sound cue'));
    await waitFor(() => expect(apiMocks.connectTaskEvents).toHaveBeenCalledTimes(3));
    eventHandler?.({ type: 'task_created', task: task({ title: 'Noisy task' }) });

    await waitFor(() =>
      expect(notification).toHaveBeenCalledWith('AskUser Popup', { body: 'Noisy task' }),
    );
    expect(createOscillator).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
