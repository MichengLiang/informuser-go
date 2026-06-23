export type MarkupLanguage = 'markdown' | 'asciidoc';

export type ReaderProjection = 'rendered' | 'source';

export type ReaderWidth = 'full' | 'reading' | 'narrow';

export type ReaderLineHeight = 'compact' | 'normal' | 'relaxed';

export type ReaderSettings = {
  defaultLanguage: MarkupLanguage;
  fontSize: number;
  lineHeight: ReaderLineHeight;
  contentWidth: ReaderWidth;
};

export type ReaderLanguageOverrides = Record<string, MarkupLanguage>;
