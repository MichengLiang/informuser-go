import * as Dialog from '@radix-ui/react-dialog';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { SlidersHorizontal, X } from 'lucide-react';
import type { MarkupLanguage, ReaderLineHeight, ReaderSettings, ReaderWidth } from './types';

type ReaderSettingsDialogProps = {
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
};

export function ReaderSettingsDialog({ settings, onSettingsChange }: ReaderSettingsDialogProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="tool-button icon-button" aria-label="Reader settings">
          <SlidersHorizontal size={16} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="reader-dialog-overlay" />
        <Dialog.Content className="reader-dialog-content">
          <div className="reader-dialog-header">
            <Dialog.Title>Reader settings</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="Close reader settings">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <section className="reader-settings-section">
            <h2>Default render language</h2>
            <ToggleGroup.Root
              type="single"
              value={settings.defaultLanguage}
              onValueChange={(value) => {
                if (value === 'markdown' || value === 'asciidoc') {
                  onSettingsChange({ ...settings, defaultLanguage: value as MarkupLanguage });
                }
              }}
              className="segmented-control"
              aria-label="Default render language"
            >
              <ToggleGroup.Item className="segmented-control-item" value="markdown">
                Markdown
              </ToggleGroup.Item>
              <ToggleGroup.Item className="segmented-control-item" value="asciidoc">
                AsciiDoc
              </ToggleGroup.Item>
            </ToggleGroup.Root>
          </section>

          <section className="reader-settings-section">
            <h2>Reading layout</h2>
            <label className="reader-range-label">
              <span>Font size</span>
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
            <div className="reader-setting-row">
              <span>Line height</span>
              <ToggleGroup.Root
                type="single"
                value={settings.lineHeight}
                onValueChange={(value) => {
                  if (value === 'compact' || value === 'normal' || value === 'relaxed') {
                    onSettingsChange({ ...settings, lineHeight: value as ReaderLineHeight });
                  }
                }}
                className="segmented-control"
                aria-label="Line height"
              >
                <ToggleGroup.Item className="segmented-control-item" value="compact">
                  Compact
                </ToggleGroup.Item>
                <ToggleGroup.Item className="segmented-control-item" value="normal">
                  Normal
                </ToggleGroup.Item>
                <ToggleGroup.Item className="segmented-control-item" value="relaxed">
                  Relaxed
                </ToggleGroup.Item>
              </ToggleGroup.Root>
            </div>
            <div className="reader-setting-row">
              <span>Width</span>
              <ToggleGroup.Root
                type="single"
                value={settings.contentWidth}
                onValueChange={(value) => {
                  if (value === 'full' || value === 'reading' || value === 'narrow') {
                    onSettingsChange({ ...settings, contentWidth: value as ReaderWidth });
                  }
                }}
                className="segmented-control"
                aria-label="Width"
              >
                <ToggleGroup.Item className="segmented-control-item" value="full">
                  Full
                </ToggleGroup.Item>
                <ToggleGroup.Item className="segmented-control-item" value="reading">
                  Reading
                </ToggleGroup.Item>
                <ToggleGroup.Item className="segmented-control-item" value="narrow">
                  Narrow
                </ToggleGroup.Item>
              </ToggleGroup.Root>
            </div>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
