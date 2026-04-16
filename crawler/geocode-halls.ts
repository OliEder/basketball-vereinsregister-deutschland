// crawler/geocode-halls.ts
// Geocodiert alle Halls mit Adresse (plz + ort) und füllt fehlende Vereinskoordinaten
// über die erste Hall-Adresse des Vereins nach.

import fs from 'fs';
import path from 'path';
import { geocodeCity } from './geocoder';
import { loadExistingClubs, writeClubs } from './writer';

const SAVE_EVERY = 100;

async function geocodeHalls(): Promise<void> {
  const clubs = Array.from(loadExistingClubs().values());

  let hallsGeocoded = 0;
  let hallsSkipped = 0;
  let clubsGeocoded = 0;
  let processed = 0;

  for (const club of clubs) {
    let changed = false;

    for (const hall of club.halls ?? []) {
      if (hall.lat != null) { hallsSkipped++; continue; }
      if (!hall.ort) continue;

      const query = [hall.strasse, hall.plz, hall.ort].filter(Boolean).join(', ');
      const coords = await geocodeCity(query);
      if (coords) {
        hall.lat = coords.lat;
        hall.lng = coords.lng;
        hallsGeocoded++;
        changed = true;
      } else {
        hall.lat = null;
        hall.lng = null;
      }
    }

    // Vereinskoordinaten aus erster Hall-Adresse nachfüllen
    if (club.lat == null) {
      const hallWithCoords = (club.halls ?? []).find(h => h.lat != null);
      if (hallWithCoords) {
        club.lat = hallWithCoords.lat!;
        club.lng = hallWithCoords.lng!;
        club.geocodedFrom = hallWithCoords.ort ?? null;
        clubsGeocoded++;
        changed = true;
      }
    }

    processed++;
    if (processed % SAVE_EVERY === 0) {
      writeClubs(new Map(clubs.map(c => [c.clubId, c])));
      console.log(`  ${processed}/${clubs.length} — Halls geocodiert: ${hallsGeocoded}, Vereine ergänzt: ${clubsGeocoded}`);
    }
  }

  writeClubs(new Map(clubs.map(c => [c.clubId, c])));
  console.log(`\nFertig:`);
  console.log(`  Halls geocodiert: ${hallsGeocoded}`);
  console.log(`  Halls übersprungen (bereits vorhanden): ${hallsSkipped}`);
  console.log(`  Vereine mit neuen Koordinaten: ${clubsGeocoded}`);
}

geocodeHalls().catch(err => {
  console.error('geocode-halls fehlgeschlagen:', err);
  process.exit(1);
});
