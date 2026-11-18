/**
 * Sessim: personagem e cor fixos para os agentes globais (~/.claude/agents).
 * As cores são as mesmas do painel savvy-progress, para os dois combinarem.
 */

import { SESSIM_ROLE_CHARS } from '../../core/src/paletteUtils.js';
import {
  SESSIM_COLOR_ARQUITETO,
  SESSIM_COLOR_CONSTRUTOR,
  SESSIM_COLOR_EXPLORADOR,
  SESSIM_COLOR_IMPLEMENTADOR,
  SESSIM_COLOR_VERIFICADOR,
  SESSIM_SESSION_COLORS,
} from './constants.js';
import { sessimCharPalette } from './sessimPalette.js';

export interface SessimRole {
  /** Índice do NOSSO boneco (0..24); a paleta real sai de sessimCharPalette. */
  char: number;
  color: string;
}

// A paleta de cada papel vem do core (o servidor também a reserva).
const ROLE_COLORS: Record<string, string> = {
  explorador: SESSIM_COLOR_EXPLORADOR,
  implementador: SESSIM_COLOR_IMPLEMENTADOR,
  verificador: SESSIM_COLOR_VERIFICADOR,
  arquiteto: SESSIM_COLOR_ARQUITETO,
  construtor: SESSIM_COLOR_CONSTRUTOR,
};

const ROLES: Record<string, SessimRole> = Object.fromEntries(
  Object.entries(ROLE_COLORS).map(([role, color]) => [
    role,
    { char: SESSIM_ROLE_CHARS[role], color },
  ]),
);

const SEP = ' · ';

/** Tipo de agente como o Claude escreve: "general-purpose", "Explore", "claude-code-guide". */
const TYPE_TOKEN = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * "explorador · Mapear pasta" → { role: 'explorador', rest: 'Mapear pasta' }.
 * Tipos fora da lista também contam quando vêm com o separador
 * ("general-purpose · Buscar usos" → role 'general-purpose'); sem separador,
 * só os papéis conhecidos, para uma descrição solta não virar tipo.
 */
export function splitRoleLabel(label: string): { role: string | null; rest: string } {
  const i = label.indexOf(SEP);
  const head = (i >= 0 ? label.slice(0, i) : label).trim();
  const known = Object.hasOwn(ROLES, head);
  if (!known && !(i >= 0 && TYPE_TOKEN.test(head))) return { role: null, rest: label };
  return { role: head, rest: i >= 0 ? label.slice(i + SEP.length) : '' };
}

/** Personagem e cor fixos só dos papéis conhecidos; null para o resto. */
export function roleLook(
  role: string | null | undefined,
): { palette: number; color: string } | null {
  if (!role || !Object.hasOwn(ROLES, role)) return null;
  const r = ROLES[role];
  return { palette: sessimCharPalette(r.char), color: r.color };
}

/** Cor fixa da sessão de id `id`, mesma regra do apelido: lista[(id - 1) mod n]. */
export function sessionColor(id: number): string {
  const n = SESSIM_SESSION_COLORS.length;
  const k = Number.isFinite(id) ? Math.floor(Math.abs(id)) : 0;
  return SESSIM_SESSION_COLORS[(((k - 1) % n) + n) % n];
}

/** Cor estável de um tipo de agente sem papel conhecido (hash do nome). */
export function typeColor(type: string): string {
  let h = 5381;
  for (let i = 0; i < type.length; i++) h = (h * 33 + type.charCodeAt(i)) >>> 0;
  return SESSIM_SESSION_COLORS[h % SESSIM_SESSION_COLORS.length];
}

/** Cor de qualquer papel/tipo: a do papel conhecido, senão a do hash do tipo. */
export function roleColor(role: string): string {
  return roleLook(role)?.color ?? typeColor(role);
}

/**
 * Cor do personagem no escritório: a mesma do card dele no quadro de
 * progresso (papel → cor do papel; sub-agente sem papel → cor da sessão-mãe;
 * sessão → cor da sessão). Usada no brilho de quem está trabalhando.
 */
export function characterColor(ch: {
  id: number;
  isSubagent: boolean;
  parentAgentId: number | null;
  sessimRole?: string;
}): string {
  if (ch.sessimRole) return roleColor(ch.sessimRole);
  if (ch.isSubagent && ch.parentAgentId !== null) return sessionColor(ch.parentAgentId);
  return sessionColor(ch.id);
}

export interface SessimProgress {
  done: number;
  total: number;
  note: string;
}

/** "Etapa 2/3 · lendo rotas" → { done: 2, total: 3, note: 'lendo rotas' }. */
export function parseStep(status: string): SessimProgress | null {
  const m = /^Etapa (\d+)\/(\d+)(?: · (.*))?$/.exec(status);
  if (!m) return null;
  return { done: Number(m[1]), total: Number(m[2]), note: m[3] ?? '' };
}
