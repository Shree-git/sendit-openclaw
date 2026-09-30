import { en, type MessageKey } from './i18n/en.js';
import { es } from './i18n/es.js';

const LOCALES: Record<string, Record<string, string>> = {
  en: en as Record<string, string>,
  es,
};

/**
 * Translate a message key with optional interpolation.
 *
 * @param key - Dot-notated message key (e.g., "errors.rate_limited")
 * @param vars - Optional interpolation variables (e.g., { path: "/etc/passwd" })
 * @param locale - Locale to use (defaults to "en")
 * @returns Translated string, falling back to English if the key is missing in the current locale
 *
 * @example
 * t("errors.file_not_found", { path: "/tmp/img.png" })
 * // => "File not found at path: /tmp/img.png"
 */
export function t(
  key: MessageKey | string,
  vars?: Record<string, string | number>,
  locale?: string
): string {
  const resolved = locale && LOCALES[locale] ? LOCALES[locale] : LOCALES.en;
  let message = resolved[key] ?? LOCALES.en[key] ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      message = message.replaceAll(`{${k}}`, String(v));
    }
  }

  return message;
}

/**
 * Create a locale-bound translate function.
 * Used for dependency injection so each plugin instance has its own locale.
 */
export function createTranslator(
  locale: string
): (key: MessageKey | string, vars?: Record<string, string | number>) => string {
  const resolvedLocale = LOCALES[locale] ? locale : 'en';
  return (key, vars) => t(key, vars, resolvedLocale);
}

export { type MessageKey };
