/**
 * Sessim: brilho na cor do agente enquanto ele trabalha.
 *
 * Run with: npm test
 */

import { describe, expect, it } from 'vitest';

import {
  SESSIM_COLOR_CONSTRUTOR,
  SESSIM_COLOR_EXPLORADOR,
  SESSIM_WORK_GLOW_ALPHA_MAX,
  SESSIM_WORK_GLOW_ALPHA_MIN,
} from '../src/constants.js';
import { recolorOutline, sessimWorkGlowAlpha } from '../src/office/sessimGlow.js';
import { characterColor, sessionColor } from '../src/sessimRoles.js';

describe('characterColor', () => {
  it('papel conhecido usa a cor do papel', () => {
    expect(
      characterColor({ id: -1, isSubagent: true, parentAgentId: 3, sessimRole: 'construtor' }),
    ).toBe(SESSIM_COLOR_CONSTRUTOR);
  });

  it('sub-agente sem papel usa a cor da sessão-mãe', () => {
    expect(characterColor({ id: -2, isSubagent: true, parentAgentId: 3 })).toBe(sessionColor(3));
  });

  it('sessão usa a própria cor', () => {
    expect(characterColor({ id: 4, isSubagent: false, parentAgentId: null })).toBe(sessionColor(4));
  });
});

describe('recolorOutline', () => {
  it('pinta só os pixels do contorno na cor pedida', () => {
    const white = [
      ['', SESSIM_COLOR_EXPLORADOR, ''],
      [SESSIM_COLOR_EXPLORADOR, '', SESSIM_COLOR_EXPLORADOR],
      ['', SESSIM_COLOR_EXPLORADOR, ''],
    ];
    const colored = recolorOutline(white, SESSIM_COLOR_CONSTRUTOR);
    expect(colored.length).toBe(white.length);
    for (let r = 0; r < white.length; r++) {
      for (let c = 0; c < white[r].length; c++) {
        expect(colored[r][c]).toBe(white[r][c] === '' ? '' : SESSIM_COLOR_CONSTRUTOR);
      }
    }
  });
});

describe('sessimWorkGlowAlpha', () => {
  it('pulsa dentro da faixa', () => {
    for (let t = 0; t < 4; t += 0.05) {
      const a = sessimWorkGlowAlpha(t);
      expect(a).toBeGreaterThanOrEqual(SESSIM_WORK_GLOW_ALPHA_MIN - 1e-9);
      expect(a).toBeLessThanOrEqual(SESSIM_WORK_GLOW_ALPHA_MAX + 1e-9);
    }
  });
});
