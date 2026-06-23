import { describe, expect, it } from 'vitest';
import { deriveEffectiveLanguage } from './language';
import type { ReaderLanguageOverrides, ReaderSettings } from './types';

const settings: ReaderSettings = {
  defaultLanguage: 'markdown',
  fontSize: 15,
  lineHeight: 'normal',
  contentWidth: 'reading',
};

describe('deriveEffectiveLanguage', () => {
  it('uses default language without a task override', () => {
    expect(deriveEffectiveLanguage('task-1', {}, settings)).toBe('markdown');
  });

  it('uses a task override when present', () => {
    expect(deriveEffectiveLanguage('task-1', { 'task-1': 'asciidoc' }, settings)).toBe('asciidoc');
  });

  it('keeps an existing task override when default language changes', () => {
    const overrides: ReaderLanguageOverrides = { 'task-1': 'markdown' };
    expect(
      deriveEffectiveLanguage('task-1', overrides, { ...settings, defaultLanguage: 'asciidoc' }),
    ).toBe('markdown');
  });

  it('does not apply another task id override', () => {
    expect(deriveEffectiveLanguage('task-2', { 'task-1': 'asciidoc' }, settings)).toBe('markdown');
  });
});
