import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownReader, type MarkdownSettings } from './MarkdownReader';

const settings: MarkdownSettings = {
  fontSize: 15,
  lineHeight: 'normal',
  contentWidth: 'reading',
  raw: false,
};

describe('MarkdownReader', () => {
  it('renders sanitized Markdown and toggles raw mode', async () => {
    const onSettingsChange = vi.fn();
    render(
      <MarkdownReader
        markdown={'# Title\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>'}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.queryByText('alert(1)')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /raw/i }));
    expect(onSettingsChange).toHaveBeenCalledWith({ ...settings, raw: true });
  });

  it('changes reading settings through the popover controls', async () => {
    const onSettingsChange = vi.fn();
    render(
      <MarkdownReader markdown="# Title" settings={settings} onSettingsChange={onSettingsChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /reading/i }));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '19' } });
    expect(onSettingsChange).toHaveBeenCalledWith({ ...settings, fontSize: 19 });

    await userEvent.selectOptions(screen.getByLabelText('Line height'), 'relaxed');
    expect(onSettingsChange).toHaveBeenCalledWith({ ...settings, lineHeight: 'relaxed' });

    await userEvent.selectOptions(screen.getByLabelText('Width'), 'narrow');
    expect(onSettingsChange).toHaveBeenCalledWith({ ...settings, contentWidth: 'narrow' });
  });

  it('renders raw Markdown with configured CSS variables', () => {
    render(
      <MarkdownReader
        markdown="# Raw"
        settings={{ ...settings, raw: true, fontSize: 20, lineHeight: 'compact' }}
        onSettingsChange={vi.fn()}
      />,
    );

    const raw = screen.getByText('# Raw');
    expect(raw).toHaveClass('raw-markdown');
    expect(raw).toHaveStyle({ '--reader-font-size': '20px', '--reader-line-height': '1.45' });
  });

  it('shows completed history replies below the assistant Markdown', () => {
    render(
      <MarkdownReader
        markdown="# Assistant request"
        userInput={'User answered here\nwith a second line'}
        settings={settings}
        onSettingsChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Assistant request' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'User reply' })).toBeInTheDocument();
    expect(screen.getByText(/User answered here/)).toHaveClass('history-reply-content');
  });

  it('copies the raw assistant Markdown from the reader toolbar', async () => {
    const onCopyMarkdown = vi.fn().mockResolvedValue(undefined);
    render(
      <MarkdownReader
        markdown={'# Raw source\n\n**Keep this Markdown**'}
        userInput="Do not copy this reply"
        settings={settings}
        onSettingsChange={vi.fn()}
        onCopyMarkdown={onCopyMarkdown}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /copy markdown/i }));

    expect(onCopyMarkdown).toHaveBeenCalledWith('# Raw source\n\n**Keep this Markdown**');
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
  });
});
