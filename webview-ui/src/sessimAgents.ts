/**
 * Sessim: junta, para cada agente do escritório, o que a pista de progresso
 * precisa mostrar — nome, cor do papel, atividade atual, fase e etapa.
 * Sem React e sem desenho: só lê o estado que o webview já mantém.
 */

import { shortModelName } from '../../core/src/modelNames.js';
import type { OfficeState } from './office/engine/officeState.js';
import type { ToolActivity } from './office/types.js';
import { laneActivity, PHRASE_NEEDS_YOU, stepSuffix } from './sessimActivity.js';
import { lulaLane } from './sessimLula.js';
import { lulaPalette } from './sessimPalette.js';
import { roleColor, sessionColor, splitRoleLabel } from './sessimRoles.js';

/**
 * attention: há algo para você responder (permissão ou pergunta aberta).
 * working: trabalhando. done: terminou o turno e espera a próxima mensagem.
 * idle: parado, sem atividade conhecida. Só attention e working ganham linha
 * no quadro; done e idle vão para o rodapé "Paradas:" e saem dele depois de
 * LANE_STALE_MS sem trabalho (voltam sozinhas se a sessão voltar a trabalhar).
 */
export type LanePhase = 'working' | 'attention' | 'done' | 'idle';

/** Parada (done/idle) há mais que isto sai do rodapé "Paradas:". */
export const LANE_STALE_MS = 30 * 60_000;

/** Status que o servidor dá à ferramenta AskUserQuestion (claude.ts). */
const ASK_USER_STATUS = 'Waiting for your answer';

export interface Lane {
  id: number;
  isSub: boolean;
  name: string;
  /**
   * Complemento mostrado apagado depois do nome ("Dave · FilmStar · Opus 5.5"):
   * o projeto da sessão, ou "do <apelido do pai>" no sub-agente, e o modelo
   * em uso quando conhecido. Vazio = nada.
   */
  suffix: string;
  /** Cor do papel; null usa a cor de texto padrão. */
  color: string | null;
  /**
   * Linha 2 do quadro: a finalidade declarada pelo agente ("Deixando o mapa
   * verde") mais sufixos curtos de estado ("· etapa 2 de 5", "· precisa de
   * você"). Nunca a ferramenta ou o arquivo (sessimActivity.ts).
   */
  activity: string;
  phase: LanePhase;
  step: { done: number; total: number } | null;
  palette: number;
  repeat: number;
}

/** O que a pista precisa de cada sub-agente (subconjunto de SubagentCharacter do hook). */
export interface SubagentLaneSource {
  id: number;
  parentAgentId: number;
  parentToolId: string;
  label: string;
}

export interface LaneSources {
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentLaneSource[];
  /** Último agentStatus por sessão ('waiting' = terminou o turno); ausente = ativo. */
  agentStatuses?: Record<number, string>;
  /**
   * Sessões que já mandaram alguma atividade (ferramenta ou status). O boneco
   * nasce "ativo"; sem nenhuma atividade vista (restaurada depois do Reload
   * Window, adotada parada) não conta como trabalhando. Ausente = não filtra.
   */
  seenActivity?: Record<number, boolean>;
  /** Agora (Date.now), para tirar do rodapé quem está parado há muito. Ausente = não tira. */
  now?: number;
}

const PT_BR: Array<[RegExp, string]> = [
  [/^Reading /, 'Lendo '],
  [/^Editing notebook$/, 'Editando notebook'],
  [/^Editing /, 'Editando '],
  [/^Writing /, 'Escrevendo '],
  [/^Running: /, 'Rodando: '],
  [/^Running subtask$/, 'Rodando subtarefa'],
  [/^Searching files$/, 'Procurando arquivos'],
  [/^Searching code$/, 'Procurando no código'],
  [/^Fetching web content$/, 'Lendo página da web'],
  [/^Searching the web$/, 'Pesquisando na web'],
  [/^Subtask: /, 'Subtarefa: '],
  [/^Waiting for your answer$/, 'Esperando sua resposta'],
  [/^Waiting for input$/, 'Esperando você'],
  [/^Needs approval$/, 'Precisa da sua aprovação'],
  [/^Planning$/, 'Planejando'],
  [/^Creating team/, 'Criando equipe'],
  [/^Sending message$/, 'Enviando mensagem'],
  [/^Idle$/, 'Parado'],
  [/^Using /, 'Usando '],
];

/** Traduz os textos de atividade que vêm do servidor (em inglês). */
export function ptBr(text: string): string {
  for (const [re, pt] of PT_BR) if (re.test(text)) return text.replace(re, pt);
  return text;
}

/**
 * Apelidos curtos para as sessões. "Sessão 3" não diz nada; "Nina · FilmStar"
 * diz quem é e onde está. O apelido sai do id (estável entre recargas), então
 * a mesma sessão mantém o mesmo nome.
 */
const NICKNAMES = [
  'Dave',
  'Nina',
  'Theo',
  'Bia',
  'Rafa',
  'Lia',
  'Bento',
  'Maya',
  'Juca',
  'Zoe',
  'Caio',
  'Lola',
  'Enzo',
  'Duda',
  'Gus',
  'Mel',
  'Pepe',
  'Ivy',
  'Rex',
  'Tito',
  'Luna',
  'Nico',
  'Sol',
  'Kiko',
];

/** Boneco do Lula (char_24, o presidiário): quem usa ele se chama Lula. */

/** Apelido fixo da sessão de id `id` (ids começam em 1); o boneco do Lula é sempre "Lula". */
export function sessionNickname(id: number, palette?: number): string {
  if (palette === lulaPalette()) return 'Lula';
  const n = Number.isFinite(id) ? Math.floor(Math.abs(id)) : 0;
  const idx = (((n - 1) % NICKNAMES.length) + NICKNAMES.length) % NICKNAMES.length;
  return NICKNAMES[idx];
}

/**
 * Parada (done/idle) cujo último trabalho conhecido foi há mais de LANE_STALE_MS.
 * Último trabalho = a resposta mais nova do transcript (sessimContextAt, que o
 * servidor lê do fim do arquivo também ao restaurar) ou o último status 'active'.
 * Sem nenhuma das duas horas, não decide aqui (trackLanes.ts cobre pelo tempo parado).
 */
function isStale(
  phase: LanePhase,
  ch: { sessimContextAt?: number; sessimActiveAt?: number },
  now: number | undefined,
): boolean {
  if (now === undefined || (phase !== 'done' && phase !== 'idle')) return false;
  const last = Math.max(ch.sessimContextAt ?? 0, ch.sessimActiveAt ?? 0);
  return last > 0 && now - last > LANE_STALE_MS;
}

/** "FilmStar" + "Opus 5.5" → "FilmStar · Opus 5.5" (partes vazias somem). */
function joinSuffix(...parts: Array<string | undefined>): string {
  return parts.filter((p): p is string => !!p).join(' · ');
}

export function buildLanes(src: LaneSources): Lane[] {
  const {
    officeState,
    agents,
    agentTools,
    subagentTools,
    subagentCharacters,
    agentStatuses,
    seenActivity,
    now,
  } = src;
  const lanes: Lane[] = [];

  for (const id of agents) {
    const ch = officeState.characters.get(id);
    if (!ch) continue;
    const openTools = agentTools[id]?.filter((t) => !t.done) ?? [];
    // "Precisa de você" só com algo para responder: pedido de permissão
    // (balão ou ferramenta aberta esperando permissão) ou pergunta aberta
    // (AskUserQuestion ainda sem resposta). Turno encerrado não conta.
    const needsPermission =
      ch.bubbleType === 'permission' || openTools.some((t) => t.permissionWait);
    const needsAnswer = openTools.some((t) => t.status === ASK_USER_STATUS);
    // Turno encerrado: o servidor mandou agentStatus 'waiting' (Stop ou
    // idle_prompt); o balão 'waiting' cobre quem não recebe agentStatuses.
    const turnEnded = agentStatuses ? agentStatuses[id] === 'waiting' : ch.bubbleType === 'waiting';
    // O boneco nasce ativo; só trabalha de verdade depois de alguma atividade.
    const seen = seenActivity ? seenActivity[id] === true : true;
    // Ativo conta como trabalhando mesmo entre uma ferramenta e outra (ou
    // pensando, sem ferramenta): senão a linha piscaria a cada chamada.
    const phase: LanePhase =
      needsPermission || needsAnswer
        ? 'attention'
        : ch.isActive && !turnEnded && seen
          ? 'working'
          : turnEnded && !ch.isActive
            ? 'done'
            : 'idle';
    if (isStale(phase, ch, now)) continue;
    lanes.push({
      id,
      isSub: false,
      // Membro de equipe já tem nome próprio; o resto ganha o apelido.
      name: ch.agentName || sessionNickname(id, ch.palette),
      suffix: joinSuffix(ch.directoryName, shortModelName(ch.sessimModel)),
      color: sessionColor(id),
      // Finalidade declarada pela sessão (agentTitle); "precisa de você" é estado.
      activity:
        phase === 'done'
          ? 'terminou · esperando você'
          : laneActivity(ch.sessimTitle, phase === 'attention' ? PHRASE_NEEDS_YOU : null),
      phase,
      step: null,
      palette: ch.palette,
      repeat: ch.repeat,
    });
  }

  for (const sub of subagentCharacters) {
    const ch = officeState.characters.get(sub.id);
    if (!ch) continue;
    const { rest } = splitRoleLabel(sub.label || '');
    // Tipo do sub-agente (papel conhecido ou não); sem tipo, herda a cor da sessão-mãe.
    const type = ch.sessimRole || null;
    const rows = subagentTools[sub.parentAgentId]?.[sub.parentToolId];
    const current = rows ? [...rows].reverse().find((t) => !t.done) : undefined;
    const needsYou =
      ch.bubbleType === 'permission' || (!!current && current.status === ASK_USER_STATUS);
    const prog = ch.sessimProgress;
    const parent = officeState.characters.get(sub.parentAgentId);
    const parentName = parent?.agentName || sessionNickname(sub.parentAgentId, parent?.palette);
    // Finalidade do sub-agente = a tarefa que ele recebeu (description do
    // Agent); sem ela, a finalidade da sessão-mãe. A etapa (savvy-progress)
    // entra só como sufixo curto.
    const purpose = (type ? rest : '') || parent?.sessimTitle || null;
    lanes.push({
      id: sub.id,
      isSub: true,
      name: type ?? (rest || 'Subtarefa'),
      suffix: joinSuffix(`do ${parentName}`, shortModelName(ch.sessimModel)),
      color: type ? roleColor(type) : sessionColor(sub.parentAgentId),
      activity: laneActivity(purpose, stepSuffix(prog), needsYou ? PHRASE_NEEDS_YOU : null),
      phase: needsYou ? 'attention' : 'working',
      step: prog && prog.total > 0 ? { done: prog.done, total: prog.total } : null,
      palette: ch.palette,
      repeat: ch.repeat,
    });
  }

  // Sessim: o Lula de enfeite, sempre trabalhando (sessimLula.ts).
  const lula = lulaLane(officeState, now ?? Date.now());
  if (lula) lanes.push(lula);

  // Quem precisa de você primeiro, depois quem trabalha, quem terminou e os parados.
  const order: Record<LanePhase, number> = { attention: 0, working: 1, done: 2, idle: 3 };
  return lanes.sort((a, b) => order[a.phase] - order[b.phase]);
}
