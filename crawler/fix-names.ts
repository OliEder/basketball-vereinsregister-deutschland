// Einmaliges Fix-Script: holt den offiziellen vereinsname für alle Einträge
// in clubs.json via /rest/club/id/{clubId}/actualmatches und korrigiert
// name + geocodedFrom. Idempotent — kann mehrfach ausgeführt werden.

import { BbbClient } from './bbb-client';
import { extractCityFromName } from './extractor';
import { loadExistingClubs, mergeAndWrite } from './writer';

async function fixNames(): Promise<void> {
  const client = new BbbClient();
  const clubs = Array.from(loadExistingClubs().values());

  console.log(`${clubs.length} Vereine werden aktualisiert...`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < clubs.length; i++) {
    const club = clubs[i];
    if (club.clubId === null) continue;

    const details = await client.getClubDetails(club.clubId);
    if (details) {
      club.name = details.vereinsname;
      club.vereinsnummer = details.vereinsnummer;
      club.geocodedFrom = extractCityFromName(details.vereinsname);
      updated++;
    } else {
      failed++;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${clubs.length} verarbeitet (${updated} aktualisiert, ${failed} Fehler)...`);
      mergeAndWrite(clubs.slice(0, i + 1));
    }
  }

  mergeAndWrite(clubs);
  console.log(`\nFertig: ${updated} aktualisiert, ${failed} Fehler.`);
}

fixNames().catch(err => {
  console.error('fix-names fehlgeschlagen:', err);
  process.exit(1);
});
