# TTCAN API

A small ASP.NET Core (.NET 9) REST API with a vanilla JavaScript frontend UI
for exploring Canadian table tennis (TTCAN) player data — rating history, match
results, head-to-head records, and activity periods. Data is scraped on demand
from the public ratings site `http://www.ttcan.ca/ratingSystem/` and cached
locally as JSON (the source refreshes roughly monthly, so repeat requests are
served from cache).

## Try it live

Frontend UI: **https://ttcan.onrender.com/**

Open the site, search for a player name such as `WANG`, click a player card, and
explore the rating chart, match table, head-to-head records, and activity chart
in your browser. The first request for an uncached player may take a few seconds
while the backend scrapes fresh data; subsequent requests are served from cache.

Developer docs and live API forms are also available at
**https://ttcan.onrender.com/docs.html**.

## Endpoints

| Method & route | Returns |
|---|---|
| `GET /api/players/search?name=` | Matching players (id, name, province, gender, rating) |
| `GET /api/players/{id}` | Full profile (identity, latest rating, ratings + matches) |
| `GET /api/players/{id}/ratings` | Rating history — one point per period (the rating graph) |
| `GET /api/players/{id}/matches` | Full match history (wins and losses, normalized) |
| `GET /api/players/{id}/head-to-head` | Win/loss record aggregated per opponent |
| `GET /api/players/{id}/head-to-head?opponent=` | Filtered to one opponent (case-insensitive) |
| `GET /api/players/{id}/activity` | Match count per rating period |

Profile/ratings/matches accept `?refresh=true` to force a re-scrape before the cache
expires. Unknown players return `404`; an empty search returns `400`.

## Running

```bash
dotnet run --project src/Ttcan.Api
```

Then open the frontend UI at `http://localhost:<port>/` or the built-in developer
reference page at `http://localhost:<port>/docs.html`. API routes remain available
as raw JSON under `/api/players`.

In development, interactive API docs are also served by [Scalar](https://scalar.com)
at `/scalar/v1`, with the raw OpenAPI document at `/openapi/v1.json`.

Example API calls:

```bash
curl "http://localhost:<port>/api/players/search?name=WANG%20Eugene"   # -> Player_ID 7864
curl "http://localhost:<port>/api/players/7864/ratings"
```

The first request for a player hits ttcan.ca and writes
`src/Ttcan.Api/data/players/{id}.json`; subsequent requests are served from that cache
(default freshness: 30 days).

## Live API

The browser UI is the easiest way to try the project yourself: `https://ttcan.onrender.com/`.

Base API URL: `https://ttcan.onrender.com`

```bash
curl "https://ttcan.onrender.com/api/players/search?name=WANG%20Eugene"
curl "https://ttcan.onrender.com/api/players/7864/ratings"
curl "https://ttcan.onrender.com/api/players/7864/head-to-head?opponent=ZHANG"
curl "https://ttcan.onrender.com/api/players/7864/activity"
```

> The free Render tier spins down after 15 min of inactivity — the first request after
> idle takes ~30 s. Subsequent requests are instant.

## Deployment (Render)

The repo includes a `Dockerfile` for hosting on [Render](https://render.com) (free tier,
no credit card required).

1. Push this repo to GitHub.
2. On Render: **New → Web Service** → connect the repo.
3. Render detects the `Dockerfile` automatically. Set **Instance Type** to **Free**.
4. Click **Deploy Web Service**. The build takes ~2–3 min.

To override the cache directory (e.g. if you add a persistent disk later), set the
`PlayerStorePath` environment variable in Render's service settings.

## Tests

```bash
dotnet test
```

Parser tests run fully offline against saved HTML fixtures in
`tests/Ttcan.Tests/fixtures/` (captured for player 7864), so no network access is needed.

## Architecture

A single Web API project, layered by folder so each concern is isolated:

```
src/Ttcan.Api/
  wwwroot/       # frontend UI: index.html, docs.html, shared CSS, vanilla JS modules
  Models/        # records: PlayerSummary, RatingPoint, Match, HeadToHeadRecord, ActivityPeriod, PlayerProfile
  Scraping/      # ITtcanScraper + TtcanScraper (HtmlAgilityPack parsing, Latin-1 decoding)
  Storage/       # IPlayerStore + JsonPlayerStore (read/write data/players/{id}.json)
  Services/      # PlayerService — cache-or-scrape orchestration + head-to-head / activity aggregation
  Controllers/   # PlayersController — thin HTTP layer
tests/Ttcan.Tests/
  fixtures/      # saved HTML pages for offline parser tests
```

`ratings`, `head-to-head`, and `activity` are all **derived** from the one cached
ratings + matches dataset — no endpoint triggers extra scraping beyond the initial fetch.

### Notes / limitations

- The scrape source is Windows-1252 / Latin-1 encoded with no charset header; the scraper
  decodes bytes explicitly.
- Search requires a rating period (`Period_Issued`); the scraper reads the latest period
  from the form automatically.
- Head-to-head keys on opponent **name** (the matches page doesn't expose a clean opponent
  id), so name collisions are possible.
- Very active players' won matches are paginated on the source; only the first page is
  parsed.
- Please be a polite scraper: this is on-demand and low-volume, with a real User-Agent and
  request timeout.
