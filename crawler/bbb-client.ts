// crawler/bbb-client.ts
import { BbbVerband, BbbLiga, BbbTableEntry, BbbMatch, BbbSpielfeld } from './types';

const BBB_BASE = 'https://www.basketball-bund.net/rest';
const RATE_LIMIT_MS = 1100;

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
      throw new Error(`BBB API error: ${response.status} ${url}`);
    }
    const data = await response.json() as any;
    if (data.status !== '0') {
      throw new Error(`BBB API returned error status: ${data.message}`);
    }
    return data as T;
  }

  async getVerbaende(): Promise<BbbVerband[]> {
    await this.sleep(RATE_LIMIT_MS);
    const data = await this.request<{ data: { verbaende: BbbVerband[] } }>(
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
    const data = await this.request<{ data: { ligen: BbbLiga[]; hasMoreData: boolean } }>(
      `${BBB_BASE}/wam/liga/list?startAtIndex=${startAtIndex}`,
      {
        method: 'POST',
        body: JSON.stringify({ token: 0, verbandIds: [verbandId], gebietIds: [], ligatypIds: [], akgGeschlechtIds: [], altersklasseIds: [], spielklasseIds: [] })
      }
    );
    return { ligen: data.data.ligen, hasMoreData: data.data.hasMoreData };
  }

  async getTable(ligaId: number): Promise<BbbTableEntry[]> {
    await this.sleep(RATE_LIMIT_MS);
    const data = await this.request<{ data: { tabelle: { entries: BbbTableEntry[] } } }>(
      `${BBB_BASE}/competition/table/id/${ligaId}`
    );
    return data.data.tabelle?.entries ?? [];
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
      const data = await this.request<{ data: { spielfeld?: BbbSpielfeld } }>(
        `${BBB_BASE}/match/id/${matchId}/matchInfo`
      );
      return data.data.spielfeld ?? null;
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
