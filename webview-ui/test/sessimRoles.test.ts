import { describe, expect, it } from 'vitest';

import {
  SESSIM_COLOR_CONSTRUTOR,
  SESSIM_COLOR_EXPLORADOR,
  SESSIM_SESSION_COLORS,
} from '../src/constants.js';
import { sessimCharPalette } from '../src/sessimPalette.js';
import {
  roleColor,
  roleLook,
  sessionColor,
  splitRoleLabel,
  typeColor,
} from '../src/sessimRoles.js';

/** Sessim: tipo do sub-agente e cores fixas por sessão e por tipo. */
describe('splitRoleLabel', () => {
  it('reconhece os papéis conhecidos com e sem descrição', () => {
    expect(splitRoleLabel('explorador · Mapear pasta')).toEqual({
      role: 'explorador',
      rest: 'Mapear pasta',
    });
    expect(splitRoleLabel('construtor')).toEqual({ role: 'construtor', rest: '' });
  });

  it('extrai tipos fora da lista quando vêm com o separador', () => {
    expect(splitRoleLabel('general-purpose · Buscar usos')).toEqual({
      role: 'general-purpose',
      rest: 'Buscar usos',
    });
    expect(splitRoleLabel('Explore · Varrer src').role).toBe('Explore');
  });

  it('descrição solta não vira tipo', () => {
    expect(splitRoleLabel('Mapear pasta')).toEqual({ role: null, rest: 'Mapear pasta' });
    expect(splitRoleLabel('Ler arquivos · depois editar')).toEqual({
      role: null,
      rest: 'Ler arquivos · depois editar',
    });
  });
});

describe('cores', () => {
  it('papel conhecido tem personagem e cor fixos; tipo desconhecido só cor', () => {
    // Paleta = perfis do editor + boneco do papel (construtor = char_0).
    expect(roleLook('construtor')).toEqual({
      palette: sessimCharPalette(0),
      color: SESSIM_COLOR_CONSTRUTOR,
    });
    expect(roleLook('general-purpose')).toBeNull();
    expect(roleColor('explorador')).toBe(SESSIM_COLOR_EXPLORADOR);
    expect(SESSIM_SESSION_COLORS).toContain(roleColor('general-purpose'));
  });

  it('cor da sessão segue o id e dá a volta na lista', () => {
    const n = SESSIM_SESSION_COLORS.length;
    expect(sessionColor(1)).toBe(SESSIM_SESSION_COLORS[0]);
    expect(sessionColor(n + 1)).toBe(SESSIM_SESSION_COLORS[0]);
    expect(sessionColor(2)).not.toBe(sessionColor(3));
  });

  it('cor do tipo é estável', () => {
    expect(typeColor('Plan')).toBe(typeColor('Plan'));
    expect(SESSIM_SESSION_COLORS).toContain(typeColor('claude-code-guide'));
  });
});
