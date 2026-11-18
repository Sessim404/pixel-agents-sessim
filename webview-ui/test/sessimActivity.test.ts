/**
 * Sessim: linha de atividade do quadro (finalidade + sufixos de estado) e a
 * carência/saída de quem terminou (progressTrack.ts).
 *
 * Run with: npm test
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  setTrackLanes,
  setTrackLanesOverride,
  TRACK_GRACE_MS,
  trackLaneSnapshot,
} from '../src/office/engine/trackLanes.js';
import { laneActivity, PHRASE_NO_PURPOSE, stepSuffix } from '../src/sessimActivity.js';
import type { Lane } from '../src/sessimAgents.js';

describe('laneActivity: finalidade nas palavras do agente, sem ferramenta nem arquivo', () => {
  it('finalidade sozinha e com sufixos de estado', () => {
    expect(laneActivity('Montando kit do Segundo Cérebro')).toBe('Montando kit do Segundo Cérebro');
    expect(laneActivity('Deixando o mapa verde', 'etapa 2 de 5')).toBe(
      'Deixando o mapa verde · etapa 2 de 5',
    );
    expect(laneActivity('Criando planilha do funil FilmStar', null, 'precisa de você')).toBe(
      'Criando planilha do funil FilmStar · precisa de você',
    );
    expect(laneActivity('Deixando o mapa verde', 'etapa 2 de 5', 'precisa de você')).toBe(
      'Deixando o mapa verde · etapa 2 de 5 · precisa de você',
    );
  });

  it('sem finalidade declarada mostra "Em andamento", nunca a ferramenta', () => {
    expect(laneActivity(null)).toBe(PHRASE_NO_PURPOSE);
    expect(laneActivity('  ')).toBe('Em andamento');
    expect(laneActivity(undefined, 'precisa de você')).toBe('Em andamento · precisa de você');
    expect(laneActivity('x', '', '  ', null)).toBe('x');
  });

  it('stepSuffix: "etapa N de M" mais o nome da etapa (note) quando houver', () => {
    expect(stepSuffix({ done: 2, total: 5, note: 'trocando a cor dos móveis' })).toBe(
      'etapa 2 de 5: trocando a cor dos móveis',
    );
    expect(stepSuffix({ done: 2, total: 5, note: '  ' })).toBe('etapa 2 de 5');
    expect(stepSuffix({ done: 7, total: 5, note: '' })).toBe('etapa 5 de 5');
    expect(stepSuffix({ done: 1, total: 0, note: 'x' })).toBeNull();
    expect(stepSuffix(null)).toBeNull();
  });
});

const lane = (id: number, phase: Lane['phase'], isSub = false): Lane => ({
  id,
  isSub,
  name: `a${id}`,
  suffix: '',
  color: null,
  activity: 'x',
  phase,
  step: null,
  palette: 0,
  repeat: 0,
});

describe('progressTrack: quem terminou sai, com carência curta', () => {
  afterEach(() => setTrackLanesOverride(null));

  it('sessão que terminou some da linha depois da carência; sub concluído some de vez', () => {
    setTrackLanesOverride([]); // limpa o estado
    setTrackLanes([lane(1, 'working'), lane(2, 'working', true), lane(3, 'done')], 1000);
    expect(trackLaneSnapshot(1000)).toEqual([
      { id: 1, shown: true },
      { id: 2, shown: true },
      { id: 3, shown: false },
    ]);

    // Sessão 1 terminou; sub 2 sumiu da lista.
    setTrackLanes([lane(1, 'done'), lane(3, 'done')], 2000);
    // Dentro da carência os dois continuam na linha, com o último texto.
    expect(trackLaneSnapshot(2000)).toEqual([
      { id: 1, shown: true },
      { id: 2, shown: true },
      { id: 3, shown: false },
    ]);

    // Passada a carência: a sessão vai para o rodapé e o sub desaparece.
    const later = 2000 + TRACK_GRACE_MS + 1;
    setTrackLanes([lane(1, 'done'), lane(3, 'done')], later);
    expect(trackLaneSnapshot(later)).toEqual([
      { id: 1, shown: false },
      { id: 3, shown: false },
    ]);
  });

  it('entre uma ferramenta e outra a linha não pisca', () => {
    setTrackLanesOverride([]);
    setTrackLanes([lane(1, 'working')], 0);
    setTrackLanes([lane(1, 'idle')], 500);
    expect(trackLaneSnapshot(500)).toEqual([{ id: 1, shown: true }]);
    setTrackLanes([lane(1, 'working')], 900);
    expect(trackLaneSnapshot(900)).toEqual([{ id: 1, shown: true }]);
  });
});
