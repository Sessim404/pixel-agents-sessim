/**
 * Server-side look assignment.
 *
 * Gives agents their look (palette + repeat, core chooseLook) when they're
 * created, so every connected client draws the same character.
 */

import type { Directory } from '../../core/src/messages.js';
import {
  chooseLook,
  pickUniqueLook,
  rosterPick,
  SESSIM_CHARACTER_COUNT,
  sessimPalettes,
  sessimReservedLooks,
} from '../../core/src/paletteUtils.js';
import type { AgentStateStore } from './agentStateStore.js';
import { getCharacterProfiles } from './characterProfilesStore.js';
import { readConfig } from './configPersistence.js';
import type { AgentState } from './types.js';

/**
 * Palettes are the character profiles (characters.json, owned by
 * characterProfilesStore) followed by any char_N.png sprites from external asset
 * directories, so the count moves when either changes. The external count mirrors the
 * setHookProvider / setTeamSwitch module-level setter pattern in transcriptParser.ts.
 */
let externalCount = 0;

/** Set after external asset directories are scanned for character sprites. */
export function setExternalCharacterCount(count: number): void {
  externalCount = Math.max(0, Math.floor(count));
}

/** Palettes an agent can wear (at least one: the profile list is never empty). */
export function getPaletteCount(): number {
  return getCharacterProfiles().length + externalCount;
}

/** Every character some Directory claims as a default: left for its own
 *  launches when another agent needs a character (see pickRandomPalette). */
function directoryDefaults(): Set<number> {
  const reserved = new Set<number>();
  for (const directory of readConfig().directories) {
    for (const palette of directory.characters ?? []) reserved.add(palette);
  }
  return reserved;
}

/** What a launch asks of a new agent's look. */
export interface LaunchLook {
  /** A character picked from the roster (a palette index). */
  picked?: number;
  /** The Directory launched into: its default characters. */
  directory?: Directory;
}

/**
 * Give an agent its look. Sessim: a escolha na lista de personagens e os
 * padrões do Directory valem como na versão oficial; fora isso, o sorteio é
 * só entre os NOSSOS bonecos, sem repetir o de outro agente nem os reservados
 * aos papéis e ao Lula (pickUniqueLook). A no-op for an agent that already has
 * one (restored, or a teammate that copied its lead's).
 */
export function assignPaletteIfNeeded(
  agent: AgentState,
  store: AgentStateStore,
  launch: LaunchLook = {},
): void {
  if (agent.palette !== undefined) return;
  const paletteCount = getPaletteCount();
  const worn = [...store.values()].filter((existing) => existing.id !== agent.id);
  const profileCount = getCharacterProfiles().length;
  const ours = sessimPalettes(profileCount, paletteCount);
  const picked = rosterPick(launch.picked, paletteCount);
  // Sem os nossos 25 bonecos carregados, ou com escolha explícita (lista de
  // personagens / padrões do Directory): regra oficial (chooseLook).
  if (
    ours.length < SESSIM_CHARACTER_COUNT ||
    picked !== undefined ||
    launch.directory?.characters?.length
  ) {
    const look = chooseLook({
      paletteCount,
      worn,
      picked,
      directory: launch.directory,
      reserved: directoryDefaults(),
    });
    agent.palette = look.palette;
    agent.repeat = look.repeat;
    return;
  }
  const look = pickUniqueLook({
    paletteCount,
    used: worn,
    reserved: sessimReservedLooks(profileCount, paletteCount),
    palettes: shuffled(ours),
  });
  agent.palette = look.palette;
  agent.repeat = look.repeat;
}

function shuffled(list: number[]): number[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
