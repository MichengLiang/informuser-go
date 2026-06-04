import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  archiveHistoryTasks,
  connectTaskEvents,
  fetchArchivedHistory,
  fetchHistory,
  fetchPendingTasks,
  renameSession,
  unarchiveHistoryTasks,
} from '../lib/api';
import { task } from './fixtures';

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('archive history api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads archived history and surfaces error payloads', async () => {
    const archived = task({
      task_id: 'archived-1',
      status: 'completed',
      archived_at: '2026-06-05T04:00:00Z',
      completed_at: '2026-06-05T03:00:00Z',
    });
    const fetchMock = mockFetch({ ok: true, json: async () => ({ tasks: [archived] }) });

    await expect(fetchArchivedHistory(10, 20)).resolves.toEqual([archived]);
    expect(fetchMock).toHaveBeenCalledWith('/api/history/archived?limit=10&offset=20');

    mockFetch({
      ok: false,
      status: 500,
      json: async () => ({ error: 'archived history failed' }),
    });
    await expect(fetchArchivedHistory()).rejects.toThrow('archived history failed');
  });

  it('uses fallback errors when archived API error payloads are missing or invalid', async () => {
    mockFetch({ ok: false, status: 502 });
    await expect(fetchArchivedHistory()).rejects.toThrow('Failed to load archived history: 502');

    mockFetch({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('invalid json');
      },
    });
    await expect(fetchArchivedHistory()).rejects.toThrow('Failed to load archived history: 503');
  });

  it('archives and restores history task ids with server payload errors', async () => {
    const fetchMock = mockFetch({ ok: true, json: async () => ({ status: 'ok', updated: 2 }) });

    await archiveHistoryTasks(['task/1', 'task-2']);
    expect(fetchMock).toHaveBeenCalledWith('/api/history/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_ids: ['task/1', 'task-2'] }),
    });

    await unarchiveHistoryTasks(['task-1']);
    expect(fetchMock).toHaveBeenCalledWith('/api/history/unarchive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_ids: ['task-1'] }),
    });

    mockFetch({
      ok: false,
      status: 400,
      json: async () => ({ error: 'task_ids is required' }),
    });
    await expect(archiveHistoryTasks([])).rejects.toThrow('task_ids is required');
    await expect(unarchiveHistoryTasks([])).rejects.toThrow('task_ids is required');
  });

  it('renames sessions with backend payload errors', async () => {
    const fetchMock = mockFetch({
      ok: true,
      json: async () => ({
        session_id: 'session-1',
        display_name: 'Renamed',
        auto_name: 'S-ONE1',
        created_at: '2026-06-05T01:00:00Z',
        updated_at: '2026-06-05T02:00:00Z',
        last_seen_at: '2026-06-05T02:00:00Z',
      }),
    });

    await expect(renameSession('session/1', 'Renamed')).resolves.toMatchObject({
      session_id: 'session-1',
      display_name: 'Renamed',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session%2F1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Renamed' }),
    });

    mockFetch({
      ok: false,
      status: 404,
      json: async () => ({ error: 'session not found' }),
    });
    await expect(renameSession('missing-session', 'Renamed')).rejects.toThrow('session not found');
  });

  it('keeps existing pending and active history API errors covered', async () => {
    mockFetch({
      ok: false,
      status: 503,
      json: async () => ({ error: 'pending failed' }),
    });
    await expect(fetchPendingTasks()).rejects.toThrow('pending failed');

    mockFetch({
      ok: false,
      status: 500,
      json: async () => ({ error: 'history failed' }),
    });
    await expect(fetchHistory()).rejects.toThrow('history failed');
  });

  it('uses secure websocket URLs and ignores close events after cleanup', () => {
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

    expect(sockets[0]?.url).toBe('ws://localhost:3000/api/events/ws');
    cleanup();
    sockets[0]?.emit('close');
    vi.advanceTimersByTime(2000);

    expect(onStatus).toHaveBeenCalledWith('connecting');
    expect(onStatus).not.toHaveBeenCalledWith('reconnecting');
    expect(sockets).toHaveLength(1);
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
