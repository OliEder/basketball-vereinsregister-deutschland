// crawler/merge-halls.ts
// Liest halls-raw.json und merged die Spielfelder als halls[] in clubs.json.
// Bestehende halls bleiben erhalten (Deduplizierung nach dbbSpielfeldId).

import fs from 'fs';
import path from 'path';
import { loadExistingClubs, mergeAndWrite } from './writer';
import { Hall } from './types';

const HALLS_RAW_PATH = path.join(__dirname, '..', 'data', 'halls-raw.json');

interface HallRawEntry {
  clubId: number;
  spielfelder: Array<{ id: number; bezeichnung: string; strasse?: string; plz?: string; ort?: string }>;
}

function spielfeldToHall(spielfeld: HallRawEntry['spielfelder'][number], internalId: number): Hall {
  return {
    id: internalId,
    dbbSpielfeldId: spielfeld.id,
    bezeichnung: spielfeld.bezeichnung,
    ...(spielfeld.strasse ? { strasse: spielfeld.strasse } : {}),
    ...(spielfeld.plz ? { plz: spielfeld.plz } : {}),
    ...(spielfeld.ort ? { ort: spielfeld.ort } : {})
  };
}

async function mergeHallsScript(): Promise<void> {
  if (!fs.existsSync(HALLS_RAW_PATH)) {
    console.error(`${HALLS_RAW_PATH} nicht gefunden. Bitte zuerst crawl-halls ausführen.`);
    process.exit(1);
  }

  const raw: HallRawEntry[] = JSON.parse(fs.readFileSync(HALLS_RAW_PATH, 'utf-8'));
  const clubs = loadExistingClubs();

  let mergedCount = 0;

  for (const entry of raw) {
    const club = clubs.get(entry.clubId);
    if (!club) continue;

    const existingDbbIds = new Set((club.halls ?? []).map(h => h.dbbSpielfeldId).filter(Boolean));
    let nextId = Math.max(0, ...((club.halls ?? []).map(h => typeof h.id === 'number' ? h.id : 0))) + 1;

    for (const spielfeld of entry.spielfelder) {
      if (existingDbbIds.has(spielfeld.id)) continue;
      const hall = spielfeldToHall(spielfeld, nextId++);
      club.halls = [...(club.halls ?? []), hall];
      existingDbbIds.add(spielfeld.id);
    }

    mergedCount++;
  }

  mergeAndWrite(Array.from(clubs.values()));
  console.log(`${mergedCount} Vereine mit Spielfeldern aktualisiert.`);
}

mergeHallsScript().catch(err => {
  console.error('merge-halls fehlgeschlagen:', err);
  process.exit(1);
});
