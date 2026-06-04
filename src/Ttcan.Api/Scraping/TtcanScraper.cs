using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using HtmlAgilityPack;
using Ttcan.Api.Models;
using Match = Ttcan.Api.Models.Match;

namespace Ttcan.Api.Scraping;

public class TtcanScraper : ITtcanScraper
{
    private readonly HttpClient _http;

    // HttpClient is injected (configured with a BaseAddress in Program.cs, Step 7).
    public TtcanScraper(HttpClient http) => _http = http;

    // ---------- public API ----------

    public async Task<IReadOnlyList<PlayerSummary>> SearchPlayersAsync(string name, CancellationToken
ct = default)
    {
        // The site only returns result rows when a rating period is supplied;
        // without Period_Issued it just echoes back the empty search form.
        var period = await GetLatestPeriodAsync(ct);
        var url = $"ctta_ratings2.asp?FormName=Search&FormAction=search" +
                  $"&Full_Name={Uri.EscapeDataString(name)}&Period_Issued={period}";
        var doc = await LoadAsync(url, ct);
        return ParseSearch(doc);
    }

    // The newest period is the first <option> in the form's Period_Issued dropdown.
    private async Task<int> GetLatestPeriodAsync(CancellationToken ct)
    {
        // The first option is a blank "All Periods" entry; take the first real period.
        var form = await LoadAsync("ctta_ratings2.asp", ct);
        var option = form.DocumentNode.SelectSingleNode("//select[@name='Period_Issued']/option[@value!='']");
        return ParseInt(option?.GetAttributeValue("value", "") ?? "");
    }

    public async Task<PlayerProfile?> GetPlayerAsync(int playerId, CancellationToken ct = default)
    {
        var ratingsDoc = await LoadAsync($"ctta_ratings1.asp?Player_ID={playerId}", ct);
        var (ratings, province, gender) = ParseRatings(ratingsDoc);
        if (ratings.Count == 0)
            return null; // no such player / no rating data

        var matchesDoc = await LoadAsync($"ctta_matches.asp?W_ID={playerId}", ct);
        var matches = ParseMatches(matchesDoc);
        var name = ParsePlayerName(matchesDoc) ?? $"Player {playerId}";
        var latest = ratings.OrderByDescending(r => r.PeriodId).First();

        return new PlayerProfile(
            PlayerId: playerId,
            Name: name,
            Province: province,
            Gender: gender,
            LatestRating: latest.Rating,
            FetchedAt: DateTimeOffset.UtcNow,
            Ratings: ratings,
            Matches: matches);
    }

    // ---------- fetching ----------

    private async Task<HtmlDocument> LoadAsync(string relativeUrl, CancellationToken ct)
    {
        var bytes = await _http.GetByteArrayAsync(relativeUrl, ct);
        // No charset header on this site; bytes are Windows-1252 / Latin-1, not UTF-8.
        var html = Encoding.Latin1.GetString(bytes);
        var doc = new HtmlDocument();
        doc.LoadHtml(html);
        return doc;
    }

    // ---------- shared helpers ----------

    private static string Clean(HtmlNode cell) =>
        HtmlEntity.DeEntitize(cell.InnerText).Replace('\u00A0', ' ').Trim();

    private static bool IsAllDigits(string s) => s.Length > 0 && s.All(char.IsDigit);

    private static int ParseInt(string s)
    {
        var cleaned = Regex.Replace(s, @"[^\d-]", "");
        return int.TryParse(cleaned, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v) ?
v : 0;
    }

    // ---------- search (ctta_ratings2.asp) ----------

    internal static IReadOnlyList<PlayerSummary> ParseSearch(HtmlDocument doc)
    {
        var rows = doc.DocumentNode.SelectNodes("//tr");
        if (rows is null) return Array.Empty<PlayerSummary>();

        // The search lists one row per (player, period); keep the most recent per player.
        var byPlayer = new Dictionary<int, (PlayerSummary summary, int period)>();

        foreach (var row in rows)
        {
            var cells = row.SelectNodes("td");
            if (cells is null || cells.Count < 6) continue;

            var link = row.SelectSingleNode(".//a[contains(@href,'Player_ID=')]");
            if (link is null) continue;

            var idMatch = Regex.Match(link.GetAttributeValue("href", ""), @"Player_ID=(\d+)");
            if (!idMatch.Success) continue;
            var playerId = int.Parse(idMatch.Groups[1].Value);

            // cells: [#, Name, Prov, Gender, Rating, Period, LastPlayed]
            var rating = ParseInt(Clean(cells[4]));
            var period = ParseInt(Clean(cells[5]));

            if (!byPlayer.TryGetValue(playerId, out var existing) || period > existing.period)
            {
                var summary = new PlayerSummary(
                    playerId, Clean(cells[1]), Clean(cells[2]), Clean(cells[3]),
                    rating == 0 ? null : rating);
                byPlayer[playerId] = (summary, period);
            }
        }

        return byPlayer.Values
            .OrderByDescending(x => x.summary.Rating ?? 0)
            .Select(x => x.summary)
            .ToList();
    }

    // ---------- rating history (ctta_ratings1.asp) ----------

    internal static (IReadOnlyList<RatingPoint> ratings, string province, string gender)
ParseRatings(HtmlDocument doc)
    {
        var ratings = new List<RatingPoint>();
        string province = "", gender = "";

        foreach (var row in doc.DocumentNode.SelectNodes("//tr") ?? Enumerable.Empty<HtmlNode>())
        {
            var cells = row.SelectNodes("td");
            if (cells is null || cells.Count < 5) continue;

            var periodText = Clean(cells[0]);
            var ratingText = Clean(cells[4]);
            // A data row has a numeric Period ID (col 0) and numeric Rating (col 4).
            if (!IsAllDigits(periodText) || !IsAllDigits(ratingText)) continue;

            ratings.Add(new RatingPoint(int.Parse(periodText), Clean(cells[1]),
int.Parse(ratingText)));
            province = Clean(cells[2]);
            gender = Clean(cells[3]);
        }

        return (ratings, province, gender);
    }

    // ---------- matches (ctta_matches.asp) ----------

    internal static IReadOnlyList<Match> ParseMatches(HtmlDocument doc)
    {
        var matches = new List<Match>();

        foreach (var table in doc.DocumentNode.SelectNodes("//table") ??
Enumerable.Empty<HtmlNode>())
        {
            var html = table.OuterHtml;
            var won = html.Contains("Formmatches_winner_Sorting");
            var lost = html.Contains("Formmatches_loosers_Sorting");
            if (!won && !lost) continue; // skip layout/header tables

            foreach (var row in table.SelectNodes(".//tr") ?? Enumerable.Empty<HtmlNode>())
            {
                var cells = row.SelectNodes("td");
                if (cells is null || cells.Count < 9 || !IsAllDigits(Clean(cells[0]))) continue;

                // cells: [#, Event, Period, VS(opp), WRtng, LRtng, WGain, LLose, Diff, (T)]
                var ev = Clean(cells[1]);
                var period = ParseInt(Clean(cells[2]));
                var opponent = Clean(cells[3]);
                var wRtng = ParseInt(Clean(cells[4]));
                var lRtng = ParseInt(Clean(cells[5]));
                var wGain = ParseInt(Clean(cells[6]));
                var lLose = ParseInt(Clean(cells[7]));

                matches.Add(won
                    ? new Match(period, ev, opponent, true,  PlayerRating: wRtng, OpponentRating:
lRtng, RatingDelta: wGain)
                    : new Match(period, ev, opponent, false, PlayerRating: lRtng, OpponentRating:
wRtng, RatingDelta: -lLose));
            }
        }

        return matches;
    }

    internal static string? ParsePlayerName(HtmlDocument doc)
    {
        // Header is: <a name="matches_winner">WANG Eugene Zhen </a><span>...: wins...
        // The first such anchor holds the player's name (a later one holds the caption).
        var anchor = doc.DocumentNode.SelectSingleNode("//a[@name='matches_winner']");
        var name = anchor is null ? null : HtmlEntity.DeEntitize(anchor.InnerText).Trim();
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }
}
