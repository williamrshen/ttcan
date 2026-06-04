using System.Text;
using HtmlAgilityPack;
using Ttcan.Api.Models;
using Ttcan.Api.Scraping;
using Ttcan.Api.Services;
using Ttcan.Api.Storage;
using Match = Ttcan.Api.Models.Match;

namespace Ttcan.Tests;

// Offline tests: parse saved HTML fixtures (captured from ttcan.ca for player 7864),
// so the parser logic is verified without any network access.
public class ScraperTests
{
    private static readonly string FixturesDir =
        Path.Combine(AppContext.BaseDirectory, "fixtures");

    // Mirror TtcanScraper.LoadAsync: the site is Latin-1, not UTF-8.
    private static HtmlDocument Load(string fixture)
    {
        var bytes = File.ReadAllBytes(Path.Combine(FixturesDir, fixture));
        var doc = new HtmlDocument();
        doc.LoadHtml(Encoding.Latin1.GetString(bytes));
        return doc;
    }

    [Fact]
    public void ParseSearch_finds_eugene_wang()
    {
        var results = TtcanScraper.ParseSearch(Load("search_wang.html"));

        var eugene = Assert.Single(results, p => p.PlayerId == 7864);
        Assert.Contains("WANG", eugene.Name, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("ON", eugene.Province);
        Assert.Equal("M", eugene.Gender);
        Assert.True(eugene.Rating > 0);
    }

    [Fact]
    public void ParseRatings_returns_history_and_identity()
    {
        var (ratings, province, gender) = TtcanScraper.ParseRatings(Load("ratings_7864.html"));

        Assert.NotEmpty(ratings);
        Assert.Equal("ON", province);
        Assert.Equal("M", gender);
        // Periods should be distinct, positive ids with positive ratings.
        Assert.All(ratings, r =>
        {
            Assert.True(r.PeriodId > 0);
            Assert.True(r.Rating > 0);
        });
    }

    [Fact]
    public void ParseMatches_returns_wins_and_losses_normalized()
    {
        var matches = TtcanScraper.ParseMatches(Load("matches_7864.html"));

        Assert.NotEmpty(matches);
        Assert.Contains(matches, m => m.Won);
        Assert.Contains(matches, m => !m.Won);
        // Wins gain rating (positive delta); losses drop it (negative delta).
        Assert.All(matches, m =>
        {
            Assert.False(string.IsNullOrWhiteSpace(m.OpponentName));
            if (m.Won) Assert.True(m.RatingDelta >= 0);
            else Assert.True(m.RatingDelta <= 0);
        });
    }

    [Fact]
    public void ParsePlayerName_reads_header()
    {
        var name = TtcanScraper.ParsePlayerName(Load("matches_7864.html"));
        Assert.NotNull(name);
        Assert.Contains("WANG", name, StringComparison.OrdinalIgnoreCase);
    }
}

// Tests the service's derived data + caching using fixture-backed fakes (still offline).
public class PlayerServiceTests
{
    private static PlayerProfile BuildProfileFromFixtures()
    {
        var (ratings, prov, gender) = TtcanScraper.ParseRatings(LoadDoc("ratings_7864.html"));
        var matches = TtcanScraper.ParseMatches(LoadDoc("matches_7864.html"));
        return new PlayerProfile(7864, "WANG Eugene Zhen", prov, gender,
            ratings.Max(r => r.Rating), DateTimeOffset.UtcNow, ratings, matches);
    }

    private static HtmlDocument LoadDoc(string fixture)
    {
        var bytes = File.ReadAllBytes(
            Path.Combine(AppContext.BaseDirectory, "fixtures", fixture));
        var doc = new HtmlDocument();
        doc.LoadHtml(Encoding.Latin1.GetString(bytes));
        return doc;
    }

    [Fact]
    public async Task HeadToHead_aggregates_wins_and_losses_per_opponent()
    {
        var profile = BuildProfileFromFixtures();
        var svc = new PlayerService(new FakeScraper(profile), new FakeStore());

        var h2h = await svc.GetHeadToHeadAsync(7864);

        Assert.NotNull(h2h);
        // Every opponent record's totals must equal the matches counted for that name.
        foreach (var rec in h2h!)
        {
            var forOpp = profile.Matches.Where(m => m.OpponentName == rec.OpponentName).ToList();
            Assert.Equal(forOpp.Count(m => m.Won), rec.Wins);
            Assert.Equal(forOpp.Count(m => !m.Won), rec.Losses);
            Assert.Equal(forOpp.Count, rec.TotalMatches);
        }
    }

    [Fact]
    public async Task Activity_counts_matches_per_period()
    {
        var profile = BuildProfileFromFixtures();
        var svc = new PlayerService(new FakeScraper(profile), new FakeStore());

        var activity = await svc.GetActivityAsync(7864);

        Assert.NotNull(activity);
        Assert.Equal(profile.Matches.Count, activity!.Sum(a => a.MatchCount));
    }

    [Fact]
    public async Task GetProfile_caches_after_first_scrape()
    {
        var profile = BuildProfileFromFixtures();
        var scraper = new FakeScraper(profile);
        var store = new FakeStore();
        var svc = new PlayerService(scraper, store);

        await svc.GetProfileAsync(7864); // miss -> scrape + save
        await svc.GetProfileAsync(7864); // hit  -> served from store

        Assert.Equal(1, scraper.GetPlayerCalls);
        Assert.Equal(1, store.SaveCalls);
    }

    private sealed class FakeScraper : ITtcanScraper
    {
        private readonly PlayerProfile _profile;
        public int GetPlayerCalls { get; private set; }
        public FakeScraper(PlayerProfile profile) => _profile = profile;

        public Task<IReadOnlyList<PlayerSummary>> SearchPlayersAsync(string name, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<PlayerSummary>>(Array.Empty<PlayerSummary>());

        public Task<PlayerProfile?> GetPlayerAsync(int playerId, CancellationToken ct = default)
        {
            GetPlayerCalls++;
            return Task.FromResult<PlayerProfile?>(_profile);
        }
    }

    private sealed class FakeStore : IPlayerStore
    {
        private readonly Dictionary<int, PlayerProfile> _data = new();
        public int SaveCalls { get; private set; }

        public Task<PlayerProfile?> GetAsync(int playerId, CancellationToken ct = default)
            => Task.FromResult(_data.TryGetValue(playerId, out var p) ? p : null);

        public Task SaveAsync(PlayerProfile profile, CancellationToken ct = default)
        {
            SaveCalls++;
            _data[profile.PlayerId] = profile;
            return Task.CompletedTask;
        }
    }
}
