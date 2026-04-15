// tests/bbb-client.test.ts
import { BbbClient } from '../crawler/bbb-client';

function makeFetch(responseBody: object, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => responseBody
  });
}

describe('BbbClient', () => {
  it('extracts verbaende from wam data', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '0',
        data: {
          verbaende: [{ id: 2, label: 'Bayern', hits: 374 }]
        }
      })
    });
    const client = new BbbClient(mockFetch as any);

    const result = await client.getVerbaende();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
    expect(result[0].label).toBe('Bayern');
  });

  it('returns ligen for a verband', async () => {
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
    const client = new BbbClient(mockFetch as any);

    const result = await client.getLigen(2, 0);
    expect(result.ligen).toHaveLength(1);
    expect(result.ligen[0].ligaId).toBe(51933);
    expect(result.hasMoreData).toBe(false);
  });

  it('returns table entries for a liga', async () => {
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
    const client = new BbbClient(mockFetch as any);

    const result = await client.getTable(51933);
    expect(result).toHaveLength(1);
    expect(result[0].team.clubId).toBe(1977);
  });
});

describe('BbbClient.getSpielplan', () => {
  it('returns home matches for a team', async () => {
    const mockFetch = makeFetch({
      status: '0',
      data: {
        matches: [
          { matchId: 1001, kickoffDate: '2026-03-01', homeTeam: { teamPermanentId: 167890 } },
          { matchId: 1002, kickoffDate: '2026-03-15', homeTeam: { teamPermanentId: 167890 } }
        ]
      }
    });
    const client = new BbbClient(mockFetch as any);
    const matches = await client.getSpielplan(167890);
    expect(matches).toHaveLength(2);
    expect(matches[0].matchId).toBe(1001);
  });

  it('returns empty array when no matches', async () => {
    const mockFetch = makeFetch({ status: '0', data: { matches: [] } });
    const client = new BbbClient(mockFetch as any);
    expect(await client.getSpielplan(99999)).toEqual([]);
  });
});

describe('BbbClient.getMatchInfo', () => {
  it('returns spielfeld from matchInfo', async () => {
    const mockFetch = makeFetch({
      status: '0',
      data: {
        matchInfo: {
          spielfeld: { id: 105061, bezeichnung: 'Mittelschule West', strasse: 'Woffenbacher Str. 38', plz: '92318', ort: 'Neumarkt' }
        }
      }
    });
    const client = new BbbClient(mockFetch as any);
    const spielfeld = await client.getMatchInfo(1001);
    expect(spielfeld).not.toBeNull();
    expect(spielfeld!.id).toBe(105061);
    expect(spielfeld!.bezeichnung).toBe('Mittelschule West');
  });

  it('returns null when spielfeld missing', async () => {
    const mockFetch = makeFetch({ status: '0', data: { matchInfo: null } });
    const client = new BbbClient(mockFetch as any);
    expect(await client.getMatchInfo(1001)).toBeNull();
  });
});
