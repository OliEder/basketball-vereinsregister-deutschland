// crawler/bbb-client.ts
import { BbbVerband, BbbLiga, BbbTableEntry } from './types';

const BBB_BASE = 'https://www.basketball-bund.net/rest';
const RATE_LIMIT_MS = 1100;

export class BbbClient {
  private fetch: typeof globalThis.fetch = globalThis.fetch;

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
}
