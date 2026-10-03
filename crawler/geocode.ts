// Standalone-Geocoding-Script: liest clubs.json, geocodiert alle Einträge
// mit lat === null und schreibt die Koordinaten zurück.
// Kann mehrfach ausgeführt werden (idempotent).

import fs from 'fs';
import path from 'path';
import { geocodeClub, GeocodeSource } from './club-geocoder';
import { loadExistingClubs, mergeAndWrite } from './writer';

const TODO_PATH = path.join(__dirname, '..', 'data', 'geocoding-todo.json');

async function geocodeAll(): Promise<void> {
  const existing = loadExistingClubs();
  const toGeocode = Array.from(existing.values()).filter(c => c.lat === null);

  if (toGeocode.length === 0) {
    console.log('Alle Vereine haben bereits Koordinaten. Nichts zu tun.');
    return;
  }

  console.log(`${toGeocode.length} Vereine ohne Koordinaten werden geocodiert...`);

  let done = 0;
  const bySource: Record<GeocodeSource, number> = { name: 0, hall: 0, city: 0 };
  for (let i = 0; i < toGeocode.length; i++) {
    const club = toGeocode[i];
    const coords = await geocodeClub(club);
    if (coords) {
      club.lat = coords.lat;
      club.lng = coords.lng;
      if (coords.geocodedFrom) club.geocodedFrom = coords.geocodedFrom;
      done++;
      bySource[coords.source]++;
    }
    // Alle 50 verarbeiteten Einträge zwischenspeichern (nicht nur erfolgreich geocodierte)
    if ((i + 1) % 50 === 0) {
      console.log(`  ${done} geocodiert, ${i + 1}/${toGeocode.length} verarbeitet...`);
      mergeAndWrite(toGeocode.slice(0, i + 1));
    }
  }

  mergeAndWrite(toGeocode);
  console.log(`Geocoding abgeschlossen: ${done}/${toGeocode.length} erfolgreich (Name: ${bySource.name}, Halle: ${bySource.hall}, Ort: ${bySource.city}).`);

  const failed = toGeocode.filter(c => c.lat === null);
  if (failed.length > 0) {
    const todo = failed.map(c => ({
      clubId: c.clubId,
      name: c.name,
      geocodedFrom: c.geocodedFrom,
      verbandName: c.verbandName,
      bbbUrl: `https://www.basketball-bund.net/vereinDetail/id/${c.clubId}`,
      // Manuell in clubs-enriched.json eintragen:
      // { "clubId": X, "address": { "city": "Stadtname" } }
    }));
    fs.writeFileSync(TODO_PATH, JSON.stringify(todo, null, 2), 'utf-8');
    console.log(`${failed.length} Vereine ohne Koordinaten → data/geocoding-todo.json`);
  } else {
    if (fs.existsSync(TODO_PATH)) fs.unlinkSync(TODO_PATH);
    console.log('Alle Vereine geocodiert — geocoding-todo.json gelöscht.');
  }
}

geocodeAll().catch(err => {
  console.error('Geocoding fehlgeschlagen:', err);
  process.exit(1);
});
