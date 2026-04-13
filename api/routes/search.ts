// api/routes/search.ts
import { Router, Request, Response } from 'express';
import { SearchEngine } from '../search-engine';
import { geocodeCity } from '../../crawler/geocoder';
import { MergedClub } from '../../crawler/types';

export function createSearchRouter(clubs: MergedClub[]): Router {
  const router = Router();
  const engine = new SearchEngine(clubs);

  router.get('/search', async (req: Request, res: Response) => {
    const { name, near, radius } = req.query as Record<string, string>;
    const radiusKm = parseFloat(radius ?? '25') || 25;

    if (!name && !near) {
      res.status(400).json({ error: 'Parameter "name" oder "near" erforderlich.' });
      return;
    }

    try {
      let results;

      if (name && near) {
        const coords = await geocodeCity(near);
        if (!coords) {
          res.status(404).json({ error: `Ort "${near}" nicht gefunden.` });
          return;
        }
        results = engine.searchCombined(name, coords.lat, coords.lng, radiusKm);
      } else if (near) {
        const coords = await geocodeCity(near);
        if (!coords) {
          res.status(404).json({ error: `Ort "${near}" nicht gefunden.` });
          return;
        }
        results = engine.searchByLocation(coords.lat, coords.lng, radiusKm);
      } else {
        results = engine.searchByName(name!);
      }

      res.json({ results, total: results.length });
    } catch {
      res.status(500).json({ error: 'Interner Fehler bei der Suche.' });
    }
  });

  router.get('/clubs/:clubId', (req: Request, res: Response) => {
    const clubId = parseInt(req.params.clubId, 10);
    const club = clubs.find(c => c.clubId === clubId);
    if (!club) {
      res.status(404).json({ error: `Verein ${clubId} nicht gefunden.` });
      return;
    }
    res.json(club);
  });

  return router;
}
