import { describe, expect, it } from 'vitest';

import { parseContextMarkdown, parseTokenText } from '../src/sessimContextDetail.js';

// Trecho real do /context do Claude Code 2.1.317 (sem janela).
const SAMPLE = `## Context Usage

**Model:** claude-opus-5-5
**Tokens:** 152.2k / 1m (15%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 6.4k | 0.6% |
| System tools | 10.2k | 1.0% |
| MCP tools | 362 | 0.0% |
| MCP tools (deferred) | 485 | 0.0% |
| Memory files | 3.2k | 0.3% |
| Messages | 121.5k | 12.2% |
| Free space | 814.8k | 81.5% |
| Autocompact buffer | 33k | 3.3% |

### MCP Tools

| Tool | Server | Tokens |
|------|--------|--------|
| mcp__savvy-progress__finalidade | savvy-progress | 164 |
| mcp__savvy-progress__step | savvy-progress | 198 |

### Custom Agents

| Agent Type | Source | Tokens |
|------------|--------|--------|
| construtor | User | 177 |

### Memory Files

| Type | Path | Tokens |
|------|------|--------|
| User | /Users/eu/.claude/CLAUDE.md | 3.1k |

### Skills

| Skill | Source | Tokens |
|-------|--------|--------|
| animate | User | ~160 |
| docx | claude.ai sync | < 20 |
`;

describe('Sessim: parseTokenText', () => {
  it('lê k, m, ~ e "< 20"', () => {
    expect(parseTokenText('152.2k')).toBe(152_200);
    expect(parseTokenText('1m')).toBe(1_000_000);
    expect(parseTokenText('362')).toBe(362);
    expect(parseTokenText('~160')).toBe(160);
    expect(parseTokenText('< 20')).toBe(10);
    expect(parseTokenText('abc')).toBe(0);
  });
});

describe('Sessim: parseContextMarkdown', () => {
  it('lê total, categorias e as listas por item', () => {
    const d = parseContextMarkdown(SAMPLE, 123)!;
    expect(d.model).toBe('claude-opus-5-5');
    expect(d.used).toBe(152_200);
    expect(d.max).toBe(1_000_000);
    expect(d.at).toBe(123);
    expect(d.categories).toHaveLength(8);
    expect(d.categories.find((c) => c.name === 'Messages')).toEqual({
      name: 'Messages',
      tokens: 121_500,
      deferred: false,
    });
    expect(d.categories.find((c) => c.name === 'MCP tools (deferred)')?.deferred).toBe(true);
    expect(d.mcpTools).toEqual([
      { name: 'mcp__savvy-progress__finalidade', group: 'savvy-progress', tokens: 164 },
      { name: 'mcp__savvy-progress__step', group: 'savvy-progress', tokens: 198 },
    ]);
    expect(d.agents).toEqual([{ name: 'construtor', group: 'User', tokens: 177 }]);
    expect(d.memoryFiles).toEqual([
      { name: '/Users/eu/.claude/CLAUDE.md', group: 'User', tokens: 3_100 },
    ]);
    expect(d.skills.map((s) => s.tokens)).toEqual([160, 10]);
  });

  it('devolve null para texto que não é o /context', () => {
    expect(parseContextMarkdown('Unknown command')).toBeNull();
    expect(parseContextMarkdown('**Tokens:** 1k / 1m\n')).toBeNull();
  });
});
