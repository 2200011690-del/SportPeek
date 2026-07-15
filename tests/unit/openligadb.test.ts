import assert from "node:assert/strict";
import test from "node:test";
import { OpenLigaDbAdapter } from "../../lib/sports-data/adapters";

test("OpenLigaDB adapter filters community junk and normalizes logos, fixtures and standings", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnabled = process.env.OPENLIGADB_ENABLED;
  const originalCompetitions = process.env.OPENLIGADB_COMPETITIONS;
  const originalSeason = process.env.OPENLIGADB_SEASON;
  const originalBaseUrl = process.env.OPENLIGADB_BASE_URL;
  process.env.OPENLIGADB_ENABLED = "true";
  process.env.OPENLIGADB_COMPETITIONS = "bl2";
  process.env.OPENLIGADB_SEASON = "2026";
  process.env.OPENLIGADB_BASE_URL = "https://openliga.test";

  globalThis.fetch = async (input) => {
    const url = String(input);
    const payload = url.endsWith("/getavailableleagues")
      ? [
          {
            leagueId: 1,
            leagueName: "2. Fußball-Bundesliga 2026/2027",
            leagueSeason: 2026,
            leagueShortcut: "bl2",
            sport: { sportId: 1 },
          },
          {
            leagueId: 2,
            leagueName: "Testliga",
            leagueSeason: 2026,
            leagueShortcut: "test",
            sport: { sportId: 1 },
          },
        ]
      : url.includes("/getavailableteams/")
        ? [
            {
              teamId: 10,
              teamName: "Test FC",
              shortName: "TFC",
              teamIconUrl: "https://upload.wikimedia.org/wikipedia/de/thumb/1/13/Test_FC.svg/240px-Test_FC.svg.png",
            },
          ]
        : url.includes("/getmatchdata/")
          ? [
              {
                matchID: 20,
                matchDateTimeUTC: "2026-08-08T18:30:00Z",
                leagueSeason: 2026,
                team1: { teamId: 10, teamName: "Test FC" },
                team2: { teamId: 11, teamName: "Away FC" },
                lastUpdateDateTime: "2026-08-08T22:00:00Z",
                matchIsFinished: true,
                matchResults: [
                  {
                    pointsTeam1: 1,
                    pointsTeam2: 0,
                    resultOrderID: 1,
                    resultTypeID: 1,
                  },
                  {
                    pointsTeam1: 2,
                    pointsTeam2: 1,
                    resultOrderID: 2,
                    resultTypeID: 2,
                  },
                ],
                group: { groupName: "1. Spieltag", groupOrderID: 1 },
                location: { locationStadium: "Test Arena" },
              },
            ]
          : [
              {
                teamInfoId: 10,
                teamName: "Test FC",
                points: 3,
                opponentGoals: 1,
                goals: 2,
                matches: 1,
                won: 1,
                lost: 0,
                draw: 0,
              },
            ];
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const adapter = new OpenLigaDbAdapter();
    const competitions = await adapter.discoverCompetitions();
    const teams = await adapter.getTeams("bl2", "2026");
    const matches = await adapter.getMatches("bl2", {
      season: "2026",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
    const standings = await adapter.getStandings("bl2", "2026");
    assert.deepEqual(
      competitions.map((item) => item.name),
      ["2. Bundesliga"],
    );
    assert.equal(teams[0].logoUrl, "https://upload.wikimedia.org/wikipedia/de/1/13/Test_FC.svg");
    assert.equal(matches[0].status, "finished");
    assert.equal(matches[0].homeScore, 2);
    assert.equal(matches[0].venue, "Test Arena");
    assert.equal(standings[0].position, 1);
    assert.equal(standings[0].points, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnabled === undefined) delete process.env.OPENLIGADB_ENABLED;
    else process.env.OPENLIGADB_ENABLED = originalEnabled;
    if (originalCompetitions === undefined)
      delete process.env.OPENLIGADB_COMPETITIONS;
    else process.env.OPENLIGADB_COMPETITIONS = originalCompetitions;
    if (originalSeason === undefined) delete process.env.OPENLIGADB_SEASON;
    else process.env.OPENLIGADB_SEASON = originalSeason;
    if (originalBaseUrl === undefined) delete process.env.OPENLIGADB_BASE_URL;
    else process.env.OPENLIGADB_BASE_URL = originalBaseUrl;
  }
});
