import { BbbClient } from './bbb-client';
import { extractClubs, extractCityFromName, extractTeams } from './extractor';
import { geocodeCity } from './geocoder';
import { mergeAndWrite, loadExistingClubs } from './writer';
import { ClubEntry, TeamEntry } from './types';

async function crawl(): Promise<void> {
  const skipGeocoding = process.argv.includes('--skip-geocoding');
  const client = new BbbClient();
  const allClubs = new Map<number, ClubEntry>();
  // teamsByClub accumulates teamPermanentIds + altersklasse/geschlecht per club
  const teamsByClub = new Map<number, TeamEntry[]>();

  // Phase 1: Verbände → Ligen → Tabellen
  console.log('Phase 1: Lade Tabellen...');
  const verbaende = await client.getVerbaende();
  console.log(`${verbaende.length} Verbände gefunden.`);

  for (const verband of verbaende) {
    console.log(`\nVerband: ${verband.label} (${verband.id})`);
    let startAtIndex = 0;
    let hasMore = true;

    while (hasMore) {
      const { ligen, hasMoreData } = await client.getLigen(verband.id, startAtIndex);
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
          const altersklasse = liga.akName ?? '';
          const geschlecht = liga.geschlecht ?? '';
          const teamsFromLiga = extractTeams(entries, altersklasse, geschlecht);
          for (const [clubId, teams] of teamsFromLiga) {
            const existing = teamsByClub.get(clubId) ?? [];
            for (const team of teams) {
              if (!existing.some(t => t.teamPermanentId === team.teamPermanentId)) {
                existing.push(team);
              }
            }
            teamsByClub.set(clubId, existing);
          }
        } catch (err) {
          console.warn(`  Tabelle für Liga ${liga.ligaId} nicht verfügbar: ${err}`);
        }
      }

      hasMore = hasMoreData;
      startAtIndex += ligen.length;
    }
  }

  // Attach accumulated teams to club entries
  for (const [clubId, teams] of teamsByClub) {
    const club = allClubs.get(clubId);
    if (club) club.teams = teams;
  }

  console.log(`\nPhase 1 fertig: ${allClubs.size} Vereine, ${teamsByClub.size} mit Teams.`);

  // Phase 2: Club-Details nur für neue clubIds
  console.log('\nPhase 2: Hole Club-Details für neue Vereine...');
  const existingClubs = loadExistingClubs();
  let detailCount = 0;

  for (const club of allClubs.values()) {
    if (existingClubs.has(club.clubId)) {
      // Preserve coordinates, name, halls from existing data; teams come from Phase 1
      const prev = existingClubs.get(club.clubId)!;
      club.name = prev.name;
      club.vereinsnummer = prev.vereinsnummer;
      club.geocodedFrom = prev.geocodedFrom;
      club.lat = prev.lat;
      club.lng = prev.lng;
      club.halls = prev.halls ?? [];
    } else {
      const details = await client.getClubDetails(club.clubId);
      if (details) {
        club.name = details.vereinsname;
        club.vereinsnummer = details.vereinsnummer;
        club.geocodedFrom = extractCityFromName(details.vereinsname);
        detailCount++;
      } else {
        console.warn(`  Club-Details nicht gefunden für clubId ${club.clubId} (${club.name})`);
      }
      club.halls = [];
    }
  }

  console.log(`${detailCount} neue Vereine mit Club-Details angereichert.`);

  // Schreiben vor Geocoding — clubs.json ist nie leer
  mergeAndWrite(Array.from(allClubs.values()));

  if (skipGeocoding) {
    console.log('Geocoding übersprungen (--skip-geocoding).');
    return;
  }

  // Phase 3: Geocoding nur für lat === null
  console.log('\nPhase 3: Geocoding...');
  const toGeocode = Array.from(allClubs.values()).filter(c => c.lat === null);
  console.log(`${toGeocode.length} Vereine ohne Koordinaten.`);

  let geocoded = 0;
  for (let i = 0; i < toGeocode.length; i++) {
    const club = toGeocode[i];
    const coords = await geocodeCity(club.geocodedFrom ?? club.name);
    if (coords) {
      club.lat = coords.lat;
      club.lng = coords.lng;
      geocoded++;
    }
    if ((i + 1) % 10 === 0) {
      console.log(`  ${i + 1}/${toGeocode.length} geocodiert...`);
    }
  }

  console.log(`Geocoding: ${geocoded}/${toGeocode.length} erfolgreich.`);
  mergeAndWrite(Array.from(allClubs.values()));

  // Phase 4: Halls — nur für neue Vereine, monatlich
  // Initialer Hall-Crawl läuft separat über crawl-halls.ts
  console.log('\nPhase 4: Halls werden im monatlichen Crawl über crawl-halls.ts ergänzt.');
}

crawl().catch(err => {
  console.error('Crawl fehlgeschlagen:', err);
  process.exit(1);
});
