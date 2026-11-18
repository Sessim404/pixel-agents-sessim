/**
 * Sessim: painel de contexto que abre ao clicar num boneco (sessão).
 *
 * Duas abas:
 * - Sessão: a divisão do contexto daquele agente, igual ao /context do Claude
 *   Code (mensagens, ferramentas MCP, ferramentas do sistema, skills, prompt
 *   do sistema, memória, agentes, reserva da compactação, livre) + listas por
 *   item (servidores MCP, skills, arquivos de memória, agentes);
 * - Projeto: o que toda sessão nova daquele projeto carrega antes do 1º pedido.
 * A divisão vem do servidor (`sessimContextRequest`), que roda o /context do
 * Claude Code sem janela; leva ~15 s na 1ª vez e fica guardada por 2 min.
 * Enquanto calcula, o painel mostra o total exato do JSONL (base fixa /
 * conversa). O quadro de progresso não muda (pedido do Eduardo).
 */
import { useEffect, useState } from 'react';

import { shortModelName } from '../../../core/src/modelNames.js';
import {
  CONTEXT_CRITICAL_THRESHOLD,
  CONTEXT_DANGER_THRESHOLD,
  CONTEXT_GAUGE_COLOR_CRITICAL,
  CONTEXT_GAUGE_COLOR_DANGER,
  CONTEXT_GAUGE_COLOR_WARN,
  CONTEXT_WARN_THRESHOLD,
  SESSIM_CONTEXT_COLOR_OTHER,
  SESSIM_CONTEXT_COLORS,
} from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { sessionNickname } from '../sessimAgents.js';
import {
  bySize,
  categoryLabel,
  contextBreakdown,
  type DetailCategory,
  type DetailItem,
  formatPct,
  formatTokens,
  groupByServer,
  serverLabel,
  shortPath,
  sortCategories,
  updatedAgo,
} from '../sessimContext.js';
import { characterColor } from '../sessimRoles.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';

/** Acima dos rótulos dos bonecos (41–43), abaixo do balão do tour (45). */
const PANEL_Z_INDEX = 44;
const REFRESH_MS = 1000;

const SEGMENT_BASE = 'var(--color-text-muted)';
const SEGMENT_CONVERSATION = 'var(--color-accent-bright)';
const SEGMENT_FREE = 'var(--color-bg-thumb)';

type Scope = 'session' | 'project';

interface Detail {
  model: string;
  used: number;
  max: number;
  categories: DetailCategory[];
  mcpTools: DetailItem[];
  agents: DetailItem[];
  memoryFiles: DetailItem[];
  skills: DetailItem[];
  at: number;
}

interface DetailState {
  loading: boolean;
  detail?: Detail;
  error?: string;
  /** Total do JSONL quando a divisão chegou (base do "Desde o cálculo"). */
  liveAtDetail?: number;
}

const keyOf = (id: number, scope: Scope) => `${scope}:${id}`;

function colorOf(name: string): string {
  return (
    SESSIM_CONTEXT_COLORS[name.replace(/\s*\(deferred\)\s*$/i, '')] ?? SESSIM_CONTEXT_COLOR_OTHER
  );
}

function pctColor(ratio: number): string {
  if (ratio >= CONTEXT_CRITICAL_THRESHOLD) return CONTEXT_GAUGE_COLOR_CRITICAL;
  if (ratio >= CONTEXT_DANGER_THRESHOLD) return CONTEXT_GAUGE_COLOR_DANGER;
  if (ratio >= CONTEXT_WARN_THRESHOLD) return CONTEXT_GAUGE_COLOR_WARN;
  return 'var(--color-text)';
}

/** Linha da legenda: quadrado, nome, tokens e % (como no Claude Code). */
function Row({
  color,
  label,
  value,
  pct,
  hollow,
  muted,
}: {
  color?: string;
  label: string;
  value: string;
  pct?: string;
  hollow?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-8 leading-none ${muted ? 'text-text-muted' : ''}`}
      style={{ fontSize: 18 }}
    >
      <span
        className="shrink-0"
        style={{
          width: 12,
          height: 12,
          background: hollow || !color ? 'transparent' : color,
          border: hollow ? '2px solid var(--color-border)' : undefined,
        }}
      />
      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {label}
      </span>
      <span className="shrink-0 tabular-nums">{value}</span>
      {pct !== undefined && (
        <span className="shrink-0 tabular-nums text-text-muted text-right" style={{ width: 56 }}>
          {pct}
        </span>
      )}
    </div>
  );
}

/** Seção que abre e fecha (› / ⌄), como "Ferramentas MCP" no Claude Code. */
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      <button
        className="flex items-center gap-8 text-left cursor-pointer bg-transparent border-0 p-0 text-text leading-none"
        style={{ fontSize: 18 }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="shrink-0" style={{ width: 12 }}>
          {open ? '⌄' : '›'}
        </span>
        <span className="flex-1">{title}</span>
        <span className="text-text-muted tabular-nums">{count}</span>
      </button>
      {open && <div className="flex flex-col gap-4 pl-20">{children}</div>}
    </div>
  );
}

function ItemRow({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div className="flex items-center gap-8 leading-none" style={{ fontSize: 16 }}>
      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {label}
        {hint && <span className="text-text-muted"> · {hint}</span>}
      </span>
      <span className="shrink-0 tabular-nums text-text-muted">{value}</span>
    </div>
  );
}

/** Barra segmentada: uma cor por categoria que ocupa a janela. */
function Bar({
  segments,
  max,
}: {
  segments: Array<{ color: string; tokens: number }>;
  max: number;
}) {
  return (
    <div
      className="flex w-full overflow-hidden border-2 border-border"
      style={{ height: 14, background: SEGMENT_FREE }}
    >
      {segments.map((s, i) => (
        <div
          key={i}
          style={{ width: `${(s.tokens / max) * 100}%`, background: s.color, flexShrink: 0 }}
        />
      ))}
    </div>
  );
}

function DetailView({ detail, since }: { detail: Detail; since: number }) {
  const { active, free, deferred } = sortCategories(detail.categories);
  const max = detail.max || 1;
  const servers = groupByServer(detail.mcpTools);
  return (
    <>
      <div className="flex items-baseline justify-between gap-8">
        <span style={{ fontSize: 26, color: pctColor(detail.used / max) }}>
          {Math.round((detail.used / max) * 100)}% usado
        </span>
        <span className="text-text-muted tabular-nums" style={{ fontSize: 18 }}>
          {formatTokens(detail.used)} / {formatTokens(max)}
        </span>
      </div>
      <Bar segments={active.map((c) => ({ color: colorOf(c.name), tokens: c.tokens }))} max={max} />
      <div className="flex flex-col gap-6">
        {active.map((c) => (
          <Row
            key={c.name}
            color={colorOf(c.name)}
            label={categoryLabel(c.name)}
            value={formatTokens(c.tokens)}
            pct={formatPct(c.tokens, max)}
          />
        ))}
        {since > 1000 && (
          <Row
            color={SEGMENT_CONVERSATION}
            label="Desde o cálculo"
            value={`+${formatTokens(since)}`}
            pct={formatPct(since, max)}
            hollow
          />
        )}
        {free && (
          <Row
            label="Livre"
            value={formatTokens(free.tokens)}
            pct={formatPct(free.tokens, max)}
            hollow
          />
        )}
      </div>
      {deferred.length > 0 && (
        <div className="flex flex-col gap-6 pt-6 border-t-2 border-border">
          <span className="text-text-muted leading-none" style={{ fontSize: 15 }}>
            Sob demanda (não ocupam a janela até serem usadas)
          </span>
          {deferred.map((c) => (
            <Row
              key={c.name}
              label={categoryLabel(c.name).replace(' (sob demanda)', '')}
              value={formatTokens(c.tokens)}
              pct="—"
              muted
            />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-6 pt-6 border-t-2 border-border">
        <Section title="Ferramentas MCP por servidor" count={servers.length}>
          {servers.map((s) => (
            <ItemRow
              key={s.server}
              label={serverLabel(s.server)}
              hint={`${s.count} ${s.count === 1 ? 'ferramenta' : 'ferramentas'}`}
              value={formatTokens(s.tokens)}
            />
          ))}
        </Section>
        <Section title="Arquivos de memória" count={detail.memoryFiles.length}>
          {bySize(detail.memoryFiles).map((m) => (
            <ItemRow key={m.name} label={shortPath(m.name)} value={formatTokens(m.tokens)} />
          ))}
        </Section>
        <Section title="Skills" count={detail.skills.length}>
          {bySize(detail.skills).map((s) => (
            <ItemRow key={s.name} label={s.name} hint={s.group} value={formatTokens(s.tokens)} />
          ))}
        </Section>
        <Section title="Agentes personalizados" count={detail.agents.length}>
          {bySize(detail.agents).map((a) => (
            <ItemRow key={a.name} label={a.name} value={formatTokens(a.tokens)} />
          ))}
        </Section>
      </div>
    </>
  );
}

/** Enquanto a divisão calcula: o total exato do JSONL (base fixa / conversa). */
function QuickView({ used, max, base }: { used: number; max: number; base: number | undefined }) {
  const b = contextBreakdown(used, max, base);
  return (
    <>
      <div className="flex items-baseline justify-between gap-8">
        <span style={{ fontSize: 26, color: pctColor(b.used / b.max) }}>{b.pct}% usado</span>
        <span className="text-text-muted tabular-nums" style={{ fontSize: 18 }}>
          {formatTokens(b.used)} / {formatTokens(b.max)}
        </span>
      </div>
      <Bar
        segments={
          b.base !== null && b.conversation !== null
            ? [
                { color: SEGMENT_BASE, tokens: b.base },
                { color: SEGMENT_CONVERSATION, tokens: b.conversation },
              ]
            : [{ color: SEGMENT_CONVERSATION, tokens: b.used }]
        }
        max={b.max}
      />
      <div className="flex flex-col gap-6">
        {b.base !== null && b.conversation !== null ? (
          <>
            <Row color={SEGMENT_BASE} label="Base fixa" value={formatTokens(b.base)} />
            <Row
              color={SEGMENT_CONVERSATION}
              label="Conversa"
              value={formatTokens(b.conversation)}
            />
          </>
        ) : (
          <Row color={SEGMENT_CONVERSATION} label="Usado" value={formatTokens(b.used)} />
        )}
        <Row label="Livre" value={formatTokens(b.free)} hollow />
      </div>
    </>
  );
}

export function SessimContextPanel({ officeState }: { officeState: OfficeState }) {
  const [selectedId, setSelectedId] = useState<number | null>(officeState.selectedAgentId);
  const [now, setNow] = useState(() => Date.now());
  // Fechado pelo × ou Esc sem tirar a seleção do boneco; reabre ao clicar em outro.
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const [scope, setScope] = useState<Scope>('session');
  const [details, setDetails] = useState<Record<string, DetailState>>({});

  useEffect(
    () =>
      officeState.subscribeSelection((id) => {
        setSelectedId(id);
        setDismissedId(null);
      }),
    [officeState],
  );

  // Respostas do servidor (só para quem pediu).
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type !== 'sessimContextDetail') return;
        const key = keyOf(msg.id as number, msg.scope as Scope);
        const live = officeState.characters.get(msg.id as number)?.contextTokens ?? 0;
        setDetails((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            detail: (msg.detail as Detail | undefined) ?? prev[key]?.detail,
            error: msg.error as string | undefined,
            liveAtDetail: msg.detail ? live : prev[key]?.liveAtDetail,
          },
        }));
      }),
    [officeState],
  );

  const ch = selectedId !== null ? officeState.characters.get(selectedId) : undefined;
  const open = !!ch && !ch.isSubagent && ch.contextTokens > 0 && dismissedId !== selectedId;
  const key = selectedId !== null ? keyOf(selectedId, scope) : '';
  const state = details[key];

  const request = (force = false) => {
    if (selectedId === null) return;
    setDetails((prev) => ({ ...prev, [key]: { ...prev[key], loading: true, error: undefined } }));
    transport.send({ type: 'sessimContextRequest', id: selectedId, scope, force });
  };

  // Pede a divisão ao abrir o painel ou trocar de aba (uma vez por agente/aba).
  useEffect(() => {
    if (open && !state) request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  // Os números mudam fora do React (mensagens do servidor): relê a cada 1 s.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissedId(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, selectedId]);

  if (!open || !ch) return null;

  const name = ch.agentName || sessionNickname(ch.id, ch.palette);
  const model = shortModelName(ch.sessimModel);
  const detail = state?.detail;
  const footer = detail
    ? (updatedAgo(detail.at, now) ?? '').replace('Atualizado', 'Calculado')
    : scope === 'session'
      ? updatedAgo(ch.sessimContextAt, now)
      : null;

  const tab = (value: Scope, label: string) => (
    <button
      className={`flex-1 cursor-pointer border-2 py-4 leading-none ${
        scope === value
          ? 'bg-active-bg border-accent text-text'
          : 'bg-btn-bg border-transparent text-text-muted hover:bg-btn-hover'
      }`}
      style={{ fontSize: 18 }}
      onClick={() => setScope(value)}
    >
      {label}
    </button>
  );

  return (
    <div
      className="absolute top-8 right-8 pixel-panel px-12 pt-8 pb-10 flex flex-col gap-8 select-none overflow-y-auto"
      style={{
        zIndex: PANEL_Z_INDEX,
        width: 380,
        maxWidth: 'calc(100% - 72px)',
        maxHeight: 'calc(100% - 16px)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      data-testid="sessim-context-panel"
    >
      <div className="flex items-center gap-8">
        <div className="flex flex-col flex-1 min-w-0 leading-none gap-2">
          <span style={{ fontSize: 22 }}>
            Contexto · <span style={{ color: characterColor(ch), fontWeight: 'bold' }}>{name}</span>
          </span>
          {(ch.directoryName || model) && (
            <span
              className="text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
              style={{ fontSize: 16 }}
            >
              {[ch.directoryName, model].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDismissedId(ch.id)}
          title="Fechar"
          className="shrink-0 leading-none"
        >
          ×
        </Button>
      </div>

      <div className="flex gap-4">
        {tab('session', 'Sessão')}
        {tab('project', 'Projeto')}
      </div>

      {scope === 'project' && (
        <span className="text-text-muted leading-tight" style={{ fontSize: 16 }}>
          O que toda sessão nova deste projeto carrega antes do primeiro pedido.
        </span>
      )}

      {detail ? (
        <DetailView
          detail={detail}
          since={
            scope === 'session' && state?.liveAtDetail ? ch.contextTokens - state.liveAtDetail : 0
          }
        />
      ) : scope === 'session' ? (
        <QuickView used={ch.contextTokens} max={ch.maxContextTokens} base={ch.sessimContextBase} />
      ) : null}

      {state?.loading && (
        <span className="text-text-muted" style={{ fontSize: 16 }}>
          {detail ? 'Recalculando…' : 'Calculando a divisão completa… (cerca de 15 s)'}
        </span>
      )}
      {state?.error && !state.loading && (
        <span style={{ fontSize: 16, color: CONTEXT_GAUGE_COLOR_DANGER }}>
          Não deu para calcular a divisão: {state.error}
        </span>
      )}

      <div className="flex items-center justify-between gap-8">
        <span className="text-text-muted" style={{ fontSize: 16 }}>
          {footer}
        </span>
        {!state?.loading && (
          <Button variant="ghost" size="sm" onClick={() => request(true)} title="Calcular de novo">
            ↻ Atualizar
          </Button>
        )}
      </div>
    </div>
  );
}
