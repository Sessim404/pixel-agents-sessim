/**
 * Sessim: cor de destaque da interface (roxo original / verde DevStart).
 *
 * Run with: npm test
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  ACCENT_THEMES,
  accentBright,
  applyAccentTheme,
  getAccentTheme,
  onAccentThemeChange,
  terminalTheme,
} from '../src/accentTheme.js';
import {
  ACCENT_GREEN_DEVSTART,
  TERMINAL_THEME,
  TRACK_DEFAULT_COLOR,
} from '../src/constants.js';

afterEach(() => {
  applyAccentTheme('purple');
});

describe('accentTheme', () => {
  it('o verde DevStart usa os tokens do site (constants.ts)', () => {
    expect(ACCENT_THEMES.green).toMatchObject(ACCENT_GREEN_DEVSTART);
    expect(ACCENT_THEMES.green.label).toBe('Verde DevStart');
  });

  it('o roxo é o padrão e bate com a cor do quadro e do terminal originais', () => {
    expect(getAccentTheme()).toBe('purple');
    expect(accentBright()).toBe(TRACK_DEFAULT_COLOR);
    expect(terminalTheme()).toEqual(TERMINAL_THEME);
  });

  it('trocar para o verde muda o canvas e o terminal na hora', () => {
    const seen: string[] = [];
    const stop = onAccentThemeChange((t) => seen.push(t));
    expect(applyAccentTheme('green')).toBe('green');
    expect(accentBright()).toBe(ACCENT_GREEN_DEVSTART.bright);
    expect(terminalTheme().cursor).toBe(ACCENT_GREEN_DEVSTART.accent);
    expect(terminalTheme().selectionBackground).toBe(ACCENT_GREEN_DEVSTART.glow);
    expect(seen).toEqual(['green']);
    stop();
    applyAccentTheme('purple');
    expect(seen).toEqual(['green']);
  });

  it('valor desconhecido ou ausente cai no roxo', () => {
    applyAccentTheme('green');
    expect(applyAccentTheme(undefined)).toBe('purple');
    expect(applyAccentTheme('orange')).toBe('purple');
    expect(accentBright()).toBe(TRACK_DEFAULT_COLOR);
  });
});
