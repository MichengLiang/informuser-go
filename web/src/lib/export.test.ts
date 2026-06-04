import { describe, expect, it } from 'vitest';
import { task } from '../test/fixtures';
import { formatTasksAsXML } from './export';

describe('formatTasksAsXML', () => {
  it('formats selected and grouped history exports with completed_at ascending order', () => {
    const newer = task({
      task_id: 'history-2',
      markdown: 'assistant newer',
      status: 'completed',
      completed_at: '2026-06-05T03:00:00Z',
      user_input: 'user newer',
    });
    const older = task({
      task_id: 'history-1',
      markdown: 'assistant older',
      status: 'completed',
      completed_at: '2026-06-05T01:00:00Z',
      user_input: 'user older',
    });

    expect(formatTasksAsXML([newer, older])).toBe(
      '<Assistant id="1">\nassistant older\n</Assistant>\n\n<User id="1">\nuser older\n</User>\n\n<Assistant id="2">\nassistant newer\n</Assistant>\n\n<User id="2">\nuser newer\n</User>',
    );
  });

  it('falls back for tasks without completed_at or user_input', () => {
    expect(
      formatTasksAsXML([
        task({
          task_id: 'history-1',
          markdown: 'assistant only',
          status: 'completed',
          completed_at: undefined,
          user_input: undefined,
        }),
      ]),
    ).toBe('<Assistant id="1">\nassistant only\n</Assistant>\n\n<User id="1">\n\n</User>');
  });
});
