import { createContext, useContext } from 'react';
import { DICT } from '../i18n.js';

export const I18nCtx = createContext('es');

export function useI18n() {
  const lang = useContext(I18nCtx) || 'es';
  const d = DICT[lang] || DICT.es;
  return { lang, d, t: (k) => d[k] ?? DICT.es[k] ?? k };
}
