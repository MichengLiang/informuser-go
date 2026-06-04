import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { TaskEvent } from './lib/api';
import { task } from './test/fixtures';

const apiMocks = vi.hoisted(() => ({
  connectTaskEvents: vi.fn(),
  fetchHistory: vi.fn(),
  fetchPendingTasks: vi.fn(),
  submitReply: vi.fn(),
}));

vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>();
  return {
    ...actual,
    connectTaskEvents: apiMocks.connectTaskEvents,
    fetchHistory: apiMocks.fetchHistory,
    fetchPendingTasks: apiMocks.fetchPendingTasks,
    submitReply: apiMocks.submitReply,
  };
});

vi.mock('./features/tasks/TaskList', () => ({
  TaskList: ({
    tasks,
    mode,
    onSelectTask,
    onQuickReply,
    onToggleHistorySelection,
    selectedHistoryIds,
  }: MockTaskListProps) => (
    <div data-testid={`task-list-${mode}`}>
      {tasks.map((item) => (
        <div data-testid={`${mode}-${item.task_id}`} key={item.task_id}>
          <button type="button" onClick={() => onSelectTask(item)}>
            Select {item.title}
          </button>
          {mode === 'pending' ? (
            <button type="button" onClick={() => onQuickReply(item, 'quick reply')}>
              Quick reply {item.task_id}
            </button>
          ) : (
            <label>
              <input
                type="checkbox"
                checked={selectedHistoryIds.has(item.task_id)}
                onChange={() => onToggleHistorySelection(item.task_id)}
              />
              Select history {item.task_id}
            </label>
          )}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('./features/markdown/MarkdownReader', () => ({
  MarkdownReader: ({ markdown, settings, onSettingsChange }: MockMarkdownReaderProps) => (
    <section data-testid="markdown-reader">
      <div>{markdown}</div>
      <div>font {settings.fontSize}</div>
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
  mode: 'pending' | 'history';
  onSelectTask: (task: MockTask) => void;
  onQuickReply: (task: MockTask, value: string) => Promise<void>;
  onToggleHistorySelection: (taskId: string) => void;
  selectedHistoryIds: Set<string>;
};

type MockMarkdownSettings = {
  fontSize: number;
  lineHeight: 'compact' | 'normal' | 'relaxed';
  contentWidth: 'full' | 'reading' | 'narrow';
  raw: boolean;
};

type MockMarkdownReaderProps = {
  markdown: string;
  settings: MockMarkdownSettings;
  onSettingsChange: (settings: MockMarkdownSettings) => void;
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
    apiMocks.submitReply.mockReset();
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

    expect(await screen.findByText('Pending one')).toBeInTheDocument();
    expect(screen.getByText('1 pending')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Quick reply task-1' }));
    await waitFor(() =>
      expect(apiMocks.submitReply).toHaveBeenCalledWith('task-1', 'quick reply', 'quick_paste'),
    );

    const created = task({ task_id: 'task-2', title: 'Event task' });
    eventHandler?.({ type: 'task_created', task: created });
    expect(await screen.findByText('Event task')).toBeInTheDocument();

    apiMocks.fetchHistory.mockResolvedValueOnce([history]);
    eventHandler?.({
      type: 'task_completed',
      task_id: 'task-2',
      session_id: 'session-1',
      completed_at: 'now',
    });
    await waitFor(() => expect(apiMocks.fetchHistory).toHaveBeenCalledTimes(3));
  });

  it('combines reply panel suffixes and persists markdown settings', async () => {
    localStorage.setItem('askuser.markdownSettings', '{');
    apiMocks.fetchPendingTasks.mockResolvedValue([task({ title: 'Needs panel reply' })]);
    apiMocks.fetchHistory.mockResolvedValue([]);
    apiMocks.submitReply.mockResolvedValue(undefined);

    render(<App />);

    expect(await screen.findByText('Needs panel reply')).toBeInTheDocument();
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
    const historyList = screen.getByTestId('task-list-history');
    await userEvent.click(within(historyList).getByLabelText('Select history history-2'));
    await userEvent.click(within(historyList).getByLabelText('Select history history-2'));
    await userEvent.click(within(historyList).getByLabelText('Select history history-2'));
    await userEvent.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '<Assistant id="1">\nassistant two\n</Assistant>\n\n<User id="1">\nuser two\n</User>',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(apiMocks.fetchHistory).toHaveBeenLastCalledWith(80, 2));
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
