import { mergeHalls, mergeTeams, validateEnriched } from '../crawler/writer';
import { Hall, TeamEntry } from '../crawler/types';

describe('mergeHalls', () => {
  it('merges enriched halls into base halls, deduplicating by id', () => {
    const base: Hall[] = [
      { id: 1, dbbSpielfeldId: 105061, bezeichnung: 'Sporthalle A' }
    ];
    const enriched: Hall[] = [
      { id: 'local-1', dbbSpielfeldId: null, bezeichnung: 'Turnhalle Nord' },
      { id: 1, dbbSpielfeldId: 105061, bezeichnung: 'Sporthalle A (updated)' }
    ];
    const result = mergeHalls(base, enriched);
    expect(result).toHaveLength(2);
    expect(result.find(h => h.id === 1)?.bezeichnung).toBe('Sporthalle A (updated)');
    expect(result.find(h => h.id === 'local-1')).toBeDefined();
  });

  it('returns base halls when no enriched halls', () => {
    const base: Hall[] = [{ id: 1, dbbSpielfeldId: 100, bezeichnung: 'Halle' }];
    expect(mergeHalls(base, [])).toEqual(base);
  });
});

describe('mergeTeams', () => {
  it('merges training from enriched into auto-crawled teams', () => {
    const base: TeamEntry[] = [
      { teamPermanentId: 100, altersklasse: 'Senioren', geschlecht: 'männlich', training: [] }
    ];
    const enriched = [
      { teamPermanentId: 100, training: [{ wochentag: 'Dienstag' as const, von: '19:00', bis: '21:00', hallId: 1 }] }
    ];
    const result = mergeTeams(base, enriched);
    expect(result[0].training).toHaveLength(1);
    expect(result[0].altersklasse).toBe('Senioren');
    expect(result[0].geschlecht).toBe('männlich');
  });

  it('does not overwrite altersklasse/geschlecht from enriched', () => {
    const base: TeamEntry[] = [
      { teamPermanentId: 100, altersklasse: 'U16', geschlecht: 'weiblich', training: [] }
    ];
    const enriched = [
      { teamPermanentId: 100, training: [], altersklasse: 'Senioren' } as any
    ];
    const result = mergeTeams(base, enriched);
    expect(result[0].altersklasse).toBe('U16');
  });
});

describe('validateEnriched', () => {
  it('returns true for valid enriched entry', () => {
    const valid = { clubId: 1, website: 'https://example.com', halls: [], teams: [] };
    expect(validateEnriched(valid)).toBe(true);
  });

  it('returns false for entry missing clubId', () => {
    const invalid = { website: 'https://example.com' };
    expect(validateEnriched(invalid as any)).toBe(false);
  });

  it('returns false for unknown field', () => {
    const invalid = { clubId: 1, unknownField: 'oops' };
    expect(validateEnriched(invalid as any)).toBe(false);
  });
});
