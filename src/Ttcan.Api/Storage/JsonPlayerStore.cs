using System.Text.Json;
using Ttcan.Api.Models;

namespace Ttcan.Api.Storage;

public class JsonPlayerStore : IPlayerStore
{
    private readonly string _directory;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    public JsonPlayerStore(string directory)
    {
        _directory = directory;
        Directory.CreateDirectory(_directory); // create the data folder if it's missing
    }

    private string PathFor(int playerId) => Path.Combine(_directory, $"{playerId}.json");

    public async Task<PlayerProfile?> GetAsync(int playerId, CancellationToken ct = default)
    {
        var path = PathFor(playerId);
        if (!File.Exists(path)) return null;

        try
        {
            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<PlayerProfile>(stream, JsonOptions, ct);
        }
        catch (JsonException)
        {
            // A corrupt or old-format file is treated as a cache miss, so it gets re-scraped.
            return null;
        }
    }

    public async Task SaveAsync(PlayerProfile profile, CancellationToken ct = default)
    {
        var path = PathFor(profile.PlayerId);
        await using var stream = File.Create(path);
        await JsonSerializer.SerializeAsync(stream, profile, JsonOptions, ct);
    }
}
