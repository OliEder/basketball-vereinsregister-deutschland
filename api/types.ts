// api/types.ts
import { MergedClub } from '../crawler/types';

export interface SearchResult extends MergedClub {
  distanceKm?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}
