import * as ToggleGroup from '@radix-ui/react-toggle-group';
import type { MarkupLanguage } from './types';

type ReaderLanguageControlProps = {
  effectiveLanguage: MarkupLanguage;
  hasLanguageOverride: boolean;
  onLanguageChange: (language: MarkupLanguage) => void;
};

export function ReaderLanguageControl({
  effectiveLanguage,
  hasLanguageOverride,
  onLanguageChange,
}: ReaderLanguageControlProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={effectiveLanguage}
      onValueChange={(value) => {
        if (value === 'markdown' || value === 'asciidoc') {
          onLanguageChange(value);
        }
      }}
      className="segmented-control"
      aria-label={`Render language${hasLanguageOverride ? ' temporary override' : ''}`}
    >
      <ToggleGroup.Item className="segmented-control-item" value="markdown" aria-label="Markdown">
        Markdown
      </ToggleGroup.Item>
      <ToggleGroup.Item className="segmented-control-item" value="asciidoc" aria-label="AsciiDoc">
        AsciiDoc
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}
