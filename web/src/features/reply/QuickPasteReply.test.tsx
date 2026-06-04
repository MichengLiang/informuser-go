import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuickPasteReply } from './QuickPasteReply';

describe('QuickPasteReply', () => {
  it('treats non-empty paste as the reply submit action', () => {
    const onReply = vi.fn().mockResolvedValue(undefined);
    render(<QuickPasteReply disabled={false} onReply={onReply} />);

    fireEvent.paste(screen.getByPlaceholderText('Paste here to send'), {
      clipboardData: { getData: () => 'approved from clipboard' },
    });

    expect(onReply).toHaveBeenCalledWith('approved from clipboard');
  });

  it('ignores blank paste and enter key editing', () => {
    const onReply = vi.fn().mockResolvedValue(undefined);
    render(<QuickPasteReply disabled={false} onReply={onReply} />);
    const textarea = screen.getByPlaceholderText('Paste here to send');

    const paste = fireEvent.paste(textarea, {
      clipboardData: { getData: () => '   ' },
    });
    const enter = fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(paste).toBe(false);
    expect(enter).toBe(false);
    expect(onReply).not.toHaveBeenCalled();
  });

  it('shows the disabled sending state', () => {
    render(<QuickPasteReply disabled={true} onReply={vi.fn()} />);

    expect(screen.getByPlaceholderText('Sending...')).toBeDisabled();
  });
});
