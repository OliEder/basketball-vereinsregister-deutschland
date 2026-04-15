// crawler/types.ts

export interface Hall {
  id: number | string;
  dbbSpielfeldId: number | null;
  bezeichnung: string;
  strasse?: string;
  plz?: string;
  ort?: string;
}

export interface TrainingSession {
  wochentag: 'Montag' | 'Dienstag' | 'Mittwoch' | 'Donnerstag' | 'Freitag' | 'Samstag' | 'Sonntag';
  von: string;
  bis: string;
  hallId: number | string;
}

export interface TeamEntry {
  teamPermanentId: number;
  altersklasse?: string;
  geschlecht?: string;
  teamNumber?: number;
  teamAkj?: string;
  teamAkjId?: number;
  training: TrainingSession[];
}

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
  halls: Hall[];
  teams: TeamEntry[];
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
  halls?: Hall[];
  teams?: Array<{
    teamPermanentId: number;
    training: TrainingSession[];
  }>;
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
  akName?: string;
  geschlecht?: string;
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

export interface BbbMatch {
  matchId: number;
  kickoffDate: string;
  homeTeam: { teamPermanentId: number };
}

export interface BbbSpielfeld {
  id: number;
  bezeichnung: string;
  strasse?: string;
  plz?: string;
  ort?: string;
}

export interface HallRawEntry {
  clubId: number;
  spielfelder: BbbSpielfeld[];
}
