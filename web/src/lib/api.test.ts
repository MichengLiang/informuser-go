import { afterEach, describe, expect, it, vi } from 'vitest';
import { task } from '../test/fixtures';
import { connectTaskEvents, fetchHistory, fetchPendingTasks, submitReply } from './api';

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads pending and history task lists', async () => {
    const fetchMock = mockFetch({
      ok: true,
      json: async () => ({ tasks: [task()] }),
    });

    await expect(fetchPendingTasks()).resolves.toEqual([task()]);
    await expect(fetchHistory(10, 20)).resolves.toEqual([task()]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/tasks/pending');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/history?limit=10&offset=20');
  });

  it('throws status-specific load errors', async () => {
    mockFetch({ ok: false, status: 503 });

    await expect(fetchPendingTasks()).rejects.toThrow('Failed to load pending tasks: 503');
  });

  it('submits replies and surfaces server error messages', async () => {
    const fetchMock = mockFetch({ ok: true });

    await submitReply('task/1', 'approved', 'quick_paste');

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task%2F1/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_input: 'approved', reply_source: 'quick_paste' }),
    });

    mockFetch({
      ok: false,
      status: 400,
      json: async () => ({ error: 'user_input is required' }),
    });
    await expect(submitReply('task-1', '', 'reply_panel')).rejects.toThrow(
      'user_input is required',
    );
  });

  it('connects websocket events, reports status, reconnects, and cleans up', () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    vi.stubGlobal(
      'WebSocket',
      class extends FakeWebSocket {
        constructor(url: string) {
          super(url);
          sockets.push(this);
        }
      },
    );

    const onEvent = vi.fn();
    const onStatus = vi.fn();
    const cleanup = connectTaskEvents(onEvent, onStatus);

    expect(onStatus).toHaveBeenLastCalledWith('connecting');
    expect(sockets[0]?.url).toBe('ws://localhost:3000/api/events/ws');

    sockets[0]?.emit('open');
    expect(onStatus).toHaveBeenLastCalledWith('connected');

    sockets[0]?.emit('message', { data: JSON.stringify({ type: 'task_created', task: task() }) });
    expect(onEvent).toHaveBeenCalledWith({ type: 'task_created', task: task() });

    sockets[0]?.emit('error');
    expect(sockets[0]?.closed).toBe(true);
    sockets[0]?.emit('close');
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting');

    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(2);

    cleanup();
    expect(sockets[1]?.closed).toBe(true);
  });
});

class FakeWebSocket {
  readonly listeners = new Map<string, Array<(event?: unknown) => void>>();
  readonly url: string;
  closed = false;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event?: unknown) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, event?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}
