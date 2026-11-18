/**
 * Sessim: uso do plano do Claude (as barras de "Usage" do Claude Code) para o
 * quadro de progresso.
 *
 * Fonte: o mesmo endereço que o Claude Code consulta para mostrar o uso
 * (GET https://api.anthropic.com/api/oauth/usage), com o login que ele guarda
 * no Chaves do macOS ("Claude Code-credentials") ou em ~/.claude/.credentials.json.
 * Só lê o token; nunca renova nem grava. Token vencido = espera o Claude Code
 * renovar na próxima resposta.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const POLL_MS = 2 * 60 * 1000;
/** Não busca de novo ao reabrir o painel se o último dado tem menos que isso. */
const FRESH_MS = 60 * 1000;

export type SessimPlanLimit = {
  /** "Sessão (5h)", "Semana (7 dias)", "Limite Fable"… */
  label: string;
  percent: number;
  /** ISO 8601; ausente quando a API não diz. */
  resetsAt?: string;
  /** normal | warning | critical (vem da API). */
  severity: string;
};

// `type` (não interface) para caber no Record<string, unknown> do broadcast/send.
export type SessimPlanUsageMessage = {
  type: 'sessimPlanUsage';
  limits: SessimPlanLimit[];
  /** Hora (ms) do dado. */
  at: number;
  error?: string;
};

interface ApiLimit {
  kind?: string;
  percent?: number;
  severity?: string;
  resets_at?: string | null;
  scope?: { model?: { display_name?: string | null } | null } | null;
}

function labelFor(l: ApiLimit): string {
  if (l.kind === 'session') return 'Sessão (5h)';
  if (l.kind === 'weekly_all') return 'Semana (7 dias)';
  const model = l.scope?.model?.display_name;
  if (model) return `Limite ${model}`;
  return 'Limite semanal';
}

/** Converte a resposta da API nas linhas do quadro (exportado para teste). */
export function parsePlanUsage(body: unknown): SessimPlanLimit[] {
  const b = body as {
    limits?: ApiLimit[];
    five_hour?: { utilization?: number; resets_at?: string | null } | null;
    seven_day?: { utilization?: number; resets_at?: string | null } | null;
  };
  if (Array.isArray(b?.limits) && b.limits.length > 0) {
    return b.limits
      .filter((l) => typeof l.percent === 'number')
      .map((l) => ({
        label: labelFor(l),
        percent: Math.round(l.percent as number),
        resetsAt: l.resets_at ?? undefined,
        severity: l.severity ?? 'normal',
      }));
  }
  // Formato antigo, sem `limits`.
  const out: SessimPlanLimit[] = [];
  if (b?.five_hour && typeof b.five_hour.utilization === 'number') {
    out.push({
      label: 'Sessão (5h)',
      percent: Math.round(b.five_hour.utilization),
      resetsAt: b.five_hour.resets_at ?? undefined,
      severity: 'normal',
    });
  }
  if (b?.seven_day && typeof b.seven_day.utilization === 'number') {
    out.push({
      label: 'Semana (7 dias)',
      percent: Math.round(b.seven_day.utilization),
      resetsAt: b.seven_day.resets_at ?? undefined,
      severity: 'normal',
    });
  }
  return out;
}

function readKeychain(): Promise<string | null> {
  if (process.platform !== 'darwin') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { timeout: 5000 },
      (err, stdout) => resolve(err ? null : stdout.trim()),
    );
  });
}

async function readToken(): Promise<string | null> {
  let raw = await readKeychain();
  if (!raw) {
    try {
      raw = await readFile(join(homedir(), '.claude', '.credentials.json'), 'utf8');
    } catch {
      return null;
    }
  }
  try {
    const oauth = (JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } }).claudeAiOauth;
    return oauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

async function fetchPlanUsage(): Promise<SessimPlanUsageMessage> {
  const at = Date.now();
  const token = await readToken();
  if (!token) return { type: 'sessimPlanUsage', limits: [], at, error: 'sem login do Claude' };
  const res = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': 'pixel-agents',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { type: 'sessimPlanUsage', limits: [], at, error: `HTTP ${res.status}` };
  return { type: 'sessimPlanUsage', limits: parsePlanUsage(await res.json()), at };
}

// Último dado de qualquer busca rodando (o standalone manda no webviewReady).
let latest: SessimPlanUsageMessage | null = null;

export function latestSessimPlanUsage(): SessimPlanUsageMessage | null {
  return latest;
}

/**
 * Busca o uso a cada 2 min e entrega a `post`. Erro passageiro (rede, token
 * vencido, 429) mantém o último dado bom. Devolve: `refresh()` para o painel
 * que acabou de abrir (manda o último e busca de novo se estiver velho) e
 * `stop()`.
 */
export function startSessimPlanUsage(post: (m: SessimPlanUsageMessage) => void): {
  refresh: () => void;
  stop: () => void;
} {
  let last: SessimPlanUsageMessage | null = null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const msg = await fetchPlanUsage();
      if (msg.limits.length > 0 || !last || last.limits.length === 0) last = msg;
      else last = { ...last, error: msg.error };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      last = last
        ? { ...last, error }
        : { type: 'sessimPlanUsage', limits: [], at: Date.now(), error };
    } finally {
      running = false;
    }
    latest = last;
    if (last) post(last);
  };
  void tick();
  const timer = setInterval(() => void tick(), POLL_MS);
  timer.unref?.();
  return {
    refresh: () => {
      if (last) post(last);
      if (!last || Date.now() - last.at > FRESH_MS) void tick();
    },
    stop: () => clearInterval(timer),
  };
}
