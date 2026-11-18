/**
 * Sessim: quebra de texto do quadro de progresso. Puro (recebe a função de
 * medir), para o canvas e os testes usarem a mesma regra.
 */

export type Measure = (text: string) => number;

/** Corta com "…" só o que não cabe em uma linha. */
export function ellipsize(measure: Measure, text: string, maxW: number): string {
  if (maxW <= 0) return '';
  if (measure(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && measure(t + '…') > maxW) t = t.slice(0, -1);
  return t + '…';
}

/** Pedaços de uma palavra que não cabe: primeiro em "/", depois por caractere. */
function breakWord(measure: Measure, word: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = '';
  // Mantém a barra no fim do pedaço ("/Users/" + "macbook/"), que lê melhor.
  const segments = word.split(/(?<=\/)/);
  for (const seg of segments) {
    if (measure(cur + seg) <= maxW) {
      cur += seg;
      continue;
    }
    if (cur) out.push(cur);
    cur = '';
    if (measure(seg) <= maxW) {
      cur = seg;
      continue;
    }
    for (const chr of seg) {
      if (cur && measure(cur + chr) > maxW) {
        out.push(cur);
        cur = '';
      }
      cur += chr;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Quebra `text` em até `maxLines` linhas de largura `maxW`. Quebra nos
 * espaços; palavra maior que a linha quebra em "/" ou por caractere. Só a
 * última linha ganha "…", e só se ainda sobrar texto além do limite.
 */
export function wrapText(measure: Measure, text: string, maxW: number, maxLines: number): string[] {
  const clean = text.trim();
  if (!clean || maxW <= 0 || maxLines <= 0) return [];

  const lines: string[] = [];
  // glue[i]: o que separa a linha i da anterior se forem coladas de novo
  // ('' quando a linha é continuação de uma palavra quebrada).
  const glue: string[] = [];
  let cur = '';
  let curGlue = ' ';

  for (const word of clean.split(/\s+/)) {
    const joined = cur ? cur + ' ' + word : word;
    if (measure(joined) <= maxW) {
      cur = joined;
      continue;
    }
    if (cur) {
      lines.push(cur);
      glue.push(curGlue);
    }
    curGlue = ' ';
    if (measure(word) <= maxW) {
      cur = word;
      continue;
    }
    const chunks = breakWord(measure, word, maxW);
    for (let i = 0; i < chunks.length - 1; i++) {
      lines.push(chunks[i]);
      glue.push(i === 0 ? ' ' : '');
    }
    cur = chunks[chunks.length - 1];
    curGlue = chunks.length > 1 ? '' : ' ';
  }
  if (cur) {
    lines.push(cur);
    glue.push(curGlue);
  }

  if (lines.length <= maxLines) return lines;
  // Passou do limite: o resto vira uma linha só, cortada com "…".
  let rest = lines[maxLines - 1];
  for (let i = maxLines; i < lines.length; i++) rest += glue[i] + lines[i];
  return [...lines.slice(0, maxLines - 1), ellipsize(measure, rest, maxW)];
}
