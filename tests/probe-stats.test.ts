import { fieldCoverage, nonZeroTotals } from '../crawler/probe-stats';

describe('probe-stats', () => {
  const entries = [
    { pts: 241, fouls: 28, rt: 0, twoPoints: { made: 74, attempted: 0 }, onePoints: { made: 36, attempted: 63 } },
    { pts: 200, fouls: 0, rt: 0, twoPoints: { made: 60, attempted: 0 }, onePoints: { made: 20, attempted: 0 } }
  ];

  it('fieldCoverage zählt Einträge mit Wert > 0 je Feld', () => {
    const c = fieldCoverage(entries);
    expect(c.pts).toBe(2);
    expect(c.fouls).toBe(1);
    expect(c.rt).toBe(0);
    expect(c['twoPoints.made']).toBe(2);
    expect(c['twoPoints.attempted']).toBe(0);
    expect(c['onePoints.attempted']).toBe(1);
  });

  it('fieldCoverage übersteht leere Listen', () => {
    expect(fieldCoverage([]).pts).toBe(0);
  });

  it('nonZeroTotals liefert nur befüllte Felder', () => {
    expect(nonZeroTotals({ pts: 49, fouls: 23, as: 0, twoPoints: { made: 22, attempted: 0 } })).toEqual({
      pts: 49, fouls: 23, 'twoPoints.made': 22
    });
    expect(nonZeroTotals(null)).toEqual({});
  });
});
