import { describe, expect, it } from 'vitest';

import { formatReset, planUsageRows, setPlanUsage } from '../src/sessimPlanUsage.js';

describe('sessimPlanUsage', () => {
  const now = new Date(2026, 10, 10, 9, 0).getTime(); // ter 10/11 09:00 local

  it('mostra só a hora quando renova nas próximas 24 h', () => {
    expect(formatReset(new Date(2026, 10, 10, 11, 0).toISOString(), now)).toBe('renova 11:00');
  });

  it('mostra o dia quando renova depois de 24 h', () => {
    expect(formatReset(new Date(2026, 10, 12, 4, 0).toISOString(), now)).toBe('renova qui 04:00');
  });

  it('arredonda 03:59:59 para 04:00', () => {
    expect(formatReset(new Date(2026, 10, 12, 3, 59, 59, 900).toISOString(), now)).toBe(
      'renova qui 04:00',
    );
  });

  it('sem data, sem texto', () => {
    expect(formatReset(undefined, now)).toBe('');
  });

  it('mantém o último dado bom quando chega lista vazia', () => {
    setPlanUsage({ limits: [{ label: 'Sessão (5h)', percent: 7, severity: 'normal' }], at: now });
    setPlanUsage({ limits: [], at: now + 1 });
    expect(planUsageRows(now).map((r) => r.percent)).toEqual([7]);
  });
});
