import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { task } from '../../test/fixtures';
import { TaskList } from './TaskList';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
    getScrollElement,
  }: {
    count: number;
    estimateSize: () => number;
    getScrollElement: () => Element | null;
  }) => {
    getScrollElement();
    return {
      getTotalSize: () => count * estimateSize(),
      getVirtualItems: () =>
        Array.from({ length: count }, (_, index) => ({
          index,
          start: index * estimateSize(),
        })),
    };
  },
}));

describe('TaskList', () => {
  it('renders pending tasks and sends quick paste replies', async () => {
    const currentTask = task();
    const onSelectTask = vi.fn();
    const onQuickReply = vi.fn().mockResolvedValue(undefined);

    render(
      <TaskList
        tasks={[currentTask]}
        activeTaskId="task-1"
        mode="pending"
        selectedHistoryIds={new Set()}
        onSelectTask={onSelectTask}
        onQuickReply={onQuickReply}
        onToggleHistorySelection={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /need review/i }));
    expect(onSelectTask).toHaveBeenCalledWith(currentTask);

    fireEvent.paste(screen.getByPlaceholderText('Paste here to send'), {
      clipboardData: { getData: () => 'quick reply' },
    });
    await waitFor(() => expect(onQuickReply).toHaveBeenCalledWith(currentTask, 'quick reply'));
  });

  it('renders history selection without quick paste controls', async () => {
    const currentTask = task({ status: 'completed', completed_at: '2026-06-05T02:00:00Z' });
    const onSelectTask = vi.fn();
    const onToggleHistorySelection = vi.fn();

    render(
      <TaskList
        tasks={[currentTask]}
        activeTaskId="task-1"
        mode="history"
        selectedHistoryIds={new Set(['task-1'])}
        onSelectTask={onSelectTask}
        onQuickReply={vi.fn()}
        onToggleHistorySelection={onToggleHistorySelection}
      />,
    );

    expect(screen.queryByPlaceholderText('Paste here to send')).not.toBeInTheDocument();
    const checkbox = screen.getByLabelText('Select history item');
    expect(checkbox).toBeChecked();

    await userEvent.click(checkbox);
    expect(onToggleHistorySelection).toHaveBeenCalledWith('task-1');
    expect(onSelectTask).toHaveBeenCalledWith(currentTask);
  });

  it('renders mode-specific empty states', () => {
    const props = {
      tasks: [],
      selectedHistoryIds: new Set<string>(),
      onSelectTask: vi.fn(),
      onQuickReply: vi.fn(),
      onToggleHistorySelection: vi.fn(),
    };

    const { rerender } = render(<TaskList {...props} mode="pending" />);
    expect(screen.getByText('No pending tasks')).toBeInTheDocument();

    rerender(<TaskList {...props} mode="history" />);
    expect(screen.getByText('No completed tasks')).toBeInTheDocument();
  });
});
