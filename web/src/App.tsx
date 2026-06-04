import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Archive,
  ArrowLeft,
  Bell,
  CheckSquare,
  ClipboardCopy,
  Inbox,
  Radio,
  RotateCcw,
  Shuffle,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MarkdownReader, type MarkdownSettings } from './features/markdown/MarkdownReader';
import { ReplyPanel } from './features/reply/ReplyPanel';
import { TaskList } from './features/tasks/TaskList';
import {
  archiveHistoryTasks,
  connectTaskEvents,
  fetchArchivedHistory,
  fetchHistory,
  fetchPendingTasks,
  renameSession,
  submitReply,
  type Task,
  type TaskEvent,
  unarchiveHistoryTasks,
} from './lib/api';
import { formatTasksAsXML } from './lib/export';
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
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [historyView, setHistoryView] = useState<'main' | 'archived'>('main');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [error, setError] = useState<string | undefined>();
  const [submittingTaskId, setSubmittingTaskId] = useState<string | undefined>();
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(() => new Set<string>());
  const [selectedArchivedIds, setSelectedArchivedIds] = useState(() => new Set<string>());
  const [replyMode, setReplyMode] = useState(false);
  const [historySelectionMode, setHistorySelectionMode] = useState(false);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
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
    const source =
      tab === 'pending' ? pendingTasks : historyView === 'archived' ? archivedTasks : historyTasks;
    return source.find((task) => task.task_id === activeTaskId) ?? source[0];
  }, [activeTaskId, archivedTasks, historyTasks, historyView, pendingTasks, tab]);
  const emptySelection = useMemo(() => new Set<string>(), []);

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

  const updateLoadedSessionNames = (sessionId: string, displayName: string, autoName: string) => {
    const updateTask = (task: Task) =>
      task.session_id === sessionId
        ? { ...task, session_display_name: displayName, session_auto_name: autoName }
        : task;
    setPendingTasks((tasks) => tasks.map(updateTask));
    setHistoryTasks((tasks) => tasks.map(updateTask));
    setArchivedTasks((tasks) => tasks.map(updateTask));
  };

  const handleRenameSession = async (sessionId: string, displayName: string) => {
    setError(undefined);
    try {
      const session = await renameSession(sessionId, displayName);
      updateLoadedSessionNames(session.session_id, session.display_name, session.auto_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const visibleHistoryTasks = historyView === 'archived' ? archivedTasks : historyTasks;
  const selectedIds = historyView === 'archived' ? selectedArchivedIds : selectedHistoryIds;

  const exportTasks = async (tasks: Task[]) => {
    setError(undefined);
    try {
      await navigator.clipboard.writeText(formatTasksAsXML(tasks));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy history XML.');
    }
  };

  const exportSelected = async () => {
    const selected = historyTasks.filter((task) => selectedHistoryIds.has(task.task_id));
    await exportTasks(selected);
    setSelectedHistoryIds(new Set());
    setHistorySelectionMode(false);
  };

  const archiveTasks = async (tasks: Task[]) => {
    const taskIds = tasks.map((task) => task.task_id);
    const removedIds = new Set(taskIds);
    setError(undefined);
    try {
      await archiveHistoryTasks(taskIds);
      setHistoryTasks((current) => current.filter((task) => !removedIds.has(task.task_id)));
      setSelectedHistoryIds(new Set());
      setHistorySelectionMode(false);
      setActiveTaskId((current) =>
        current && removedIds.has(current)
          ? (historyTasks
              .filter((task) => !removedIds.has(task.task_id))
              .sort((a, b) =>
                (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at),
              )[0]?.task_id ?? pendingTasks[0]?.task_id)
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const restoreTasks = async (tasks: Task[]) => {
    const taskIds = tasks.map((task) => task.task_id);
    const removedIds = new Set(taskIds);
    setError(undefined);
    try {
      await unarchiveHistoryTasks(taskIds);
      setArchivedTasks((current) => current.filter((task) => !removedIds.has(task.task_id)));
      setHistoryTasks((current) =>
        [...tasks.map((task) => ({ ...task, archived_at: undefined })), ...current].sort((a, b) =>
          (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at),
        ),
      );
      setSelectedArchivedIds(new Set());
      setHistorySelectionMode(false);
      setActiveTaskId((current) =>
        current && removedIds.has(current)
          ? (archivedTasks
              .filter((task) => !removedIds.has(task.task_id))
              .sort((a, b) =>
                (b.archived_at ?? b.completed_at ?? b.created_at).localeCompare(
                  a.archived_at ?? a.completed_at ?? a.created_at,
                ),
              )[0]?.task_id ?? pendingTasks[0]?.task_id)
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const archiveSelected = async () => {
    await archiveTasks(historyTasks.filter((task) => selectedHistoryIds.has(task.task_id)));
  };

  const restoreSelected = async () => {
    await restoreTasks(archivedTasks.filter((task) => selectedArchivedIds.has(task.task_id)));
  };

  const toggleTaskSelection = (taskId: string) => {
    const setSelected = historyView === 'archived' ? setSelectedArchivedIds : setSelectedHistoryIds;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const toggleGroupSelection = (_sessionId: string, taskIds: string[]) => {
    const setSelected = historyView === 'archived' ? setSelectedArchivedIds : setSelectedHistoryIds;
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = taskIds.every((taskId) => next.has(taskId));
      for (const taskId of taskIds) {
        if (allSelected) {
          next.delete(taskId);
        } else {
          next.add(taskId);
        }
      }
      return next;
    });
    setHistorySelectionMode(true);
  };

  const openArchivedHistory = async () => {
    setError(undefined);
    setHistorySelectionMode(false);
    setSelectedHistoryIds(new Set());
    setSelectedArchivedIds(new Set());
    setHistoryView('archived');
    if (archivedLoaded) {
      return;
    }
    try {
      const archived = await fetchArchivedHistory(historyPageSize);
      setArchivedTasks(archived);
      setArchivedLoaded(true);
      setActiveTaskId((current) => current ?? archived[0]?.task_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const backToMainHistory = () => {
    setHistoryView('main');
    setHistorySelectionMode(false);
    setSelectedArchivedIds(new Set());
    setActiveTaskId((current) => current ?? historyTasks[0]?.task_id);
  };

  const loadMoreHistory = async () => {
    setError(undefined);
    try {
      if (historyView === 'archived') {
        const nextPage = await fetchArchivedHistory(historyPageSize, archivedTasks.length);
        setArchivedTasks((current) => [...current, ...nextPage]);
      } else {
        const nextPage = await fetchHistory(historyPageSize, historyTasks.length);
        setHistoryTasks((current) => [...current, ...nextPage]);
      }
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
    setHistorySelectionMode(false);
    setHistoryView('main');
    setSelectedHistoryIds(new Set());
    setSelectedArchivedIds(new Set());
  };

  const selectTask = (task: Task) => {
    setActiveTaskId(task.task_id);
    setReplyMode(false);
  };

  const enterHistorySelectionMode = () => {
    setHistorySelectionMode(true);
    if (historyView === 'archived') {
      setSelectedArchivedIds(new Set());
    } else {
      setSelectedHistoryIds(new Set());
    }
  };

  const exitHistorySelectionMode = () => {
    setHistorySelectionMode(false);
    setSelectedHistoryIds(new Set());
    setSelectedArchivedIds(new Set());
  };

  const selectAllHistory = () => {
    const source = historyView === 'archived' ? archivedTasks : historyTasks;
    const setSelected = historyView === 'archived' ? setSelectedArchivedIds : setSelectedHistoryIds;
    setSelected(new Set(source.map((task) => task.task_id)));
  };

  const invertHistorySelection = () => {
    const source = historyView === 'archived' ? archivedTasks : historyTasks;
    const setSelected = historyView === 'archived' ? setSelectedArchivedIds : setSelectedHistoryIds;
    setSelected((current) => {
      const next = new Set<string>();
      for (const task of source) {
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
                  <div className="history-heading-actions">
                    {historyView === 'archived' ? (
                      <>
                        <button
                          type="button"
                          className="tool-button"
                          onClick={backToMainHistory}
                          title="Back to main history"
                        >
                          <ArrowLeft size={15} />
                          Back
                        </button>
                        <span className="history-view-label">Archived History</span>
                        <button
                          type="button"
                          className="tool-button"
                          disabled={archivedTasks.length === 0}
                          onClick={enterHistorySelectionMode}
                          title="Restore selected archived tasks"
                        >
                          <RotateCcw size={15} />
                          Restore
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="tool-button"
                          disabled={historyTasks.length === 0}
                          onClick={enterHistorySelectionMode}
                          title="Copy selected history as XML"
                        >
                          <ClipboardCopy size={15} />
                          Export
                        </button>
                        <button
                          type="button"
                          className="tool-button"
                          disabled={historyTasks.length === 0}
                          onClick={enterHistorySelectionMode}
                          title="Archive selected history"
                        >
                          <Archive size={15} />
                          Archive
                        </button>
                        <button
                          type="button"
                          className="tool-button"
                          onClick={() => void openArchivedHistory()}
                          title="Open archived history"
                        >
                          <Archive size={15} />
                          Archived
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
              {tab === 'history' && historySelectionMode ? (
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
                      disabled={selectedIds.size === 0 || historyView === 'archived'}
                      onClick={() => void exportSelected()}
                    >
                      <ClipboardCopy size={15} />
                      Copy ({selectedIds.size})
                    </button>
                    {historyView === 'archived' ? (
                      <button
                        type="button"
                        className="tool-button"
                        disabled={selectedIds.size === 0}
                        onClick={() => void restoreSelected()}
                      >
                        <RotateCcw size={15} />
                        Restore ({selectedIds.size})
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="tool-button"
                        disabled={selectedIds.size === 0}
                        onClick={() => void archiveSelected()}
                      >
                        <Archive size={15} />
                        Archive ({selectedIds.size})
                      </button>
                    )}
                    <button
                      type="button"
                      className="tool-button"
                      onClick={exitHistorySelectionMode}
                    >
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
                  selectedIds={emptySelection}
                  onSelectTask={selectTask}
                  onQuickReply={(task, value) => handleSubmit(task, value, 'quick_paste')}
                  onRenameSession={handleRenameSession}
                  onToggleTaskSelection={() => undefined}
                />
              </Tabs.Content>
              <Tabs.Content value="history">
                <TaskList
                  tasks={visibleHistoryTasks}
                  mode={historyView === 'archived' ? 'archived' : 'history'}
                  selectionMode={historySelectionMode}
                  activeTaskId={activeTask?.task_id}
                  selectedIds={selectedIds}
                  onSelectTask={selectTask}
                  onQuickReply={(task, value) => handleSubmit(task, value, 'quick_paste')}
                  onRenameSession={handleRenameSession}
                  onToggleTaskSelection={toggleTaskSelection}
                  onToggleGroupSelection={toggleGroupSelection}
                  onExportGroup={exportTasks}
                  onArchiveGroup={archiveTasks}
                  onUnarchiveGroup={restoreTasks}
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
