/**
 * Sessim: quem terminou sai do quadro de progresso.
 * - boneco restaurado/adotado sem nenhuma atividade não conta como "trabalhando";
 * - status 'waiting' reenviado depois do Reload Window vira "terminou";
 * - parada há mais de 30 min sai também do rodapé "Paradas:" e volta se trabalhar;
 * - sub-agente concluído some.
 *
 * Run with: npm test
 */

import { afterEach, describe, expect, it } from 'vitest';

import { OfficeState } from '../src/office/engine/officeState.js';
import {
  isStaleStopped,
  setTrackLanes,
  setTrackLanesOverride,
  trackLaneStates,
} from '../src/office/engine/trackLanes.js';
import type { OfficeLayout } from '../src/office/types.js';
import { TileType } from '../src/office/types.js';
import { buildLanes, type Lane, LANE_STALE_MS, type LaneSources } from '../src/sessimAgents.js';

function floorLayout(cols = 9, rows = 7): OfficeLayout {
  return {
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [],
  };
}

function sources(os: OfficeState, over: Partial<LaneSources> = {}): LaneSources {
  return {
    officeState: os,
    agents: [...os.characters.keys()].filter((id) => id > 0),
    agentTools: {},
    subagentTools: {},
    subagentCharacters: [],
    agentStatuses: {},
    seenActivity: {},
    ...over,
  };
}

const NOW = Date.parse('2026-11-06T14:15:00Z');

describe('buildLanes: sessão restaurada depois do Reload Window', () => {
  it('boneco nasce ativo, mas sem atividade vista não é "trabalhando"', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(9); // createCharacter: isActive = true
    expect(os.characters.get(9)?.isActive).toBe(true);
    const [lane] = buildLanes(sources(os));
    expect(lane.phase).toBe('idle');
  });

  it('o \'waiting\' reenviado pelo servidor vira "terminou"', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(9);
    // o que useExtensionMessages faz ao receber agentStatus waiting
    os.setAgentActive(9, false);
    const [lane] = buildLanes(
      sources(os, { agentStatuses: { 9: 'waiting' }, seenActivity: { 9: true } }),
    );
    expect(lane.phase).toBe('done');
  });

  it('com atividade vista e sem waiting continua "trabalhando"', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(9);
    os.setAgentActive(9, true);
    const [lane] = buildLanes(sources(os, { seenActivity: { 9: true } }));
    expect(lane.phase).toBe('working');
  });

  it('turno encerrado nunca é "trabalhando", mesmo com o boneco ativo', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(9);
    os.setAgentActive(9, true);
    const [lane] = buildLanes(
      sources(os, { agentStatuses: { 9: 'waiting' }, seenActivity: { 9: true } }),
    );
    expect(lane.phase).not.toBe('working');
  });
});

describe('buildLanes: parada há mais de 30 min sai do rodapé', () => {
  function doneAgent(lastResponseAt?: number, activeAt?: number) {
    const os = new OfficeState(floorLayout());
    os.addAgent(9);
    os.setAgentActive(9, false);
    const ch = os.characters.get(9)!;
    ch.sessimContextAt = lastResponseAt;
    ch.sessimActiveAt = activeAt;
    return os;
  }
  const done = { agentStatuses: { 9: 'waiting' }, seenActivity: { 9: true }, now: NOW };

  it('terminou há 31 min (hora da última resposta no transcript): some', () => {
    const os = doneAgent(NOW - LANE_STALE_MS - 60_000);
    expect(buildLanes(sources(os, done))).toEqual([]);
  });

  it('terminou há 5 min: fica no rodapé como "terminou"', () => {
    const os = doneAgent(NOW - 5 * 60_000);
    expect(buildLanes(sources(os, done)).map((l) => l.phase)).toEqual(['done']);
  });

  it('atividade nova (status active recente) traz de volta', () => {
    const os = doneAgent(NOW - 2 * LANE_STALE_MS, NOW - 1000);
    expect(buildLanes(sources(os, done))).toHaveLength(1);
  });

  it('trabalhando nunca some, por mais antiga que seja a última resposta', () => {
    const os = doneAgent(NOW - 10 * LANE_STALE_MS);
    os.setAgentActive(9, true);
    const lanes = buildLanes(sources(os, { seenActivity: { 9: true }, now: NOW }));
    expect(lanes.map((l) => l.phase)).toEqual(['working']);
  });

  it('sem hora conhecida, buildLanes não decide (fica para trackLanes)', () => {
    const os = doneAgent();
    expect(buildLanes(sources(os, done))).toHaveLength(1);
  });
});

describe('buildLanes: sub-agente concluído some', () => {
  it('sai da lista quando sai de subagentCharacters', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(5);
    os.setAgentActive(5, false);
    const subId = os.addSubagent(5, 'toolu_sub', 'construtor');
    const sub = { id: subId, parentAgentId: 5, parentToolId: 'toolu_sub', label: 'construtor: x' };
    const withSub = buildLanes(
      sources(os, { subagentCharacters: [sub], agentStatuses: { 5: 'waiting' } }),
    );
    expect(withSub.some((l) => l.isSub && l.phase === 'working')).toBe(true);
    const after = buildLanes(
      sources(os, { subagentCharacters: [], agentStatuses: { 5: 'waiting' } }),
    );
    expect(after.some((l) => l.isSub)).toBe(false);
  });
});

const lane = (id: number, phase: Lane['phase']): Lane => ({
  id,
  isSub: false,
  name: `a${id}`,
  suffix: '',
  color: null,
  activity: 'x',
  phase,
  step: null,
  palette: 0,
  repeat: 0,
});

describe('trackLanes: parada há mais de 30 min (sem hora conhecida) sai do rodapé', () => {
  afterEach(() => setTrackLanesOverride(null));

  const state = (id: number) => trackLaneStates().find((s) => s.lane.id === id)!;

  it('parada desde que apareceu: some depois de 30 min e volta ao trabalhar', () => {
    setTrackLanesOverride([]); // limpa o estado
    setTrackLanes([lane(1, 'idle')], 0);
    expect(isStaleStopped(state(1), 1000)).toBe(false);
    setTrackLanes([lane(1, 'idle')], LANE_STALE_MS + 1000);
    expect(isStaleStopped(state(1), LANE_STALE_MS + 1000)).toBe(true);
    // voltou a trabalhar: não é mais parada
    setTrackLanes([lane(1, 'working')], LANE_STALE_MS + 2000);
    expect(isStaleStopped(state(1), LANE_STALE_MS + 2000)).toBe(false);
  });

  it('terminou o turno: conta a partir de quando parou de trabalhar', () => {
    setTrackLanesOverride([]);
    setTrackLanes([lane(1, 'working')], 0);
    setTrackLanes([lane(1, 'done')], 10_000);
    setTrackLanes([lane(1, 'done')], 20_000); // passou a carência
    expect(isStaleStopped(state(1), 20_000)).toBe(false);
    expect(isStaleStopped(state(1), 10_000 + LANE_STALE_MS + 1)).toBe(true);
  });
});
