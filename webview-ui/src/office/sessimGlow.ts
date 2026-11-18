/**
 * Sessim: brilho na cor do agente enquanto ele trabalha. Funções puras (sem
 * DOM), usadas pelo renderer e pelo cache de sprites.
 */

import {
  SESSIM_WORK_GLOW_ALPHA_MAX,
  SESSIM_WORK_GLOW_ALPHA_MIN,
  SESSIM_WORK_GLOW_PERIOD_SEC,
} from '../constants.js';
import type { SpriteData } from './types.js';

/** Opacidade do brilho no instante `tSec` (onda suave entre min e max). */
export function sessimWorkGlowAlpha(tSec: number): number {
  const wave = 0.5 + 0.5 * Math.sin((2 * Math.PI * tSec) / SESSIM_WORK_GLOW_PERIOD_SEC);
  return (
    SESSIM_WORK_GLOW_ALPHA_MIN + (SESSIM_WORK_GLOW_ALPHA_MAX - SESSIM_WORK_GLOW_ALPHA_MIN) * wave
  );
}

/** Pinta um contorno (pixels não vazios) na cor `color`. */
export function recolorOutline(outline: SpriteData, color: string): SpriteData {
  return outline.map((row) => row.map((px) => (px === '' ? '' : color)));
}
