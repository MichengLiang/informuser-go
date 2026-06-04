import * as Popover from '@radix-ui/react-popover';
import { Check, ClipboardCopy, Eye, MessageSquareReply, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

export type MarkdownSettings = {
  fontSize: number;
  lineHeight: 'compact' | 'normal' | 'relaxed';
  contentWidth: 'full' | 'reading' | 'narrow';
  raw: boolean;
};

type MarkdownReaderProps = {
  markdown: string;
  userInput?: string;
  canReply?: boolean;
  settings: MarkdownSettings;
  onSettingsChange: (settings: MarkdownSettings) => void;
  onOpenReply?: () => void;
  onCopyMarkdown?: (markdown: string) => Promise<void>;
};

const lineHeightMap: Record<MarkdownSettings['lineHeight'], number> = {
  compact: 1.45,
  normal: 1.7,
  relaxed: 1.95,
};

export function MarkdownReader({
  markdown,
  userInput,
  canReply = false,
  settings,
  onSettingsChange,
  onOpenReply,
  onCopyMarkdown,
}: MarkdownReaderProps) {
  const [copied, setCopied] = useState(false);
  const style = {
    '--reader-font-size': `${settings.fontSize}px`,
    '--reader-line-height': lineHeightMap[settings.lineHeight],
  } as React.CSSProperties;

  return (
    <section className="reader">
      <div className="reader-toolbar">
        <div className="reader-title">
          <strong>Task detail</strong>
          <span>{userInput ? 'Completed conversation' : 'Assistant request'}</span>
        </div>
        <div className="reader-actions">
          {canReply ? (
            <button
              type="button"
              className="tool-button"
              onClick={onOpenReply}
              title="Open reply panel"
            >
              <MessageSquareReply size={16} />
              Reply
            </button>
          ) : null}
          {onCopyMarkdown ? (
            <button
              type="button"
              className="tool-button"
              onClick={async () => {
                await onCopyMarkdown(markdown);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              }}
              title="Copy raw Markdown"
            >
              {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}
              {copied ? 'Copied' : 'Copy Markdown'}
            </button>
          ) : null}
          <button
            type="button"
            className="tool-button"
            onClick={() => onSettingsChange({ ...settings, raw: !settings.raw })}
            title={settings.raw ? 'Show rendered Markdown' : 'Show raw Markdown'}
          >
            <Eye size={16} />
            {settings.raw ? 'Rendered' : 'Raw'}
          </button>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className="tool-button" title="Markdown reading settings">
                <SlidersHorizontal size={16} />
                Reading
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="settings-popover" align="end" sideOffset={8}>
                <label>
                  Font size
                  <input
                    type="range"
                    min="13"
                    max="22"
                    value={settings.fontSize}
                    onChange={(event) =>
                      onSettingsChange({ ...settings, fontSize: Number(event.target.value) })
                    }
                  />
                  <span>{settings.fontSize}px</span>
                </label>
                <label>
                  Line height
                  <select
                    value={settings.lineHeight}
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        lineHeight: event.target.value as MarkdownSettings['lineHeight'],
                      })
                    }
                  >
                    <option value="compact">Compact</option>
                    <option value="normal">Normal</option>
                    <option value="relaxed">Relaxed</option>
                  </select>
                </label>
                <label>
                  Width
                  <select
                    value={settings.contentWidth}
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        contentWidth: event.target.value as MarkdownSettings['contentWidth'],
                      })
                    }
                  >
                    <option value="full">Full</option>
                    <option value="reading">Reading</option>
                    <option value="narrow">Narrow</option>
                  </select>
                </label>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>

      <div className={`reader-scroll reader-width-${settings.contentWidth}`}>
        {settings.raw ? (
          <pre className="raw-markdown" style={style}>
            {markdown}
          </pre>
        ) : (
          <article className="markdown-reader" style={style}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {markdown}
            </ReactMarkdown>
          </article>
        )}
        {userInput ? (
          <section className="history-reply-section">
            <h2>
              <MessageSquareReply size={18} />
              User reply
            </h2>
            <pre className="history-reply-content">{userInput}</pre>
          </section>
        ) : null}
      </div>
    </section>
  );
}
