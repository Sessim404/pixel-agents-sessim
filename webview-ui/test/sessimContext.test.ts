/**
 * Sessim: contas e textos do painel de contexto (sessimContext.ts).
 *
 * Run with: npm test
 */

import { describe, expect, it } from 'vitest';

import {
  categoryLabel,
  contextBreakdown,
  formatPct,
  formatTokens,
  groupByServer,
  serverLabel,
  shortPath,
  sortCategories,
  updatedAgo,
} from '../src/sessimContext.js';

describe('formatTokens: números curtos em português', () => {
  it('k e M com vírgula, sem ",0"', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(229_700)).toBe('229,7k');
    expect(formatTokens(33_000)).toBe('33k');
    expect(formatTokens(1_000_000)).toBe('1M');
    expect(formatTokens(1_250_000)).toBe('1,3M');
    expect(formatTokens(-5)).toBe('0');
  });
});

describe('contextBreakdown: base fixa + conversa + livre', () => {
  it('divide o usado entre base e conversa', () => {
    const b = contextBreakdown(229_700, 1_000_000, 92_100);
    expect(b.pct).toBe(23);
    expect(b.base).toBe(92_100);
    expect(b.conversation).toBe(137_600);
    expect(b.free).toBe(770_300);
  });

  it('sem base conhecida não inventa divisão', () => {
    const b = contextBreakdown(50_000, 200_000, 0);
    expect(b.base).toBeNull();
    expect(b.conversation).toBeNull();
    expect(b.pct).toBe(25);
  });

  it('base nunca passa do total (sessão compactada)', () => {
    const b = contextBreakdown(30_000, 1_000_000, 70_000);
    expect(b.base).toBe(30_000);
    expect(b.conversation).toBe(0);
  });

  it('usado acima do máximo fica em 100%', () => {
    const b = contextBreakdown(250_000, 200_000, 10_000);
    expect(b.pct).toBe(100);
    expect(b.free).toBe(0);
  });
});

describe('updatedAgo', () => {
  const now = 10_000_000;
  it('agora, minutos, horas e dias', () => {
    expect(updatedAgo(now - 5_000, now)).toBe('Atualizado agora');
    expect(updatedAgo(now - 4 * 60_000, now)).toBe('Atualizado há 4 min');
    expect(updatedAgo(now - 2 * 3_600_000, now)).toBe('Atualizado há 2 h');
    expect(updatedAgo(now - 9_000_000, now)).toBe('Atualizado há 2 h');
    expect(updatedAgo(undefined, now)).toBeNull();
  });
});

describe('divisão detalhada (/context)', () => {
  it('traduz as categorias e marca as sob demanda', () => {
    expect(categoryLabel('Messages')).toBe('Mensagens');
    expect(categoryLabel('MCP tools (deferred)')).toBe('Ferramentas MCP (sob demanda)');
    expect(categoryLabel('Algo novo')).toBe('Algo novo');
  });

  it('separa o que ocupa a janela, o livre e o sob demanda, na ordem do Claude Code', () => {
    const s = sortCategories([
      { name: 'Free space', tokens: 800, deferred: false },
      { name: 'System prompt', tokens: 6, deferred: false },
      { name: 'MCP tools (deferred)', tokens: 196, deferred: true },
      { name: 'Messages', tokens: 120, deferred: false },
      { name: 'Custom agents', tokens: 0, deferred: false },
    ]);
    expect(s.active.map((c) => c.name)).toEqual(['Messages', 'System prompt']);
    expect(s.free?.tokens).toBe(800);
    expect(s.deferred.map((c) => c.name)).toEqual(['MCP tools (deferred)']);
  });

  it('soma ferramentas MCP por servidor, maior primeiro', () => {
    const g = groupByServer([
      { name: 'a', group: 'savvy', tokens: 100 },
      { name: 'b', group: 'claude_ai_ClickUp', tokens: 500 },
      { name: 'c', group: 'savvy', tokens: 50 },
    ]);
    expect(g).toEqual([
      { server: 'claude_ai_ClickUp', count: 1, tokens: 500 },
      { server: 'savvy', count: 2, tokens: 150 },
    ]);
    expect(serverLabel('claude_ai_Google_Sheets')).toBe('Google Sheets (claude.ai)');
    expect(serverLabel('higgsfield')).toBe('higgsfield');
  });

  it('encurta caminho e formata % com vírgula', () => {
    expect(shortPath('/Users/eu/.claude/CLAUDE.md')).toBe('~/.claude/CLAUDE.md');
    expect(formatPct(121_500, 1_000_000)).toBe('12,2%');
    expect(formatPct(1, 0)).toBe('0%');
  });
});
