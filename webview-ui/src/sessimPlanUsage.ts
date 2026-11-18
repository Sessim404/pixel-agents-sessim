/**
 * Sessim: uso do plano do Claude para a faixa "USO DO CLAUDE" do quadro de
 * progresso. O servidor manda `sessimPlanUsage` a cada 2 min
 * (server/src/sessimPlanUsage.ts); aqui fica o último dado e o texto pronto
 * de cada barra. Sem DOM (testável no Node).
 */

export interface PlanLimit {
  label: string;
  percent: number;
  resetsAt?: string;
  severity: string;
}

export interface PlanUsageRow {
  label: string;
  percent: number;
  /** "renova 11:00", "renova qui 04:00" ou "" quando a API não diz. */
  reset: string;
  severity: 'normal' | 'warning' | 'critical';
}

/** Dado mais velho que isso ganha a hora em que foi lido. */
const STALE_MS = 10 * 60 * 1000;
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

let limits: PlanLimit[] = [];
let at = 0;

export function setPlanUsage(next: { limits?: PlanLimit[]; at?: number }): void {
  if (Array.isArray(next.limits) && next.limits.length > 0) {
    limits = next.limits;
    at = typeof next.at === 'number' ? next.at : Date.now();
  }
}

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Texto de renovação no fuso local: só a hora se for nas próximas 24 h. */
export function formatReset(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const raw = Date.parse(iso);
  if (Number.isNaN(raw)) return '';
  // A API às vezes manda 06:59:59.9: arredonda para o minuto.
  const t = Math.round(raw / 60000) * 60000;
  const d = new Date(t);
  if (t - now < 24 * 60 * 60 * 1000) return `renova ${hhmm(d)}`;
  return `renova ${WEEKDAYS[d.getDay()]} ${hhmm(d)}`;
}

function severityOf(s: string): PlanUsageRow['severity'] {
  return s === 'critical' || s === 'warning' ? s : 'normal';
}

export function planUsageRows(now: number = Date.now()): PlanUsageRow[] {
  return limits.map((l) => ({
    label: l.label,
    percent: Math.max(0, Math.min(100, Math.round(l.percent))),
    reset: formatReset(l.resetsAt, now),
    severity: severityOf(l.severity),
  }));
}

/** "lido 10:42" quando o último dado está velho (rede caiu, token vencido). */
export function planUsageStaleNote(now: number = Date.now()): string {
  if (limits.length === 0 || now - at <= STALE_MS) return '';
  return `lido ${hhmm(new Date(at))}`;
}
