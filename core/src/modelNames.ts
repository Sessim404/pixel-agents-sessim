/**
 * Sessim: nome curto e legível de um id de modelo.
 *
 * "claude-opus-5-5" → "Opus 5.5", "claude-fable-5-1" → "Fable 5.1",
 * "claude-3-5-sonnet-20241022" → "Sonnet 3.5", "haiku" → "Haiku".
 * Id desconhecido vira um nome a partir das próprias partes, sem quebrar.
 */

const FAMILIES = new Set(['opus', 'sonnet', 'haiku', 'fable']);

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shortModelName(modelId: string | null | undefined): string {
  if (!modelId) return '';
  // Sufixo entre colchetes ("[1m]" = contexto de 1M) fica inteiro no fim.
  const tag = /\[[^\]]*\]$/.exec(modelId.trim())?.[0] ?? '';
  const parts = modelId
    .trim()
    .slice(0, modelId.trim().length - tag.length)
    .toLowerCase()
    .replace(/^claude[-_]/, '')
    .split(/[-_.\s]+/)
    .filter(Boolean)
    // Data de lançamento (20241022) e sufixos vazios não entram no nome.
    .filter((p) => !/^\d{8}$/.test(p));
  if (parts.length === 0) return '';

  const words = parts.filter((p) => !/^\d+$/.test(p));
  const numbers = parts.filter((p) => /^\d+$/.test(p));
  const family = words.find((w) => FAMILIES.has(w)) ?? words[0];
  const extra = words.filter((w) => w !== family && !/^latest$/.test(w));
  const version = numbers.slice(0, 2).join('.');

  const name = family ? capitalize(family) : '';
  return [name, version, ...extra.map(capitalize), tag].filter(Boolean).join(' ');
}
