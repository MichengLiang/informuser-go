import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { task } from '../../test/fixtures';
import { ReplyPanel } from './ReplyPanel';

describe('ReplyPanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads and persists per-task drafts before submitting', async () => {
    const currentTask = task();
    localStorage.setItem('askuser.drafts.task-1', 'saved draft');
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ReplyPanel
        task={currentTask}
        suffixEnabled={false}
        suffix=""
        onSuffixEnabledChange={vi.fn()}
        onSuffixChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const textarea = screen.getByPlaceholderText('Write a reply...');
    expect(textarea).toHaveValue('saved draft');

    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'fresh reply');
    expect(localStorage.getItem('askuser.drafts.task-1')).toBe('fresh reply');

    await userEvent.click(screen.getByRole('button', { name: /submit reply/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(currentTask, 'fresh reply', 'reply_panel'),
    );
    expect(localStorage.getItem('askuser.drafts.task-1')).toBeNull();
  });

  it('submits with ctrl-enter and guards empty or missing tasks', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ReplyPanel
        task={task()}
        suffixEnabled={false}
        suffix=""
        onSuffixEnabledChange={vi.fn()}
        onSuffixChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const textarea = screen.getByPlaceholderText('Write a reply...');
    await userEvent.type(textarea, 'keyboard reply');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });

  it('disables submit when no pending task is selected', () => {
    render(
      <ReplyPanel
        suffixEnabled={false}
        suffix=""
        onSuffixEnabledChange={vi.fn()}
        onSuffixChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('Select a pending task')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Write a reply...')).toBeDisabled();
    expect(screen.getByRole('button', { name: /submit reply/i })).toBeDisabled();
  });

  it('updates suffix settings through the popover', async () => {
    const onSuffixEnabledChange = vi.fn();
    const onSuffixChange = vi.fn();
    render(
      <ReplyPanel
        task={task()}
        suffixEnabled={false}
        suffix=""
        onSuffixEnabledChange={onSuffixEnabledChange}
        onSuffixChange={onSuffixChange}
        onSubmit={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTitle('Reply settings'));
    await userEvent.click(screen.getByLabelText('Auto-append suffix'));
    await userEvent.type(screen.getByPlaceholderText('Text appended after each reply'), 'note');

    expect(onSuffixEnabledChange).toHaveBeenCalledWith(true);
    expect(onSuffixChange).toHaveBeenLastCalledWith('e');
  });

  it('calls onClose when the close button is shown', async () => {
    const onClose = vi.fn();
    render(
      <ReplyPanel
        task={task()}
        suffixEnabled={false}
        suffix=""
        onSuffixEnabledChange={vi.fn()}
        onSuffixChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );

    await userEvent.click(screen.getByTitle('Close reply panel'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
