/**
 * Sessim: o Lula (char_24, o presidiário) é um boneco de enfeite. Não é uma
 * sessão nem faz nada: anda pela sala sem mesa própria e mostra no
 * quadro de progresso uma tarefa de mentira que troca de tempos em tempos.
 */

import type { OfficeState } from './office/engine/officeState.js';
import type { Lane } from './sessimAgents.js';
import { lulaPalette } from './sessimPalette.js';
import { roleColor } from './sessimRoles.js';

/** Id fixo do Lula: negativo e longe dos sub-agentes (-1, -2…) e do greeter. */
export const LULA_ID = -24_024;

/** Boneco do Lula (char_24). Nenhuma sessão recebe essa paleta (paletteUtils). */

/** Quanto tempo cada tarefa fica no quadro. */
const TASK_MS = 9_000;

/** Tarefas de mentira, em ordem. */
export const LULA_TASKS = [
  'Preparando nova mentira',
  'Aplicando juros',
  'Fud*endo o povo',
  'Criando imposto novo',
  'Taxando as blusinhas',
  'Prometendo picanha',
  'Gastando o cartão corporativo',
  'Subindo a gasolina',
  'Culpando o governo anterior',
  'Aumentando o IOF',
  'Viajando pro exterior de novo',
  'Fazendo o L',
  'Inventando mais um ministério',
  'Dando o calote',
  'Cortando a picanha do povo',
];

/** Põe o Lula no escritório se ele ainda não estiver lá (layout já carregado). */
export function ensureLula(os: OfficeState): void {
  if (os.characters.has(LULA_ID)) return;
  if (os.seats.size === 0) return;
  os.addAgent(LULA_ID, lulaPalette(), 0, undefined, true, undefined);
  const ch = os.characters.get(LULA_ID);
  if (!ch) return;
  // addAgent nunca entrega a paleta reservada; aqui ela é dele de propósito.
  ch.palette = lulaPalette();
  ch.repeat = 0;
  // Sem mesa: devolve a cadeira e fica parado de vez, o que faz ele andar
  // pela sala sem nunca voltar a sentar (characters.ts só senta quem tem mesa).
  if (ch.seatId) {
    const seat = os.seats.get(ch.seatId);
    if (seat) seat.assigned = false;
    ch.seatId = null;
  }
  os.setAgentActive(LULA_ID, false);
  // Preso: nasce e anda só dentro da cela (a sala dos sofás).
  os.placeLulaInCela();
}

/** Linha do Lula no quadro: sempre trabalhando, tarefa e barra andando com o tempo. */
export function lulaLane(os: OfficeState, now: number): Lane | null {
  if (!os.characters.has(LULA_ID)) return null;
  const tick = Math.floor(now / TASK_MS);
  const task = LULA_TASKS[tick % LULA_TASKS.length];
  const total = 5;
  return {
    id: LULA_ID,
    isSub: false,
    name: 'Lula',
    suffix: 'Planalto · Opus 13',
    color: roleColor('Lula'),
    activity: task,
    phase: 'working',
    step: { done: tick % total, total },
    palette: lulaPalette(),
    repeat: 0,
  };
}
