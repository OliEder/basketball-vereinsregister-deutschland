// api/search-engine.ts
import Fuse from 'fuse.js';
import { MergedClub } from '../crawler/types';
import { SearchResult } from './types';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class SearchEngine {
  private fuse: Fuse<MergedClub>;
  private clubs: MergedClub[];

  constructor(clubs: MergedClub[]) {
    this.clubs = clubs;
    this.fuse = new Fuse(clubs, {
      keys: ['name'],
      threshold: 0.4,
      includeScore: true
    });
  }

  searchByName(query: string): SearchResult[] {
    return this.fuse.search(query).map(r => r.item);
  }

  searchByLocation(lat: number, lng: number, radiusKm: number): SearchResult[] {
    return this.clubs
      .filter(c => c.lat !== null && c.lng !== null)
      .map(c => ({
        ...c,
        distanceKm: Math.round(haversineKm(lat, lng, c.lat!, c.lng!) * 10) / 10
      }))
      .filter(c => c.distanceKm! <= radiusKm)
      .sort((a, b) => a.distanceKm! - b.distanceKm!);
  }

  searchCombined(query: string, lat: number, lng: number, radiusKm: number): SearchResult[] {
    const byLocation = this.searchByLocation(lat, lng, radiusKm);
    const locationIds = new Set(byLocation.map(c => c.clubId));
    const byName = this.searchByName(query).filter(c => locationIds.has(c.clubId));
    const distances = new Map(byLocation.map(c => [c.clubId, c.distanceKm]));
    return byName.map(c => ({ ...c, distanceKm: distances.get(c.clubId) }));
  }
}
