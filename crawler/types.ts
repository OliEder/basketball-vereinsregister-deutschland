// crawler/types.ts

export interface ClubEntry {
  clubId: number;
  name: string;
  vereinsnummer?: string;
  verbandId: number;
  verbandName: string;
  lat: number | null;
  lng: number | null;
  geocodedFrom: string | null;
  logoUrl: string | null;
  lastCrawled: string;
}

export interface ClubEnriched {
  clubId: number;
  logoUrl?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    zip?: string;
    city?: string;
  };
  info?: string;
}

export interface MergedClub extends ClubEntry {
  logoUrl: string | null;
  website?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    zip?: string;
    city?: string;
  };
  info?: string;
}

// BBB-API Response-Typen
export interface BbbVerband {
  id: number;
  label: string;
  hits: number;
}

export interface BbbLiga {
  ligaId: number;
  liganame: string;
  verbandId: number;
  verbandName: string;
}

export interface BbbTeam {
  seasonTeamId: number;
  teamPermanentId: number;
  teamname: string;
  teamnameSmall: string;
  clubId: number;
}

export interface BbbTableEntry {
  rang: number;
  team: BbbTeam;
}
