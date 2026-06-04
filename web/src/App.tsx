import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ClipboardCopy, Inbox, Radio } from 'lucide-react';
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
  const [markdownSettings, setMarkdownSettings] = useState<MarkdownSettings>(() =>
    loadJSON('askuser.markdownSettings', defaultMarkdownSettings),
  );
  const [suffixEnabled, setSuffixEnabled] = useState(
    () => localStorage.getItem('askuser.suffix.enabled') === 'true',
  );
  const [suffix, setSuffix] = useState(() => localStorage.getItem('askuser.suffix.value') ?? '');

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
    const load = async () => {
      try {
        const [pending, history] = await Promise.all([fetchPendingTasks(), fetchHistory()]);
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
    const applyEvent = async (event: TaskEvent) => {
      if (event.type === 'task_created') {
        setPendingTasks((tasks) => [
          event.task,
          ...tasks.filter((task) => task.task_id !== event.task.task_id),
        ]);
        setActiveTaskId((current) => current ?? event.task.task_id);
      }
      if (event.type === 'task_completed' || event.type === 'task_cancelled') {
        const taskId = event.task_id;
        setPendingTasks((tasks) => tasks.filter((task) => task.task_id !== taskId));
        localStorage.removeItem(`askuser.drafts.${taskId}`);
        setHistoryTasks(await fetchHistory());
      }
    };

    return connectTaskEvents((event) => {
      void applyEvent(event);
    }, setConnectionStatus);
  }, []);

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
      setHistoryTasks(await fetchHistory());
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
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        <main className="workspace">
          <section className="task-panel">
            <Tabs.Root value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
              <div className="panel-heading tabs-heading">
                <Tabs.List className="tabs-list">
                  <Tabs.Trigger value="pending">Pending</Tabs.Trigger>
                  <Tabs.Trigger value="history">History</Tabs.Trigger>
                </Tabs.List>
                {tab === 'history' ? (
                  <button
                    type="button"
                    className="tool-button"
                    disabled={selectedHistoryIds.size === 0}
                    onClick={() => void exportSelected()}
                    title="Copy selected history as XML"
                  >
                    <ClipboardCopy size={15} />
                    Export
                  </button>
                ) : null}
              </div>
              <Tabs.Content value="pending">
                <TaskList
                  tasks={pendingTasks}
                  mode="pending"
                  activeTaskId={activeTask?.task_id}
                  submittingTaskId={submittingTaskId}
                  selectedHistoryIds={selectedHistoryIds}
                  onSelectTask={(task) => setActiveTaskId(task.task_id)}
                  onQuickReply={(task, value) => handleSubmit(task, value, 'quick_paste')}
                  onToggleHistorySelection={() => undefined}
                />
              </Tabs.Content>
              <Tabs.Content value="history">
                <TaskList
                  tasks={historyTasks}
                  mode="history"
                  activeTaskId={activeTask?.task_id}
                  selectedHistoryIds={selectedHistoryIds}
                  onSelectTask={(task) => setActiveTaskId(task.task_id)}
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
              </Tabs.Content>
            </Tabs.Root>
          </section>

          <MarkdownReader
            markdown={activeTask?.markdown ?? 'Select a task to read its Markdown content.'}
            settings={markdownSettings}
            onSettingsChange={setMarkdownSettings}
          />

          <ReplyPanel
            task={activeTask?.status === 'pending' ? activeTask : undefined}
            suffix={suffix}
            suffixEnabled={suffixEnabled}
            onSuffixChange={setSuffix}
            onSuffixEnabledChange={setSuffixEnabled}
            onSubmit={handleSubmit}
          />
        </main>
      </div>
    </Tooltip.Provider>
  );
}

export default App;
