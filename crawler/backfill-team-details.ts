// crawler/backfill-team-details.ts
// Einmaliger Backfill: holt teamNumber, teamAkj, teamAkjId für alle Teams
// in clubs.json die diese Felder noch nicht haben.
// Loggt am Ende alle gesehenen teamAkjId → teamAkj Mappings.

import { BbbClient } from './bbb-client';
import { loadExistingClubs, mergeAndWrite } from './writer';

async function backfillTeamDetails(): Promise<void> {
  const client = new BbbClient();
  const clubs = Array.from(loadExistingClubs().values());

  // Alle Teams ohne teamNumber sammeln
  const toFetch: Array<{ clubId: number; teamPermanentId: number }> = [];
  for (const club of clubs) {
    for (const team of club.teams ?? []) {
      if (team.teamNumber === undefined) {
        toFetch.push({ clubId: club.clubId, teamPermanentId: team.teamPermanentId });
      }
    }
  }

  console.log(`${toFetch.length} Teams ohne teamNumber gefunden.`);

  // Map für schnellen Zugriff
  const clubMap = new Map(clubs.map(c => [c.clubId, c]));

  // Enum-Tracking
  const akjEnum = new Map<number, string>();

  let done = 0;
  let failed = 0;

  for (let i = 0; i < toFetch.length; i++) {
    const { clubId, teamPermanentId } = toFetch[i];
    const details = await client.getTeamDetails(teamPermanentId);

    if (details) {
      const club = clubMap.get(clubId)!;
      const team = club.teams.find(t => t.teamPermanentId === teamPermanentId);
      if (team) {
        team.teamNumber = details.teamNumber;
        team.teamAkj = details.teamAkj;
        team.teamAkjId = details.teamAkjId;
        akjEnum.set(details.teamAkjId, details.teamAkj);
      }
      done++;
    } else {
      failed++;
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${toFetch.length} verarbeitet (${done} OK, ${failed} Fehler)...`);
      mergeAndWrite(Array.from(clubMap.values()));
    }
  }

  mergeAndWrite(Array.from(clubMap.values()));
  console.log(`\nFertig: ${done} Teams aktualisiert, ${failed} Fehler.`);

  console.log('\n--- teamAkjId Enum ---');
  const sorted = Array.from(akjEnum.entries()).sort((a, b) => a[0] - b[0]);
  for (const [id, name] of sorted) {
    console.log(`  ${id}: "${name}"`);
  }
}

backfillTeamDetails().catch(err => {
  console.error('backfill-team-details fehlgeschlagen:', err);
  process.exit(1);
});
