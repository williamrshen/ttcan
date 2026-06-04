using Ttcan.Api.Models;
using Ttcan.Api.Scraping;
using Ttcan.Api.Storage;

namespace Ttcan.Api.Services;

public class PlayerService
{
    // The site refreshes monthly, so cached data older than this is re-scraped.
    private static readonly TimeSpan CacheTtl = TimeSpan.FromDays(30);

    private readonly ITtcanScraper _scraper;
    private readonly IPlayerStore _store;

    public PlayerService(ITtcanScraper scraper, IPlayerStore store)
    {
        _scraper = scraper;
        _store = store;
    }

    public Task<IReadOnlyList<PlayerSummary>> SearchAsync(string name, CancellationToken ct =
default)
        => _scraper.SearchPlayersAsync(name, ct);

    // Cache-or-scrape: serve fresh cache; otherwise scrape, save, return.
    public async Task<PlayerProfile?> GetProfileAsync(int playerId, bool refresh = false,
CancellationToken ct = default)
    {
        if (!refresh)
        {
            var cached = await _store.GetAsync(playerId, ct);
            if (cached is not null && DateTimeOffset.UtcNow - cached.FetchedAt < CacheTtl)
                return cached;
        }

        var fresh = await _scraper.GetPlayerAsync(playerId, ct);
        if (fresh is null)
            return null;

        await _store.SaveAsync(fresh, ct);
        return fresh;
    }

    public async Task<IReadOnlyList<RatingPoint>?> GetRatingsAsync(int playerId, bool refresh =
false, CancellationToken ct = default)
        => (await GetProfileAsync(playerId, refresh, ct))?.Ratings;

    public async Task<IReadOnlyList<Match>?> GetMatchesAsync(int playerId, bool refresh = false,
CancellationToken ct = default)
        => (await GetProfileAsync(playerId, refresh, ct))?.Matches;

    // Derived: aggregate wins/losses per opponent. Optional filter to one opponent.
    public async Task<IReadOnlyList<HeadToHeadRecord>?> GetHeadToHeadAsync(int playerId, string?
opponent = null, CancellationToken ct = default)
    {
        var profile = await GetProfileAsync(playerId, ct: ct);
        if (profile is null)
            return null;

        var matches = profile.Matches.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(opponent))
            matches = matches.Where(m => m.OpponentName.Contains(opponent,
StringComparison.OrdinalIgnoreCase));

        return matches
            .GroupBy(m => m.OpponentName)
            .Select(g => new HeadToHeadRecord(
                g.Key,
                g.Count(m => m.Won),
                g.Count(m => !m.Won)))
            .OrderByDescending(r => r.TotalMatches)
            .ToList();
    }

    // Derived: how many matches played per rating period.
    public async Task<IReadOnlyList<ActivityPeriod>?> GetActivityAsync(int playerId,
CancellationToken ct = default)
    {
        var profile = await GetProfileAsync(playerId, ct: ct);
        if (profile is null)
            return null;

        return profile.Matches
            .GroupBy(m => m.PeriodId)
            .Select(g => new ActivityPeriod(g.Key, g.Count()))
            .OrderByDescending(p => p.PeriodId)
            .ToList();
    }
}
