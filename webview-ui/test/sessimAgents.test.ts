/**
 * Sessim: fases das raias do quadro de progresso. "Precisa de você" só com
 * algo para responder (permissão ou pergunta aberta); turno encerrado vira
 * 'done' ("terminou · esperando você"), entre "trabalhando" e "parado".
 *
 * Run with: npm test
 */

import { describe, expect, it } from 'vitest';

import { OfficeState } from '../src/office/engine/officeState.js';
import type { OfficeLayout, ToolActivity } from '../src/office/types.js';
import { TileType } from '../src/office/types.js';
import { buildLanes, type LaneSources } from '../src/sessimAgents.js';

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
    ...over,
  };
}

const tool = (status: string, over: Partial<ToolActivity> = {}): ToolActivity => ({
  toolId: 't-' + status,
  status,
  done: false,
  ...over,
});

describe('buildLanes: quando é "precisa de você"', () => {
  it('balão de permissão', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.showPermissionBubble(1);
    const [lane] = buildLanes(sources(os));
    expect(lane.phase).toBe('attention');
    expect(lane.activity).toBe('Em andamento · precisa de você');
  });

  it('ferramenta aberta esperando permissão', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.setAgentActive(1, true);
    const src = sources(os, {
      agentTools: { 1: [tool('Editing x.ts', { permissionWait: true })] },
    });
    expect(buildLanes(src)[0].phase).toBe('attention');
  });

  it('pergunta aberta (AskUserQuestion)', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.setAgentActive(1, true);
    const src = sources(os, { agentTools: { 1: [tool('Waiting for your answer')] } });
    const [lane] = buildLanes(src);
    expect(lane.phase).toBe('attention');
    expect(lane.activity).toBe('Em andamento · precisa de você');
  });

  it('pergunta já respondida (ferramenta concluída) não conta', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.setAgentActive(1, true);
    const src = sources(os, {
      agentTools: { 1: [tool('Waiting for your answer', { done: true }), tool('Reading a.ts')] },
    });
    expect(buildLanes(src)[0].phase).toBe('working');
  });
});

describe('buildLanes: a linha diz a finalidade, não a ferramenta', () => {
  it('sessão: finalidade declarada (agentTitle), sem o nome do arquivo', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.setAgentActive(1, true);
    os.characters.get(1)!.sessimTitle = 'Montando kit do Segundo Cérebro';
    const src = sources(os, { agentTools: { 1: [tool('Editing constants.ts')] } });
    const [lane] = buildLanes(src);
    expect(lane.phase).toBe('working');
    expect(lane.activity).toBe('Montando kit do Segundo Cérebro');
    // Pedindo permissão, o estado entra como sufixo.
    os.showPermissionBubble(1);
    expect(buildLanes(src)[0].activity).toBe('Montando kit do Segundo Cérebro · precisa de você');
  });

  it('sessão ativa entre ferramentas (ou pensando) continua "trabalhando"', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.setAgentActive(1, true);
    expect(buildLanes(sources(os))[0].phase).toBe('working');
    expect(buildLanes(sources(os))[0].activity).toBe('Em andamento');
  });

  it('sub-agente: a tarefa recebida (description) e a etapa como sufixo curto', () => {
    const os = new OfficeState(floorLayout(12, 8));
    os.addAgent(1);
    os.setAgentActive(1, true);
    os.characters.get(1)!.sessimTitle = 'Deixando o mapa verde';
    const subId = os.addSubagent(1, 'toolu_1', 'construtor');
    const subCh = os.characters.get(subId)!;
    const subs = [
      {
        id: subId,
        parentAgentId: 1,
        parentToolId: 'toolu_1',
        label: 'construtor · Trocar a cor dos móveis',
      },
    ];
    const src = sources(os, {
      subagentCharacters: subs,
      subagentTools: { 1: { toolu_1: [tool('Editing accentRecolor.ts')] } },
    });
    let sub = buildLanes(src).find((l) => l.isSub)!;
    expect(sub.name).toBe('construtor');
    expect(sub.activity).toBe('Trocar a cor dos móveis');

    subCh.sessimProgress = { done: 2, total: 5, note: 'trocando a cor dos móveis' };
    sub = buildLanes(src).find((l) => l.isSub)!;
    expect(sub.activity).toBe('Trocar a cor dos móveis · etapa 2 de 5: trocando a cor dos móveis');
    expect(sub.step).toEqual({ done: 2, total: 5 });

    // Sem description (sub criado tarde), herda a finalidade da sessão-mãe.
    subs[0].label = '';
    sub = buildLanes(src).find((l) => l.isSub)!;
    expect(sub.activity).toBe('Deixando o mapa verde · etapa 2 de 5: trocando a cor dos móveis');
  });
});

describe('buildLanes: turno encerrado', () => {
  it('sessão parada no prompt (idle_prompt) é "terminou", não "precisa de você"', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.setAgentActive(1, false);
    os.showWaitingBubble(1, true); // waitingAwaitingInput: o caso do falso alarme
    const [lane] = buildLanes(sources(os, { agentStatuses: { 1: 'waiting' } }));
    expect(lane.phase).toBe('done');
    expect(lane.activity).toBe('terminou · esperando você');
  });

  it('Stop (sem awaitingInput) também é "terminou"', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.setAgentActive(1, false);
    os.showWaitingBubble(1, false);
    expect(buildLanes(sources(os, { agentStatuses: { 1: 'waiting' } }))[0].phase).toBe('done');
  });

  it('continua "terminou" depois que o balão some, enquanto o status for waiting', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.setAgentActive(1, false);
    expect(buildLanes(sources(os, { agentStatuses: { 1: 'waiting' } }))[0].phase).toBe('done');
  });

  it('sem agentStatuses, o balão de espera é o sinal', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.setAgentActive(1, false);
    os.showWaitingBubble(1, true);
    expect(buildLanes(sources(os))[0].phase).toBe('done');
  });

  it('sem atividade conhecida é "parado"', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    os.setAgentActive(1, false);
    expect(buildLanes(sources(os, { agentStatuses: {} }))[0].phase).toBe('idle');
  });
});

describe('buildLanes: ordem', () => {
  it('precisa de você, trabalhando, terminou, parado', () => {
    const os = new OfficeState(floorLayout(12, 8));
    for (const id of [1, 2, 3, 4]) os.addAgent(id);
    os.setAgentActive(1, false); // parado
    os.setAgentActive(2, false); // terminou
    os.setAgentActive(3, true); // trabalhando
    os.setAgentActive(4, true);
    os.showPermissionBubble(4); // precisa de você
    const lanes = buildLanes(
      sources(os, {
        agentTools: { 3: [tool('Reading a.ts')], 4: [tool('Editing b.ts')] },
        agentStatuses: { 2: 'waiting' },
      }),
    );
    expect(lanes.map((l) => [l.id, l.phase])).toEqual([
      [4, 'attention'],
      [3, 'working'],
      [2, 'done'],
      [1, 'idle'],
    ]);
  });
});
