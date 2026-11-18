import { describe, expect, it } from 'vitest';

import { parsePlanUsage } from '../src/sessimPlanUsage.js';

describe('parsePlanUsage', () => {
  it('lê `limits` com sessão, semana e limite por modelo', () => {
    const rows = parsePlanUsage({
      limits: [
        { kind: 'session', percent: 7, severity: 'normal', resets_at: '2026-11-10T14:00:00Z' },
        { kind: 'weekly_all', percent: 65, severity: 'normal', resets_at: '2026-11-12T07:00:00Z' },
        {
          kind: 'weekly_scoped',
          percent: 81,
          severity: 'warning',
          resets_at: '2026-11-12T07:00:00Z',
          scope: { model: { id: null, display_name: 'Fable' } },
        },
      ],
    });
    expect(rows.map((r) => [r.label, r.percent, r.severity])).toEqual([
      ['Sessão (5h)', 7, 'normal'],
      ['Semana (7 dias)', 65, 'normal'],
      ['Limite Fable', 81, 'warning'],
    ]);
  });

  it('cai no formato antigo sem `limits`', () => {
    const rows = parsePlanUsage({
      five_hour: { utilization: 12.4, resets_at: null },
      seven_day: { utilization: 40, resets_at: '2026-11-12T07:00:00Z' },
    });
    expect(rows.map((r) => [r.label, r.percent, r.resetsAt])).toEqual([
      ['Sessão (5h)', 12, undefined],
      ['Semana (7 dias)', 40, '2026-11-12T07:00:00Z'],
    ]);
  });

  it('resposta estranha não quebra', () => {
    expect(parsePlanUsage(null)).toEqual([]);
    expect(parsePlanUsage({ limits: [] })).toEqual([]);
  });
});
