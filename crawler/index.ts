import { BbbClient } from './bbb-client';
import { extractClubs } from './extractor';
import { geocodeCity } from './geocoder';
import { mergeAndWrite, loadExistingClubs } from './writer';
import { ClubEntry } from './types';

async function crawl(): Promise<void> {
  const skipGeocoding = process.argv.includes('--skip-geocoding');
  const client = new BbbClient();
  const allClubs = new Map<number, ClubEntry>();

  console.log('Lade Verbände...');
  const verbaende = await client.getVerbaende();
  console.log(`${verbaende.length} Verbände gefunden.`);

  for (const verband of verbaende) {
    console.log(`\nVerband: ${verband.label} (${verband.id})`);
    let startAtIndex = 0;
    let hasMore = true;

    while (hasMore) {
      const { ligen, hasMoreData } = await client.getLigen(verband.id, startAtIndex);
      console.log(`  ${ligen.length} Ligen ab Index ${startAtIndex}`);

      if (ligen.length === 0) break;

      for (const liga of ligen) {
        try {
          const entries = await client.getTable(liga.ligaId);
          const clubs = extractClubs(entries, verband.id, verband.label);
          for (const club of clubs) {
            if (!allClubs.has(club.clubId)) {
              allClubs.set(club.clubId, club);
            }
          }
        } catch (err) {
          console.warn(`  Tabelle für Liga ${liga.ligaId} nicht verfügbar: ${err}`);
        }
      }

      hasMore = hasMoreData;
      startAtIndex += ligen.length;
    }
  }

  console.log(`\n${allClubs.size} eindeutige Vereine gefunden.`);

  // Erst schreiben (ohne Koordinaten) damit clubs.json nie leer bleibt
  mergeAndWrite(Array.from(allClubs.values()));

  if (skipGeocoding) {
    console.log('Geocoding übersprungen (--skip-geocoding).');
    return;
  }

  console.log('Starte Geocoding...');
  const existing = loadExistingClubs();
  const toGeocode = Array.from(allClubs.values()).filter(club => {
    const ex = existing.get(club.clubId);
    return !ex || ex.lat === null;
  });

  console.log(`${toGeocode.length} Vereine werden geocodiert (${allClubs.size - toGeocode.length} haben bereits Koordinaten).`);

  let geocoded = 0;
  for (const club of toGeocode) {
    const coords = await geocodeCity(club.geocodedFrom ?? club.name);
    if (coords) {
      club.lat = coords.lat;
      club.lng = coords.lng;
      geocoded++;
    }
    if (geocoded % 10 === 0 && geocoded > 0) {
      console.log(`  ${geocoded}/${toGeocode.length} geocodiert...`);
    }
  }

  console.log(`\nGeocodierung abgeschlossen: ${geocoded}/${toGeocode.length} erfolgreich.`);
  mergeAndWrite(Array.from(allClubs.values()));
}

crawl().catch(err => {
  console.error('Crawl fehlgeschlagen:', err);
  process.exit(1);
});
