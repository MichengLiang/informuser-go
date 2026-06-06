export function markCreatedUnread(unread: Set<string>, taskId: string) {
  return new Set([...unread, taskId]);
}

export function clearUnread(unread: Set<string>, taskId: string) {
  const next = new Set(unread);
  next.delete(taskId);
  return next;
}

export function clearRemovedUnread(unread: Set<string>, taskIds: string[]) {
  const removed = new Set(taskIds);
  const next = new Set(unread);
  for (const taskId of next) {
    if (removed.has(taskId)) {
      next.delete(taskId);
    }
  }
  return next;
}
