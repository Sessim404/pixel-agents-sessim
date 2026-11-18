// Sessim: descobre, pelo fim do transcript, se a sessão terminou o turno.
//
// Dois furos deixavam uma sessão encerrada como "trabalhando" no quadro:
// 1. O Claude Code não grava mais `turn_duration`. O fim do turno no transcript
//    agora é o registro `system`/`stop_hook_summary` (escrito depois dos hooks de
//    Stop). Sem ele, quem não recebe o hook Stop nunca terminava.
// 2. Ao restaurar agentes (Reload Window), a leitura recomeça do fim do arquivo e
//    o estado nasce "ativo". Sem um `agentStatus: waiting` reenviado, o webview
//    mostrava a sessão trabalhando para sempre.

import * as fs from 'fs';
import * as path from 'path';

/** Sem nada escrito no transcript (nem nos sub-agentes) há este tempo, a sessão está parada. */
export const SESSIM_TURN_STALE_MS = 30 * 60_000;

/** Quanto do fim do transcript é lido para achar o último registro de turno. */
const TAIL_BYTES = 256 * 1024;

/** Registro que encerra o turno: `turn_duration` (antigo) ou `stop_hook_summary` (atual). */
export function isTurnEndRecord(record: { type?: unknown; subtype?: unknown } | null): boolean {
  return (
    record?.type === 'system' &&
    (record.subtype === 'turn_duration' || record.subtype === 'stop_hook_summary')
  );
}

/**
 * O que o último registro relevante do transcript diz sobre o turno:
 * 'ended' (Stop ou interrupção), 'running' (pergunta ou resposta no meio do turno)
 * ou null (nada decisivo no trecho lido).
 */
export function lastTurnStateFromText(text: string): 'ended' | 'running' | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    let record: {
      type?: unknown;
      subtype?: unknown;
      isSidechain?: unknown;
      message?: { content?: unknown };
    };
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (isTurnEndRecord(record)) return 'ended';
    // Registros de sub-agente embutidos (formatos antigos) não dizem nada da sessão.
    if (record.isSidechain === true) continue;
    if (record.type === 'assistant') return 'running';
    if (record.type === 'user') {
      const content = record.message?.content;
      const texts =
        typeof content === 'string'
          ? [content]
          : Array.isArray(content)
            ? content.map((b: { text?: unknown }) => (typeof b?.text === 'string' ? b.text : ''))
            : [];
      // Esc no meio do turno: o Claude Code grava esta linha e não roda o Stop.
      if (texts.some((t) => t.startsWith('[Request interrupted by user'))) return 'ended';
      return 'running';
    }
    // last-prompt, cost-state, attachment, queue-operation etc.: não decidem nada.
  }
  return null;
}

/** Última escrita (ms) no transcript ou nos transcripts dos sub-agentes dele. */
export function lastTranscriptWriteMs(jsonlFile: string): number {
  let latest = 0;
  try {
    latest = fs.statSync(jsonlFile).mtimeMs;
  } catch {
    return 0;
  }
  // Um sub-agente em primeiro plano escreve só no arquivo dele; a sessão-mãe fica quieta.
  const subDir = path.join(jsonlFile.replace(/\.jsonl$/, ''), 'subagents');
  try {
    for (const name of fs.readdirSync(subDir)) {
      if (!name.endsWith('.jsonl')) continue;
      try {
        latest = Math.max(latest, fs.statSync(path.join(subDir, name)).mtimeMs);
      } catch {
        // arquivo sumiu no meio da leitura
      }
    }
  } catch {
    // sem sub-agentes
  }
  return latest;
}

function readTail(file: string): string | null {
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const length = size - start;
    if (length <= 0) return '';
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      const text = buf.toString('utf8');
      // Começo no meio do arquivo cai dentro de um registro: descarta o pedaço.
      return start > 0 ? text.slice(text.indexOf('\n') + 1) : text;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/**
 * Ao restaurar uma sessão: o turno dela já terminou? Sim quando o último registro
 * de turno é um fim (Stop/interrupção) ou quando nada foi escrito há
 * SESSIM_TURN_STALE_MS (processo fechado no meio do turno, por exemplo).
 */
export function transcriptTurnEnded(jsonlFile: string, now = Date.now()): boolean {
  const text = readTail(jsonlFile);
  if (text === null) return false;
  if (lastTurnStateFromText(text) === 'ended') return true;
  const lastWrite = lastTranscriptWriteMs(jsonlFile);
  return lastWrite > 0 && now - lastWrite > SESSIM_TURN_STALE_MS;
}
