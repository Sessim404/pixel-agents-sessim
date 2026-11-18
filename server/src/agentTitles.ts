/**
 * Sessim: a FINALIDADE de cada sessão, para o quadro de progresso dizer o que
 * o agente está fazendo e para quê ("Montando kit do Segundo Cérebro") em vez
 * do arquivo que está sendo editado.
 *
 * Fonte principal: a própria sessão declara, chamando a ferramenta
 * `mcp__savvy-progress__finalidade` (plugin savvy-progress) com um texto curto
 * a cada pedido novo; vale o valor mais recente. Sem chamada, plano B:
 * `custom-title` (o usuário renomeou a sessão) e, por último, `ai-title`
 * (título automático: sai da primeira mensagem e nunca muda). Toda mudança do
 * título efetivo vai ao webview como `agentTitle`.
 *
 * Sessões restauradas começam a ler o JSONL do fim, então o que já estava
 * gravado nunca chegaria: `backfillAgentTitle` lê o rabo do arquivo uma vez,
 * na primeira linha processada.
 */

import * as fs from 'fs';

import type { AgentStateStore } from './agentStateStore.js';
import type { AgentState } from './types.js';

/** Ferramenta do plugin savvy-progress com que a sessão declara a finalidade. */
export const PURPOSE_TOOL = 'mcp__savvy-progress__finalidade';
/** Tamanho máximo do título mostrado (o resto vira "…"). */
export const TITLE_MAX_LENGTH = 80;
/** Quanto do fim do JSONL é lido no backfill (títulos e finalidade ficam perto do fim). */
const BACKFILL_TAIL_BYTES = 512 * 1024;

/** Uma linha só, corte em palavra, "…" no fim quando passa do limite. */
export function shortenTitle(text: string, max = TITLE_MAX_LENGTH): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const head = space > max * 0.5 ? cut.slice(0, space) : cut;
  return head.replace(/[\s,;:.!?…-]+$/u, '') + '…';
}

/** Título efetivo pela prioridade (undefined quando ainda não há nada). */
export function effectiveTitle(agent: AgentState): string | undefined {
  const raw = agent.titlePurpose || agent.titleCustom || agent.titleAi;
  return raw ? shortenTitle(raw) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Texto da finalidade numa chamada da ferramenta, ou undefined se não for ela. */
export function purposeFromTool(toolName: string, input: unknown): string | undefined {
  if (toolName !== PURPOSE_TOOL) return undefined;
  const inp = (input ?? {}) as Record<string, unknown>;
  return str(inp.texto ?? inp.text ?? inp.title);
}

/**
 * Lê um registro do JSONL e guarda o que serve de título. Devolve true se o
 * registro era de título (para o parser não o tratar como desconhecido).
 */
export function absorbTitleRecord(agent: AgentState, record: Record<string, unknown>): boolean {
  switch (record.type) {
    case 'custom-title':
      agent.titleCustom = str(record.customTitle ?? record.title);
      return true;
    case 'ai-title':
      agent.titleAi = str(record.aiTitle ?? record.title);
      return true;
    case 'assistant': {
      // Chamada da ferramenta de finalidade dentro da mensagem do assistente.
      const message = record.message as Record<string, unknown> | undefined;
      const content = message?.content ?? record.content;
      if (Array.isArray(content)) {
        for (const block of content as Array<{ type?: string; name?: string; input?: unknown }>) {
          if (block.type !== 'tool_use' || typeof block.name !== 'string') continue;
          const p = purposeFromTool(block.name, block.input);
          if (p) agent.titlePurpose = p;
        }
      }
      return false;
    }
    default:
      return false;
  }
}

/** Avisa o webview se o título efetivo mudou. */
export function broadcastTitleIfChanged(
  agentId: number,
  agent: AgentState,
  agents: AgentStateStore,
): void {
  const title = effectiveTitle(agent);
  if (!title || title === agent.title) return;
  agent.title = title;
  agents.broadcast({ type: 'agentTitle', id: agentId, title });
}

/** `absorbTitleRecord` + aviso ao webview. Devolve true se era registro de título. */
export function noteAgentTitleRecord(
  agentId: number,
  agent: AgentState,
  agents: AgentStateStore,
  record: Record<string, unknown>,
): boolean {
  const handled = absorbTitleRecord(agent, record);
  broadcastTitleIfChanged(agentId, agent, agents);
  return handled;
}

/**
 * Uma vez por agente: lê o fim do JSONL já existente atrás de títulos e
 * finalidade gravados antes de o servidor começar a acompanhar o arquivo.
 * Linhas quebradas no início do rabo são ignoradas.
 */
export function backfillAgentTitle(
  agentId: number,
  agent: AgentState,
  agents: AgentStateStore,
  tailBytes = BACKFILL_TAIL_BYTES,
): void {
  if (agent.titleBackfilled) return;
  agent.titleBackfilled = true;
  if (!agent.jsonlFile) return;
  let text: string;
  try {
    const stat = fs.statSync(agent.jsonlFile);
    const start = Math.max(0, stat.size - tailBytes);
    const buf = Buffer.alloc(stat.size - start);
    const fd = fs.openSync(agent.jsonlFile, 'r');
    try {
      fs.readSync(fd, buf, 0, buf.length, start);
    } finally {
      fs.closeSync(fd);
    }
    text = buf.toString('utf-8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    // Só o que interessa, sem fazer JSON.parse de todo o transcript.
    if (!/"type":"(?:ai-title|custom-title)"/.test(line) && !line.includes(PURPOSE_TOOL)) continue;
    try {
      absorbTitleRecord(agent, JSON.parse(line) as Record<string, unknown>);
    } catch {
      // linha quebrada no início do rabo
    }
  }
  broadcastTitleIfChanged(agentId, agent, agents);
}
