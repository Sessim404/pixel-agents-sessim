/**
 * Sessim: sessão com o turno encerrado nunca fica "trabalhando" no quadro.
 * - o fim do turno no transcript atual é o stop_hook_summary (sem turn_duration);
 * - ao restaurar (Reload Window), a sessão encerrada volta como 'waiting';
 * - ferramenta de sub-agente em segundo plano não reativa a sessão-mãe parada.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StateAdapter } from '../../core/src/adapter.js';
import type { PersistedAgent } from '../../core/src/schemas.js';
import { resendAgentActivity } from '../src/agentActivityResend.js';
import { AgentRuntime } from '../src/agentRuntime.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { HookEventHandler, isSubagentHook } from '../src/hookEventHandler.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import {
  isTurnEndRecord,
  lastTurnStateFromText,
  SESSIM_TURN_STALE_MS,
  transcriptTurnEnded,
} from '../src/sessimTurnState.js';
import { SessionRouter } from '../src/sessionRouter.js';
import { processTranscriptLine, setHookProvider } from '../src/transcriptParser.js';
import type { AgentState } from '../src/types.js';

const j = (o: unknown) => JSON.stringify(o);
const stopSummary = j({ type: 'system', subtype: 'stop_hook_summary', hookCount: 1 });
const toolUse = j({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 'toolu_x', name: 'Bash', input: {} }] },
});
const textReply = j({
  type: 'assistant',
  message: { content: [{ type: 'text', text: 'Pronto.' }] },
});
const userPrompt = j({ type: 'user', message: { content: 'faz isso' } });

function testAgent(over: Partial<AgentState> = {}): AgentState {
  return {
    id: 1,
    sessionId: 'sess-1',
    terminalRef: undefined,
    isExternal: true,
    projectDir: '/test',
    jsonlFile: '/test/session.jsonl',
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
    ...over,
  } as AgentState;
}

describe('lastTurnStateFromText', () => {
  it('stop_hook_summary depois da resposta = turno encerrado (ignora registros de bookkeeping)', () => {
    const text = [
      userPrompt,
      toolUse,
      textReply,
      stopSummary,
      j({ type: 'last-prompt' }),
      j({ type: 'cost-state' }),
    ].join('\n');
    expect(lastTurnStateFromText(text)).toBe('ended');
  });

  it('turn_duration (formato antigo) também encerra', () => {
    expect(
      lastTurnStateFromText([toolUse, j({ type: 'system', subtype: 'turn_duration' })].join('\n')),
    ).toBe('ended');
  });

  it('ferramenta ou pedido depois do último Stop = turno rodando', () => {
    expect(lastTurnStateFromText([stopSummary, userPrompt].join('\n'))).toBe('running');
    expect(lastTurnStateFromText([stopSummary, userPrompt, toolUse].join('\n'))).toBe('running');
  });

  it('Esc no meio do turno encerra', () => {
    const interrupted = j({
      type: 'user',
      message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] },
    });
    expect(lastTurnStateFromText([toolUse, interrupted].join('\n'))).toBe('ended');
  });

  it('sem registro decisivo = null', () => {
    expect(lastTurnStateFromText([j({ type: 'last-prompt' }), 'lixo{'].join('\n'))).toBeNull();
  });

  it('isTurnEndRecord', () => {
    expect(isTurnEndRecord({ type: 'system', subtype: 'stop_hook_summary' })).toBe(true);
    expect(isTurnEndRecord({ type: 'system', subtype: 'compact_boundary' })).toBe(false);
    expect(isTurnEndRecord(null)).toBe(false);
  });
});

describe('transcriptTurnEnded (arquivo)', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessim-turn-'));
    file = path.join(dir, 'sess.jsonl');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('turno encerrado no fim do arquivo', () => {
    fs.writeFileSync(file, [userPrompt, toolUse, textReply, stopSummary, ''].join('\n'));
    expect(transcriptTurnEnded(file)).toBe(true);
  });

  it('turno rodando e arquivo recente: não encerrado', () => {
    fs.writeFileSync(file, [userPrompt, toolUse, ''].join('\n'));
    expect(transcriptTurnEnded(file)).toBe(false);
  });

  it('turno "rodando" mas nada escrito há mais de 30 min: parado', () => {
    fs.writeFileSync(file, [userPrompt, toolUse, ''].join('\n'));
    const old = (Date.now() - SESSIM_TURN_STALE_MS - 60_000) / 1000;
    fs.utimesSync(file, old, old);
    expect(transcriptTurnEnded(file)).toBe(true);
  });

  it('sub-agente em primeiro plano escrevendo agora: ainda rodando', () => {
    fs.writeFileSync(file, [userPrompt, toolUse, ''].join('\n'));
    const old = (Date.now() - SESSIM_TURN_STALE_MS - 60_000) / 1000;
    fs.utimesSync(file, old, old);
    const sub = path.join(dir, 'sess', 'subagents');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'agent-abc.jsonl'), toolUse + '\n');
    expect(transcriptTurnEnded(file)).toBe(false);
  });

  it('arquivo inexistente: não decide (false)', () => {
    expect(transcriptTurnEnded(path.join(dir, 'nada.jsonl'))).toBe(false);
  });
});

describe('transcriptParser: stop_hook_summary encerra o turno', () => {
  it('sem hooks, uma sessão que usou ferramentas termina no stop_hook_summary', () => {
    vi.useFakeTimers();
    try {
      setHookProvider(claudeProvider);
      const agents = new AgentStateStore();
      const agent = testAgent();
      agents.set(1, agent);
      const msgs: Array<Record<string, unknown>> = [];
      agents.on('broadcast', (m) => msgs.push(m as Record<string, unknown>));
      const wt = new Map<number, ReturnType<typeof setTimeout>>();
      const pt = new Map<number, ReturnType<typeof setTimeout>>();

      processTranscriptLine(1, toolUse, agents, wt, pt);
      expect(agent.isWaiting).toBe(false);
      processTranscriptLine(1, textReply, agents, wt, pt);
      processTranscriptLine(1, stopSummary, agents, wt, pt);

      expect(agent.isWaiting).toBe(true);
      expect(agent.activeToolIds.size).toBe(0);
      const last = msgs.filter((m) => m.type === 'agentStatus').pop();
      expect(last).toMatchObject({ id: 1, status: 'waiting' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('restauração (Reload Window)', () => {
  let dir: string;
  let file: string;
  let runtime: AgentRuntime | undefined;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessim-restore-'));
    file = path.join(dir, 'sess.jsonl');
  });
  afterEach(() => {
    runtime?.dispose();
    runtime = undefined;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function restore(): AgentStateStore {
    const persisted: PersistedAgent[] = [
      {
        id: 9,
        sessionId: 'sess',
        terminalName: '',
        isExternal: true,
        jsonlFile: file,
        projectDir: dir,
      },
    ];
    const adapter: StateAdapter = {
      loadAgents: () => persisted,
      saveAgents: () => {},
      loadSeats: () => ({}),
      saveSeats: () => {},
      getSetting: <T>(_k: string, d: T): T => d,
      setSetting: () => {},
    };
    const store = new AgentStateStore();
    store.setAdapter(adapter);
    runtime = new AgentRuntime(store, claudeProvider);
    runtime.restoreExternalAgents();
    return store;
  }

  it('sessão com turno encerrado volta como waiting e o webview recebe o status', () => {
    fs.writeFileSync(file, [userPrompt, toolUse, textReply, stopSummary, ''].join('\n'));
    const store = restore();
    expect(store.get(9)?.isWaiting).toBe(true);
    const sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((m) => sent.push(m), store);
    expect(sent).toContainEqual({ type: 'agentStatus', id: 9, status: 'waiting' });
  });

  it('sessão no meio do turno volta ativa (sem waiting)', () => {
    fs.writeFileSync(file, [userPrompt, toolUse, ''].join('\n'));
    const store = restore();
    expect(store.get(9)?.isWaiting).toBe(false);
  });
});

describe('hook de sub-agente não reativa a sessão-mãe parada', () => {
  function setup(isWaiting: boolean) {
    const agents = new AgentStateStore();
    const msgs: Array<Record<string, unknown>> = [];
    agents.on('broadcast', (m) => msgs.push(m as Record<string, unknown>));
    const handler = new HookEventHandler(
      agents,
      new Map(),
      new Map(),
      claudeProvider,
      new SessionRouter(),
    );
    const agent = testAgent({ isWaiting });
    agents.set(1, agent);
    handler.registerAgent('sess-1', 1);
    return { handler, agent, msgs };
  }

  it('isSubagentHook', () => {
    expect(isSubagentHook({ hook_event_name: 'PreToolUse', session_id: 's', agent_id: 'a1' })).toBe(
      true,
    );
    expect(isSubagentHook({ hook_event_name: 'PreToolUse', session_id: 's' })).toBe(false);
    expect(isSubagentHook(undefined)).toBe(false);
  });

  it('mãe já terminou o turno: PreToolUse com agent_id não manda active', () => {
    const { handler, agent, msgs } = setup(true);
    handler.handleEvent('claude', {
      hook_event_name: 'PreToolUse',
      session_id: 'sess-1',
      agent_id: 'a15a4632',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    });
    expect(agent.isWaiting).toBe(true);
    expect(msgs.some((m) => m.type === 'agentStatus' && m.status === 'active')).toBe(false);
  });

  it('PreToolUse da própria sessão (sem agent_id) reativa normalmente', () => {
    const { handler, agent, msgs } = setup(true);
    handler.handleEvent('claude', {
      hook_event_name: 'PreToolUse',
      session_id: 'sess-1',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    });
    expect(agent.isWaiting).toBe(false);
    expect(msgs.some((m) => m.type === 'agentStatus' && m.status === 'active')).toBe(true);
  });
});
