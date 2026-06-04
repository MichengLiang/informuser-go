import type { Task } from '../lib/api';

export function task(overrides: Partial<Task> = {}): Task {
  return {
    task_id: 'task-1',
    session_id: 'session-1',
    title: 'Need review',
    markdown: '# Review\n\nPlease check this.',
    status: 'pending',
    created_at: '2026-06-05T01:00:00Z',
    updated_at: '2026-06-05T01:00:00Z',
    ...overrides,
  };
}
