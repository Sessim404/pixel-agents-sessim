/**
 * Sessim: leitura do modelo de cada agente (message.model do JSONL, agent_progress
 * do sub-agente e frontmatter de ~/.claude/agents como plano B).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearAgentModelCache,
  noteSubagentModel,
  readAgentFrontmatterModel,
} from '../src/agentModels.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { processTranscriptLine, setHookProvider } from '../src/transcriptParser.js';
import type { AgentState } from '../src/types.js';

function createTestAgent(overrides: Partial<AgentState> = {}): AgentState {
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
    ...overrides,
  } as AgentState;
}

const assistantLine = (model: string, content: unknown[] = [{ type: 'text', text: 'oi' }]) =>
  JSON.stringify({ type: 'assistant', message: { model, content } });

describe('readAgentFrontmatterModel', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessim-agents-'));
    clearAgentModelCache();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    clearAgentModelCache();
  });

  it('lê o model: do frontmatter', () => {
    fs.writeFileSync(
      path.join(dir, 'explorador.md'),
      '---\nname: explorador\ndescription: x\nmodel: haiku\n---\n\ncorpo model: nao\n',
    );
    expect(readAgentFrontmatterModel('explorador', dir)).toBe('haiku');
  });

  it('sem arquivo, sem frontmatter ou sem model: null; tipo inválido nunca lê fora da pasta', () => {
    fs.writeFileSync(path.join(dir, 'semfm.md'), 'só texto\nmodel: sonnet\n');
    fs.writeFileSync(path.join(dir, 'semmodel.md'), '---\nname: a\n---\n');
    expect(readAgentFrontmatterModel('nao-existe', dir)).toBeNull();
    expect(readAgentFrontmatterModel('semfm', dir)).toBeNull();
    expect(readAgentFrontmatterModel('semmodel', dir)).toBeNull();
    expect(readAgentFrontmatterModel('../explorador', dir)).toBeNull();
  });
});

describe('transcriptParser: modelo dos agentes', () => {
  let agents: AgentStateStore;
  let agent: AgentState;
  let messages: Array<Record<string, unknown>>;
  const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const models = () => messages.filter((m) => m.type === 'agentModel');

  beforeEach(() => {
    setHookProvider(claudeProvider);
    agents = new AgentStateStore();
    agent = createTestAgent();
    agents.set(1, agent);
    messages = [];
    agents.on('broadcast', (msg) => {
      messages.push(msg as Record<string, unknown>);
    });
  });

  it('manda o modelo da sessão uma vez e de novo só quando muda (/model)', () => {
    processTranscriptLine(
      1,
      assistantLine('claude-opus-5-5'),
      agents,
      waitingTimers,
      permissionTimers,
    );
    processTranscriptLine(
      1,
      assistantLine('claude-opus-5-5'),
      agents,
      waitingTimers,
      permissionTimers,
    );
    processTranscriptLine(
      1,
      assistantLine('claude-sonnet-5-5'),
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(models()).toEqual([
      { type: 'agentModel', id: 1, model: 'claude-opus-5-5' },
      { type: 'agentModel', id: 1, model: 'claude-sonnet-5-5' },
    ]);
    expect(agent.model).toBe('claude-sonnet-5-5');
  });

  it('sub-agente: modelo real do agent_progress substitui o plano B', () => {
    const spawn = assistantLine('claude-opus-5-5', [
      {
        type: 'tool_use',
        id: 'toolu_task',
        name: 'Task',
        input: { subagent_type: 'tipo-sem-arquivo' },
      },
    ]);
    processTranscriptLine(1, spawn, agents, waitingTimers, permissionTimers);
    // Plano B (como se viesse do frontmatter).
    noteSubagentModel(1, agent, agents, 'toolu_task', 'fable', true);
    const progress = JSON.stringify({
      type: 'progress',
      parentToolUseID: 'toolu_task',
      data: {
        type: 'agent_progress',
        message: {
          type: 'assistant',
          message: {
            model: 'claude-fable-5-1',
            content: [
              { type: 'tool_use', id: 'toolu_sub', name: 'Read', input: { file_path: 'a' } },
            ],
          },
        },
      },
    });
    processTranscriptLine(1, progress, agents, waitingTimers, permissionTimers);
    // Um plano B tardio não sobrescreve o modelo real.
    noteSubagentModel(1, agent, agents, 'toolu_task', 'fable', true);
    expect(models().filter((m) => m.parentToolId === 'toolu_task')).toEqual([
      { type: 'agentModel', id: 1, parentToolId: 'toolu_task', model: 'fable' },
      { type: 'agentModel', id: 1, parentToolId: 'toolu_task', model: 'claude-fable-5-1' },
    ]);
    expect(agent.subagentModels?.get('toolu_task')).toBe('claude-fable-5-1');
  });
});
