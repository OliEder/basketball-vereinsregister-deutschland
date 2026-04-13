// api/server.ts
import express from 'express';
import fs from 'fs';
import path from 'path';
import { ClubEntry, ClubEnriched, MergedClub } from '../crawler/types';
import { createSearchRouter } from './routes/search';

const PORT = process.env.PORT ?? 3000;
const CLUBS_PATH = path.join(__dirname, '..', 'data', 'clubs.json');
const ENRICHED_PATH = path.join(__dirname, '..', 'data', 'clubs-enriched.json');

function loadAndMerge(): MergedClub[] {
  if (!fs.existsSync(CLUBS_PATH)) {
    console.warn('clubs.json nicht gefunden. Bitte zuerst Crawler ausführen.');
    return [];
  }

  const base: ClubEntry[] = JSON.parse(fs.readFileSync(CLUBS_PATH, 'utf-8'));
  const enriched: ClubEnriched[] = fs.existsSync(ENRICHED_PATH)
    ? JSON.parse(fs.readFileSync(ENRICHED_PATH, 'utf-8'))
    : [];

  const enrichedMap = new Map(enriched.map(e => [e.clubId, e]));

  return base.map(club => ({
    ...club,
    ...(enrichedMap.get(club.clubId) ?? {})
  }));
}

const clubs = loadAndMerge();
const lastCrawled = clubs.length > 0
  ? clubs.reduce((latest, c) => c.lastCrawled > latest ? c.lastCrawled : latest, '')
  : null;

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.use('/', createSearchRouter(clubs));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', clubCount: clubs.length, lastCrawled });
});

app.use(express.static(path.join(__dirname, '..', 'portal')));

app.listen(PORT, () => {
  console.log(`Vereinsregister API läuft auf http://localhost:${PORT}`);
  console.log(`${clubs.length} Vereine geladen.`);
});
