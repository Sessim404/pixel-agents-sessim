/**
 * Sessim: a linha de atividade do quadro de progresso.
 *
 * Ela diz a FINALIDADE do que o agente está fazendo, nas palavras do próprio
 * agente ("Montando kit do Segundo Cérebro", "Deixando o mapa verde"), nunca
 * a ferramenta ou o arquivo. A sessão principal declara a finalidade pela
 * ferramenta `mcp__savvy-progress__finalidade` (servidor: agentTitles.ts); o
 * sub-agente usa a tarefa que recebeu (description do Agent). Depois da
 * finalidade só entram sufixos curtos de estado: "· etapa 2 de 5: lendo
 * scripts" (o nome da etapa vem da note do agente) e "· precisa de você".
 */

import type { SessimProgress } from './sessimRoles.js';

export const PHRASE_NEEDS_YOU = 'precisa de você';
/** Quando ninguém declarou finalidade ainda. */
export const PHRASE_NO_PURPOSE = 'Em andamento';

const SEP = ' · ';

/** "etapa 2 de 5: lendo scripts" — o nome da etapa (note) quando o agente informa. */
export function stepSuffix(step: SessimProgress | null | undefined): string | null {
  if (!step || step.total <= 0) return null;
  const count = `etapa ${Math.min(step.done, step.total)} de ${step.total}`;
  const note = (step.note ?? '').trim();
  return note ? `${count}: ${note}` : count;
}

/**
 * Monta a linha: finalidade (ou "Em andamento") seguida dos sufixos de estado
 * que existirem. Ex.: "Deixando o mapa verde · etapa 2 de 5".
 */
export function laneActivity(
  purpose: string | null | undefined,
  ...suffixes: Array<string | null | undefined>
): string {
  const head = (purpose ?? '').trim() || PHRASE_NO_PURPOSE;
  return [head, ...suffixes.filter((s): s is string => !!s && s.trim() !== '')].join(SEP);
}
