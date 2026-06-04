using Ttcan.Api.Models;

namespace Ttcan.Api.Storage;

public interface IPlayerStore
{
    Task<PlayerProfile?> GetAsync(int playerId, CancellationToken ct = default);
    Task SaveAsync(PlayerProfile profile, CancellationToken ct = default);
}
