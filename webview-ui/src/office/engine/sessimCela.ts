/**
 * Sessim: a cela do Lula. É o tapete da antiga sala dos sofás, cercado de
 * grades e sem teto, com piso de concreto, beliche e vaso. O Lula só anda ali dentro;
 * ninguém mais entra, e nenhum assento de dentro vai para sessão.
 */

import type { CarpetTile, TileType as TileTypeVal } from '../types.js';
import { TileType } from '../types.js';

/** Retângulo da cela em tiles, com as bordas incluídas. */
export interface Cela {
  col0: number;
  row0: number;
  col1: number;
  row1: number;
}

function isFloor(tileMap: TileTypeVal[][], col: number, row: number): boolean {
  const t = tileMap[row]?.[col];
  return t !== undefined && t !== TileType.WALL && t !== TileType.VOID;
}

/** A cela é o retângulo do tapete. Sem tapete no layout, não há cela. */
export function celaFromCarpet(
  carpetTiles: Array<CarpetTile | null> | undefined,
  cols: number,
  tileMap: TileTypeVal[][],
): Cela | null {
  if (!carpetTiles || cols <= 0) return null;
  let col0 = Infinity;
  let row0 = Infinity;
  let col1 = -Infinity;
  let row1 = -Infinity;
  carpetTiles.forEach((t, i) => {
    if (!t) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    col0 = Math.min(col0, col);
    row0 = Math.min(row0, row);
    col1 = Math.max(col1, col);
    row1 = Math.max(row1, row);
  });
  if (!Number.isFinite(col0)) return null;
  // A cela é o próprio tapete; só vale se tudo embaixo dele for piso.
  for (let r = row0; r <= row1; r++) {
    for (let c = col0; c <= col1; c++) if (!isFloor(tileMap, c, r)) return null;
  }
  return { col0, row0, col1, row1 };
}

export function insideCela(cela: Cela, col: number, row: number): boolean {
  return col >= cela.col0 && col <= cela.col1 && row >= cela.row0 && row <= cela.row1;
}

/** Cabe a mobília da cadeia (beliche de 2 tiles e vaso)? */
export function celaHasFurniture(cela: Cela): boolean {
  return cela.col1 - cela.col0 >= 2 && cela.row1 - cela.row0 >= 1;
}

/** Tiles ocupados pela mobília: beliche no canto de trás à esquerda, vaso à direita. */
export function celaFurnitureKeys(cela: Cela): string[] {
  if (!celaHasFurniture(cela)) return [];
  return [
    `${cela.col0},${cela.row0}`,
    `${cela.col0},${cela.row0 + 1}`,
    `${cela.col1},${cela.row0}`,
  ];
}

/** Todas as chaves "col,row" da cela (o formato de blockedTiles). */
export function celaKeys(cela: Cela): string[] {
  const keys: string[] = [];
  for (let r = cela.row0; r <= cela.row1; r++) {
    for (let c = cela.col0; c <= cela.col1; c++) keys.push(`${c},${r}`);
  }
  return keys;
}

/** Bloqueio só do Lula: o de sempre mais tudo o que fica fora da cela. */
export function blockedOutsideCela(
  cela: Cela,
  tileMap: TileTypeVal[][],
  baseBlocked: Set<string>,
): Set<string> {
  const blocked = new Set(baseBlocked);
  for (const key of celaFurnitureKeys(cela)) blocked.add(key);
  for (let r = 0; r < tileMap.length; r++) {
    for (let c = 0; c < (tileMap[r]?.length ?? 0); c++) {
      if (!insideCela(cela, c, r)) blocked.add(`${c},${r}`);
    }
  }
  return blocked;
}
