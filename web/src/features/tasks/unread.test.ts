import { describe, expect, it } from 'vitest';
import { clearRemovedUnread, clearUnread, markCreatedUnread } from './unread';

describe('pending unread state', () => {
  it('marks created pending tasks unread without duplicating ids', () => {
    const unread = markCreatedUnread(new Set(['task-1']), 'task-1');

    expect(Array.from(unread)).toEqual(['task-1']);
  });

  it('clears unread when a task is opened', () => {
    const unread = clearUnread(new Set(['task-1', 'task-2']), 'task-1');

    expect(Array.from(unread)).toEqual(['task-2']);
  });

  it('removes unread ids for tasks that left the pending stream', () => {
    const unread = clearRemovedUnread(new Set(['task-1', 'task-2', 'task-3']), [
      'task-1',
      'task-3',
    ]);

    expect(Array.from(unread)).toEqual(['task-2']);
  });
});
