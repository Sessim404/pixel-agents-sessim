/**
 * Sessim: recolore o roxo da CASA (chão, parede, tapete, móveis, letreiros) na
 * cor de destaque do tema. É o único ponto de verdade da regra; personagens,
 * sub-agentes e pets não passam por aqui de propósito (spriteData.ts chama
 * adjustSprite direto, sem este módulo).
 *
 * Regra: só pixels na faixa violeta/índigo (matiz 245–290) com saturação e
 * croma mínimos mudam. Ficam iguais: o azul puro (240) dos cinzas escuros dos
 * móveis TECH (#0e0e12, #16161e…), os azuis das telas e dos PCs (~205–235),
 * as plantas, a madeira e o magenta/fúcsia (>290).
 *
 * Mapeamento calibrado para o roxo dos móveis TECH (#8b5cf6, violet-500) cair
 * exatamente no verde do tema (#22c55e): o matiz é deslocado em volta desse
 * centro (metade da variação sobrevive, então o neon 266 fica um pouco mais
 * frio que a mesa 258), a saturação escala na mesma proporção e a luminância
 * percebida (Rec. 601) passa por uma curva gama que fixa preto e branco e
 * leva a luminância do violet-500 na do green-500 — é isso que preserva o
 * sombreamento relativo sem estourar os brilhos. No tema roxo tudo é
 * identidade (mesma referência).
 */

import {
  ACCENT_THEMES,
  type AccentTheme,
  DEFAULT_ACCENT_THEME,
  getAccentTheme,
} from '../accentTheme.js';
import { ACCENT_RECOLOR_SOURCE_PURPLE } from '../constants.js';
import type { SpriteData } from './types.js';

/** Faixa de matiz (graus HSL) tratada como roxo: violeta/índigo até púrpura. */
export const ACCENT_HUE_MIN = 245;
export const ACCENT_HUE_MAX = 290;
/** Saturação HSL mínima (0–1); abaixo disso é cinza, mesmo com matiz roxo. */
export const ACCENT_MIN_SATURATION = 0.1;
/** Croma mínimo (max−min em 0–255); ignora o ruído quase preto, onde o matiz não é confiável. */
export const ACCENT_MIN_CHROMA = 8;
/** Quanto da variação de matiz em volta do roxo central sobrevive (0.5 = metade). */
const HUE_SPREAD = 0.5;

type Rgb = [number, number, number];

interface Calibration {
  srcHue: number;
  dstHue: number;
  satFactor: number;
  /** Expoente da curva gama de luminância: srcLuma^gamma === dstLuma. */
  lumaGamma: number;
}

const calibrations = new Map<AccentTheme, Calibration>();
/** `#RRGGBB[AA]` → resultado, por tema. Os sprites repetem poucas cores. */
const hexCaches = new Map<AccentTheme, Map<string, string>>();

/** Um pixel conta como "roxo da casa"? (independe do tema) */
export function isAccentPurple(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  const [h, s] = rgbToHsl(rgb);
  const chroma = Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
  return (
    h >= ACCENT_HUE_MIN &&
    h <= ACCENT_HUE_MAX &&
    s >= ACCENT_MIN_SATURATION &&
    chroma >= ACCENT_MIN_CHROMA
  );
}

/** Recolore uma cor sólida (`#RRGGBB` ou `#RRGGBBAA`); fora da faixa, devolve igual. */
export function recolorHexForAccent(hex: string, theme: AccentTheme = getAccentTheme()): string {
  if (theme === DEFAULT_ACCENT_THEME || hex === '') return hex;
  let cache = hexCaches.get(theme);
  if (!cache) {
    cache = new Map();
    hexCaches.set(theme, cache);
  }
  const cached = cache.get(hex);
  if (cached !== undefined) return cached;
  const out = isAccentPurple(hex) ? remapHex(hex, calibration(theme)) : hex;
  cache.set(hex, out);
  return out;
}

/**
 * Recolore um sprite inteiro. No tema padrão devolve a MESMA referência (sem
 * custo e sem invalidar o cache de canvas por sprite).
 */
export function recolorSpriteForAccent(
  sprite: SpriteData,
  theme: AccentTheme = getAccentTheme(),
): SpriteData {
  if (theme === DEFAULT_ACCENT_THEME) return sprite;
  return sprite.map((row) =>
    row.map((pixel) => (pixel === '' ? '' : recolorHexForAccent(pixel, theme))),
  );
}

// ── Calibração ───────────────────────────────────────────────

function calibration(theme: AccentTheme): Calibration {
  let c = calibrations.get(theme);
  if (c) return c;
  const src = parseHex(ACCENT_RECOLOR_SOURCE_PURPLE);
  const dst = parseHex(ACCENT_THEMES[theme].accent);
  if (!src || !dst) throw new Error('accentRecolor: cor de calibração inválida');
  const [srcHue, srcSat] = rgbToHsl(src);
  const [dstHue, dstSat] = rgbToHsl(dst);
  const srcLuma = luma(src);
  const dstLuma = luma(dst);
  const gammaOk = srcLuma > 0 && srcLuma < 1 && dstLuma > 0 && dstLuma < 1;
  c = {
    srcHue,
    dstHue,
    satFactor: srcSat > 0 ? dstSat / srcSat : 1,
    lumaGamma: gammaOk ? Math.log(dstLuma) / Math.log(srcLuma) : 1,
  };
  calibrations.set(theme, c);
  return c;
}

function remapHex(hex: string, cal: Calibration): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [h, s] = rgbToHsl(rgb);
  const newH = (((cal.dstHue + (h - cal.srcHue) * HUE_SPREAD) % 360) + 360) % 360;
  const newS = clamp01(s * cal.satFactor);
  const targetLuma = clamp01(Math.pow(luma(rgb), cal.lumaGamma));
  const newL = lightnessForLuma(newH, newS, targetLuma);
  return formatHex(hslToRgb(newH, newS, newL)) + hex.slice(7).toUpperCase();
}

/**
 * Lightness HSL que, com este matiz e saturação, dá a luminância pedida.
 * A luminância cresce monotonicamente com a lightness, então basta bissecção.
 */
function lightnessForLuma(h: number, s: number, target: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (luma(hslToRgb(h, s, mid)) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Conversões (locais para não criar ciclo com colorize.ts) ──

function parseHex(hex: string): Rgb | null {
  if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function formatHex([r, g, b]: Rgb): string {
  const to2 = (v: number) => clamp255(Math.round(v)).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}

/** Luminância relativa Rec. 601, 0–1 (a mesma métrica de colorize.ts). */
function luma([r, g, b]: Rgb): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** RGB 0–255 → HSL (h: 0–360, s: 0–1, l: 0–1). */
function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60;
  else if (max === gf) h = ((bf - rf) / d + 2) * 60;
  else h = ((rf - gf) / d + 4) * 60;
  return [h, s, l];
}

/** HSL (h: 0–360, s: 0–1, l: 0–1) → RGB 0–255 (sem arredondar). */
function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1] = [c, x];
  else if (hp < 2) [r1, g1] = [x, c];
  else if (hp < 3) [g1, b1] = [c, x];
  else if (hp < 4) [g1, b1] = [x, c];
  else if (hp < 5) [r1, b1] = [x, c];
  else [r1, b1] = [c, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v));
}
