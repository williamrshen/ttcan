namespace Ttcan.Api.Models;

// One row in a name-search result list (from ctta_ratings2.asp).
public record PlayerSummary(
    int PlayerId,
    string Name,
    string Province,
    string Gender,
    int? Rating);

// One point on a player's rating-over-time graph — one entry per rating period
// (from ctta_ratings1.asp).
public record RatingPoint(
    int PeriodId,
    string Date,
    int Rating);

// A single match, normalized to the requested player's perspective
// (from ctta_matches.asp). RatingDelta is positive for a win, negative for a loss.
public record Match(
    int PeriodId,
    string Event,
    string OpponentName,
    bool Won,
    int PlayerRating,
    int OpponentRating,
    int RatingDelta);

// Aggregated win/loss record against one opponent (derived from Matches).
public record HeadToHeadRecord(
    string OpponentName,
    int Wins,
    int Losses)
{
    public int TotalMatches => Wins + Losses;
}

// How many matches a player played in a given rating period (derived from Matches).
public record ActivityPeriod(
    int PeriodId,
    int MatchCount);

// The full cached profile for one player — THIS is what we serialize to JSON on disk.
public record PlayerProfile(
    int PlayerId,
    string Name,
    string Province,
    string Gender,
    int? LatestRating,
    DateTimeOffset FetchedAt,
    IReadOnlyList<RatingPoint> Ratings,
    IReadOnlyList<Match> Matches);
