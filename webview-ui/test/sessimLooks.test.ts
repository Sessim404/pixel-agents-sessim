/**
 * Sessim: dois personagens vivos nunca saem com a mesma aparência (paleta +
 * cópia). Desde a v1.6 os nossos 25 bonecos (char_0..24) entram como bonecos
 * externos, depois dos personagens do editor: o boneco n é a paleta
 * `perfis + n`. Cobre a função pura do core (pickUniqueLook) e os pontos de
 * spawn do OfficeState: sessão, sub-agente com e sem papel e teammate.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { afterEach, beforeEach, describe, expect, it, test } from 'vitest';

import {
  type Look,
  pickUniqueLook,
  sessimPalettes,
  sessimReservedLooks,
} from '../../core/src/paletteUtils.js';
import { setExternalCharacterSprites } from '../src/characters/officeSprites.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { setCharacterTemplates } from '../src/office/sprites/spriteData.js';
import type { OfficeLayout } from '../src/office/types.js';
import { TileType } from '../src/office/types.js';
import { lulaPalette, sessimCharPalette } from '../src/sessimPalette.js';
import { roleLook } from '../src/sessimRoles.js';

/** 6 personagens do editor + os nossos 25. */
const PROFILES = 6;
const TOTAL = PROFILES + 25;

const key = (l: Look) => `${l.palette}:${l.repeat}`;

describe('pickUniqueLook (core)', () => {
  const reserved = sessimReservedLooks(PROFILES, TOTAL);
  const ours = sessimPalettes(PROFILES, TOTAL);

  it('reserva a cópia 0 dos bonecos dos papéis e do Lula, depois dos perfis', () => {
    expect(reserved.map((l) => l.palette).sort((a, b) => a - b)).toEqual([6, 7, 9, 10, 11, 30]);
    expect(reserved.every((l) => l.repeat === 0)).toBe(true);
    // Sem os nossos bonecos carregados, não há o que reservar.
    expect(sessimReservedLooks(PROFILES, PROFILES)).toEqual([]);
    expect(ours).toHaveLength(25);
    expect(ours[0]).toBe(PROFILES);
  });

  it('a primeira sessão fica com o primeiro boneco livre, cópia 0', () => {
    expect(pickUniqueLook({ paletteCount: TOTAL, used: [], reserved, palettes: ours })).toEqual({
      palette: 8,
      repeat: 0,
    });
  });

  it('usa o look preferido só se ele estiver livre', () => {
    // Livre: mantido.
    expect(
      pickUniqueLook({
        paletteCount: TOTAL,
        used: [],
        reserved,
        preferred: [{ palette: 12, repeat: 0 }],
        palettes: ours,
      }),
    ).toEqual({ palette: 12, repeat: 0 });
    // Uma cópia preferida cede a vez a um boneco livre.
    expect(
      pickUniqueLook({
        paletteCount: TOTAL,
        used: [],
        reserved,
        preferred: [{ palette: 12, repeat: 1 }],
        palettes: ours,
      }),
    ).toEqual({ palette: 8, repeat: 0 });
    // Reservado (boneco do construtor) é remapeado.
    expect(
      pickUniqueLook({
        paletteCount: TOTAL,
        used: [],
        reserved,
        preferred: [{ palette: 6, repeat: 0 }],
        palettes: ours,
      }),
    ).toEqual({ palette: 8, repeat: 0 });
  });

  it('só faz cópia quando todos os bonecos estão em uso, na paleta menos ocupada', () => {
    const used: Look[] = ours
      .filter((p) => !reserved.some((r) => r.palette === p))
      .map((palette) => ({ palette, repeat: 0 }));
    used.push({ palette: 8, repeat: 1 });
    const pick = pickUniqueLook({ paletteCount: TOTAL, used, reserved, palettes: ours });
    expect(pick.repeat).toBe(1);
    expect(pick.palette).not.toBe(8);
    expect(used.map(key)).not.toContain(key(pick));
  });
});

/** Layout só de chão, sem móveis: todo tile anda, ninguém senta. */
function floorLayout(cols = 9, rows = 7): OfficeLayout {
  return {
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [],
  };
}

function lookOf(os: OfficeState, id: number): Look {
  const ch = os.characters.get(id);
  assert.ok(ch, `personagem ${id} existe`);
  return { palette: ch.palette, repeat: ch.repeat };
}

function assertAllDistinct(os: OfficeState): void {
  const seen = new Map<string, number>();
  for (const ch of os.characters.values()) {
    const k = key({ palette: ch.palette, repeat: ch.repeat });
    assert.ok(!seen.has(k), `look ${k} repetido entre ${seen.get(k)} e ${ch.id}`);
    seen.set(k, ch.id);
  }
}

describe('OfficeState com os nossos 25 bonecos', () => {
  const blank = { down: [], up: [], right: [] };
  beforeEach(() => {
    setCharacterTemplates(Array.from({ length: TOTAL }, () => blank));
    setExternalCharacterSprites(Array.from({ length: 25 }, () => blank));
  });
  afterEach(() => {
    setExternalCharacterSprites([]);
    setCharacterTemplates(null as never);
  });

  test('papéis e Lula apontam para os nossos bonecos, depois dos perfis', () => {
    expect(roleLook('construtor')?.palette).toBe(sessimCharPalette(0));
    expect(sessimCharPalette(0)).toBe(PROFILES);
    expect(lulaPalette()).toBe(PROFILES + 24);
  });

  test('sessão nova ganha um dos nossos bonecos, nunca um perfil nem um reservado', () => {
    const reserved = new Set(sessimReservedLooks(PROFILES, TOTAL).map(key));
    for (let i = 0; i < 20; i++) {
      const os = new OfficeState(floorLayout());
      os.addAgent(1);
      const look = lookOf(os, 1);
      expect(look.palette).toBeGreaterThanOrEqual(PROFILES);
      expect(reserved.has(key(look))).toBe(false);
      expect(look.repeat).toBe(0);
    }
  });

  test('sessão salva com o look do construtor é remapeada ao entrar', () => {
    const os = new OfficeState(floorLayout());
    const construtor = roleLook('construtor')!;
    os.addAgent(1, construtor.palette, 0, undefined, true);
    assert.notDeepEqual(lookOf(os, 1), { palette: construtor.palette, repeat: 0 });
    // E o construtor que vier depois fica com o look do papel.
    const sub = os.addSubagent(1, 'tool-1', 'construtor');
    assert.deepEqual(lookOf(os, sub), { palette: construtor.palette, repeat: 0 });
    assertAllDistinct(os);
  });

  test('duas sessões com a mesma paleta salva não ficam iguais', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1, 12, 0, undefined, true);
    os.addAgent(2, 12, 0, undefined, true);
    assert.deepEqual(lookOf(os, 1), { palette: 12, repeat: 0 });
    assert.notDeepEqual(lookOf(os, 2), lookOf(os, 1));
    assertAllDistinct(os);
  });

  test('segundo construtor ganha outro boneco livre', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1);
    const a = os.addSubagent(1, 'tool-a', 'construtor');
    const b = os.addSubagent(1, 'tool-b', 'construtor');
    assert.deepEqual(lookOf(os, a), { palette: roleLook('construtor')!.palette, repeat: 0 });
    assert.notDeepEqual(lookOf(os, b), lookOf(os, a));
    assert.equal(
      os.characters.get(b)?.sessimRole,
      'construtor',
      'o papel (cor do quadro) continua',
    );
    assertAllDistinct(os);
  });

  test('sessões, teammates e sub-agentes ganham bonecos diferentes, sem cópias', () => {
    const os = new OfficeState(floorLayout(12, 12));
    os.addAgent(1);
    os.addAgent(2);
    os.addAgent(3, undefined, undefined, undefined, undefined, undefined, 1);
    os.addSubagent(1, 'c1', 'construtor');
    os.addSubagent(2, 'c2', 'construtor');
    os.addSubagent(1, 'gp', 'general-purpose');
    os.addSubagent(2, 'none');
    const palettes = [...os.characters.values()].map((ch) => ch.palette);
    expect(new Set(palettes).size).toBe(palettes.length);
    expect([...os.characters.values()].every((ch) => ch.repeat === 0)).toBe(true);
  });

  test('sessão salva como cópia ganha um boneco próprio', () => {
    const os = new OfficeState(floorLayout(12, 12));
    os.addAgent(1, 12, 0, undefined, true);
    os.addAgent(2, 12, 1, undefined, true);
    expect(lookOf(os, 2).palette).not.toBe(12);
    expect(lookOf(os, 2).repeat).toBe(0);
  });

  test('só faz cópia quando todos os bonecos estão em uso', () => {
    const os = new OfficeState(floorLayout(12, 12));
    // 19 bonecos livres para sessões (25 menos os 5 dos papéis e o Lula).
    for (let id = 1; id <= 19; id++) os.addAgent(id);
    expect([...os.characters.values()].every((ch) => ch.repeat === 0)).toBe(true);
    os.addAgent(20);
    expect(lookOf(os, 20).repeat).toBe(1);
    assertAllDistinct(os);
  });

  test('muitos personagens ao mesmo tempo continuam todos diferentes', () => {
    const os = new OfficeState(floorLayout(12, 12));
    for (let id = 1; id <= 10; id++) os.addAgent(id);
    for (let id = 1; id <= 10; id++) {
      os.addSubagent(id, 'c', 'construtor');
      os.addSubagent(id, 'e', 'explorador');
      os.addSubagent(id, 'g', 'general-purpose');
    }
    assert.equal(os.characters.size, 40);
    assertAllDistinct(os);
  });

  test('o look de quem está em despawn fica livre para o próximo', () => {
    const os = new OfficeState(floorLayout());
    os.addAgent(1, 12, 0, undefined, true);
    os.removeAgent(1); // começa o efeito de despawn; o personagem ainda está no mapa
    os.addAgent(2, 12, 0, undefined, true);
    assert.deepEqual(lookOf(os, 2), { palette: 12, repeat: 0 });
  });
});
