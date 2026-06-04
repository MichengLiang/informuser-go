import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Bell, CheckSquare, ClipboardCopy, Inbox, Radio, Shuffle, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MarkdownReader, type MarkdownSettings } from './features/markdown/MarkdownReader';
import { ReplyPanel } from './features/reply/ReplyPanel';
import { TaskList } from './features/tasks/TaskList';
import {
  connectTaskEvents,
  fetchHistory,
  fetchPendingTasks,
  submitReply,
  type Task,
  type TaskEvent,
} from './lib/api';
import './App.css';

const defaultMarkdownSettings: MarkdownSettings = {
  fontSize: 15,
  lineHeight: 'normal',
  contentWidth: 'reading',
  raw: false,
};

const historyPageSize = 80;

function loadJSON<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key);
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function App() {
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [historyTasks, setHistoryTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [error, setError] = useState<string | undefined>();
  const [submittingTaskId, setSubmittingTaskId] = useState<string | undefined>();
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(() => new Set<string>());
  const [replyMode, setReplyMode] = useState(false);
  const [historyExportMode, setHistoryExportMode] = useState(false);
  const [markdownSettings, setMarkdownSettings] = useState<MarkdownSettings>(() =>
    loadJSON('askuser.markdownSettings', defaultMarkdownSettings),
  );
  const [suffixEnabled, setSuffixEnabled] = useState(
    () => localStorage.getItem('askuser.suffix.enabled') === 'true',
  );
  const [suffix, setSuffix] = useState(() => localStorage.getItem('askuser.suffix.value') ?? '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem('askuser.notifications.enabled') === 'true',
  );
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem('askuser.sound.enabled') === 'true',
  );

  useEffect(() => {
    localStorage.setItem('askuser.markdownSettings', JSON.stringify(markdownSettings));
  }, [markdownSettings]);

  useEffect(() => {
    localStorage.setItem('askuser.suffix.enabled', String(suffixEnabled));
  }, [suffixEnabled]);

  useEffect(() => {
    localStorage.setItem('askuser.suffix.value', suffix);
  }, [suffix]);

  useEffect(() => {
    localStorage.setItem('askuser.notifications.enabled', String(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
    localStorage.setItem('askuser.sound.enabled', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    const load = async () => {
      try {
        const [pending, history] = await Promise.all([
          fetchPendingTasks(),
          fetchHistory(historyPageSize),
        ]);
        setPendingTasks(pending);
        setHistoryTasks(history);
        setActiveTaskId(pending[0]?.task_id ?? history[0]?.task_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const alertNewTask = (task: Task) => {
      if (
        notificationsEnabled &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        new Notification('AskUser Popup', { body: task.title });
      }
      if (soundEnabled) {
        // The browser workbench stays web-only, so a tiny generated tone gives an
        // optional "popup" cue without adding a native desktop shell or asset file.
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = 740;
        gain.gain.value = 0.05;
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.12);
      }
    };

    const applyEvent = async (event: TaskEvent) => {
      if (event.type === 'task_created') {
        setPendingTasks((tasks) => [
          event.task,
          ...tasks.filter((task) => task.task_id !== event.task.task_id),
        ]);
        setActiveTaskId((current) => current ?? event.task.task_id);
        alertNewTask(event.task);
      }
      if (event.type === 'task_completed' || event.type === 'task_cancelled') {
        const taskId = event.task_id;
        setPendingTasks((tasks) => tasks.filter((task) => task.task_id !== taskId));
        localStorage.removeItem(`askuser.drafts.${taskId}`);
        setReplyMode(false);
        setHistoryTasks(await fetchHistory(historyPageSize));
      }
    };

    return connectTaskEvents((event) => {
      void applyEvent(event);
    }, setConnectionStatus);
  }, [notificationsEnabled, soundEnabled]);

  const activeTask = useMemo(() => {
    const source = tab === 'pending' ? pendingTasks : historyTasks;
    return source.find((task) => task.task_id === activeTaskId) ?? source[0];
  }, [activeTaskId, historyTasks, pendingTasks, tab]);

  const combinedReply = (value: string) => {
    if (!suffixEnabled || !suffix.trim()) {
      return value;
    }
    // The suffix is appended after a blank line so copied agent-facing replies
    // keep their body intact while still receiving the configured trailing note.
    return `${value}\n\n${suffix}`;
  };

  const handleSubmit = async (task: Task, value: string, source: string) => {
    setSubmittingTaskId(task.task_id);
    setError(undefined);
    try {
      await submitReply(task.task_id, combinedReply(value), source);
      setPendingTasks((tasks) => tasks.filter((item) => item.task_id !== task.task_id));
      localStorage.removeItem(`askuser.drafts.${task.task_id}`);
      setReplyMode(false);
      setHistoryTasks(await fetchHistory(historyPageSize));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingTaskId(undefined);
    }
  };

  const exportSelected = async () => {
    const selected = historyTasks.filter((task) => selectedHistoryIds.has(task.task_id));
    const xml = selected
      .slice()
      .sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''))
      .map((task, index) => {
        const id = index + 1;
        return `<Assistant id="${id}">\n${task.markdown}\n</Assistant>\n\n<User id="${id}">\n${
          task.user_input ?? ''
        }\n</User>`;
      })
      .join('\n\n');
    await navigator.clipboard.writeText(xml);
    setSelectedHistoryIds(new Set());
    setHistoryExportMode(false);
  };

  const loadMoreHistory = async () => {
    setError(undefined);
    try {
      const nextPage = await fetchHistory(historyPageSize, historyTasks.length);
      setHistoryTasks((current) => [...current, ...nextPage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const copyMarkdown = async (markdown: string) => {
    setError(undefined);
    try {
      await navigator.clipboard.writeText(markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy Markdown.');
      throw err;
    }
  };

  const changeTab = (value: string) => {
    setTab(value as typeof tab);
    setReplyMode(false);
    setHistoryExportMode(false);
    setSelectedHistoryIds(new Set());
  };

  const selectTask = (task: Task) => {
    setActiveTaskId(task.task_id);
    setReplyMode(false);
  };

  const enterHistoryExportMode = () => {
    setHistoryExportMode(true);
    setSelectedHistoryIds(new Set());
  };

  const exitHistoryExportMode = () => {
    setHistoryExportMode(false);
    setSelectedHistoryIds(new Set());
  };

  const selectAllHistory = () => {
    setSelectedHistoryIds(new Set(historyTasks.map((task) => task.task_id)));
  };

  const invertHistorySelection = () => {
    setSelectedHistoryIds((current) => {
      const next = new Set<string>();
      for (const task of historyTasks) {
        if (!current.has(task.task_id)) {
          next.add(task.task_id);
        }
      }
      return next;
    });
  };

  const toggleNotifications = async () => {
    if (
      !notificationsEnabled &&
      'Notification' in window &&
      Notification.permission !== 'granted'
    ) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Browser notification permission was not granted.');
        return;
      }
    }
    setNotificationsEnabled((enabled) => !enabled);
  };

  return (
    <Tooltip.Provider>
      <div className="app-shell">
        <header className="top-bar">
          <div>
            <h1>AskUser Popup</h1>
            <span>Local human checkpoint for code agents</span>
          </div>
          <div className="status-cluster">
            <span className={`status-pill ${connectionStatus}`}>
              <Radio size={14} />
              {connectionStatus}
            </span>
            <span className="status-pill">
              <Inbox size={14} />
              {pendingTasks.length} pending
            </span>
            <button
              type="button"
              className={`status-button ${notificationsEnabled ? 'enabled' : ''}`}
              onClick={() => void toggleNotifications()}
              title="Toggle browser notifications"
            >
              <Bell size={14} />
            </button>
            <button
              type="button"
              className={`status-button ${soundEnabled ? 'enabled' : ''}`}
              onClick={() => setSoundEnabled((enabled) => !enabled)}
              title="Toggle sound cue"
            >
              <Volume2 size={14} />
            </button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        <main className={`workspace ${replyMode ? 'reply-mode' : ''}`}>
          <section className="task-panel">
            <Tabs.Root className="task-tabs" value={tab} onValueChange={changeTab}>
              <div className="panel-heading tabs-heading">
                <Tabs.List className="tabs-list">
                  <Tabs.Trigger value="pending">Pending</Tabs.Trigger>
                  <Tabs.Trigger value="history">History</Tabs.Trigger>
                </Tabs.List>
                {tab === 'history' ? (
                  <button
                    type="button"
                    className="tool-button"
                    disabled={historyTasks.length === 0}
                    onClick={enterHistoryExportMode}
                    title="Copy selected history as XML"
                    style={{ display: historyExportMode ? 'none' : undefined }}
                  >
                    <ClipboardCopy size={15} />
                    Export
                  </button>
                ) : null}
              </div>
              {tab === 'history' && historyExportMode ? (
                <div className="export-toolbar">
                  <div className="export-toolbar-left">
                    <button type="button" className="tool-button" onClick={selectAllHistory}>
                      <CheckSquare size={15} />
                      Select all
                    </button>
                    <button type="button" className="tool-button" onClick={invertHistorySelection}>
                      <Shuffle size={15} />
                      Invert
                    </button>
                  </div>
                  <div className="export-toolbar-right">
                    <button
                      type="button"
                      className="tool-button"
                      disabled={selectedHistoryIds.size === 0}
                      onClick={() => void exportSelected()}
                    >
                      <ClipboardCopy size={15} />
                      Copy ({selectedHistoryIds.size})
                    </button>
                    <button type="button" className="tool-button" onClick={exitHistoryExportMode}>
                      <X size={15} />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <Tabs.Content value="pending">
                <TaskList
                  tasks={pendingTasks}
                  mode="pending"
                  activeTaskId={activeTask?.task_id}
                  submittingTaskId={submittingTaskId}
                  selectedHistoryIds={selectedHistoryIds}
                  onSelectTask={selectTask}
                  onQuickReply={(task, value) => handleSubmit(task, value, 'quick_paste')}
                  onToggleHistorySelection={() => undefined}
                />
              </Tabs.Content>
              <Tabs.Content value="history">
                <TaskList
                  tasks={historyTasks}
                  mode="history"
                  exportMode={historyExportMode}
                  activeTaskId={activeTask?.task_id}
                  selectedHistoryIds={selectedHistoryIds}
                  onSelectTask={selectTask}
                  onQuickReply={(task, value) => handleSubmit(task, value, 'quick_paste')}
                  onToggleHistorySelection={(taskId) =>
                    setSelectedHistoryIds((current) => {
                      const next = new Set(current);
                      if (next.has(taskId)) {
                        next.delete(taskId);
                      } else {
                        next.add(taskId);
                      }
                      return next;
                    })
                  }
                />
                <div className="history-footer">
                  <button
                    type="button"
                    className="tool-button"
                    onClick={() => void loadMoreHistory()}
                  >
                    Load more
                  </button>
                </div>
              </Tabs.Content>
            </Tabs.Root>
          </section>

          <section className="detail-workspace">
            <MarkdownReader
              markdown={activeTask?.markdown ?? 'Select a task to read its Markdown content.'}
              userInput={activeTask?.status === 'completed' ? activeTask.user_input : undefined}
              canReply={activeTask?.status === 'pending'}
              settings={markdownSettings}
              onSettingsChange={setMarkdownSettings}
              onOpenReply={() => setReplyMode(true)}
              onCopyMarkdown={copyMarkdown}
            />

            {replyMode ? (
              <ReplyPanel
                task={activeTask?.status === 'pending' ? activeTask : undefined}
                suffix={suffix}
                suffixEnabled={suffixEnabled}
                onSuffixChange={setSuffix}
                onSuffixEnabledChange={setSuffixEnabled}
                onSubmit={handleSubmit}
                onClose={() => setReplyMode(false)}
              />
            ) : null}
          </section>
        </main>
      </div>
    </Tooltip.Provider>
  );
}

export default App;
