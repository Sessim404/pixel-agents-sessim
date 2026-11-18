/**
 * Sessim: qual modelo cada agente está usando.
 *
 * O modelo real vem de `message.model` das mensagens do assistente no JSONL
 * (sessão) ou do `agent_progress` / transcript próprio (sub-agente). Antes da
 * primeira mensagem, o plano B é o `model:` do frontmatter de
 * ~/.claude/agents/<tipo>.md. Toda mudança vai ao webview como `agentModel`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentStateStore } from './agentStateStore.js';
import type { AgentState } from './types.js';

/** Pasta dos agentes globais do Claude Code (frontmatter com `model:`). */
export function defaultAgentsDir(): string {
  return path.join(os.homedir(), '.claude', 'agents');
}

const frontmatterCache = new Map<string, string | null>();

/** Esquece o cache (testes e recarga). */
export function clearAgentModelCache(): void {
  frontmatterCache.clear();
}

/**
 * `model:` do frontmatter de `<dir>/<type>.md`, ou null se não houver.
 * Só aceita nomes de tipo simples (sem barra), para nunca ler fora da pasta.
 */
export function readAgentFrontmatterModel(
  type: string,
  dir: string = defaultAgentsDir(),
): string | null {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(type)) return null;
  const file = path.join(dir, `${type}.md`);
  const cached = frontmatterCache.get(file);
  if (cached !== undefined) return cached;
  let model: string | null = null;
  try {
    const head = fs.readFileSync(file, 'utf-8').slice(0, 4000);
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head);
    const m = fm ? /^model:\s*["']?([^"'\r\n#]+?)["']?\s*$/m.exec(fm[1]) : null;
    model = m ? m[1].trim() : null;
  } catch {
    model = null;
  }
  frontmatterCache.set(file, model);
  return model;
}

/** Guarda o modelo da sessão e avisa o webview se mudou (/model no meio conta). */
export function noteAgentModel(
  agentId: number,
  agent: AgentState,
  agents: AgentStateStore,
  model: unknown,
): void {
  if (typeof model !== 'string' || !model || agent.model === model) return;
  agent.model = model;
  agents.broadcast({ type: 'agentModel', id: agentId, model });
}

/**
 * Guarda o modelo de um sub-agente (chave: tool_use do spawn) e avisa o
 * webview se mudou. `provisional` é o plano B do frontmatter: não sobrescreve
 * um modelo real já visto.
 */
export function noteSubagentModel(
  agentId: number,
  agent: AgentState,
  agents: AgentStateStore,
  parentToolId: string,
  model: unknown,
  provisional = false,
): void {
  if (typeof model !== 'string' || !model) return;
  const models = (agent.subagentModels ??= new Map());
  if (models.get(parentToolId) === model) return;
  if (provisional && models.has(parentToolId)) return;
  models.set(parentToolId, model);
  agents.broadcast({ type: 'agentModel', id: agentId, parentToolId, model });
}
