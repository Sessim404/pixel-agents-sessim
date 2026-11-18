/**
 * Sessim: índice de paleta dos nossos bonecos na tela. Os 25 char_N.png
 * embutidos entram como bonecos externos, logo depois dos personagens do
 * editor (perfis); por isso o boneco n é a paleta `perfis + n`.
 */

import {
  SESSIM_CHARACTER_COUNT,
  SESSIM_LULA_CHAR,
  sessimPalette,
} from '../../core/src/paletteUtils.js';
import { getExternalCharacterCount } from './characters/officeSprites.js';
import { getLoadedCharacterCount } from './office/sprites/spriteData.js';

/** Quantos personagens do editor vêm antes dos nossos bonecos. */
export function sessimProfileCount(): number {
  return Math.max(0, getLoadedCharacterCount() - getExternalCharacterCount());
}

/** Os nossos 25 bonecos já chegaram do servidor. */
export function sessimCharactersLoaded(): boolean {
  return getExternalCharacterCount() >= SESSIM_CHARACTER_COUNT;
}

/** Paleta do nosso boneco `char` (0..24). */
export function sessimCharPalette(char: number): number {
  return sessimPalette(char, sessimProfileCount());
}

/** Paleta do Lula (char_24). */
export function lulaPalette(): number {
  return sessimCharPalette(SESSIM_LULA_CHAR);
}
