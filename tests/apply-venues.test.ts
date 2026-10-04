import { applyVenuesToDoc, coordsByHallId } from '../crawler/apply-venues';
import { VenueStore, HallMap } from '../crawler/venues';

const store: VenueStore = { updated: '', matches: { '1': [100, 20000], '2': [0, 20000], '3': [101, 20000] } };
const halls: HallMap = {
  '100': { bezeichnung: 'Halle A', strasse: 'A 1', plz: '80331', ort: 'München' },
  '101': { bezeichnung: 'Halle B', strasse: null, plz: null, ort: 'Bonn' }
};
const coords = coordsByHallId([{ halls: [{ dbbSpielfeldId: 100, lat: 48.1, lng: 11.6 }, { dbbSpielfeldId: 999, lat: 1, lng: 1 }, { dbbSpielfeldId: null, lat: 2, lng: 2 }] }]);

describe('coordsByHallId', () => {
  it('nimmt nur Hallen mit Spielfeld-ID und Koordinaten', () => {
    expect(coords.get(100)).toEqual({ lat: 48.1, lng: 11.6 });
    expect(coords.size).toBe(2);
  });
});

describe('applyVenuesToDoc', () => {
  it('legt venues und halls an, mit Koordinaten wo bekannt', () => {
    const doc: any = { matches: [{ matchId: 1 }, { matchId: 2 }, { matchId: 3 }, { matchId: 4 }] };
    expect(applyVenuesToDoc(doc, store, halls, coords)).toBe(2);
    expect(doc.venues).toEqual({ '1': 100, '3': 101 });
    expect(doc.halls['100']).toMatchObject({ bezeichnung: 'Halle A', lat: 48.1, lng: 11.6 });
    expect(doc.halls['101']).toMatchObject({ bezeichnung: 'Halle B', lat: null, lng: null });
  });

  it('lässt unbekannte Hallen (0), fehlende Einträge und unbekannte Hallen-IDs aus', () => {
    const doc: any = { matches: [{ matchId: 2 }, { matchId: 4 }, { matchId: 5 }] };
    expect(applyVenuesToDoc(doc, { ...store, matches: { ...store.matches, '5': [555, 1] } }, halls, coords)).toBe(0);
    expect(doc.venues).toBeUndefined();
    expect(doc.halls).toBeUndefined();
  });

  it('entfernt veraltete Felder, wenn nichts mehr bekannt ist', () => {
    const doc: any = { matches: [{ matchId: 4 }], venues: { '4': 1 }, halls: { '1': {} } };
    applyVenuesToDoc(doc, store, halls, coords);
    expect(doc.venues).toBeUndefined();
  });
});

describe('coordsByHallId mit Geokodierung', () => {
  it('nimmt Treffer auf die Adresse, ignoriert Ortsmitten; clubs.json ändert eine vorhandene Geokodierung nicht', () => {
    const clubs = [{ halls: [{ dbbSpielfeldId: 1, lat: 1, lng: 1 }, { dbbSpielfeldId: 2 }] }];
    const m = coordsByHallId(clubs, {
      '1': { lat: 9, lng: 9, precision: 'adresse' },
      '3': { lat: 3, lng: 3, precision: 'adresse' },
      '4': { lat: 4, lng: 4, precision: 'ort' }
    });
    expect(m.get(1)).toEqual({ lat: 9, lng: 9 });
    expect(m.get(3)).toEqual({ lat: 3, lng: 3 });
    expect(m.has(4)).toBe(false);
    expect(m.has(2)).toBe(false);
  });
});
