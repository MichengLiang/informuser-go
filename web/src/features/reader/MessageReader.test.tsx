import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MessageReader } from './MessageReader';
import type { ReaderSettings } from './types';

vi.mock('./AsciiDocRenderer', () => ({
  AsciiDocRenderer: ({ source, onRenderError }: MockAsciiDocRendererProps) => {
    useEffect(() => {
      if (source === '= Broken') {
        onRenderError?.('conversion failed');
      }
    }, [source, onRenderError]);
    if (source === '= Broken') {
      return null;
    }
    return <article data-testid="mock-asciidoc-renderer">{source}</article>;
  },
}));

type MockAsciiDocRendererProps = {
  source: string;
  onRenderError?: (message: string) => void;
};

const settings: ReaderSettings = {
  defaultLanguage: 'markdown',
  fontSize: 15,
  lineHeight: 'normal',
  contentWidth: 'reading',
};

function renderReader(overrides: Partial<React.ComponentProps<typeof MessageReader>> = {}) {
  const props: React.ComponentProps<typeof MessageReader> = {
    source: '# Source',
    taskId: 'task-1',
    settings,
    effectiveLanguage: 'markdown',
    projection: 'rendered',
    hasLanguageOverride: false,
    onSettingsChange: vi.fn(),
    onLanguageOverrideChange: vi.fn(),
    onProjectionChange: vi.fn(),
    onCopySource: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<MessageReader {...props} />);
  return props;
}

describe('MessageReader', () => {
  it('copies source and never includes user reply', async () => {
    const props = renderReader({
      source: '# Raw source',
      userInput: 'Do not copy',
    });

    await userEvent.click(screen.getByRole('button', { name: /copy source/i }));

    expect(props.onCopySource).toHaveBeenCalledWith('# Raw source');
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  it('writes language overrides only when a task id exists', async () => {
    const props = renderReader();

    await userEvent.click(screen.getByRole('radio', { name: 'AsciiDoc' }));

    expect(props.onLanguageOverrideChange).toHaveBeenCalledWith('task-1', 'asciidoc');

    cleanup();
    const markdownProps = renderReader({ effectiveLanguage: 'asciidoc' });
    await userEvent.click(screen.getByRole('radio', { name: 'Markdown' }));
    expect(markdownProps.onLanguageOverrideChange).toHaveBeenCalledWith('task-1', 'markdown');

    cleanup();
    const withoutTask = renderReader({ taskId: undefined });
    await userEvent.click(screen.getByRole('radio', { name: 'AsciiDoc' }));
    expect(withoutTask.onLanguageOverrideChange).not.toHaveBeenCalled();
  });

  it('changes projection and renders source projection', async () => {
    const props = renderReader({ projection: 'source' });

    expect(document.querySelector('.source-reader')).toHaveTextContent('# Source');
    await userEvent.click(screen.getByRole('radio', { name: 'Rendered' }));

    expect(props.onProjectionChange).toHaveBeenCalledWith('rendered');
  });

  it('uses Markdown and AsciiDoc renderers in rendered projection', () => {
    renderReader({ source: '# Markdown title', effectiveLanguage: 'markdown' });
    expect(screen.getByRole('heading', { name: 'Markdown title' })).toBeInTheDocument();

    renderReader({ source: '= AsciiDoc title', effectiveLanguage: 'asciidoc' });
    expect(screen.getByTestId('mock-asciidoc-renderer')).toHaveTextContent('= AsciiDoc title');
  });

  it('does not keep a render error after source and language change', async () => {
    const { rerender } = render(
      <MessageReader
        source="= Broken"
        taskId="task-1"
        settings={settings}
        effectiveLanguage="asciidoc"
        projection="rendered"
        hasLanguageOverride={false}
        onSettingsChange={vi.fn()}
        onLanguageOverrideChange={vi.fn()}
        onProjectionChange={vi.fn()}
        onCopySource={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText(/AsciiDoc render failed/)).toBeInTheDocument();
    expect(document.querySelector('.source-reader')).toHaveTextContent('= Broken');

    rerender(
      <MessageReader
        source="# Valid"
        taskId="task-2"
        settings={settings}
        effectiveLanguage="markdown"
        projection="rendered"
        hasLanguageOverride={false}
        onSettingsChange={vi.fn()}
        onLanguageOverrideChange={vi.fn()}
        onProjectionChange={vi.fn()}
        onCopySource={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Valid' })).toBeInTheDocument();
    expect(screen.queryByText(/AsciiDoc render failed/)).not.toBeInTheDocument();
    expect(document.querySelector('.source-reader')).not.toBeInTheDocument();
  });

  it('shows user input as plain text', () => {
    renderReader({ userInput: '<strong>plain reply</strong>' });

    expect(screen.getByText('<strong>plain reply</strong>')).toHaveClass('history-reply-content');
  });
});
