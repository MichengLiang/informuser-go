import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { ArrowRight, Check, ClipboardCopy, MessageSquareReply } from 'lucide-react';
import { type CSSProperties, useCallback, useState } from 'react';
import { AsciiDocRenderer } from './AsciiDocRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ReaderLanguageControl } from './ReaderLanguageControl';
import { ReaderRenderBoundary } from './ReaderRenderBoundary';
import { ReaderSettingsDialog } from './ReaderSettingsDialog';
import type { MarkupLanguage, ReaderProjection, ReaderSettings } from './types';

type MessageReaderProps = {
  source: string;
  taskId?: string;
  userInput?: string;
  canReply?: boolean;
  statusMessage?: string;
  settings: ReaderSettings;
  effectiveLanguage: MarkupLanguage;
  projection: ReaderProjection;
  hasLanguageOverride: boolean;
  onSettingsChange: (settings: ReaderSettings) => void;
  onLanguageOverrideChange: (taskId: string, language: MarkupLanguage) => void;
  onProjectionChange: (projection: ReaderProjection) => void;
  onOpenReply?: () => void;
  onOpenReplacement?: () => void;
  onCopySource?: (source: string) => Promise<void>;
};

const lineHeightMap: Record<ReaderSettings['lineHeight'], number> = {
  compact: 1.45,
  normal: 1.7,
  relaxed: 1.95,
};

function subtitleFor(
  projection: ReaderProjection,
  effectiveLanguage: MarkupLanguage,
  hasLanguageOverride: boolean,
) {
  if (projection === 'source') {
    return 'Source';
  }
  const languageLabel = effectiveLanguage === 'markdown' ? 'Markdown' : 'AsciiDoc';
  return `Rendered as ${languageLabel}${hasLanguageOverride ? ' · Temporary' : ''}`;
}

export function MessageReader({
  source,
  taskId,
  userInput,
  canReply = false,
  statusMessage,
  settings,
  effectiveLanguage,
  projection,
  hasLanguageOverride,
  onSettingsChange,
  onLanguageOverrideChange,
  onProjectionChange,
  onOpenReply,
  onOpenReplacement,
  onCopySource,
}: MessageReaderProps) {
  const [copied, setCopied] = useState(false);
  const renderKey = `${projection}:${effectiveLanguage}:${source}`;
  const [renderError, setRenderError] = useState<{ key: string; message: string }>();
  const activeRenderError = renderError?.key === renderKey ? renderError.message : undefined;
  const style = {
    '--reader-font-size': `${settings.fontSize}px`,
    '--reader-line-height': lineHeightMap[settings.lineHeight],
  } as CSSProperties;

  const renderAsciiDocError = useCallback(
    (message: string) => {
      setRenderError({ key: renderKey, message: `AsciiDoc render failed: ${message}` });
    },
    [renderKey],
  );

  const renderMarkdownError = useCallback(
    (message: string) => {
      setRenderError({ key: renderKey, message: `Markdown render failed: ${message}` });
    },
    [renderKey],
  );

  const sourceProjection = (
    <pre className="source-reader" style={style}>
      {source}
    </pre>
  );

  const projectionContent =
    projection === 'source' || activeRenderError ? (
      sourceProjection
    ) : (
      <ReaderRenderBoundary
        fallback={sourceProjection}
        onRenderError={effectiveLanguage === 'markdown' ? renderMarkdownError : renderAsciiDocError}
        resetKey={renderKey}
      >
        {effectiveLanguage === 'markdown' ? (
          <MarkdownRenderer source={source} style={style} />
        ) : (
          <div style={style}>
            <AsciiDocRenderer source={source} onRenderError={renderAsciiDocError} />
          </div>
        )}
      </ReaderRenderBoundary>
    );

  return (
    <section className="reader">
      <div className="reader-toolbar">
        <div className="reader-title">
          <strong>Task detail</strong>
          <span>{subtitleFor(projection, effectiveLanguage, hasLanguageOverride)}</span>
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
          {onCopySource ? (
            <button
              type="button"
              className="tool-button"
              onClick={async () => {
                try {
                  await onCopySource(source);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                } catch {
                  setCopied(false);
                }
              }}
              title="Copy source"
            >
              {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}
              {copied ? 'Copied' : 'Copy source'}
            </button>
          ) : null}
          <ReaderLanguageControl
            effectiveLanguage={effectiveLanguage}
            hasLanguageOverride={hasLanguageOverride}
            onLanguageChange={(language) => {
              if (taskId) {
                onLanguageOverrideChange(taskId, language);
              }
            }}
          />
          <ToggleGroup.Root
            type="single"
            value={projection}
            onValueChange={(value) => {
              if (value === 'rendered' || value === 'source') {
                setRenderError(undefined);
                onProjectionChange(value);
              }
            }}
            className="segmented-control"
            aria-label="Reader projection"
          >
            <ToggleGroup.Item className="segmented-control-item" value="rendered">
              Rendered
            </ToggleGroup.Item>
            <ToggleGroup.Item className="segmented-control-item" value="source">
              Source
            </ToggleGroup.Item>
          </ToggleGroup.Root>
          <ReaderSettingsDialog settings={settings} onSettingsChange={onSettingsChange} />
        </div>
      </div>

      <div className={`reader-scroll reader-width-${settings.contentWidth}`}>
        {statusMessage || activeRenderError ? (
          <div className="reader-status-banner">
            <span>{activeRenderError ?? statusMessage}</span>
            {onOpenReplacement && !activeRenderError ? (
              <button type="button" className="tool-button" onClick={onOpenReplacement}>
                <ArrowRight size={16} />
                Open replacement
              </button>
            ) : null}
          </div>
        ) : null}
        {projectionContent}
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
