/**
 * Sessim: cor de destaque de toda a interface. "Roxo" é o original do Pixel
 * Agents; "Verde DevStart" usa os tokens do site da DevStart em produção.
 *
 * O CSS lê `data-accent` no <html> (index.css redefine as variáveis); o que
 * é desenhado no canvas e o tema do terminal leem daqui.
 */

import { ACCENT_GREEN_DEVSTART, ACCENT_PURPLE, TERMINAL_THEME } from './constants.js';

export type AccentTheme = 'purple' | 'green';

export interface AccentTokens {
  /** Nome mostrado no menu Settings. */
  label: string;
  /** Destaque forte (botões, bordas). */
  accent: string;
  /** Destaque claro (hover, títulos, barra padrão do quadro). */
  bright: string;
  /** Brilho translúcido (seleção do terminal). */
  glow: string;
}

export const ACCENT_THEMES: Record<AccentTheme, AccentTokens> = {
  purple: { label: 'Roxo', ...ACCENT_PURPLE },
  green: { label: 'Verde DevStart', ...ACCENT_GREEN_DEVSTART },
};

export const DEFAULT_ACCENT_THEME: AccentTheme = 'purple';

export function isAccentTheme(v: unknown): v is AccentTheme {
  return v === 'purple' || v === 'green';
}

let current: AccentTheme = DEFAULT_ACCENT_THEME;
const listeners = new Set<(theme: AccentTheme) => void>();

export function getAccentTheme(): AccentTheme {
  return current;
}

/** Tokens do tema atual. */
export function accentTokens(): AccentTokens {
  return ACCENT_THEMES[current];
}

/** Cor clara de destaque, para o canvas (quadro de progresso). */
export function accentBright(): string {
  return ACCENT_THEMES[current].bright;
}

/** Tema do xterm com o cursor e a seleção na cor de destaque atual. */
export function terminalTheme(): { [K in keyof typeof TERMINAL_THEME]: string } {
  const t = ACCENT_THEMES[current];
  return { ...TERMINAL_THEME, cursor: t.accent, selectionBackground: t.glow };
}

/** `document` sem depender da lib DOM (os testes rodam em Node). */
function htmlDataset(): Record<string, string | undefined> | null {
  const doc = (
    globalThis as {
      document?: { documentElement?: { dataset?: Record<string, string | undefined> } };
    }
  ).document;
  return doc?.documentElement?.dataset ?? null;
}

/**
 * Aplica o tema na hora: marca o <html> (o CSS troca as variáveis) e avisa
 * quem desenha fora do React (terminal, caches de sprite). Valor desconhecido
 * cai no padrão. Só avisa quando o tema de fato muda: os ouvintes descartam
 * caches, e o settings chega mais de uma vez com o mesmo valor.
 */
export function applyAccentTheme(theme: unknown): AccentTheme {
  const next = isAccentTheme(theme) ? theme : DEFAULT_ACCENT_THEME;
  const changed = next !== current;
  current = next;
  const dataset = htmlDataset();
  if (dataset) {
    if (next === DEFAULT_ACCENT_THEME) delete dataset.accent;
    else dataset.accent = next;
  }
  if (changed) for (const cb of listeners) cb(next);
  return next;
}

/** Avisa a cada mudança de tema; devolve a função para cancelar. */
export function onAccentThemeChange(cb: (theme: AccentTheme) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
