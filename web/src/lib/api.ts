export type TaskStatus = 'pending' | 'completed' | 'cancelled';

export type Task = {
  task_id: string;
  session_id: string;
  title: string;
  markdown: string;
  status: TaskStatus;
  user_input?: string;
  reply_source?: string;
  cancel_reason?: string;
  created_at: string;
  completed_at?: string;
  updated_at: string;
};

export type TaskEvent =
  | { type: 'task_created'; task: Task }
  | { type: 'task_completed'; task_id: string; session_id: string; completed_at: string }
  | { type: 'task_cancelled'; task_id: string; session_id: string };

type ListTasksResponse = {
  tasks: Task[];
};

export async function fetchPendingTasks(): Promise<Task[]> {
  const response = await fetch('/api/tasks/pending');
  if (!response.ok) {
    throw new Error(`Failed to load pending tasks: ${response.status}`);
  }
  const data = (await response.json()) as ListTasksResponse;
  return data.tasks;
}

export async function fetchHistory(limit = 80, offset = 0): Promise<Task[]> {
  const response = await fetch(`/api/history?limit=${limit}&offset=${offset}`);
  if (!response.ok) {
    throw new Error(`Failed to load history: ${response.status}`);
  }
  const data = (await response.json()) as ListTasksResponse;
  return data.tasks;
}

export async function submitReply(taskId: string, userInput: string, replySource: string) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_input: userInput, reply_source: replySource }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Failed to submit reply: ${response.status}`);
  }
}

export function connectTaskEvents(
  onEvent: (event: TaskEvent) => void,
  onStatus: (status: string) => void,
) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let socket: WebSocket | undefined;
  let closed = false;
  let reconnectTimer: number | undefined;

  const connect = () => {
    onStatus('connecting');
    socket = new WebSocket(`${protocol}//${window.location.host}/api/events/ws`);

    socket.addEventListener('open', () => onStatus('connected'));
    socket.addEventListener('message', (message) => {
      onEvent(JSON.parse(message.data) as TaskEvent);
    });
    socket.addEventListener('close', () => {
      if (closed) {
        return;
      }
      onStatus('reconnecting');
      reconnectTimer = window.setTimeout(connect, 2000);
    });
    socket.addEventListener('error', () => {
      socket?.close();
    });
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
    }
    socket?.close();
  };
}
