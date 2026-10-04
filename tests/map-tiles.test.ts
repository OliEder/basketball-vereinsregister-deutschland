import fs from 'fs';
import path from 'path';

const MapTiles = require('../portal/map-tiles.js');
const portal = path.join(__dirname, '..', 'portal');

describe('MapTiles', () => {
  it('nutzt OpenStreetMap-Kacheln mit Quellenvermerk und markiert den Container', () => {
    const classes = new Set<string>();
    let options: any;
    let url = '';
    const L = { tileLayer: (u: string, o: any) => { url = u; options = o; return { addTo: (m: any) => m }; } };
    const map = { getContainer: () => ({ classList: { add: (c: string) => classes.add(c) } }) };
    MapTiles.add(L, map);
    expect(url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(options.attribution).toContain('OpenStreetMap');
    expect(options.maxZoom).toBe(19);
    expect(classes.has('dss-map')).toBe(true);
  });

  it('keine Datei des Portals nennt noch CARTO-Kacheln (verlangen einen API-Schlüssel)', () => {
    const files = fs.readdirSync(portal).filter(f => /\.(js|html|css)$/.test(f));
    const hits = files.filter(f => /cartocdn|basemaps\.cartocdn/i.test(fs.readFileSync(path.join(portal, f), 'utf-8')));
    expect(hits).toEqual([]);
  });

  it('Seiten mit Karte laden map-tiles.js nach Leaflet und vor dem Kartenskript', () => {
    for (const [page, script] of [['team.html', 'team.js'], ['verein.html', 'verein.js']]) {
      const html = fs.readFileSync(path.join(portal, page), 'utf-8');
      const at = (s: string) => html.indexOf(s);
      expect(at('leaflet.js')).toBeGreaterThan(-1);
      expect(at('map-tiles.js')).toBeGreaterThan(at('leaflet.js'));
      expect(at(script)).toBeGreaterThan(at('map-tiles.js'));
    }
  });
});
