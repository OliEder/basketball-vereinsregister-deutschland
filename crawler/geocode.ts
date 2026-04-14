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
  for (let i = 0; i < toGeocode.length; i++) {
    const club = toGeocode[i];
    const coords = await geocodeCity(club.geocodedFrom ?? club.name);
    if (coords) {
      club.lat = coords.lat;
      club.lng = coords.lng;
      done++;
    }
    // Alle 50 verarbeiteten Einträge zwischenspeichern (nicht nur erfolgreich geocodierte)
    if ((i + 1) % 50 === 0) {
      console.log(`  ${done} geocodiert, ${i + 1}/${toGeocode.length} verarbeitet...`);
      mergeAndWrite(toGeocode.slice(0, i + 1));
    }
  }

  mergeAndWrite(toGeocode);
  console.log(`Geocoding abgeschlossen: ${done}/${toGeocode.length} erfolgreich.`);
}

geocodeAll().catch(err => {
  console.error('Geocoding fehlgeschlagen:', err);
  process.exit(1);
});
