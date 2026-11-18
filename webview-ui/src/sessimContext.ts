/**
 * Sessim: contas e textos do painel de contexto (abre ao clicar num boneco).
 *
 * O Claude Code não grava a divisão por categoria (mensagens, MCP, skills…);
 * só o total de cada resposta. Por isso o painel divide em:
 * - base fixa: contexto da 1ª resposta da sessão (sistema, ferramentas,
 *   memória, skills e o 1º pedido);
 * - conversa: o que cresceu depois;
 * - livre: o que falta para o máximo.
 * Módulo puro (sem DOM) para poder ser testado.
 */

export interface ContextBreakdown {
  /** 0–100, arredondado. */
  pct: number;
  used: number;
  max: number;
  /** null quando a base não é conhecida (aí não há divisão). */
  base: number | null;
  conversation: number | null;
  free: number;
}

export function contextBreakdown(
  used: number,
  max: number,
  base?: number | null,
): ContextBreakdown {
  const safeMax = max > 0 ? max : 1;
  const safeUsed = Math.max(0, Math.min(used, safeMax));
  // A base nunca passa do total (depois de compactar, o total pode cair).
  const knownBase = base && base > 0 ? Math.min(base, safeUsed) : null;
  return {
    pct: Math.min(100, Math.round((safeUsed / safeMax) * 100)),
    used: safeUsed,
    max: safeMax,
    base: knownBase,
    conversation: knownBase === null ? null : safeUsed - knownBase,
    free: safeMax - safeUsed,
  };
}

function oneDecimal(n: number): string {
  const fixed = n.toFixed(1);
  return (fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed).replace('.', ',');
}

/** 950 → "950"; 229_700 → "229,7k"; 1_000_000 → "1M"; 1_250_000 → "1,3M". */
export function formatTokens(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1_000_000) return `${oneDecimal(v / 1_000_000)}M`;
  if (v >= 1_000) return `${oneDecimal(v / 1_000)}k`;
  return String(v);
}

/** "Atualizado agora" / "há 1 min" / "há 2 h". null sem hora conhecida. */
export function updatedAgo(at: number | undefined, now: number): string | null {
  if (!at || !Number.isFinite(at)) return null;
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 60) return 'Atualizado agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `Atualizado há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Atualizado há ${h} h`;
  const d = Math.floor(h / 24);
  return `Atualizado há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

// ── Divisão detalhada (resposta do /context, via servidor) ──

export interface DetailCategory {
  name: string;
  tokens: number;
  deferred: boolean;
}

export interface DetailItem {
  name: string;
  group: string;
  tokens: number;
}

const CATEGORY_PT: Record<string, string> = {
  Messages: 'Mensagens',
  'MCP tools': 'Ferramentas MCP',
  'System tools': 'Ferramentas do sistema',
  Skills: 'Skills',
  'System prompt': 'Prompt do sistema',
  'MCP server instructions': 'Instruções dos servidores MCP',
  'Memory files': 'Arquivos de memória',
  'Custom agents': 'Agentes personalizados',
  'Autocompact buffer': 'Reserva da compactação',
  'Free space': 'Livre',
};

/** Nome em português; "(deferred)" vira "(sob demanda)". */
export function categoryLabel(name: string): string {
  const base = name.replace(/\s*\(deferred\)\s*$/i, '');
  const pt = CATEGORY_PT[base] ?? base;
  return /\(deferred\)/i.test(name) ? `${pt} (sob demanda)` : pt;
}

/** Ordem do painel do Claude Code: mensagens, MCP, ferramentas, o resto. */
const ORDER = [
  'Messages',
  'MCP tools',
  'System tools',
  'Skills',
  'System prompt',
  'MCP server instructions',
  'Memory files',
  'Custom agents',
  'Autocompact buffer',
  'Free space',
];

export interface SortedCategories {
  /** Ocupam a janela agora (inclui a reserva da compactação). */
  active: DetailCategory[];
  free: DetailCategory | null;
  /** Carregados sob demanda: não ocupam a janela. */
  deferred: DetailCategory[];
}

export function sortCategories(categories: DetailCategory[]): SortedCategories {
  const rank = (c: DetailCategory) => {
    const i = ORDER.indexOf(c.name.replace(/\s*\(deferred\)\s*$/i, ''));
    return i < 0 ? ORDER.length : i;
  };
  const sorted = [...categories].sort((a, b) => rank(a) - rank(b));
  return {
    active: sorted.filter((c) => !c.deferred && c.name !== 'Free space' && c.tokens > 0),
    free: sorted.find((c) => c.name === 'Free space') ?? null,
    deferred: sorted.filter((c) => c.deferred && c.tokens > 0),
  };
}

/** "claude_ai_ClickUp" → "ClickUp (claude.ai)"; "higgsfield" fica igual. */
export function serverLabel(server: string): string {
  const m = /^claude_ai_(.+)$/.exec(server);
  return m ? `${m[1].replace(/_/g, ' ')} (claude.ai)` : server;
}

export interface ServerGroup {
  server: string;
  count: number;
  tokens: number;
}

/** Ferramentas MCP somadas por servidor, maior primeiro. */
export function groupByServer(tools: DetailItem[]): ServerGroup[] {
  const map = new Map<string, ServerGroup>();
  for (const t of tools) {
    const g = map.get(t.group) ?? { server: t.group, count: 0, tokens: 0 };
    g.count += 1;
    g.tokens += t.tokens;
    map.set(t.group, g);
  }
  return [...map.values()].sort((a, b) => b.tokens - a.tokens);
}

/** Itens do maior para o menor. */
export function bySize<T extends { tokens: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.tokens - a.tokens);
}

/** "/Users/eu/.claude/CLAUDE.md" → "~/.claude/CLAUDE.md". */
export function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~');
}

/** "12,2%" com uma casa (como no Claude Code). */
export function formatPct(tokens: number, max: number): string {
  if (max <= 0) return '0%';
  const pct = (tokens / max) * 100;
  return `${pct.toFixed(1).replace('.', ',')}%`;
}
