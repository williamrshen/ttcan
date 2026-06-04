using Microsoft.AspNetCore.Mvc;
using Ttcan.Api.Models;
using Ttcan.Api.Services;

namespace Ttcan.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PlayersController : ControllerBase
{
    private readonly PlayerService _players;

    public PlayersController(PlayerService players)
    {
        _players = players;
    }

    // GET /api/players/search?name=WANG%20Eugene
    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<PlayerSummary>>> Search([FromQuery] string name, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest("Query parameter 'name' is required.");

        var results = await _players.SearchAsync(name, ct);
        return Ok(results);
    }

    // GET /api/players/7864
    [HttpGet("{id:int}")]
    public async Task<ActionResult<PlayerProfile>> GetProfile(int id, [FromQuery] bool refresh, CancellationToken ct)
    {
        var profile = await _players.GetProfileAsync(id, refresh, ct);
        return profile is null ? NotFound() : Ok(profile);
    }

    // GET /api/players/7864/ratings
    [HttpGet("{id:int}/ratings")]
    public async Task<ActionResult<IReadOnlyList<RatingPoint>>> GetRatings(int id, [FromQuery] bool refresh, CancellationToken ct)
    {
        var ratings = await _players.GetRatingsAsync(id, refresh, ct);
        return ratings is null ? NotFound() : Ok(ratings);
    }

    // GET /api/players/7864/matches
    [HttpGet("{id:int}/matches")]
    public async Task<ActionResult<IReadOnlyList<Match>>> GetMatches(int id, [FromQuery] bool refresh, CancellationToken ct)
    {
        var matches = await _players.GetMatchesAsync(id, refresh, ct);
        return matches is null ? NotFound() : Ok(matches);
    }

    // GET /api/players/7864/head-to-head           -> all opponents
    // GET /api/players/7864/head-to-head?opponent=zhang  -> filtered
    [HttpGet("{id:int}/head-to-head")]
    public async Task<ActionResult<IReadOnlyList<HeadToHeadRecord>>> GetHeadToHead(int id, [FromQuery] string? opponent, CancellationToken ct)
    {
        var records = await _players.GetHeadToHeadAsync(id, opponent, ct);
        return records is null ? NotFound() : Ok(records);
    }

    // GET /api/players/7864/activity
    [HttpGet("{id:int}/activity")]
    public async Task<ActionResult<IReadOnlyList<ActivityPeriod>>> GetActivity(int id, CancellationToken ct)
    {
        var activity = await _players.GetActivityAsync(id, ct);
        return activity is null ? NotFound() : Ok(activity);
    }
}
