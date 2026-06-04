import type { Task } from './api';

export function formatTasksAsXML(tasks: Task[]) {
  return tasks
    .slice()
    .sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''))
    .map((task, index) => {
      const id = index + 1;
      return `<Assistant id="${id}">\n${task.markdown}\n</Assistant>\n\n<User id="${id}">\n${
        task.user_input ?? ''
      }\n</User>`;
    })
    .join('\n\n');
}
