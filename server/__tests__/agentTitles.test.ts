/**
 * Sessim: finalidade de cada sessão para o quadro (ferramenta
 * mcp__savvy-progress__finalidade > custom-title > ai-title), com backfill do fim
 * do JSONL em sessões restauradas.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resendAgentActivity } from '../src/agentActivityResend.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import {
  backfillAgentTitle,
  PURPOSE_TOOL,
  purposeFromTool,
  shortenTitle,
} from '../src/agentTitles.js';
import { claudeProvider, formatToolStatus } from '../src/providers/hook/claude/claude.js';
import { processTranscriptLine, setHookProvider } from '../src/transcriptParser.js';
import type { AgentState } from '../src/types.js';

function createTestAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 1,
    sessionId: 'sess-1',
    terminalRef: undefined,
    isExternal: true,
    projectDir: '/test',
    jsonlFile: '/test/nao-existe.jsonl',
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundSpawns: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: false,
    contextTokens: 0,
    maxContextTokens: 200_000,
    ...overrides,
  } as AgentState;
}

function harness(agentOverrides: Partial<AgentState> = {}) {
  setHookProvider(claudeProvider);
  const agents = new AgentStateStore();
  const sent: Array<Record<string, unknown>> = [];
  agents.on('broadcast', (m: Record<string, unknown>) => sent.push(m));
  const agent = createTestAgent(agentOverrides);
  agents.set(1, agent);
  const feed = (record: unknown) =>
    processTranscriptLine(1, JSON.stringify(record), agents, new Map(), new Map());
  const titles = () => sent.filter((m) => m.type === 'agentTitle').map((m) => m.title);
  return { agents, agent, feed, titles, sent };
}

/** Mensagem do assistente chamando a ferramenta de finalidade. */
const purposeCall = (texto: string, id = 'toolu_fin') => ({
  type: 'assistant',
  message: {
    model: 'claude-opus-5-5',
    content: [{ type: 'tool_use', id, name: PURPOSE_TOOL, input: { texto } }],
  },
});

describe('shortenTitle e purposeFromTool', () => {
  it('deixa curto como está e corta longo em palavra, com "…"', () => {
    expect(shortenTitle('Montando kit do Segundo Cérebro')).toBe('Montando kit do Segundo Cérebro');
    const long =
      'Montando o kit completo do Segundo Cérebro para o colega, com prompts para GPT e Claude web e o roteiro';
    const out = shortenTitle(long);
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith('…')).toBe(true);
    expect(shortenTitle('a\n\n  b')).toBe('a b');
  });

  it('só a ferramenta certa conta, e o texto vazio não', () => {
    expect(purposeFromTool(PURPOSE_TOOL, { texto: ' Deixando o mapa verde ' })).toBe(
      'Deixando o mapa verde',
    );
    expect(purposeFromTool(PURPOSE_TOOL, { texto: '  ' })).toBeUndefined();
    expect(purposeFromTool('mcp__savvy-progress__step', { note: 'x' })).toBeUndefined();
    expect(formatToolStatus(PURPOSE_TOOL, { texto: 'Deixando o mapa verde' })).toBe(
      'Finalidade: Deixando o mapa verde',
    );
  });
});

describe('processTranscriptLine: finalidade da sessão', () => {
  it('a ferramenta finalidade vira agentTitle; a chamada mais nova vale; repetida não reenvia', () => {
    const h = harness();
    h.feed(purposeCall('Montando kit do Segundo Cérebro'));
    expect(h.titles()).toEqual(['Montando kit do Segundo Cérebro']);
    h.feed(purposeCall('Montando kit do Segundo Cérebro', 'toolu_2'));
    expect(h.titles()).toHaveLength(1);
    h.feed(purposeCall('Deixando o mapa verde', 'toolu_3'));
    expect(h.titles()).toEqual(['Montando kit do Segundo Cérebro', 'Deixando o mapa verde']);
    // Uma ferramenta comum no meio não mexe no título.
    h.feed({
      type: 'assistant',
      message: {
        model: 'claude-opus-5-5',
        content: [{ type: 'tool_use', id: 'toolu_4', name: 'Edit', input: { file_path: 'a.ts' } }],
      },
    });
    expect(h.titles()).toHaveLength(2);
  });

  it('sem finalidade: custom-title ganha de ai-title; a finalidade ganha dos dois', () => {
    const h = harness();
    h.feed({ type: 'ai-title', aiTitle: 'Últimas alterações não finalizadas', sessionId: 's' });
    expect(h.titles()).toEqual(['Últimas alterações não finalizadas']);
    h.feed({ type: 'custom-title', customTitle: 'Quarto verde', sessionId: 's' });
    expect(h.titles()).toEqual(['Últimas alterações não finalizadas', 'Quarto verde']);
    // Um ai-title novo não passa por cima do nome que o usuário deu.
    h.feed({ type: 'ai-title', aiTitle: 'Outro', sessionId: 's' });
    expect(h.titles()).toHaveLength(2);
    h.feed(purposeCall('Deixando o mapa verde'));
    expect(h.titles()[2]).toBe('Deixando o mapa verde');
    // last-prompt e mensagem do usuário não são fonte de título.
    h.feed({ type: 'last-prompt', lastPrompt: 'Conseguimos evitar agents iguais?' });
    h.feed({ type: 'user', message: { role: 'user', content: 'E agora?' } });
    expect(h.titles()).toHaveLength(3);
    expect(h.agent.seenUnknownRecordTypes.size).toBe(0);
  });
});

describe('backfillAgentTitle', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessim-titles-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sessão restaurada (lendo do fim) recupera a finalidade já gravada no arquivo', () => {
    const file = path.join(dir, 's.jsonl');
    const lines = [
      { type: 'ai-title', aiTitle: 'Últimas alterações não finalizadas' },
      { type: 'user', message: { content: 'Deixa o quarto verde' } },
      purposeCall('Deixando o mapa verde'),
      { type: 'last-prompt', lastPrompt: 'Deixa o quarto verde' },
    ];
    fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const h = harness({ jsonlFile: file, fileOffset: fs.statSync(file).size });
    // Primeira linha nova depois da restauração: dispara o backfill.
    h.feed({
      type: 'assistant',
      message: { model: 'claude-opus-5-5', content: [{ type: 'text', text: 'x' }] },
    });
    expect(h.titles()).toEqual(['Deixando o mapa verde']);
    expect(h.agent.titleBackfilled).toBe(true);
  });

  it('só lê uma vez e aguenta arquivo inexistente ou rabo com linha quebrada', () => {
    const agents = new AgentStateStore();
    const agent = createTestAgent();
    agents.set(1, agent);
    backfillAgentTitle(1, agent, agents);
    expect(agent.titleBackfilled).toBe(true);
    expect(agent.title).toBeUndefined();

    const file = path.join(dir, 'tail.jsonl');
    const body =
      JSON.stringify({ type: 'ai-title', aiTitle: 'Antigo' }) +
      '\n' +
      JSON.stringify({ type: 'ai-title', aiTitle: 'Novo título' }) +
      '\n';
    fs.writeFileSync(file, body);
    const agent2 = createTestAgent({ jsonlFile: file });
    agents.set(1, agent2);
    // Rabo menor que o arquivo: a primeira linha chega quebrada e é ignorada.
    backfillAgentTitle(1, agent2, agents, body.length - 10);
    expect(agent2.title).toBe('Novo título');
  });
});

describe('resendAgentActivity', () => {
  it('reenvia a finalidade na reconexão, antes do modelo', () => {
    const store = new AgentStateStore();
    store.set(1, createTestAgent({ title: 'Deixando o mapa verde', model: 'claude-opus-5-5' }));
    const sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((m) => sent.push(m), store);
    expect(sent.map((m) => m.type)).toEqual(['agentTitle', 'agentModel']);
    expect(sent[0]).toEqual({ type: 'agentTitle', id: 1, title: 'Deixando o mapa verde' });
  });
});
