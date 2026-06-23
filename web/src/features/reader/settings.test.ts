import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultReaderSettings,
  legacyMarkdownSettingsKey,
  loadReaderSettings,
  readerSettingsKey,
  saveReaderSettings,
} from './settings';

describe('reader settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns and writes defaults when no stored settings exist', () => {
    expect(loadReaderSettings()).toEqual(defaultReaderSettings);
    expect(JSON.parse(localStorage.getItem(readerSettingsKey) ?? '{}')).toEqual(
      defaultReaderSettings,
    );
  });

  it('returns valid reader settings', () => {
    const stored = {
      defaultLanguage: 'asciidoc',
      fontSize: 18,
      lineHeight: 'relaxed',
      contentWidth: 'narrow',
    };
    localStorage.setItem(readerSettingsKey, JSON.stringify(stored));

    expect(loadReaderSettings()).toEqual(stored);
  });

  it('deletes invalid reader settings', () => {
    localStorage.setItem(readerSettingsKey, JSON.stringify({ defaultLanguage: 'auto' }));

    expect(loadReaderSettings()).toEqual(defaultReaderSettings);
    expect(JSON.parse(localStorage.getItem(readerSettingsKey) ?? '{}')).toEqual(
      defaultReaderSettings,
    );
  });

  it('migrates valid legacy markdown settings without raw', () => {
    localStorage.setItem(
      legacyMarkdownSettingsKey,
      JSON.stringify({
        fontSize: 19,
        lineHeight: 'compact',
        contentWidth: 'full',
        raw: true,
      }),
    );

    const settings = loadReaderSettings();

    expect(settings).toEqual({
      defaultLanguage: 'markdown',
      fontSize: 19,
      lineHeight: 'compact',
      contentWidth: 'full',
    });
    expect(settings).not.toHaveProperty('raw');
    expect(localStorage.getItem(legacyMarkdownSettingsKey)).toBeNull();
  });

  it('deletes both invalid keys and writes defaults', () => {
    localStorage.setItem(readerSettingsKey, '{');
    localStorage.setItem(legacyMarkdownSettingsKey, JSON.stringify({ fontSize: 19, raw: true }));

    expect(loadReaderSettings()).toEqual(defaultReaderSettings);
    expect(localStorage.getItem(legacyMarkdownSettingsKey)).toBeNull();
    expect(JSON.parse(localStorage.getItem(readerSettingsKey) ?? '{}')).toEqual(
      defaultReaderSettings,
    );
  });

  it('saveReaderSettings writes only the new key', () => {
    localStorage.setItem(legacyMarkdownSettingsKey, JSON.stringify({ keep: true }));
    const settings = { ...defaultReaderSettings, defaultLanguage: 'asciidoc' as const };

    saveReaderSettings(settings);

    expect(JSON.parse(localStorage.getItem(readerSettingsKey) ?? '{}')).toEqual(settings);
    expect(localStorage.getItem(legacyMarkdownSettingsKey)).toEqual('{"keep":true}');
  });
});
