// Standalone-Geocoding-Script: liest clubs.json, geocodiert alle Einträge
// mit lat === null und schreibt die Koordinaten zurück.
// Kann mehrfach ausgeführt werden (idempotent).

import { geocodeCity } from './geocoder';
import { loadExistingClubs, mergeAndWrite } from './writer';

async function geocodeAll(): Promise<void> {
  const existing = loadExistingClubs();
  const toGeocode = Array.from(existing.values()).filter(c => c.lat === null);

  if (toGeocode.length === 0) {
    console.log('Alle Vereine haben bereits Koordinaten. Nichts zu tun.');
    return;
  }

  console.log(`${toGeocode.length} Vereine ohne Koordinaten werden geocodiert...`);

  let done = 0;
  for (const club of toGeocode) {
    const coords = await geocodeCity(club.geocodedFrom ?? club.name);
    if (coords) {
      club.lat = coords.lat;
      club.lng = coords.lng;
      done++;
    }
    if (done % 50 === 0 && done > 0) {
      console.log(`  ${done}/${toGeocode.length} geocodiert...`);
      // Zwischenspeichern damit bei Timeout kein Fortschritt verloren geht
      mergeAndWrite(toGeocode.slice(0, done));
    }
  }

  mergeAndWrite(toGeocode);
  console.log(`Geocoding abgeschlossen: ${done}/${toGeocode.length} erfolgreich.`);
}

geocodeAll().catch(err => {
  console.error('Geocoding fehlgeschlagen:', err);
  process.exit(1);
});
