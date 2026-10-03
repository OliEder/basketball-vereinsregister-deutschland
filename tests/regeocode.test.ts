import { isSuspect } from '../crawler/regeocode';

describe('isSuspect', () => {
  it('flags legal forms and empty values as geocodedFrom', () => {
    for (const g of ['e.V.', 'V.', 'eV', 'e. V.', '', null]) {
      expect(isSuspect({ geocodedFrom: g as any })).toBe(true);
    }
  });
  it('accepts real place names', () => {
    expect(isSuspect({ geocodedFrom: 'Calw' })).toBe(false);
    expect(isSuspect({ geocodedFrom: 'Neustadt a. d. Waldnaab' })).toBe(false);
  });
});
