import type { MarkupLanguage, ReaderLanguageOverrides, ReaderSettings } from './types';

export function deriveEffectiveLanguage(
  taskId: string | undefined,
  overrides: ReaderLanguageOverrides,
  settings: ReaderSettings,
): MarkupLanguage {
  return taskId && overrides[taskId] ? overrides[taskId] : settings.defaultLanguage;
}
