/**
 * Sessim: estado das raias do quadro de progresso, sem desenho e sem DOM
 * (testável no Node). progressTrack.ts lê daqui a cada quadro.
 *
 * Quem trabalha (ou precisa de você) tem raia. Quem para ganha uma carência
 * curta com o último texto, para a linha não piscar entre uma ferramenta e
 * outra; passada a carência, a sessão vai para o rodapé e o sub-agente
 * concluído some. Parada há mais de LANE_STALE_MS sai também do rodapé.
 */

import { type Lane, LANE_STALE_MS } from '../../sessimAgents.js';

/** Carência depois de parar (ou sumir) até a raia sair da linha. */
export const TRACK_GRACE_MS = 2500;

export interface LaneState {
  /** Última raia ocupada (trabalhando/precisa de você) ou a atual, se nunca trabalhou. */
  lane: Lane;
  startedAt: number;
  /** Quando deixou de estar ocupada (carência correndo); null enquanto ocupada. */
  leftAt: number | null;
  /** Sumiu da lista do React (sub-agente concluído). */
  gone: boolean;
}

const states = new Map<number, LaneState>();

/** Raias simuladas (e2e/prévia); null usa as reais. */
let override: Lane[] | null = null;

export function setTrackLanesOverride(lanes: Lane[] | null): void {
  override = lanes;
  states.clear();
}

export function getTrackLanesOverride(): Lane[] | null {
  return override;
}

const busy = (phase: Lane['phase']) => phase === 'working' || phase === 'attention';

/** Chamado pelo React (~2x por segundo) com as linhas atuais. */
export function setTrackLanes(lanes: Lane[], now: number): void {
  const seen = new Set<number>();
  for (const lane of lanes) {
    seen.add(lane.id);
    const prev = states.get(lane.id);
    if (!prev) {
      states.set(lane.id, {
        lane,
        startedAt: now,
        leftAt: busy(lane.phase) ? null : now,
        gone: false,
      });
      continue;
    }
    prev.gone = false;
    if (busy(lane.phase)) {
      // O cronômetro recomeça quando ele volta a trabalhar depois de parado de verdade.
      if (prev.leftAt !== null && now - prev.leftAt > TRACK_GRACE_MS) prev.startedAt = now;
      prev.lane = lane;
      prev.leftAt = null;
    } else if (prev.leftAt === null) {
      // Acabou de parar: segura o último texto pela carência.
      prev.leftAt = now;
    } else if (now - prev.leftAt > TRACK_GRACE_MS) {
      // Parado de verdade: a raia atual (done/idle) vai para o rodapé.
      prev.lane = lane;
    }
  }
  for (const [id, st] of states) {
    if (seen.has(id)) continue;
    st.gone = true;
    if (st.leftAt === null) st.leftAt = now;
    else if (now - st.leftAt > TRACK_GRACE_MS) states.delete(id);
  }
}

/** Todas as raias conhecidas (ocupadas, em carência e paradas). */
export function trackLaneStates(): LaneState[] {
  return [...states.values()];
}

/** Ocupada agora, ou dentro da carência depois de parar. */
export function isShownBusy(st: LaneState, now: number): boolean {
  if (!busy(st.lane.phase)) return false;
  return st.leftAt === null || now - st.leftAt <= TRACK_GRACE_MS;
}

/**
 * Parada (fora da carência) há mais de LANE_STALE_MS desde que deixou de
 * trabalhar ou, se nunca trabalhou, desde que apareceu (ex.: restaurada depois
 * do Reload Window sem hora de atividade conhecida). Sai do rodapé "Paradas:".
 */
export function isStaleStopped(st: LaneState, now: number): boolean {
  if (busy(st.lane.phase)) return false;
  return st.leftAt !== null && now - st.leftAt > LANE_STALE_MS;
}

/** Para testes: estado interno resumido. */
export function trackLaneSnapshot(now: number): Array<{ id: number; shown: boolean }> {
  return trackLaneStates().map((st) => ({ id: st.lane.id, shown: isShownBusy(st, now) }));
}
