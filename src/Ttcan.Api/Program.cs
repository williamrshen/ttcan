using Scalar.AspNetCore;
using Ttcan.Api.Scraping;
using Ttcan.Api.Services;
using Ttcan.Api.Storage;

var builder = WebApplication.CreateBuilder(args);

// MVC controllers + OpenAPI document generation.
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddMemoryCache();

// Typed HttpClient wired to the scraper: base URL, polite User-Agent, timeout.
builder.Services.AddHttpClient<ITtcanScraper, TtcanScraper>(client =>
{
    client.BaseAddress = new Uri("http://www.ttcan.ca/ratingSystem/");
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("ttcan-api/1.0 (personal learning project)");
});

// JSON cache store. PlayerStorePath env var lets Railway point this at a mounted volume;
// falls back to <contentRoot>/data/players for local development.
var storePath = builder.Configuration["PlayerStorePath"] is { Length: > 0 } configured
    ? configured
    : Path.Combine(builder.Environment.ContentRootPath, "data", "players");
builder.Services.AddSingleton<IPlayerStore>(_ => new JsonPlayerStore(storePath));

// Orchestrates store + scraper, computes derived data.
builder.Services.AddScoped<PlayerService>();

var app = builder.Build();

// Interactive API docs in development: JSON at /openapi/v1.json, UI at /scalar/v1.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
