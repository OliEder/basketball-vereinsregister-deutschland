const PageNav = require('../portal/pagenav.js');

const heading = (text: string, id = '') => ({ id, textContent: text });

describe('PageNav', () => {
  it('slug löst Umlaute auf und bleibt lesbar', () => {
    expect(PageNav.slug('Nächste Spiele')).toBe('naechste-spiele');
    expect(PageNav.slug('Lokalderbys in Ulm')).toBe('lokalderbys-in-ulm');
    expect(PageNav.slug('!!!')).toBe('abschnitt');
  });

  it('vergibt fehlende Ids eindeutig und behält vorhandene', () => {
    const hs = [heading('Tabelle'), heading('Tabelle'), heading('Hallen', 'hallen')];
    const list = PageNav.entries(hs, { 'abschnitt-tabelle': false });
    expect(list.map((e: any) => e.id)).toEqual(['abschnitt-tabelle', 'abschnitt-tabelle-2', 'hallen']);
    expect(hs[1].id).toBe('abschnitt-tabelle-2');
  });

  it('weicht bereits benutzten Ids auf der Seite aus', () => {
    const list = PageNav.entries([heading('Tabelle')], { 'abschnitt-tabelle': true });
    expect(list[0].id).toBe('abschnitt-tabelle-2');
  });

  it('nimmt data-pagenav als Beschriftung für Blöcke ohne Überschrift', () => {
    const block = { id: '', textContent: 'Kalender abonnieren: Alle Spiele', getAttribute: (n: string) => (n === 'data-pagenav' ? 'Kalender-Abo' : null) };
    const list = PageNav.entries([block], {});
    expect(list).toEqual([{ id: 'abschnitt-kalender-abo', text: 'Kalender-Abo' }]);
  });

  it('lässt leere Überschriften weg und normalisiert Leerraum', () => {
    const list = PageNav.entries([heading('  Nächste \n Spiele '), heading('   ')], {});
    expect(list.map((e: any) => e.text)).toEqual(['Nächste Spiele']);
  });

  it('Signatur ändert sich mit Text und Id, nicht mit der Reihenfolge der Aufrufe', () => {
    const a = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }];
    expect(PageNav.signature(a)).toBe(PageNav.signature(a.map(e => ({ ...e }))));
    expect(PageNav.signature(a)).not.toBe(PageNav.signature([{ id: 'a', text: 'A' }, { id: 'b', text: 'C' }]));
  });
});
