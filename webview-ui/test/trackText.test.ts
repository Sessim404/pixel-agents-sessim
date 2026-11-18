/**
 * Sessim: quebra de texto do quadro de progresso (sem "…" enquanto couber em
 * até N linhas; caminhos longos quebram em "/" ou por caractere).
 *
 * Run with: npm test
 */

import { describe, expect, it } from 'vitest';

import { ellipsize, wrapText } from '../src/office/engine/trackText.js';

/** Fonte "monoespaçada" de 10px por caractere. */
const measure = (s: string) => s.length * 10;

describe('ellipsize', () => {
  it('não mexe no que cabe', () => {
    expect(ellipsize(measure, 'abc', 30)).toBe('abc');
  });
  it('corta com "…" o que não cabe', () => {
    expect(ellipsize(measure, 'abcdefgh', 50)).toBe('abcd…');
  });
});

describe('wrapText', () => {
  it('texto curto fica em uma linha', () => {
    expect(wrapText(measure, 'construtor', 200, 3)).toEqual(['construtor']);
  });

  it('quebra nos espaços sem cortar', () => {
    expect(wrapText(measure, 'construtor · Planilha FilmStar: layout novo', 150, 4)).toEqual([
      'construtor ·',
      'Planilha',
      'FilmStar:',
      'layout novo',
    ]);
    // Com 3 linhas, só a última é cortada.
    expect(wrapText(measure, 'construtor · Planilha FilmStar: layout novo', 150, 3)).toEqual([
      'construtor ·',
      'Planilha',
      'FilmStar: layo…',
    ]);
  });

  it('caminho longo quebra na barra', () => {
    const lines = wrapText(measure, 'Rodando: cd /Users/macbookprom1/Projetos/x', 150, 4);
    expect(lines).toEqual(['Rodando: cd', '/Users/', 'macbookprom1/', 'Projetos/x']);
    // Passando do limite, os pedaços do caminho voltam colados (sem espaço).
    expect(wrapText(measure, 'Rodando: cd /Users/macbookprom1/Projetos/x', 150, 3)).toEqual([
      'Rodando: cd',
      '/Users/',
      'macbookprom1/P…',
    ]);
  });

  it('palavra sem espaço nem barra quebra por caractere', () => {
    expect(wrapText(measure, 'abcdefghijklmnop', 50, 4)).toEqual(['abcde', 'fghij', 'klmno', 'p']);
  });

  it('só usa "…" quando passa do limite de linhas', () => {
    const text = 'um dois tres quatro cinco seis sete oito nove dez';
    const ok = wrapText(measure, text, 200, 3);
    expect(ok).toEqual(['um dois tres quatro', 'cinco seis sete oito', 'nove dez']);
    expect(ok.join(' ')).not.toContain('…');
    const cut = wrapText(measure, text, 100, 2);
    expect(cut).toHaveLength(2);
    expect(cut[0]).toBe('um dois');
    expect(cut[1].endsWith('…')).toBe(true);
    expect(measure(cut[1])).toBeLessThanOrEqual(100);
  });

  it('continuação de palavra quebrada volta colada no corte final', () => {
    // "abcdefghij" quebra em "abcde" + "fghij"; com 1 linha, junta sem espaço.
    expect(wrapText(measure, 'abcdefghij', 50, 1)).toEqual(['abcd…']);
  });

  it('vazio e largura zero', () => {
    expect(wrapText(measure, '   ', 100, 3)).toEqual([]);
    expect(wrapText(measure, 'abc', 0, 3)).toEqual([]);
  });
});
