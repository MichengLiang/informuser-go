import type { Task, TaskEvent } from '../../lib/api';

export type FocusSurface = 'pending' | 'history' | 'archived';

export type TaskFocus =
  | { kind: 'none'; surface: FocusSurface; reason: 'empty' | 'not_initialized' }
  | {
      kind: 'task';
      surface: FocusSurface;
      taskId: string;
      selectedBy: 'startup' | 'user' | 'post_completion' | 'post_archive' | 'restore';
    }
  | {
      kind: 'stale';
      surface: FocusSurface;
      taskId: string;
      lastKnownTask: Task;
      reason: 'completed_elsewhere' | 'cancelled' | 'superseded' | 'archived' | 'unarchived';
      replacementTaskId?: string;
    };

export type FocusState = {
  currentSurface: FocusSurface;
  bySurface: Record<FocusSurface, TaskFocus>;
};

export type TaskSources = Record<FocusSurface, Task[]>;

export type FocusedTaskView =
  | { kind: 'empty'; surface: FocusSurface; message: string }
  | { kind: 'task'; surface: FocusSurface; task: Task }
  | {
      kind: 'stale';
      surface: FocusSurface;
      task: Task;
      reason: Extract<TaskFocus, { kind: 'stale' }>['reason'];
      replacementTask?: Task;
    };

function none(surface: FocusSurface, reason: 'empty' | 'not_initialized' = 'empty'): TaskFocus {
  return { kind: 'none', surface, reason };
}

function focusTask(
  surface: FocusSurface,
  taskId: string,
  selectedBy: Extract<TaskFocus, { kind: 'task' }>['selectedBy'],
): TaskFocus {
  return { kind: 'task', surface, taskId, selectedBy };
}

function currentFocus(state: FocusState) {
  return state.bySurface[state.currentSurface];
}

function withSurfaceFocus(
  state: FocusState,
  surface: FocusSurface,
  focus: TaskFocus,
  currentSurface = state.currentSurface,
): FocusState {
  return {
    currentSurface,
    bySurface: {
      ...state.bySurface,
      [surface]: focus,
    },
  };
}

function staleFocus(
  focus: Extract<TaskFocus, { kind: 'task' | 'stale' }>,
  lastKnownTask: Task,
  reason: Extract<TaskFocus, { kind: 'stale' }>['reason'],
  replacementTaskId?: string,
): TaskFocus {
  return {
    kind: 'stale',
    surface: focus.surface,
    taskId: focus.kind === 'task' ? focus.taskId : focus.taskId,
    lastKnownTask,
    reason,
    replacementTaskId,
  };
}

export function initializeFocus(pending: Task[], history: Task[]): FocusState {
  const pendingFocus = pending[0]
    ? focusTask('pending', pending[0].task_id, 'startup')
    : none('pending');
  const historyFocus = history[0]
    ? focusTask('history', history[0].task_id, 'startup')
    : none('history');
  const currentSurface = pending[0] ? 'pending' : history[0] ? 'history' : 'pending';

  return {
    currentSurface,
    bySurface: {
      pending: pendingFocus,
      history: historyFocus,
      archived: none('archived'),
    },
  };
}

export function deriveFocusedTask(state: FocusState, sources: TaskSources): FocusedTaskView {
  const focus = currentFocus(state);
  if (focus.kind === 'none') {
    return { kind: 'empty', surface: focus.surface, message: emptyMessage(focus.surface) };
  }
  if (focus.kind === 'stale') {
    return {
      kind: 'stale',
      surface: focus.surface,
      task: focus.lastKnownTask,
      reason: focus.reason,
      replacementTask: focus.replacementTaskId
        ? sources.pending.find((task) => task.task_id === focus.replacementTaskId)
        : undefined,
    };
  }

  const task = sources[focus.surface].find((item) => item.task_id === focus.taskId);
  if (!task) {
    return { kind: 'empty', surface: focus.surface, message: emptyMessage(focus.surface) };
  }
  return { kind: 'task', surface: focus.surface, task };
}

export function selectTask(
  state: FocusState,
  surface: FocusSurface,
  taskId: string,
  selectedBy: Extract<TaskFocus, { kind: 'task' }>['selectedBy'] = 'user',
): FocusState {
  return withSurfaceFocus(state, surface, focusTask(surface, taskId, selectedBy), surface);
}

export function changeSurface(state: FocusState, surface: FocusSurface): FocusState {
  return { ...state, currentSurface: surface };
}

export function applyTaskCreated(state: FocusState, task: Task): FocusState {
  const pendingFocus = state.bySurface.pending;
  if (pendingFocus.kind === 'none') {
    return withSurfaceFocus(state, 'pending', focusTask('pending', task.task_id, 'startup'));
  }
  return state;
}

export function applyTaskCompleted(
  state: FocusState,
  taskId: string,
  lastKnownTask?: Task,
): FocusState {
  const pendingFocus = state.bySurface.pending;
  if (pendingFocus.kind !== 'task' || pendingFocus.taskId !== taskId || !lastKnownTask) {
    return state;
  }
  return withSurfaceFocus(
    state,
    'pending',
    staleFocus(pendingFocus, lastKnownTask, 'completed_elsewhere'),
  );
}

export function applyTaskCompletedLocally(
  state: FocusState,
  taskId: string,
  remainingPending: Task[],
): FocusState {
  const pendingFocus = state.bySurface.pending;
  if (pendingFocus.kind !== 'task' || pendingFocus.taskId !== taskId) {
    return state;
  }
  const nextPending = remainingPending.find((task) => task.task_id !== taskId);
  return withSurfaceFocus(
    state,
    'pending',
    nextPending ? focusTask('pending', nextPending.task_id, 'post_completion') : none('pending'),
  );
}

export function applyTaskCancelled(
  state: FocusState,
  event: Extract<TaskEvent, { type: 'task_cancelled' }>,
  lastKnownTask?: Task,
): FocusState {
  const pendingFocus = state.bySurface.pending;
  if (pendingFocus.kind !== 'task' || pendingFocus.taskId !== event.task_id || !lastKnownTask) {
    return state;
  }
  return withSurfaceFocus(
    state,
    'pending',
    staleFocus(
      pendingFocus,
      lastKnownTask,
      event.cancel_reason === 'superseded_by_new_task' ? 'superseded' : 'cancelled',
      event.replacement_task_id,
    ),
  );
}

export function applyArchiveResult(
  state: FocusState,
  taskIds: string[],
  lastKnownTasks: Map<string, Task>,
): FocusState {
  const historyFocus = state.bySurface.history;
  if (historyFocus.kind !== 'task' || !taskIds.includes(historyFocus.taskId)) {
    return state;
  }
  const lastKnownTask = lastKnownTasks.get(historyFocus.taskId);
  if (!lastKnownTask) {
    return state;
  }
  return withSurfaceFocus(state, 'history', staleFocus(historyFocus, lastKnownTask, 'archived'));
}

export function applyRestoreResult(
  state: FocusState,
  taskIds: string[],
  lastKnownTasks: Map<string, Task>,
): FocusState {
  const archivedFocus = state.bySurface.archived;
  if (archivedFocus.kind !== 'task' || !taskIds.includes(archivedFocus.taskId)) {
    return state;
  }
  const lastKnownTask = lastKnownTasks.get(archivedFocus.taskId);
  if (!lastKnownTask) {
    return state;
  }
  return withSurfaceFocus(
    state,
    'archived',
    staleFocus(archivedFocus, lastKnownTask, 'unarchived'),
  );
}

function emptyMessage(surface: FocusSurface) {
  if (surface === 'pending') {
    return 'Select a task to read its Markdown content.';
  }
  if (surface === 'archived') {
    return 'Select an archived task to read its Markdown content.';
  }
  return 'Select a history task to read its Markdown content.';
}
