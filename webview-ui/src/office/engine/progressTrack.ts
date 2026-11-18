/**
 * Sessim: quadro de progresso desenhado dentro do mapa.
 *
 * Ocupa as linhas vazias (VOID) no fim do layout. Cada agente trabalhando
 * (ou precisando de você) ganha uma linha: rostinho, nome na cor do papel, o
 * que está fazendo e uma barra em blocos (um bloco por etapa informada). Sem
 * etapas, uma faixa animada mostra que ele está ativo. Quem termina sai do
 * quadro: sub-agente concluído some e sessão que encerrou o turno vai para a
 * linha "Paradas:" do rodapé, junto com as sem atividade, e sai dele depois de
 * 30 min parada. Uma carência curta segura a linha entre uma ferramenta e
 * outra, para não piscar.
 *
 * Toda linha tem o mesmo formato e a mesma altura: nome, depois projeto/pai
 * e modelo, depois a atividade, uma linha cada. O que não cabe ganha "…".
 *
 * Os textos têm tamanho mínimo na tela, para continuarem legíveis com pouco
 * zoom. O React informa as linhas com setTrackLanes(); o renderer chama
 * renderProgressTrack() a cada quadro.
 */

import { accentBright } from '../../accentTheme.js';
import {
  TRACK_ATTENTION_COLOR,
  TRACK_BG,
  TRACK_LANE_A,
  TRACK_LANE_B,
  TRACK_LINE,
  TRACK_TEXT,
  TRACK_TEXT_MUTED,
  TRACK_TEXT_SHADOW,
  TRACK_USAGE_CRITICAL,
} from '../../constants.js';
import { planUsageRows, planUsageStaleNote } from '../../sessimPlanUsage.js';
import { getCachedSprite } from '../sprites/spriteCache.js';
import { getCharacterSprites } from '../sprites/spriteData.js';
import type { TileType as TileTypeVal } from '../types.js';
import { Direction, TILE_SIZE, TileType } from '../types.js';
import { isShownBusy, isStaleStopped, type LaneState, trackLaneStates } from './trackLanes.js';
import { ellipsize } from './trackText.js';

const FONT = "'FS Pixel Sans'";
const MIN_ROWS = 3;
/** Só para o "%" da faixa de uso (o da FS Pixel Sans fica ilegível). */
const PCT_FONT = "system-ui, sans-serif, 'FS Pixel Sans'";

// O estado das raias (carência, override de teste) vive em trackLanes.ts, sem DOM.
export { setTrackLanes, setTrackLanesOverride } from './trackLanes.js';

// Linhas VOID no fim do mapa = área do quadro. Guardado por tileMap.
const regionCache = new WeakMap<TileTypeVal[][], number | null>();

function regionStartRow(tileMap: TileTypeVal[][]): number | null {
  const cached = regionCache.get(tileMap);
  if (cached !== undefined) return cached;
  let r = tileMap.length;
  while (r > 0 && tileMap[r - 1].every((t) => t === TileType.VOID)) r--;
  const result = tileMap.length - r >= MIN_ROWS ? r : null;
  regionCache.set(tileMap, result);
  return result;
}

/** Clareia uma cor #RRGGBB misturando com branco (0 = igual, 1 = branco). */
function lighten(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  const hex2 = (v: number) => v.toString(16).padStart(2, '0');
  return '#' + hex2(r) + hex2(g) + hex2(b);
}

// Quanto o quadro passou do fim do mapa no último quadro (pixels de tela).
let lastOverflowPx = 0;

/** Altura extra do quadro abaixo do mapa, para a rolagem alcançar todas as linhas. */
export function trackOverflowPx(): number {
  return lastOverflowPx;
}

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function renderProgressTrack(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const startRow = regionStartRow(tileMap);
  if (startRow === null) {
    lastOverflowPx = 0;
    return;
  }
  const now = performance.now();

  // Tudo em pixels de tela a partir daqui.
  const left = Math.round(offsetX);
  const top = Math.round(offsetY + startRow * TILE_SIZE * zoom);
  const width = Math.round(cols * TILE_SIZE * zoom);
  const mapBottom = top + Math.round((rows - startRow) * TILE_SIZE * zoom);
  const right = left + width;

  const pad = Math.max(10, Math.round(5 * zoom));
  const headerFont = Math.max(20, Math.round(10 * zoom));
  const nameFont = Math.max(22, Math.round(11 * zoom));
  const subFont = Math.max(17, Math.round(8.5 * zoom));
  // Complemento do nome: um pouco menor que o nome, sem negrito.
  const suffixFont = Math.max(19, Math.round(9.5 * zoom));
  const headerH = headerFont + pad * 2;
  const footerH = subFont + pad;
  // Altura da composição estreita (uma linha de nome + uma de atividade).
  const laneH = Math.max(nameFont + subFont + pad + 14, Math.round(30 * zoom));
  const avatar = laneH - 14;
  const labelW = Math.min(Math.round(width * 0.5), Math.max(260, Math.round(150 * zoom)));
  const rightW = Math.max(64, Math.round(32 * zoom));
  const barH = Math.max(14, Math.round(7 * zoom));
  const lineGap = Math.max(2, Math.round(zoom));
  const nameLineH = nameFont + lineGap;
  const subLineH = subFont + lineGap;
  const suffixLineH = suffixFont + lineGap;

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.shadowColor = TRACK_TEXT_SHADOW;
  // Texto com sombra curta embaixo, para destacar do fundo escuro.
  const text = (t: string, x: number, y: number) => {
    ctx.shadowOffsetY = Math.max(1, Math.round(zoom));
    ctx.fillText(t, x, y);
    ctx.shadowOffsetY = 0;
  };
  const measure = (t: string) => ctx.measureText(t).width;
  const all = trackLaneStates();
  // Linha no quadro: quem trabalha ou precisa de você (mais a carência).
  // Rodapé: sessões que terminaram o turno ou estão paradas, até 30 min
  // paradas (sessimAgents.ts/trackLanes.ts); sub-agente concluído não
  // aparece em lugar nenhum.
  const active = all
    .filter((s) => isShownBusy(s, now))
    .sort(
      (a, b) => (a.lane.phase === 'attention' ? 0 : 1) - (b.lane.phase === 'attention' ? 0 : 1),
    );
  const idle = all.filter(
    (s) => !isShownBusy(s, now) && !s.lane.isSub && !s.gone && !isStaleStopped(s, now),
  );
  const working = active.filter((s) => s.leftAt === null).length;

  // Medida de cada linha antes de desenhar: a altura depende do texto.
  const tx = left + pad + avatar + 8;
  const narrowW = labelW - avatar - 8;
  // Altura fixa de toda linha: nome + complemento + atividade.
  const fixedTextH = nameLineH + suffixLineH + subLineH;
  const fixedLaneH = Math.max(laneH, pad + Math.max(fixedTextH, avatar) + pad);
  interface LaneLayout {
    st: LaneState;
    nameLines: string[];
    /** Complemento desenhado depois da última linha do nome (já com " · "). */
    suffix: string;
    /** Complemento em linhas próprias, quando não cabe ao lado do nome. */
    suffixLines: string[];
    subLines: string[];
    /** Altura do bloco de texto (para centralizar na linha). */
    textH: number;
    h: number;
  }
  const measureLane = (st: LaneState): LaneLayout => {
    const { lane } = st;
    // A atividade já vem pronta em linguagem simples ("Assunto · frase").
    const sub = lane.activity;

    // Formato fixo, igual para todo agente (Sessim: pedido do usuário):
    // 1) nome  2) projeto/pai · modelo  3) atividade. Cada parte ocupa uma
    // linha só; o que não cabe ganha "…". Assim todas as linhas têm a mesma
    // altura. Sem complemento, a linha do meio fica vazia (mesma altura).
    ctx.font = `bold ${nameFont}px ${FONT}`;
    const nameLines = [ellipsize(measure, lane.name, narrowW)];
    ctx.font = `${suffixFont}px ${FONT}`;
    const suffixLines = [lane.suffix ? ellipsize(measure, lane.suffix, narrowW) : ''];
    ctx.font = `${subFont}px ${FONT}`;
    const subLines = [ellipsize(measure, sub, narrowW)];
    return { st, nameLines, suffix: '', suffixLines, subLines, textH: fixedTextH, h: fixedLaneH };
  };

  // Sessim: faixa "USO DO CLAUDE" logo abaixo do título (sessão, semana e
  // limite por modelo, como o Usage do Claude Code). Some sem dado.
  const usage = planUsageRows();
  const usageBarH = Math.max(10, Math.round(5 * zoom));
  // Percentual no tamanho do nome do agente; nome da barra no do complemento.
  const usageTopH = nameLineH + lineGap * 2;
  const usageH = usage.length > 0 ? pad + usageTopH + usageBarH + lineGap * 2 + subLineH + pad : 0;

  // Linhas dos agentes: todas aparecem. Se não couberem nas linhas vazias do
  // mapa, o quadro cresce para baixo dele e a tela rola até o fim
  // (trackOverflowPx() libera a rolagem no OfficeCanvas).
  const lanesTop = top + headerH + usageH;
  const shown: LaneLayout[] = active.map(measureLane);
  const used = shown.reduce((sum, l) => sum + l.h, 0);
  const bottom = Math.max(mapBottom, lanesTop + used + (idle.length > 0 ? footerH : 0) + pad);
  const height = bottom - top;
  lastOverflowPx = bottom - mapBottom;

  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();

  // Fundo e filete de cima.
  ctx.fillStyle = TRACK_BG;
  ctx.fillRect(left, top, width, height);
  // Filete na cor de destaque atual (roxo ou verde DevStart).
  ctx.fillStyle = accentBright();
  ctx.fillRect(left, top, width, Math.max(2, Math.round(zoom)));

  // Cabeçalho.
  ctx.font = `bold ${headerFont}px ${FONT}`;
  ctx.fillStyle = TRACK_TEXT;
  ctx.textAlign = 'left';
  text('PROGRESSO DOS AGENTES', left + pad, top + headerH / 2);
  ctx.font = `${subFont}px ${FONT}`;
  ctx.fillStyle = TRACK_TEXT_MUTED;
  ctx.textAlign = 'right';
  text(
    working === 0
      ? 'ninguém trabalhando'
      : working === 1
        ? '1 trabalhando'
        : `${working} trabalhando`,
    right - pad,
    top + headerH / 2,
  );

  if (usage.length > 0) {
    const uTop = top + headerH;
    ctx.fillStyle = TRACK_LANE_B;
    ctx.fillRect(left, uTop, width, usageH);
    const n = usage.length;
    const colW = (width - pad * (n + 1)) / n;
    const stale = planUsageStaleNote();
    usage.forEach((u, i) => {
      const cx = Math.round(left + pad + i * (colW + pad));
      const cw = Math.round(colW);
      const color =
        u.severity === 'critical'
          ? TRACK_USAGE_CRITICAL
          : u.severity === 'warning'
            ? TRACK_ATTENTION_COLOR
            : accentBright();
      // Linha 1: nome à esquerda, % à direita.
      const l1 = uTop + pad + nameLineH / 2;
      ctx.font = `bold ${nameFont}px ${FONT}`;
      // % na cor da barra (clareada), branco no normal.
      ctx.fillStyle = u.severity === 'normal' ? TRACK_TEXT : lighten(color, 0.25);
      // O "%" da fonte de pixel vira um borrão: número em pixel, "%" em fonte comum.
      ctx.textAlign = 'right';
      ctx.font = `600 ${Math.round(nameFont * 0.62)}px ${PCT_FONT}`;
      const signW = measure('%');
      text('%', cx + cw, l1);
      ctx.font = `bold ${nameFont}px ${FONT}`;
      const num = String(u.percent);
      text(num, cx + cw - signW - 1, l1);
      const pctW = measure(num) + signW + 12;
      ctx.textAlign = 'left';
      ctx.font = `bold ${suffixFont}px ${FONT}`;
      ctx.fillStyle = TRACK_TEXT;
      text(ellipsize(measure, u.label, cw - pctW), cx, l1);
      // Barra.
      const by = Math.round(uTop + pad + usageTopH);
      ctx.fillStyle = TRACK_LINE;
      ctx.fillRect(cx, by, cw, usageBarH);
      ctx.fillStyle = color;
      ctx.fillRect(cx, by, Math.round((cw * u.percent) / 100), usageBarH);
      // Linha 3: quando renova (e a hora do dado, se estiver velho).
      const note = [u.reset, i === n - 1 ? stale : ''].filter(Boolean).join(' · ');
      if (note) {
        ctx.font = `${subFont}px ${FONT}`;
        ctx.fillStyle = TRACK_TEXT_MUTED;
        text(ellipsize(measure, note, cw), cx, by + usageBarH + lineGap * 2 + subLineH / 2);
      }
    });
  }

  if (active.length === 0) {
    ctx.font = `${subFont}px ${FONT}`;
    ctx.fillStyle = TRACK_TEXT_MUTED;
    ctx.textAlign = 'left';
    text('Quando um agente começar, ele aparece aqui.', left + pad, lanesTop + laneH / 2);
  }

  let y = lanesTop;
  shown.forEach((layout, i) => {
    const { st, nameLines, suffix, suffixLines, subLines, textH, h } = layout;
    const { lane } = st;
    const cy = y + h / 2;
    const attention = lane.phase === 'attention';
    const color = attention ? TRACK_ATTENTION_COLOR : (lane.color ?? accentBright());

    ctx.fillStyle = i % 2 ? TRACK_LANE_B : TRACK_LANE_A;
    ctx.fillRect(left, y, width, h);
    ctx.fillStyle = color;
    ctx.fillRect(left, y, Math.max(3, Math.round(1.5 * zoom)), h);

    // Rostinho (metade de cima do personagem). Balança de leve enquanto trabalha.
    const sprites = getCharacterSprites(lane.palette, lane.repeat);
    const cached = getCachedSprite(sprites.walk[Direction.DOWN][1], zoom);
    const bob = !attention && Math.floor(now / 400) % 2 === 0 ? -1 : 0;
    const ax = left + pad;
    const textTop = Math.round(cy - textH / 2);
    const ay = Math.round(cy - avatar / 2) + bob;
    ctx.drawImage(cached, 0, 0, cached.width, cached.width, ax, ay, avatar, avatar);

    // Nome (em negrito, na cor clara do papel) e complemento apagado.
    ctx.textAlign = 'left';
    let ly = textTop;
    nameLines.forEach((line, n) => {
      ctx.font = `bold ${nameFont}px ${FONT}`;
      ctx.fillStyle = lane.color ? lighten(lane.color, 0.35) : TRACK_TEXT;
      const lineY = ly + nameLineH / 2;
      text(line, tx, lineY);
      if (suffix && n === nameLines.length - 1) {
        const nameW = measure(line);
        ctx.font = `${suffixFont}px ${FONT}`;
        ctx.fillStyle = TRACK_TEXT_MUTED;
        text(suffix, tx + nameW, lineY);
      }
      ly += nameLineH;
    });
    ctx.font = `${suffixFont}px ${FONT}`;
    ctx.fillStyle = TRACK_TEXT_MUTED;
    for (const line of suffixLines) {
      text(line, tx, ly + suffixLineH / 2);
      ly += suffixLineH;
    }
    // Atividade.
    ctx.font = `${subFont}px ${FONT}`;
    ctx.fillStyle = TRACK_TEXT_MUTED;
    for (const line of subLines) {
      text(line, tx, ly + subLineH / 2);
      ly += subLineH;
    }

    // Barra: sempre à direita do texto, no meio da linha.
    const bx = left + pad + labelW + pad;
    const bw = right - pad - rightW - bx;
    const barCy = cy;
    const by = Math.round(barCy - barH / 2);
    if (bw > 20) {
      const gap = Math.max(2, Math.round(zoom));
      if (lane.step) {
        const total = Math.max(1, lane.step.total);
        const segW = (bw - gap * (total - 1)) / total;
        for (let s = 0; s < total; s++) {
          const sx = Math.round(bx + s * (segW + gap));
          const ex = Math.round(bx + s * (segW + gap) + segW);
          if (s < lane.step.done) {
            ctx.fillStyle = color;
          } else if (s === lane.step.done && !attention) {
            // Etapa em andamento: pulsa.
            ctx.globalAlpha = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(now / 250));
            ctx.fillStyle = color;
          } else {
            ctx.fillStyle = TRACK_LINE;
          }
          ctx.fillRect(sx, by, ex - sx, barH);
          ctx.globalAlpha = 1;
        }
      } else {
        // Sem etapas: um bloco desliza pela barra enquanto ele trabalha.
        ctx.fillStyle = TRACK_LINE;
        ctx.fillRect(bx, by, bw, barH);
        if (!attention) {
          const blockW = Math.round(bw * 0.22);
          const cell = Math.max(4, Math.round(4 * zoom));
          const t = (now % 1800) / 1800;
          const pos = Math.floor(((bw + blockW) * t) / cell) * cell - blockW;
          const sx = Math.max(bx, bx + pos);
          const ex = Math.min(bx + bw, bx + pos + blockW);
          if (ex > sx) {
            ctx.fillStyle = color;
            ctx.fillRect(sx, by, ex - sx, barH);
          }
        }
      }
    }

    // Direita: etapas, tempo ou ! (na mesma linha da barra).
    ctx.textAlign = 'right';
    ctx.font = `bold ${subFont}px ${FONT}`;
    ctx.fillStyle = attention ? TRACK_ATTENTION_COLOR : TRACK_TEXT;
    const tag = attention
      ? '!'
      : lane.step
        ? `${lane.step.done}/${lane.step.total}`
        : fmtTime(now - st.startedAt);
    text(tag, right - pad, barCy);
    y += h;
  });

  // Rodapé: as sessões paradas.
  ctx.font = `${subFont}px ${FONT}`;
  ctx.fillStyle = TRACK_TEXT_MUTED;
  const footY = bottom - pad / 2 - subFont / 2;
  if (idle.length > 0) {
    ctx.textAlign = 'left';
    const names = idle.map((s) => s.lane.name).join(', ');
    text(ellipsize(measure, `Paradas: ${names}`, width * 0.7), left + pad, footY);
  }

  ctx.restore();
}
