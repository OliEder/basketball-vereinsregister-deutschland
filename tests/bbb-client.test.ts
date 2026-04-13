// tests/bbb-client.test.ts
import { BbbClient } from '../crawler/bbb-client';

describe('BbbClient', () => {
  it('extracts verbaende from wam data', async () => {
    const client = new BbbClient();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '0',
        data: {
          verbaende: [{ id: 2, label: 'Bayern', hits: 374 }]
        }
      })
    });
    (client as any).fetch = mockFetch;

    const result = await client.getVerbaende();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
    expect(result[0].label).toBe('Bayern');
  });

  it('returns ligen for a verband', async () => {
    const client = new BbbClient();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '0',
        data: {
          ligen: [{ ligaId: 51933, liganame: 'Bayernliga', verbandId: 2, verbandName: 'Bayern' }],
          hasMoreData: false,
          startAtIndex: 0,
          size: 1
        }
      })
    });
    (client as any).fetch = mockFetch;

    const result = await client.getLigen(2, 0);
    expect(result.ligen).toHaveLength(1);
    expect(result.ligen[0].ligaId).toBe(51933);
    expect(result.hasMoreData).toBe(false);
  });

  it('returns table entries for a liga', async () => {
    const client = new BbbClient();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '0',
        data: {
          tabelle: {
            entries: [{
              rang: 1,
              team: {
                seasonTeamId: 429406,
                teamPermanentId: 163077,
                teamname: 'SYNTAINICS MBC',
                teamnameSmall: 'MBC',
                clubId: 1977
              }
            }]
          }
        }
      })
    });
    (client as any).fetch = mockFetch;

    const result = await client.getTable(51933);
    expect(result).toHaveLength(1);
    expect(result[0].team.clubId).toBe(1977);
  });
});
