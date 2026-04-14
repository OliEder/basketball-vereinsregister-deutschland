// crawler/crawl-halls.ts
// Initialer einmaliger Hall-Crawl für alle bestehenden Vereine.
// Ergebnis: data/halls-raw.json (gitignored, manuell prüfen vor merge-halls)

import fs from 'fs';
import path from 'path';
import { BbbClient } from './bbb-client';
import { loadExistingClubs } from './writer';
import { BbbSpielfeld } from './types';

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'halls-raw.json');

interface HallRawEntry {
  clubId: number;
  spielfelder: BbbSpielfeld[];
}

async function crawlHalls(): Promise<void> {
  const client = new BbbClient();
  const clubs = Array.from(loadExistingClubs().values());
  console.log(`${clubs.length} Vereine werden nach Spielfeldern durchsucht...`);

  const result: HallRawEntry[] = [];
  let processed = 0;
  let found = 0;

  for (const club of clubs) {
    const usedDates = new Set<string>();
    const spielfelder = new Map<number, BbbSpielfeld>();

    for (const team of club.teams ?? []) {
      const matches = await client.getSpielplan(team.teamPermanentId);
      // Erstes Heimspiel mit noch nicht verwendetem Datum für diesen Verein
      const heimspiel = matches.find(m =>
        m.homeTeam.teamPermanentId === team.teamPermanentId &&
        !usedDates.has(m.kickoffDate)
      );
      if (!heimspiel) continue;

      usedDates.add(heimspiel.kickoffDate);

      const spielfeld = await client.getMatchInfo(heimspiel.matchId);
      if (spielfeld && !spielfelder.has(spielfeld.id)) {
        spielfelder.set(spielfeld.id, spielfeld);
      }
    }

    if (spielfelder.size > 0) {
      result.push({ clubId: club.clubId, spielfelder: Array.from(spielfelder.values()) });
      found++;
    }

    processed++;
    if (processed % 50 === 0) {
      console.log(`  ${processed}/${clubs.length} Vereine verarbeitet, ${found} mit Spielfeldern...`);
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\nFertig: ${found}/${clubs.length} Vereine haben Spielfelder.`);
  console.log(`Ergebnis: ${OUTPUT_PATH}`);
  console.log('Bitte halls-raw.json prüfen, dann merge-halls ausführen.');
}

crawlHalls().catch(err => {
  console.error('crawl-halls fehlgeschlagen:', err);
  process.exit(1);
});
