// crawler/bbb-client.ts
import { BbbVerband, BbbLiga, BbbLigaData, BbbTableEntry, BbbMatch, BbbSpielfeld } from './types';

const BBB_BASE = 'https://www.basketball-bund.net/rest';
const RATE_LIMIT_MS = 1100;
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 2000;

class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`BBB API error: ${status} ${url}`);
  }
}

export class BbbClient {
  private fetch: typeof globalThis.fetch;

  constructor(fetchImpl?: typeof globalThis.fetch) {
    this.fetch = fetchImpl ?? globalThis.fetch;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await this.fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Vereinsregister/1.0 (https://github.com/vereinsregister)',
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string> ?? {})
      }
    });
    if (!response.ok) {
      throw new HttpError(response.status, url);
    }
    const data = await response.json() as any;
    if (data.status !== '0') {
      throw new Error(`BBB API returned error status: ${data.message}`);
    }
    return data as T;
  }

  /** Wiederholt transiente Fehler (Netzwerk, 429, 5xx) mit exponentiellem Backoff; 4xx werden sofort weitergereicht. */
  private async requestWithRetry<T>(url: string, options?: RequestInit): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.request<T>(url, options);
      } catch (err) {
        const transient = !(err instanceof HttpError) || err.status === 429 || err.status >= 500;
        if (!transient || attempt >= MAX_ATTEMPTS) throw err;
        const wait = RETRY_BASE_MS * 2 ** (attempt - 1);
        console.warn(`  Request fehlgeschlagen (${err}), Versuch ${attempt}/${MAX_ATTEMPTS}, neuer Versuch in ${wait} ms`);
        await this.sleep(wait);
      }
    }
  }

  async getVerbaende(): Promise<BbbVerband[]> {
    await this.sleep(RATE_LIMIT_MS);
    const data = await this.requestWithRetry<{ data: { verbaende: BbbVerband[] } }>(
      `${BBB_BASE}/wam/data`,
      {
        method: 'POST',
        body: JSON.stringify({ token: 0, verbandIds: [], gebietIds: [], ligatypIds: [], akgGeschlechtIds: [], altersklasseIds: [], spielklasseIds: [] })
      }
    );
    return data.data.verbaende;
  }

  async getLigen(verbandId: number, startAtIndex: number): Promise<{ ligen: BbbLiga[]; hasMoreData: boolean }> {
    await this.sleep(RATE_LIMIT_MS);
    const data = await this.requestWithRetry<{ data: { ligen: BbbLiga[]; hasMoreData: boolean } }>(
      `${BBB_BASE}/wam/liga/list?startAtIndex=${startAtIndex}`,
      {
        method: 'POST',
        body: JSON.stringify({ token: 0, verbandIds: [verbandId], gebietIds: [], ligatypIds: [], akgGeschlechtIds: [], altersklasseIds: [], spielklasseIds: [] })
      }
    );
    return { ligen: data.data.ligen, hasMoreData: data.data.hasMoreData };
  }

  async getTable(ligaId: number): Promise<BbbTableEntry[]> {
    return (await this.getTableWithLiga(ligaId)).entries;
  }

  /** Tabelle samt Gebietsangaben (ligaData) derselben Liga, ohne zusätzlichen Request. */
  async getTableWithLiga(ligaId: number): Promise<{ entries: BbbTableEntry[]; ligaData: BbbLigaData | null }> {
    await this.sleep(RATE_LIMIT_MS);
    const data = await this.requestWithRetry<{ data: { ligaData?: BbbLigaData; tabelle: { entries: BbbTableEntry[] } } }>(
      `${BBB_BASE}/competition/table/id/${ligaId}`
    );
    return { entries: data.data.tabelle?.entries ?? [], ligaData: data.data.ligaData ?? null };
  }

  async getClubDetails(clubId: number): Promise<{ vereinsname: string; vereinsnummer: string } | null> {
    await this.sleep(RATE_LIMIT_MS);
    try {
      const data = await this.request<{ data: { club: { vereinsname: string; vereinsnummer: string } } }>(
        `${BBB_BASE}/club/id/${clubId}/actualmatches?justHome=false&rangeDays=0`
      );
      return data.data.club ?? null;
    } catch {
      return null;
    }
  }

  async getSpielplan(teamPermanentId: number): Promise<BbbMatch[]> {
    await this.sleep(RATE_LIMIT_MS);
    try {
      const data = await this.request<{ data: { matches: BbbMatch[] } }>(
        `${BBB_BASE}/team/id/${teamPermanentId}/matches`
      );
      return data.data.matches ?? [];
    } catch (err) {
      console.warn(`getSpielplan(${teamPermanentId}) fehlgeschlagen:`, err);
      return [];
    }
  }

  /** Lädt die Spielfeldinformationen für ein Match. Gibt nur das spielfeld-Objekt zurück (nicht die gesamten matchInfo-Daten). */
  async getMatchInfo(matchId: number): Promise<BbbSpielfeld | null> {
    await this.sleep(RATE_LIMIT_MS);
    try {
      const data = await this.request<{ data: { matchInfo: { spielfeld?: BbbSpielfeld } | null } }>(
        `${BBB_BASE}/match/id/${matchId}/matchInfo`
      );
      return data.data.matchInfo?.spielfeld ?? null;
    } catch (err) {
      console.warn(`getMatchInfo(${matchId}) fehlgeschlagen:`, err);
      return null;
    }
  }

  async getTeamDetails(teamPermanentId: number): Promise<{ teamNumber: number; teamAkj: string; teamAkjId: number } | null> {
    await this.sleep(RATE_LIMIT_MS);
    try {
      const data = await this.request<{ data: { team: { teamNumber: number; teamAkj: string; teamAkjId: number } } }>(
        `${BBB_BASE}/team/id/${teamPermanentId}/matches`
      );
      const t = data.data.team;
      return t ? { teamNumber: t.teamNumber, teamAkj: t.teamAkj, teamAkjId: t.teamAkjId } : null;
    } catch (err) {
      console.warn(`getTeamDetails(${teamPermanentId}) fehlgeschlagen:`, err);
      return null;
    }
  }
}
