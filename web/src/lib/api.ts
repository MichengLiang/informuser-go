export type TaskStatus = 'pending' | 'completed' | 'cancelled';

export type Task = {
  task_id: string;
  session_id: string;
  session_display_name: string;
  session_auto_name: string;
  title: string;
  markdown: string;
  status: TaskStatus;
  user_input?: string;
  reply_source?: string;
  cancel_reason?: string;
  created_at: string;
  completed_at?: string;
  archived_at?: string;
  updated_at: string;
};

export type Session = {
  session_id: string;
  display_name: string;
  auto_name: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

export type TaskEvent =
  | { type: 'task_created'; task: Task }
  | { type: 'task_completed'; task_id: string; session_id: string; completed_at: string }
  | { type: 'task_cancelled'; task_id: string; session_id: string };

type ListTasksResponse = {
  tasks: Task[];
};

async function errorFromResponse(response: Response, fallback: string) {
  const payload =
    typeof response.json === 'function'
      ? ((await response.json().catch(() => ({}))) as { error?: string })
      : {};
  return new Error(payload.error ?? `${fallback}: ${response.status}`);
}

export async function fetchPendingTasks(): Promise<Task[]> {
  const response = await fetch('/api/tasks/pending');
  if (!response.ok) {
    throw await errorFromResponse(response, 'Failed to load pending tasks');
  }
  const data = (await response.json()) as ListTasksResponse;
  return data.tasks;
}

export async function fetchHistory(limit = 80, offset = 0): Promise<Task[]> {
  const response = await fetch(`/api/history?limit=${limit}&offset=${offset}`);
  if (!response.ok) {
    throw await errorFromResponse(response, 'Failed to load history');
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
    throw await errorFromResponse(response, 'Failed to submit reply');
  }
}

export async function renameSession(sessionId: string, displayName: string): Promise<Session> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName }),
  });

  if (!response.ok) {
    throw await errorFromResponse(response, 'Failed to rename session');
  }

  return (await response.json()) as Session;
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
