import {
  ApiError,
  getActivity,
  getHeadToHead,
  getMatches,
  getProfile,
  getRatings,
  searchPlayers,
} from './api.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  searchAbort: null,
  activePlayerId: null,
  ratingsChart: null,
  activityChart: null,
  h2h: [],
  profile: null,
  ratings: [],
  matches: [],
  activity: [],
};

const elements = {
  searchForm: $('#searchForm'),
  searchInput: $('#searchInput'),
  searchStatus: $('#searchStatus'),
  searchResults: $('#searchResults'),
  emptyState: $('#emptyState'),
  playerPanel: $('#playerPanel'),
  playerLoading: $('#playerLoading'),
  playerName: $('#playerName'),
  playerRatingBadge: $('#playerRatingBadge'),
  playerMeta: $('#playerMeta'),
  refreshButton: $('#refreshButton'),
  copyLinkButton: $('#copyLinkButton'),
  snapshotStats: $('#snapshotStats'),
  matchesTable: $('#matchesTable'),
  h2hTable: $('#h2hTable'),
  h2hFilter: $('#h2hFilter'),
  ratingsEndpointLabel: $('#ratingsEndpointLabel'),
};

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function number(value) {
  return value === null || value === undefined ? '—' : Number(value).toLocaleString();
}

function signedNumber(value) {
  if (value === null || value === undefined) return '—';
  return value > 0 ? `+${value}` : String(value);
}

function percent(wins, total) {
  if (!total) return '—';
  return `${Math.round((wins / total) * 100)}%`;
}

function setLoading(isLoading) {
  elements.playerLoading.classList.toggle('active', isLoading);
  elements.playerPanel.setAttribute('aria-busy', String(isLoading));
}

function setSearchStatus(html) {
  elements.searchStatus.innerHTML = html;
}
function setSearchDropdownOpen(isOpen) {
  elements.searchResults.classList.toggle('open', isOpen && elements.searchResults.children.length > 0);
}


function showSearchError(error) {
  const message = error instanceof ApiError
    ? `HTTP ${error.status}: ${error.message}`
    : error.message || 'Search failed.';
  setSearchStatus(`<p class="error-state">${escapeHtml(message)}</p>`);
}

function renderSearchResults(players, query) {
  if (!query) {
    elements.searchResults.innerHTML = '';
    setSearchDropdownOpen(false);
    setSearchStatus('');
    return;
  }

  if (!players.length) {
    elements.searchResults.innerHTML = '';
    setSearchDropdownOpen(false);
    setSearchStatus(`<p class="empty-state">No players found for <strong>${escapeHtml(query)}</strong>.</p>`);
    return;
  }

  setSearchStatus(`<p class="muted">${players.length} result${players.length === 1 ? '' : 's'} for <strong>${escapeHtml(query)}</strong></p>`);
  elements.searchResults.innerHTML = players.map((player) => `
    <button class="result-card" type="button" data-player-id="${player.playerId}">
      <span>
        <span class="result-title">${escapeHtml(player.name)}</span>
        <span class="result-meta">${escapeHtml(player.province || '—')} · ${escapeHtml(player.gender || '—')} · ID ${player.playerId}</span>
      </span>
      <span class="badge primary">${number(player.rating)}</span>
    </button>
  `).join('');
  setSearchDropdownOpen(true);
}

function collapseSearchResults(selectedName) {
  if (state.searchAbort) {
    state.searchAbort.abort();
    state.searchAbort = null;
  }

  elements.searchResults.innerHTML = '';
  setSearchDropdownOpen(false);
  setSearchStatus(selectedName
    ? `<p class="muted">Selected <strong>${escapeHtml(selectedName)}</strong>. Search results collapsed.</p>`
    : '');
}

function sortRatingsOldestFirst(ratings) {
  return [...ratings].sort((a, b) => {
    const periodDifference = (a.periodId ?? 0) - (b.periodId ?? 0);
    if (periodDifference !== 0) return periodDifference;

    const aTime = Date.parse(a.date ?? '');
    const bTime = Date.parse(b.date ?? '');
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
    return String(a.date ?? '').localeCompare(String(b.date ?? ''));
  });
}

const performSearch = debounce(async () => {
  const query = elements.searchInput.value.trim();

  if (state.searchAbort) {
    state.searchAbort.abort();
  }

  if (query.length < 2) {
    renderSearchResults([], '');
    if (query.length === 1) {
      setSearchStatus('<p class="muted">Type one more character to search.</p>');
    }
    return;
  }

  const abortController = new AbortController();
  state.searchAbort = abortController;
  setSearchStatus('<p class="muted"><span class="spinner small" aria-hidden="true"></span> Searching...</p>');

  try {
    const players = await searchPlayers(query, { signal: abortController.signal });
    if (abortController.signal.aborted) return;
    renderSearchResults(players, query);
  } catch (error) {
    if (error.name === 'AbortError') return;
    showSearchError(error);
  }
}, 300);

function destroyCharts() {
  state.ratingsChart?.destroy();
  state.activityChart?.destroy();
  state.ratingsChart = null;
  state.activityChart = null;
}

function waitForChart() {
  if (window.Chart) {
    return Promise.resolve(window.Chart);
  }

  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (window.Chart) {
        window.clearInterval(timer);
        resolve(window.Chart);
      } else if (attempts > 60) {
        window.clearInterval(timer);
        reject(new Error('Chart.js did not load.'));
      }
    }, 100);
  });
}

async function renderRatingsChart(ratings) {
  const Chart = await waitForChart();
  const ctx = $('#ratingsChart');
  state.ratingsChart?.destroy();

  state.ratingsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ratings.map((point) => point.date || `Period ${point.periodId}`),
      datasets: [{
        label: 'Rating',
        data: ratings.map((point) => point.rating),
        borderColor: '#d32f2f',
        backgroundColor: 'rgba(211, 47, 47, 0.12)',
        borderWidth: 3,
        pointRadius: ratings.length > 80 ? 0 : 2.5,
        pointHoverRadius: 5,
        tension: 0.18,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (items) => items[0]?.label ?? '' } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
        y: { beginAtZero: false, ticks: { precision: 0 } },
      },
    },
  });
}

async function renderActivityChart(activity) {
  const Chart = await waitForChart();
  const ctx = $('#activityChart');
  state.activityChart?.destroy();

  state.activityChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: activity.map((point) => String(point.periodId)),
      datasets: [{
        label: 'Matches',
        data: activity.map((point) => point.matchCount),
        borderColor: '#d32f2f',
        backgroundColor: 'rgba(211, 47, 47, 0.72)',
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 16 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

function renderProfileHeader(profile) {
  elements.playerName.textContent = profile.name;
  elements.playerRatingBadge.textContent = `Rating ${number(profile.latestRating)}`;
  elements.ratingsEndpointLabel.textContent = `/api/players/${profile.playerId}/ratings`;

  const fetched = profile.fetchedAt ? new Date(profile.fetchedAt).toLocaleString() : 'unknown';
  elements.playerMeta.innerHTML = `
    <span class="badge">ID ${profile.playerId}</span>
    <span class="badge">${escapeHtml(profile.province || 'Province —')}</span>
    <span class="badge">${escapeHtml(profile.gender || 'Gender —')}</span>
    <span class="badge">Fetched ${escapeHtml(fetched)}</span>
  `;
}

function renderSnapshot(profile, ratings, matches, h2h, activity) {
  const latest = ratings.at(-1)?.rating ?? profile.latestRating;
  const first = ratings[0]?.rating;
  const ratingChange = first !== undefined && latest !== undefined ? latest - first : null;
  const wins = matches.filter((match) => match.won).length;
  const losses = matches.length - wins;
  const activePeriods = activity.length;

  const stats = [
    ['Latest rating', number(latest)],
    ['Rating change', ratingChange === null ? '—' : signedNumber(ratingChange)],
    ['Matches', number(matches.length)],
    ['Record', `${number(wins)}–${number(losses)}`],
    ['Opponents', number(h2h.length)],
    ['Active periods', number(activePeriods)],
  ];

  elements.snapshotStats.innerHTML = stats.map(([label, value]) => `
    <div class="stat-card">
      <span class="muted">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join('');
}

function renderMatches(matches) {
  if (!matches.length) {
    elements.matchesTable.innerHTML = '<p class="empty-state">No matches found for this player.</p>';
    return;
  }

  elements.matchesTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Period</th>
          <th>Event</th>
          <th>Opponent</th>
          <th>W/L</th>
          <th>My Rating</th>
          <th>Opp Rating</th>
          <th>Delta</th>
        </tr>
      </thead>
      <tbody>
        ${matches.map((match) => `
          <tr>
            <td>${match.periodId}</td>
            <td>${escapeHtml(match.event || '—')}</td>
            <td>${escapeHtml(match.opponentName || '—')}</td>
            <td><span class="badge ${match.won ? 'win' : 'loss'}">${match.won ? 'W' : 'L'}</span></td>
            <td>${number(match.playerRating)}</td>
            <td>${number(match.opponentRating)}</td>
            <td class="${match.ratingDelta >= 0 ? 'delta-pos' : 'delta-neg'}">${signedNumber(match.ratingDelta)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderH2H(records) {
  if (!records.length) {
    elements.h2hTable.innerHTML = '<p class="empty-state">No head-to-head records match the current filter.</p>';
    return;
  }

  const sorted = [...records].sort((a, b) => (b.totalMatches ?? (b.wins + b.losses)) - (a.totalMatches ?? (a.wins + a.losses)) || a.opponentName.localeCompare(b.opponentName));

  elements.h2hTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Opponent</th>
          <th>W</th>
          <th>L</th>
          <th>Total</th>
          <th>Win%</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((record) => {
          const total = record.totalMatches ?? (record.wins + record.losses);
          return `
            <tr>
              <td>${escapeHtml(record.opponentName)}</td>
              <td>${number(record.wins)}</td>
              <td>${number(record.losses)}</td>
              <td>${number(total)}</td>
              <td>${percent(record.wins, total)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function filterH2H() {
  const filter = elements.h2hFilter.value.trim().toLowerCase();
  const records = filter
    ? state.h2h.filter((record) => record.opponentName.toLowerCase().includes(filter))
    : state.h2h;
  renderH2H(records);
}

function renderError(error) {
  const message = error instanceof ApiError
    ? `HTTP ${error.status}: ${error.message}`
    : error.message || 'Unable to load player data.';
  elements.playerPanel.classList.remove('hidden');
  elements.emptyState.classList.add('hidden');
  elements.snapshotStats.innerHTML = '';
  elements.matchesTable.innerHTML = '';
  elements.h2hTable.innerHTML = '';
  elements.playerName.textContent = 'Unable to load player';
  elements.playerRatingBadge.textContent = 'Error';
  elements.playerMeta.innerHTML = `<span class="error-state">${escapeHtml(message)}</span>`;
}

async function loadPlayer(playerId, { refresh = false } = {}) {
  if (!playerId) return;

  state.activePlayerId = Number(playerId);
  elements.emptyState.classList.add('hidden');
  elements.playerPanel.classList.remove('hidden');
  setLoading(true);
  destroyCharts();

  try {
    const profile = await getProfile(playerId, { refresh });
    renderProfileHeader(profile);

    const [ratings, matches, h2h, activity] = await Promise.all([
      getRatings(playerId, { refresh }),
      getMatches(playerId, { refresh }),
      getHeadToHead(playerId),
      getActivity(playerId),
    ]);

    const ratingsOldestFirst = sortRatingsOldestFirst(ratings);

    state.profile = profile;
    state.ratings = ratingsOldestFirst;
    state.matches = matches;
    state.h2h = h2h;
    state.activity = activity;

    renderSnapshot(profile, ratingsOldestFirst, matches, h2h, activity);
    renderMatches(matches);
    filterH2H();
    await Promise.all([
      renderRatingsChart(ratingsOldestFirst),
      renderActivityChart(activity),
    ]);
  } catch (error) {
    renderError(error);
  } finally {
    setLoading(false);
  }
}

function activateTab(tabName) {
  document.querySelectorAll('[role="tab"][data-tab]').forEach((tab) => {
    const selected = tab.dataset.tab === tabName;
    tab.setAttribute('aria-selected', String(selected));
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.remove('active');
  });

  const panelMap = {
    overview: '#overviewPanel',
    matches: '#matchesPanel',
    h2h: '#h2hPanel',
    activity: '#activityPanel',
  };
  $(panelMap[tabName] ?? '#overviewPanel').classList.add('active');
}

function playerIdFromHash() {
  const match = window.location.hash.match(/^#player-(\d+)$/);
  return match ? Number(match[1]) : null;
}

function updateHash(playerId) {
  const nextHash = `#player-${playerId}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  } else {
    loadPlayer(playerId);
  }
}

function bindEvents() {
  elements.searchForm.addEventListener('submit', (event) => event.preventDefault());
  elements.searchInput.addEventListener('input', performSearch);
  elements.searchInput.addEventListener('focus', () => setSearchDropdownOpen(true));

  document.addEventListener('click', (event) => {
    if (!elements.searchForm.contains(event.target) && !elements.searchResults.contains(event.target)) {
      setSearchDropdownOpen(false);
    }
  });

  elements.searchResults.addEventListener('click', (event) => {
    const card = event.target.closest('[data-player-id]');
    if (!card) return;

    const selectedName = card.querySelector('.result-title')?.textContent?.trim() ?? '';
    collapseSearchResults(selectedName);
    updateHash(card.dataset.playerId);
    window.setTimeout(() => {
      elements.playerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  });

  document.querySelectorAll('[role="tab"][data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });

  elements.h2hFilter.addEventListener('input', filterH2H);

  elements.refreshButton.addEventListener('click', () => {
    if (state.activePlayerId) {
      loadPlayer(state.activePlayerId, { refresh: true });
    }
  });

  elements.copyLinkButton.addEventListener('click', async () => {
    if (!state.activePlayerId) return;
    const url = `${window.location.origin}${window.location.pathname}#player-${state.activePlayerId}`;
    try {
      await navigator.clipboard.writeText(url);
      elements.copyLinkButton.textContent = 'Copied!';
      window.setTimeout(() => { elements.copyLinkButton.textContent = 'Copy link'; }, 1400);
    } catch {
      window.prompt('Copy this player link:', url);
    }
  });

  window.addEventListener('hashchange', () => {
    const id = playerIdFromHash();
    if (id) loadPlayer(id);
  });
}

bindEvents();

const deepLinkedPlayerId = playerIdFromHash();
if (deepLinkedPlayerId) {
  loadPlayer(deepLinkedPlayerId);
}
