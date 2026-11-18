/**
 * Sessim: nome curto do modelo mostrado no quadro de progresso.
 *
 * Run with: npm test
 */

import { describe, expect, it } from 'vitest';

import { shortModelName } from '../../core/src/modelNames.js';

describe('shortModelName', () => {
  it('modelos atuais', () => {
    expect(shortModelName('claude-opus-5-5')).toBe('Opus 5.5');
    expect(shortModelName('claude-fable-5-1')).toBe('Fable 5.1');
    expect(shortModelName('claude-sonnet-5-5')).toBe('Sonnet 5.5');
    expect(shortModelName('claude-haiku-5-5')).toBe('Haiku 5.5');
  });

  it('ids antigos, com data e família no meio', () => {
    expect(shortModelName('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5');
    expect(shortModelName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5');
    expect(shortModelName('claude-3-opus-latest')).toBe('Opus 3');
  });

  it('apelidos do frontmatter (plano B) ficam só com a família', () => {
    expect(shortModelName('haiku')).toBe('Haiku');
    expect(shortModelName('fable')).toBe('Fable');
  });

  it('id desconhecido vira um nome a partir das partes, sem quebrar', () => {
    expect(shortModelName('gpt-5-turbo')).toBe('Gpt 5 Turbo');
    expect(shortModelName('claude-opus-5-5[1m]')).toBe('Opus 5.5 [1m]');
    expect(shortModelName('')).toBe('');
    expect(shortModelName(undefined)).toBe('');
    expect(shortModelName('---')).toBe('');
  });
});
