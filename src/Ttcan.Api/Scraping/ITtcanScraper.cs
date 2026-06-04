using Ttcan.Api.Models;

namespace Ttcan.Api.Scraping;

public interface ITtcanScraper
{
    Task<IReadOnlyList<PlayerSummary>> SearchPlayersAsync(string name, CancellationToken ct =
default);
    Task<PlayerProfile?> GetPlayerAsync(int playerId, CancellationToken ct = default);
}