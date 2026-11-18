/**
 * Sessim: recolor do roxo da casa na cor de destaque (office/accentRecolor.ts).
 *
 * Run with: npm test
 */
/* eslint-disable pixel-agents/no-inline-colors -- cores reais dos PNGs sob teste, não UI */

import { afterEach, describe, expect, it } from 'vitest';

import { applyAccentTheme } from '../src/accentTheme.js';
import { ACCENT_GREEN_DEVSTART, ACCENT_RECOLOR_SOURCE_PURPLE } from '../src/constants.js';
import {
  isAccentPurple,
  recolorHexForAccent,
  recolorSpriteForAccent,
} from '../src/office/accentRecolor.js';
import { getAccentRecoloredSprite, getColorizedSprite } from '../src/office/colorize.js';
import { getCharacterSprites, setCharacterTemplates } from '../src/office/sprites/spriteData.js';
import type { SpriteData } from '../src/office/types.js';
import { Direction } from '../src/office/types.js';

afterEach(() => {
  applyAccentTheme('purple');
});

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function hsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function luma(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Cores reais dos PNGs da casa (levantadas em webview-ui/public/assets e no pacote TECH). */
const PURPLE_TECH_BORDER = '#8b5cf6'; // borda das mesas/cadeiras TECH (violet-500)
const PURPLE_NEON = '#a866ff'; // letreiros </>, raio, power
const PURPLE_NEON_GLOW = '#ece0ff'; // brilho dos letreiros
const PURPLE_CARPET_ACCENT = '#7a25e4'; // tapete do usuário (h266 s78 l52)
const PURPLE_FLOOR_GRAY = '#3f3d4d'; // chão colorizado h250 s12 (sala de estar)

const KEEP = {
  cinzaAzulado: '#2c2e3c', // tampo das mesas TECH (h233)
  pretoAzulado: '#0e0e12', // vaso das plantas TECH (h240, croma 4)
  telaCiano: '#3b82f6', // monitor ligado (h217)
  planta: '#4caf50',
  madeira: '#8b5a2b',
  cinza: '#808080',
  magenta: '#d946ef', // >295, fora da faixa
  azulPuro: '#6060a0', // parede padrão do editor (h240 s25)
};

describe('accentRecolor: faixa de cor', () => {
  it('reconhece os roxos reais da casa', () => {
    for (const hex of [
      PURPLE_TECH_BORDER,
      PURPLE_NEON,
      PURPLE_NEON_GLOW,
      PURPLE_CARPET_ACCENT,
      PURPLE_FLOOR_GRAY,
    ]) {
      expect(isAccentPurple(hex), hex).toBe(true);
    }
  });

  it('ignora cinzas, azuis de tela, plantas, madeira e magenta', () => {
    for (const hex of Object.values(KEEP)) {
      expect(isAccentPurple(hex), hex).toBe(false);
    }
  });
});

describe('accentRecolor: tema roxo é identidade', () => {
  it('não muda nenhum pixel e devolve a mesma referência do sprite', () => {
    const sprite: SpriteData = [
      [PURPLE_TECH_BORDER, ''],
      [KEEP.planta, PURPLE_NEON],
    ];
    expect(recolorSpriteForAccent(sprite)).toBe(sprite);
    expect(recolorHexForAccent(PURPLE_TECH_BORDER)).toBe(PURPLE_TECH_BORDER);
    expect(getAccentRecoloredSprite('t-identidade', sprite)).toBe(sprite);
  });
});

describe('accentRecolor: tema verde', () => {
  it('o roxo de referência cai exatamente no verde DevStart', () => {
    applyAccentTheme('green');
    expect(recolorHexForAccent(ACCENT_RECOLOR_SOURCE_PURPLE).toLowerCase()).toBe(
      ACCENT_GREEN_DEVSTART.accent,
    );
  });

  it('os outros roxos ficam no matiz verde, com luminosidade relativa preservada', () => {
    applyAccentTheme('green');
    const [targetHue] = hsl(ACCENT_GREEN_DEVSTART.accent);
    // Curva gama de luminância calibrada nos dois tons de referência.
    const gamma =
      Math.log(luma(ACCENT_GREEN_DEVSTART.accent)) / Math.log(luma(ACCENT_RECOLOR_SOURCE_PURPLE));
    const neon = recolorHexForAccent(PURPLE_NEON);
    const glow = recolorHexForAccent(PURPLE_NEON_GLOW);
    const carpet = recolorHexForAccent(PURPLE_CARPET_ACCENT);
    const floor = recolorHexForAccent(PURPLE_FLOOR_GRAY);
    for (const [src, out] of [
      [PURPLE_NEON, neon],
      [PURPLE_NEON_GLOW, glow],
      [PURPLE_CARPET_ACCENT, carpet],
      [PURPLE_FLOOR_GRAY, floor],
    ] as const) {
      const [h, s] = hsl(out);
      expect(Math.abs(h - targetHue), `${src} → ${out}`).toBeLessThan(20);
      expect(s, `${src} → ${out}`).toBeGreaterThan(0.05);
      // Luminância segue a curva gama (≈2% de folga para o arredondamento).
      expect(Math.abs(luma(out) - Math.pow(luma(src), gamma)), `${src} → ${out}`).toBeLessThan(
        0.02,
      );
    }
    // O brilho do neon continua quase branco, mas esverdeado, não branco puro.
    expect(luma(glow)).toBeGreaterThan(0.9);
    expect(luma(glow)).toBeLessThan(0.99);
    // Sombreamento relativo: brilho do neon > neon > borda > tapete > chão.
    expect(luma(glow)).toBeGreaterThan(luma(neon));
    expect(luma(neon)).toBeGreaterThan(luma(recolorHexForAccent(PURPLE_TECH_BORDER)));
    expect(luma(recolorHexForAccent(PURPLE_TECH_BORDER))).toBeGreaterThan(luma(carpet));
    expect(luma(carpet)).toBeGreaterThan(luma(floor));
  });

  it('o que não é roxo fica igual, e o alpha é preservado', () => {
    applyAccentTheme('green');
    for (const hex of Object.values(KEEP)) {
      expect(recolorHexForAccent(hex), hex).toBe(hex);
    }
    expect(recolorHexForAccent(`${KEEP.cinzaAzulado}80`)).toBe(`${KEEP.cinzaAzulado}80`);
    const semi = recolorHexForAccent(`${PURPLE_TECH_BORDER}80`);
    expect(semi).toHaveLength(9);
    expect(semi.slice(7)).toBe('80');
    expect(semi.slice(0, 7).toLowerCase()).toBe(ACCENT_GREEN_DEVSTART.accent);
  });

  it('recolore o sprite pixel a pixel mantendo transparência e forma', () => {
    applyAccentTheme('green');
    const sprite: SpriteData = [
      [PURPLE_TECH_BORDER, '', KEEP.planta],
      [KEEP.pretoAzulado, PURPLE_NEON, ''],
    ];
    const out = recolorSpriteForAccent(sprite);
    expect(out).not.toBe(sprite);
    expect(out[0][1]).toBe('');
    expect(out[1][2]).toBe('');
    expect(out[0][2]).toBe(KEEP.planta);
    expect(out[1][0]).toBe(KEEP.pretoAzulado);
    expect(out[0][0].toLowerCase()).toBe(ACCENT_GREEN_DEVSTART.accent);
    expect(isAccentPurple(out[1][1])).toBe(false);
  });
});

describe('accentRecolor: personagens ficam fora', () => {
  it('sprites de personagem são idênticos nos dois temas, mesmo com roxo e hue shift', () => {
    const frame = (px: string): SpriteData => [
      [px, PURPLE_NEON],
      [KEEP.planta, ''],
    ];
    const frames = Array.from({ length: 16 }, () => frame(PURPLE_TECH_BORDER));
    const template = { down: frames, up: frames, right: frames };

    setCharacterTemplates([template]);
    const purple = [getCharacterSprites(0, 0), getCharacterSprites(0, 30)];

    applyAccentTheme('green');
    setCharacterTemplates([template]); // limpa o cache interno: nada mascara a diferença
    const green = [getCharacterSprites(0, 0), getCharacterSprites(0, 30)];

    expect(JSON.stringify(green)).toBe(JSON.stringify(purple));
    expect(green[0].walk[Direction.DOWN][0][0][0]).toBe(PURPLE_TECH_BORDER);
  });
});

describe('accentRecolor: integração com os caches de colorize.ts', () => {
  it('trocar o tema invalida o cache e volta ao original no roxo', () => {
    const sprite: SpriteData = [[PURPLE_TECH_BORDER, KEEP.cinzaAzulado]];
    const key = 't-cache-furn';
    expect(getAccentRecoloredSprite(key, sprite)).toBe(sprite);

    applyAccentTheme('green');
    const green = getAccentRecoloredSprite(key, sprite);
    expect(green).not.toBe(sprite);
    expect(green[0][0].toLowerCase()).toBe(ACCENT_GREEN_DEVSTART.accent);
    expect(green[0][1]).toBe(KEEP.cinzaAzulado);
    // Mesma chave, mesmo tema: vem do cache.
    expect(getAccentRecoloredSprite(key, sprite)).toBe(green);

    applyAccentTheme('purple');
    expect(getAccentRecoloredSprite(key, sprite)).toBe(sprite);
  });

  it('o chão colorizado em roxo (modo colorize) sai verde só no tema verde', () => {
    const gray: SpriteData = [['#808080', '#a0a0a0']];
    const roxo = { h: 250, s: 40, b: -20, c: 0, colorize: true };

    const purpleOut = getColorizedSprite('t-floor-roxo', gray, roxo);
    expect(isAccentPurple(purpleOut[0][0])).toBe(true);

    applyAccentTheme('green');
    const greenOut = getColorizedSprite('t-floor-roxo', gray, roxo);
    expect(greenOut).not.toBe(purpleOut);
    for (const px of greenOut[0]) expect(isAccentPurple(px)).toBe(false);
    const [h0] = hsl(greenOut[0][0]);
    expect(Math.abs(h0 - hsl(ACCENT_GREEN_DEVSTART.accent)[0])).toBeLessThan(20);
    // Pixel mais claro continua mais claro.
    expect(luma(greenOut[0][1])).toBeGreaterThan(luma(greenOut[0][0]));
  });
});
