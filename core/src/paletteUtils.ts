/**
 * A new agent's look: which character it wears, and which copy of that
 * character it is (so two agents never look the same).
 *
 * Pure functions with no DOM/sprite dependencies — safe for use in both
 * browser (webview) and Node.js (server) environments. How a copy looks (its
 * clothes colour) is the webview's business; here a copy is only a number.
 */

import { pickDirectoryCharacter } from './directoryCharacters.js';
import type { DirectoryCharacterOrder } from './messages.js';

/**
 * An agent's look. `repeat` counts the copies of one character in the
 * office: 0 is the character as drawn, 1 its first repeat, 2 the next…
 */
export interface Look {
  palette: number;
  repeat: number;
}

/** An agent's look as far as picking goes (either part may still be unset). */
export type WornLook = Partial<Look>;

/** The repeat a new agent wearing `palette` gets: the lowest one no agent in
 *  `worn` wearing that character holds (0 when no one wears it). */
export function repeatFor(palette: number, worn: Iterable<WornLook>): number {
  const taken = new Set<number>();
  for (const look of worn) {
    if (look.palette === palette) taken.add(look.repeat ?? 0);
  }
  let repeat = 0;
  while (taken.has(repeat)) repeat++;
  return repeat;
}

/**
 * A character picked at random for a new agent among those with the fewest
 * copies in the office: who walks in is a surprise, but the copies stay even.
 * It never repeats one already in the office while some character is free,
 * and once the whole cast is in, no character gets a third copy until every
 * one has a second (and so on). Among those, it prefers characters no
 * Directory claims as a default (`reserved`), so a Directory's characters stay
 * available for its own launches.
 *
 * @param paletteCount - Total number of available palettes (e.g., 6)
 * @param worn - The looks of the agents already in the office
 * @param random - Source of randomness in [0, 1) (tests pass a fixed one)
 * @param reserved - Palettes to leave for whoever claims them (Directory defaults)
 */
export function pickRandomPalette(
  paletteCount: number,
  worn: readonly WornLook[],
  random: () => number = Math.random,
  reserved: ReadonlySet<number> = new Set(),
): number {
  const copies = new Array<number>(paletteCount).fill(0);
  for (const look of worn) {
    if (look.palette !== undefined && look.palette < paletteCount) copies[look.palette]++;
  }
  const fewest = Math.min(...copies);
  const candidates: number[] = [];
  for (let palette = 0; palette < paletteCount; palette++) {
    if (copies[palette] === fewest) candidates.push(palette);
  }
  const unclaimed = candidates.filter((palette) => !reserved.has(palette));
  const pool = unclaimed.length > 0 ? unclaimed : candidates;
  return pool[Math.floor(random() * pool.length)];
}

export interface LookRequest {
  paletteCount: number;
  /** The looks of the agents already in the office. */
  worn: readonly WornLook[];
  /** A character picked from the roster: worn even when someone else wears it. */
  picked?: number;
  /** The launch Directory's default characters (pickDirectoryCharacter). */
  directory?: { characters?: readonly number[]; characterOrder?: DirectoryCharacterOrder };
  /** Characters a random pick leaves for their Directories (pickRandomPalette). */
  reserved?: ReadonlySet<number>;
  random?: () => number;
}

/** A roster pick as it arrives (`launchAgent.palette`, any value), when it
 *  names a character in the cast: an integer in [0, paletteCount). */
export function rosterPick(raw: unknown, paletteCount: number): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return undefined;
  return raw >= 0 && raw < paletteCount ? raw : undefined;
}

/**
 * A new agent's look, first match wins: the roster pick, else one of the
 * launch Directory's defaults no one wears, else a random pick. Whichever it
 * is, an agent wearing a character already in the office is its next repeat.
 */
export function chooseLook(request: LookRequest): Look {
  const { paletteCount, worn, directory, random = Math.random } = request;
  const wornPalettes = new Set<number>();
  for (const look of worn) if (look.palette !== undefined) wornPalettes.add(look.palette);
  const palette =
    rosterPick(request.picked, paletteCount) ??
    pickDirectoryCharacter(
      directory?.characters ?? [],
      directory?.characterOrder ?? 'priority',
      paletteCount,
      wornPalettes,
      random,
    ) ??
    pickRandomPalette(paletteCount, worn, random, request.reserved);
  return { palette, repeat: repeatFor(palette, worn) };
}

// ── Sessim: nossos 25 bonecos e look único por personagem ─────────

/**
 * Os nossos bonecos (char_0..char_24.png, embutidos na extensão) entram como
 * bonecos externos: vêm logo depois dos personagens do editor (perfis). Por
 * isso o índice de paleta de um boneco nosso é `quantidade de perfis + n`.
 */
export const SESSIM_CHARACTER_COUNT = 25;

/**
 * Boneco fixo de cada papel dos agentes globais (~/.claude/agents), como
 * índice dos NOSSOS bonecos (0..24). As cores do quadro continuam em
 * webview-ui/src/sessimRoles.ts.
 */
export const SESSIM_ROLE_CHARS: Readonly<Record<string, number>> = Object.freeze({
  explorador: 1,
  implementador: 3,
  verificador: 4,
  arquiteto: 5,
  construtor: 0,
});

/** Boneco do Lula (char_24), reservado ao enfeite do escritório. */
export const SESSIM_LULA_CHAR = 24;

/** Paleta de um boneco nosso, dada a quantidade de perfis do editor. */
export function sessimPalette(char: number, profileCount: number): number {
  return profileCount + char;
}

/** As paletas dos nossos bonecos que existem (vazio se não foram carregados). */
export function sessimPalettes(profileCount: number, paletteCount: number): number[] {
  const out: number[] = [];
  for (let n = 0; n < SESSIM_CHARACTER_COUNT; n++) {
    const palette = sessimPalette(n, profileCount);
    if (palette < paletteCount) out.push(palette);
  }
  return out;
}

/** Looks reservados aos papéis e ao Lula (repeat 0) que existem nas paletas carregadas. */
export function sessimReservedLooks(profileCount: number, paletteCount: number): Look[] {
  return [...Object.values(SESSIM_ROLE_CHARS), SESSIM_LULA_CHAR]
    .map((char) => sessimPalette(char, profileCount))
    .filter((palette) => palette < paletteCount)
    .map((palette) => ({ palette, repeat: 0 }));
}

export interface UniqueLookOptions {
  /** Quantas paletas existem (perfis + bonecos externos). */
  paletteCount: number;
  /** Looks dos personagens vivos; nunca são repetidos. */
  used: readonly WornLook[];
  /** Looks que nunca podem ser escolhidos (os dos papéis), mesmo livres. */
  reserved?: readonly Look[];
  /** Tentados primeiro, na ordem, se não estiverem em `used`/`reserved`. */
  preferred?: readonly Look[];
  /** Paletas candidatas, em ordem de preferência (padrão: todas, em ordem sorteada). */
  palettes?: readonly number[];
  /** Gerador em [0, 1); injetável nos testes. */
  random?: () => number;
}

function lookKey(palette: number, repeat: number): string {
  return `${palette}:${repeat}`;
}

/**
 * Escolhe um look que não repita nenhum em uso nem reservado.
 *
 * Ordem: 1) o primeiro `preferred` livre (uma cópia, repeat > 0, só se não
 * houver boneco livre); 2) uma paleta candidata livre (repeat 0);
 * 3) a paleta candidata menos ocupada, na próxima cópia livre.
 */
export function pickUniqueLook(opts: UniqueLookOptions): Look {
  const random = opts.random ?? Math.random;
  const reserved = opts.reserved ?? [];
  const taken = new Set<string>();
  const all: WornLook[] = [...opts.used, ...reserved];
  for (const l of all) {
    if (l.palette !== undefined) taken.add(lookKey(l.palette, l.repeat ?? 0));
  }

  let palettes: number[];
  if (opts.palettes) {
    palettes = opts.palettes.filter((p) => p >= 0 && p < opts.paletteCount);
  } else {
    palettes = [];
    for (let i = 0; i < opts.paletteCount; i++) palettes.push(i);
    for (let i = palettes.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [palettes[i], palettes[j]] = [palettes[j], palettes[i]];
    }
  }
  if (palettes.length === 0) palettes = [0];

  const anyFreeBody = palettes.some((p) => !taken.has(lookKey(p, 0)));
  for (const p of opts.preferred ?? []) {
    if (p.palette >= opts.paletteCount || taken.has(lookKey(p.palette, p.repeat))) continue;
    if (p.repeat !== 0 && anyFreeBody) continue;
    return { palette: p.palette, repeat: p.repeat };
  }

  for (const palette of palettes) {
    if (!taken.has(lookKey(palette, 0))) return { palette, repeat: 0 };
  }

  const copies = new Map<number, number>();
  for (const l of all) {
    if (l.palette !== undefined) copies.set(l.palette, (copies.get(l.palette) ?? 0) + 1);
  }
  const palette = [...palettes].sort((a, b) => (copies.get(a) ?? 0) - (copies.get(b) ?? 0))[0];
  return { palette, repeat: repeatFor(palette, all) };
}
