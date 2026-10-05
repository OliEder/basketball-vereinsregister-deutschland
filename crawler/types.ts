// crawler/types.ts

export interface Hall {
  id: number | string;
  dbbSpielfeldId: number | null;
  bezeichnung: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  lat?: number | null;
  lng?: number | null;
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
  ligaId?: number;
  liganame?: string;
  rang?: number;
  /** Spielebene der Liga (z. B. "Verband", "Bezirk", "Kreis") aus ligaData */
  ebene?: string;
  /** Bezirk und Kreis der Liga; Grundlage der Ortsvalidierung */
  bezirk?: string;
  kreis?: string;
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
    /** Koordinate der belegten Adresse; nur damit erscheint der Vereinssitz auf der Karte */
    lat?: number;
    lng?: number;
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
    /** Koordinate der belegten Adresse; nur damit erscheint der Vereinssitz auf der Karte */
    lat?: number;
    lng?: number;
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
  seasonId?: number;
  seasonName?: string;
  skName?: string;
  skEbeneName?: string | null;
  bezirkName?: string | null;
  kreisname?: string | null;
}

/** Auszug aus ligaData der BBB-API (Gebietsangaben der Liga) */
export interface BbbLigaData {
  skEbeneName?: string | null;
  bezirkName?: string | null;
  kreisname?: string | null;
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
