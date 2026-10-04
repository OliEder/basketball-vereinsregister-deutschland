import { buildHallIndex } from '../crawler/hall-index';
import { ClubEntry } from '../crawler/types';

const club = (clubId: number, name: string, halls: ClubEntry['halls']): ClubEntry => ({
  clubId, name, verbandId: 1, verbandName: 'Bayern', lat: null, lng: null, geocodedFrom: null, logoUrl: null, lastCrawled: '', halls, teams: []
});

describe('buildHallIndex', () => {
  it('nimmt die Heimhalle je Verein samt Adresse und Koordinaten', () => {
    const idx = buildHallIndex([
      club(1, 'TSV Test', [{ id: 1, dbbSpielfeldId: 1, bezeichnung: 'Sporthalle', strasse: 'A 1', plz: '86720', ort: 'Nördlingen', lat: 48.85, lng: 10.49 }])
    ]);
    expect(idx['1']).toEqual({ id: 1, bezeichnung: 'Sporthalle', strasse: 'A 1', plz: '86720', ort: 'Nördlingen', lat: 48.85, lng: 10.49 });
  });

  it('lässt Vereine ohne Halle aus und kennt fehlende Koordinaten als null', () => {
    const idx = buildHallIndex([
      club(2, 'Ohne Halle', []),
      club(3, 'Ohne Koordinaten', [{ id: 1, dbbSpielfeldId: 1, bezeichnung: 'Halle', ort: 'Bonn' }])
    ]);
    expect(idx['2']).toBeUndefined();
    expect(idx['3']).toMatchObject({ lat: null, lng: null, strasse: null, ort: 'Bonn' });
  });

  it('wählt bei mehreren Orten die Heimhalle nach dem Hallenalgorithmus', () => {
    const idx = buildHallIndex([
      club(4, 'SV Bonn', [
        { id: 1, dbbSpielfeldId: 1, bezeichnung: 'Auswärtshalle', ort: 'Köln' },
        { id: 2, dbbSpielfeldId: 2, bezeichnung: 'Heimhalle', ort: 'Bonn' }
      ])
    ]);
    expect(idx['4'].bezeichnung).toBe('Heimhalle'); // Ort steht im Vereinsnamen
  });
});

describe('buildHallIndex mit Geokodierung', () => {
  it('füllt Koordinaten der Heimhalle nur bei genauem Treffer', () => {
    const c = (id: number, sid: number) => club(id, 'TSV ' + id, [{ id: 1, dbbSpielfeldId: sid, bezeichnung: 'H', strasse: 'A 1', plz: '1', ort: 'Ulm' }]);
    const idx = buildHallIndex([c(1, 10), c(2, 20), c(3, 30)], { '10': { lat: 1, lng: 2, precision: 'adresse' }, '20': { lat: 3, lng: 4, precision: 'ort' } });
    expect(idx['1']).toMatchObject({ lat: 1, lng: 2 });
    expect(idx['2']).toMatchObject({ lat: null, lng: null });
    expect(idx['3']).toMatchObject({ lat: null, lng: null });
  });
});
