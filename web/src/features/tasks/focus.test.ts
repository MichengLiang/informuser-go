import { describe, expect, it } from 'vitest';
import type { TaskEvent } from '../../lib/api';
import { task } from '../../test/fixtures';
import {
  applyArchiveResult,
  applyRestoreResult,
  applyTaskCancelled,
  applyTaskCompleted,
  applyTaskCompletedLocally,
  applyTaskCreated,
  changeSurface,
  deriveFocusedTask,
  type FocusState,
  initializeFocus,
  selectTask,
} from './focus';

describe('task focus state', () => {
  it('initializes from pending before history', () => {
    const pending = task({ task_id: 'pending-1', markdown: 'pending markdown' });
    const history = task({
      task_id: 'history-1',
      markdown: 'history markdown',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
    });

    const focus = initializeFocus([pending], [history]);
    const view = deriveFocusedTask(focus, {
      pending: [pending],
      history: [history],
      archived: [],
    });

    expect(view).toMatchObject({ kind: 'task', surface: 'pending', task: pending });
  });

  it('initializes from history when pending is empty', () => {
    const history = task({
      task_id: 'history-1',
      markdown: 'history markdown',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
    });

    const focus = initializeFocus([], [history]);

    expect(
      deriveFocusedTask(focus, { pending: [], history: [history], archived: [] }),
    ).toMatchObject({
      kind: 'task',
      surface: 'history',
      task: history,
    });
  });

  it('does not let a created task steal an existing pending focus', () => {
    const active = task({ task_id: 'pending-active', markdown: 'active markdown' });
    const created = task({ task_id: 'pending-new', markdown: 'new markdown' });
    const focus = initializeFocus([active], []);

    const next = applyTaskCreated(focus, created);

    expect(
      deriveFocusedTask(next, { pending: [created, active], history: [], archived: [] }),
    ).toMatchObject({ kind: 'task', task: active });
  });

  it('uses a created task only when the workbench had no readable focus', () => {
    const created = task({ task_id: 'pending-new', markdown: 'new markdown' });
    const empty = initializeFocus([], []);

    const next = applyTaskCreated(empty, created);

    expect(
      deriveFocusedTask(next, { pending: [created], history: [], archived: [] }),
    ).toMatchObject({
      kind: 'task',
      surface: 'pending',
      task: created,
    });
  });

  it('turns the current pending task stale when it is completed elsewhere', () => {
    const active = task({ task_id: 'pending-active', markdown: 'active markdown' });
    const focus = initializeFocus([active], []);

    const next = applyTaskCompleted(focus, 'pending-active', active);

    expect(deriveFocusedTask(next, { pending: [], history: [], archived: [] })).toMatchObject({
      kind: 'stale',
      surface: 'pending',
      task: active,
      reason: 'completed_elsewhere',
    });
  });

  it('moves local completion focus to the next pending task instead of marking stale', () => {
    const active = task({ task_id: 'pending-active', markdown: 'active markdown' });
    const nextPending = task({ task_id: 'pending-next', markdown: 'next markdown' });
    const focus = initializeFocus([active, nextPending], []);

    const next = applyTaskCompletedLocally(focus, 'pending-active', [nextPending]);

    expect(
      deriveFocusedTask(next, { pending: [nextPending], history: [], archived: [] }),
    ).toMatchObject({
      kind: 'task',
      surface: 'pending',
      task: nextPending,
    });
  });

  it('clears pending focus after local completion when no pending task remains', () => {
    const active = task({ task_id: 'pending-active', markdown: 'active markdown' });
    const focus = initializeFocus([active], []);

    const next = applyTaskCompletedLocally(focus, 'pending-active', []);

    expect(deriveFocusedTask(next, { pending: [], history: [], archived: [] })).toMatchObject({
      kind: 'empty',
      surface: 'pending',
    });
  });

  it('records supersede replacement without opening the replacement automatically', () => {
    const oldTask = task({
      task_id: 'task-old',
      session_id: 'session-1',
      markdown: 'old markdown',
    });
    const replacement = task({
      task_id: 'task-new',
      session_id: 'session-1',
      markdown: 'new markdown',
    });
    const focus = initializeFocus([oldTask], []);
    const event: TaskEvent = {
      type: 'task_cancelled',
      task_id: 'task-old',
      session_id: 'session-1',
      cancel_reason: 'superseded_by_new_task',
      replacement_task_id: 'task-new',
    };

    const cancelled = applyTaskCancelled(focus, event, oldTask);
    const created = applyTaskCreated(cancelled, replacement);

    expect(
      deriveFocusedTask(created, { pending: [replacement], history: [], archived: [] }),
    ).toMatchObject({
      kind: 'stale',
      surface: 'pending',
      task: oldTask,
      reason: 'superseded',
      replacementTask: replacement,
    });
  });

  it('keeps independent focus per surface while switching tabs', () => {
    const pending = task({ task_id: 'pending-1' });
    const history = task({
      task_id: 'history-1',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
    });
    const selectedHistory = selectTask(
      initializeFocus([pending], [history]),
      'history',
      'history-1',
    );

    const backToPending = changeSurface(selectedHistory, 'pending');

    expect(
      deriveFocusedTask(backToPending, { pending: [pending], history: [history], archived: [] }),
    ).toMatchObject({ kind: 'task', surface: 'pending', task: pending });
    expect(
      deriveFocusedTask(changeSurface(backToPending, 'history'), {
        pending: [pending],
        history: [history],
        archived: [],
      }),
    ).toMatchObject({ kind: 'task', surface: 'history', task: history });
  });

  it('marks the current history focus stale after archive instead of jumping to another item', () => {
    const active = task({
      task_id: 'history-active',
      markdown: 'active markdown',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
    });
    const next = task({
      task_id: 'history-next',
      markdown: 'next markdown',
      status: 'completed',
      completed_at: '2026-06-05T02:00:00Z',
    });
    const focus = initializeFocus([], [active, next]);

    const archived = applyArchiveResult(
      focus,
      ['history-active'],
      new Map([[active.task_id, active]]),
    );

    expect(
      deriveFocusedTask(archived, { pending: [], history: [next], archived: [] }),
    ).toMatchObject({
      kind: 'stale',
      surface: 'history',
      task: active,
      reason: 'archived',
    });
  });

  it('marks the current archived focus stale after restore instead of jumping to another item', () => {
    const archivedTask = task({
      task_id: 'archived-active',
      markdown: 'archived markdown',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
      archived_at: '2026-06-05T04:00:00Z',
    });
    const focus: FocusState = {
      currentSurface: 'archived',
      bySurface: {
        pending: { kind: 'none', surface: 'pending', reason: 'empty' },
        history: { kind: 'none', surface: 'history', reason: 'empty' },
        archived: {
          kind: 'task',
          surface: 'archived',
          taskId: 'archived-active',
          selectedBy: 'user',
        },
      },
    };

    const restored = applyRestoreResult(
      focus,
      ['archived-active'],
      new Map([[archivedTask.task_id, archivedTask]]),
    );

    expect(deriveFocusedTask(restored, { pending: [], history: [], archived: [] })).toMatchObject({
      kind: 'stale',
      surface: 'archived',
      task: archivedTask,
      reason: 'unarchived',
    });
  });
});
