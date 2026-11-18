/**
 * Sessim: desenho da cela do Lula (sem teto): piso de concreto, cama de
 * ferro, vaso de inox e as grades. Fica separado de sessimCela.ts porque usa
 * o canvas, e os testes do webview rodam sem DOM.
 */

import {
  CELA_BAR_COLOR,
  CELA_BAR_LIGHT_COLOR,
  CELA_BLANKET_COLOR,
  CELA_BLANKET_LIGHT_COLOR,
  CELA_FLOOR_COLOR,
  CELA_FLOOR_DARK_COLOR,
  CELA_FLOOR_LIGHT_COLOR,
  CELA_LOCK_COLOR,
  CELA_MATTRESS_COLOR,
  CELA_MATTRESS_STRIPE_COLOR,
  CELA_PILLOW_COLOR,
  CELA_STEEL_COLOR,
  CELA_STEEL_DARK_COLOR,
  CELA_STEEL_LIGHT_COLOR,
  CELA_WATER_COLOR,
  CHARACTER_Z_SORT_OFFSET,
} from '../../constants.js';
import { TILE_SIZE } from '../types.js';
import type { Cela } from './sessimCela.js';
import { celaHasFurniture } from './sessimCela.js';

/** Altura das grades em pixels do sprite (o boneco tem 32: a cabeça aparece). */
const BAR_HEIGHT = 16;
/** Distância entre as barras. */
const BAR_GAP = 3;

interface Drawable {
  zY: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

type Rect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

/** Retângulo em pixels do sprite, escalado pelo zoom e alinhado à tela. */
function rectFn(offsetX: number, offsetY: number, zoom: number): Rect {
  return (c, x, y, w, h) => {
    const sx = Math.round(offsetX + x * zoom);
    const sy = Math.round(offsetY + y * zoom);
    c.fillRect(
      sx,
      sy,
      Math.round(offsetX + (x + w) * zoom) - sx,
      Math.round(offsetY + (y + h) * zoom) - sy,
    );
  };
}

/** Piso de concreto por cima do tapete: placas com rejunte e manchas. */
export function renderCelaFloor(
  ctx: CanvasRenderingContext2D,
  cela: Cela,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const rect = rectFn(offsetX, offsetY, zoom);
  for (let r = cela.row0; r <= cela.row1; r++) {
    for (let col = cela.col0; col <= cela.col1; col++) {
      const x = col * TILE_SIZE;
      const y = r * TILE_SIZE;
      ctx.fillStyle = CELA_FLOOR_COLOR;
      rect(ctx, x, y, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = CELA_FLOOR_DARK_COLOR;
      rect(ctx, x, y, TILE_SIZE, 1); // rejunte
      rect(ctx, x, y, 1, TILE_SIZE);
      // Manchas fixas por tile (sempre no mesmo lugar).
      const seed = (col * 7 + r * 13) % 5;
      rect(ctx, x + 3 + seed * 2, y + 4 + seed, 2, 1);
      rect(ctx, x + 11 - seed, y + 10 + (seed % 3), 1, 1);
      ctx.fillStyle = CELA_FLOOR_LIGHT_COLOR;
      rect(ctx, x + 6 + (seed % 3) * 2, y + 12 - seed, 1, 1);
    }
  }
  // Risquinhos contando os dias, no chão perto da cama.
  if (celaHasFurniture(cela)) {
    const tx = (cela.col0 + 1) * TILE_SIZE + 3;
    const ty = cela.row0 * TILE_SIZE + 3;
    ctx.fillStyle = CELA_FLOOR_LIGHT_COLOR;
    for (let i = 0; i < 4; i++) rect(ctx, tx + i * 2, ty, 1, 5);
    for (let i = 0; i < 5; i++) rect(ctx, tx - 1 + i * 2, ty + 3 - i, 2, 1); // o corte do 5
  }
}

/** Cama de ferro de 1×2 tiles: estrutura, colchão listrado, travesseiro e cobertor. */
function drawBed(c: CanvasRenderingContext2D, rect: Rect, x: number, y: number): void {
  c.fillStyle = CELA_BAR_COLOR;
  rect(c, x + 1, y + 1, 14, 30); // estrutura
  rect(c, x + 1, y + 30, 2, 2); // pés
  rect(c, x + 13, y + 30, 2, 2);
  c.fillStyle = CELA_BAR_LIGHT_COLOR;
  rect(c, x + 1, y + 1, 14, 1); // cabeceira
  c.fillStyle = CELA_MATTRESS_COLOR;
  rect(c, x + 2, y + 3, 12, 26);
  c.fillStyle = CELA_MATTRESS_STRIPE_COLOR;
  for (let sy = y + 5; sy < y + 16; sy += 3) rect(c, x + 2, sy, 12, 1);
  c.fillStyle = CELA_PILLOW_COLOR;
  rect(c, x + 3, y + 4, 10, 4);
  c.fillStyle = CELA_BLANKET_COLOR;
  rect(c, x + 2, y + 16, 12, 13);
  c.fillStyle = CELA_BLANKET_LIGHT_COLOR;
  rect(c, x + 2, y + 16, 12, 2); // dobra
}

/** Vaso de inox de cadeia (sem tampa), visto de cima. */
function drawToilet(c: CanvasRenderingContext2D, rect: Rect, x: number, y: number): void {
  c.fillStyle = CELA_STEEL_DARK_COLOR;
  rect(c, x + 3, y + 1, 10, 5); // caixa encostada na grade
  c.fillStyle = CELA_STEEL_COLOR;
  rect(c, x + 4, y + 1, 8, 4);
  c.fillStyle = CELA_STEEL_DARK_COLOR;
  rect(c, x + 4, y + 6, 8, 9); // bacia
  rect(c, x + 3, y + 7, 10, 6);
  c.fillStyle = CELA_STEEL_LIGHT_COLOR;
  rect(c, x + 5, y + 6, 6, 1); // borda brilhando
  rect(c, x + 4, y + 7, 1, 5);
  rect(c, x + 11, y + 7, 1, 5);
  c.fillStyle = CELA_WATER_COLOR;
  rect(c, x + 6, y + 8, 4, 4);
}

/**
 * Grades e mobília entram no mesmo ordenamento por profundidade dos móveis e
 * bonecos: a grade de trás fica atrás de quem está dentro, a da frente fica
 * na frente. Coordenadas em pixels do sprite; o desenho escala pelo zoom.
 */
export function celaDrawables(
  cela: Cela,
  offsetX: number,
  offsetY: number,
  zoom: number,
): Drawable[] {
  const x0 = cela.col0 * TILE_SIZE;
  const x1 = (cela.col1 + 1) * TILE_SIZE;
  const y0 = cela.row0 * TILE_SIZE;
  const y1 = (cela.row1 + 1) * TILE_SIZE;
  const H = BAR_HEIGHT;
  const rect = rectFn(offsetX, offsetY, zoom);

  // Grade reta (de trás ou da frente): barras em pé com trilho em cima e embaixo.
  const straight = (c: CanvasRenderingContext2D, base: number, withLock: boolean) => {
    c.fillStyle = CELA_BAR_COLOR;
    for (let x = x0 + BAR_GAP; x < x1; x += BAR_GAP) rect(c, x, base - H, 1, H);
    rect(c, x0, base - H, x1 - x0, 2); // trilho de cima
    rect(c, x0, base - Math.round(H / 2), x1 - x0, 1); // travessa do meio
    rect(c, x0, base - 1, x1 - x0, 1); // trilho do chão
    c.fillStyle = CELA_BAR_LIGHT_COLOR;
    rect(c, x0, base - H, x1 - x0, 1); // brilho no trilho
    if (withLock) {
      const lx = Math.round((x0 + x1) / 2) - 2;
      const ly = base - Math.round(H / 2) - 1;
      c.fillStyle = CELA_LOCK_COLOR;
      rect(c, lx, ly, 4, 4);
      c.fillStyle = CELA_BAR_COLOR;
      rect(c, lx + 1, ly + 2, 2, 1);
    }
  };

  // Lateral vista de frente: um pilar com as barras de perfil (risquinhos).
  const side = (c: CanvasRenderingContext2D, x: number, rTop: number, rBottom: number) => {
    c.fillStyle = CELA_BAR_COLOR;
    rect(c, x - 1, rTop - H, 2, rBottom - rTop);
    c.fillStyle = CELA_BAR_LIGHT_COLOR;
    for (let y = rTop - H + 2; y < rBottom - H; y += BAR_GAP) rect(c, x - 1, y, 1, 1);
  };

  // Pilares dos cantos, um pouco mais grossos.
  const post = (c: CanvasRenderingContext2D, x: number, base: number) => {
    c.fillStyle = CELA_BAR_COLOR;
    rect(c, x - 1, base - H - 1, 3, H + 1);
    c.fillStyle = CELA_BAR_LIGHT_COLOR;
    rect(c, x - 1, base - H - 1, 3, 1);
  };

  const half = TILE_SIZE / 2;
  const list: Drawable[] = [];
  // Trás: depois de quem está do lado de fora acima, antes de quem está dentro.
  list.push({
    zY: y0 + half + CHARACTER_Z_SORT_OFFSET / 2,
    draw: (c) => {
      straight(c, y0, false);
      post(c, x0, y0);
      post(c, x1, y0);
    },
  });
  // Mobília: ordenada pela base, como um móvel comum.
  if (celaHasFurniture(cela)) {
    list.push({ zY: y0 + 2 * TILE_SIZE, draw: (c) => drawBed(c, rect, x0, y0) });
    list.push({ zY: y0 + TILE_SIZE, draw: (c) => drawToilet(c, rect, x1 - TILE_SIZE, y0) });
  }
  // Laterais, uma fatia por linha de tiles para ordenar com quem passa ao lado.
  for (let r = cela.row0; r <= cela.row1; r++) {
    const top = r * TILE_SIZE;
    const bottom = top + TILE_SIZE;
    list.push({
      zY: bottom + CHARACTER_Z_SORT_OFFSET / 2,
      draw: (c) => {
        side(c, x0, top, bottom);
        side(c, x1, top, bottom);
      },
    });
  }
  // Frente: na frente de todo mundo que está dentro, com o cadeado no meio.
  list.push({
    zY: y1 + half,
    draw: (c) => {
      straight(c, y1, true);
      post(c, x0, y1);
      post(c, x1, y1);
    },
  });
  return list;
}
