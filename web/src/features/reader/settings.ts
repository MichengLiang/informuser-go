import type { ReaderLineHeight, ReaderSettings, ReaderWidth } from './types';

export const readerSettingsKey = 'askuser.readerSettings';
export const legacyMarkdownSettingsKey = 'askuser.markdownSettings';

export const defaultReaderSettings: ReaderSettings = {
  defaultLanguage: 'markdown',
  fontSize: 15,
  lineHeight: 'normal',
  contentWidth: 'reading',
};

type LegacyMarkdownSettings = {
  fontSize: number;
  lineHeight: ReaderLineHeight;
  contentWidth: ReaderWidth;
  raw: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLineHeight(value: unknown): value is ReaderLineHeight {
  return value === 'compact' || value === 'normal' || value === 'relaxed';
}

function isContentWidth(value: unknown): value is ReaderWidth {
  return value === 'full' || value === 'reading' || value === 'narrow';
}

function isFontSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 13 && value <= 22;
}

function parseJSON(value: string | null): unknown {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function normalizeReaderSettings(value: unknown): ReaderSettings | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.defaultLanguage !== 'markdown' && value.defaultLanguage !== 'asciidoc') {
    return undefined;
  }
  if (
    !isFontSize(value.fontSize) ||
    !isLineHeight(value.lineHeight) ||
    !isContentWidth(value.contentWidth)
  ) {
    return undefined;
  }
  return {
    defaultLanguage: value.defaultLanguage,
    fontSize: value.fontSize,
    lineHeight: value.lineHeight,
    contentWidth: value.contentWidth,
  };
}

function normalizeLegacyMarkdownSettings(value: unknown): LegacyMarkdownSettings | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    !isFontSize(value.fontSize) ||
    !isLineHeight(value.lineHeight) ||
    !isContentWidth(value.contentWidth) ||
    typeof value.raw !== 'boolean'
  ) {
    return undefined;
  }
  return {
    fontSize: value.fontSize,
    lineHeight: value.lineHeight,
    contentWidth: value.contentWidth,
    raw: value.raw,
  };
}

export function loadReaderSettings(): ReaderSettings {
  const storedReaderSettings = localStorage.getItem(readerSettingsKey);
  let settings = normalizeReaderSettings(parseJSON(storedReaderSettings));

  if (storedReaderSettings && !settings) {
    localStorage.removeItem(readerSettingsKey);
  }

  if (!settings) {
    const legacySettings = normalizeLegacyMarkdownSettings(
      parseJSON(localStorage.getItem(legacyMarkdownSettingsKey)),
    );
    if (legacySettings) {
      settings = {
        defaultLanguage: 'markdown',
        fontSize: legacySettings.fontSize,
        lineHeight: legacySettings.lineHeight,
        contentWidth: legacySettings.contentWidth,
      };
      // Legacy raw is not migrated because projection mode is a browser reading posture,
      // not a persistent reader default.
    }
  }

  const normalizedSettings = settings ?? defaultReaderSettings;
  localStorage.setItem(readerSettingsKey, JSON.stringify(normalizedSettings));
  localStorage.removeItem(legacyMarkdownSettingsKey);
  return normalizedSettings;
}

export function saveReaderSettings(settings: ReaderSettings): void {
  localStorage.setItem(readerSettingsKey, JSON.stringify(settings));
}
