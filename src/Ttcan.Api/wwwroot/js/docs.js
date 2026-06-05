import { baseUrl, buildPath, requestWithMeta } from './api.js';

const endpoints = [
  {
    slug: 'search',
    title: 'Search players',
    description: 'Find players by name. Empty names return HTTP 400.',
    method: 'GET',
    path: '/api/players/search',
    params: [
      ['name', 'string', 'query', 'Yes', 'Name fragment to search, for example WANG.'],
    ],
    defaults: { name: 'WANG' },
    response: `Array<PlayerSummary> = [
  {
    playerId: number,
    name: string,
    province: string,
    gender: string,
    rating: number | null
  }
]`,
    jsSample: (path) => `const baseUrl = window.location.origin;
const response = await fetch(baseUrl + '${path}');
if (!response.ok) throw new Error('HTTP ' + response.status);
const players = await response.json();
console.log(players);`,
  },
  {
    slug: 'profile',
    title: 'Get player profile',
    description: 'Get a full player profile. The first request may scrape live TTCAN data; cached responses are fast.',
    method: 'GET',
    path: '/api/players/{id}',
    params: [
      ['id', 'number', 'path', 'Yes', 'TTCAN player ID.'],
      ['refresh', 'boolean', 'query', 'No', 'When true, bypasses cache and scrapes fresh data.'],
    ],
    defaults: { id: '7864', refresh: '' },
    response: `PlayerProfile = {
  playerId: number,
  name: string,
  province: string,
  gender: string,
  latestRating: number | null,
  fetchedAt: string,
  ratings: RatingPoint[],
  matches: Match[]
}`,
    jsSample: (path) => `const baseUrl = window.location.origin;
const profile = await fetch(baseUrl + '${path}').then((r) => {
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
});
console.log(profile.name, profile.latestRating);`,
  },
  {
    slug: 'ratings',
    title: 'Get rating history',
    description: 'Return rating points for charting rating over time.',
    method: 'GET',
    path: '/api/players/{id}/ratings',
    params: [
      ['id', 'number', 'path', 'Yes', 'TTCAN player ID.'],
      ['refresh', 'boolean', 'query', 'No', 'When true, bypasses cache and scrapes fresh data.'],
    ],
    defaults: { id: '7864', refresh: '' },
    response: `Array<RatingPoint> = [
  {
    periodId: number,
    date: string,
    rating: number
  }
]`,
    jsSample: (path) => `const baseUrl = window.location.origin;
const ratings = await fetch(baseUrl + '${path}').then((r) => r.json());
const labels = ratings.map((point) => point.date);
const data = ratings.map((point) => point.rating);`,
  },
  {
    slug: 'matches',
    title: 'Get matches',
    description: 'Return match rows normalized to the requested player perspective.',
    method: 'GET',
    path: '/api/players/{id}/matches',
    params: [
      ['id', 'number', 'path', 'Yes', 'TTCAN player ID.'],
      ['refresh', 'boolean', 'query', 'No', 'When true, bypasses cache and scrapes fresh data.'],
    ],
    defaults: { id: '7864', refresh: '' },
    response: `Array<Match> = [
  {
    periodId: number,
    event: string,
    opponentName: string,
    won: boolean,
    playerRating: number,
    opponentRating: number,
    ratingDelta: number
  }
]`,
    jsSample: (path) => `const baseUrl = window.location.origin;
const matches = await fetch(baseUrl + '${path}').then((r) => r.json());
const wins = matches.filter((match) => match.won).length;
const losses = matches.length - wins;`,
  },
  {
    slug: 'head-to-head',
    title: 'Get head-to-head records',
    description: 'Return aggregated win/loss records by opponent. The optional opponent query filters server-side.',
    method: 'GET',
    path: '/api/players/{id}/head-to-head',
    params: [
      ['id', 'number', 'path', 'Yes', 'TTCAN player ID.'],
      ['opponent', 'string', 'query', 'No', 'Optional opponent name fragment filter.'],
    ],
    defaults: { id: '7864', opponent: '' },
    response: `Array<HeadToHeadRecord> = [
  {
    opponentName: string,
    wins: number,
    losses: number,
    totalMatches: number
  }
]`,
    jsSample: (path) => `const baseUrl = window.location.origin;
const records = await fetch(baseUrl + '${path}').then((r) => r.json());
const withWinPct = records.map((record) => ({
  ...record,
  winPct: record.totalMatches ? record.wins / record.totalMatches : 0,
}));`,
  },
  {
    slug: 'activity',
    title: 'Get activity by period',
    description: 'Return match counts grouped by rating period for activity charts.',
    method: 'GET',
    path: '/api/players/{id}/activity',
    params: [
      ['id', 'number', 'path', 'Yes', 'TTCAN player ID.'],
    ],
    defaults: { id: '7864' },
    response: `Array<ActivityPeriod> = [
  {
    periodId: number,
    matchCount: number
  }
]`,
    jsSample: (path) => `const baseUrl = window.location.origin;
const activity = await fetch(baseUrl + '${path}').then((r) => r.json());
const labels = activity.map((point) => point.periodId);
const counts = activity.map((point) => point.matchCount);`,
  },
];

const docsNav = document.querySelector('#docsNav');
const docsContent = document.querySelector('#docsContent');
const originLabel = document.querySelector('#originLabel');
originLabel.textContent = baseUrl;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function defaultPath(endpoint) {
  return buildPath(endpoint.path, endpoint.defaults);
}

function curlSample(path) {
  return `curl -sS "${baseUrl}${path}" \\
  -H "Accept: application/json"`;
}

function codeSamples(endpoint) {
  const path = defaultPath(endpoint);
  return {
    curl: curlSample(path),
    js: endpoint.jsSample(path),
  };
}

function renderParamsTable(endpoint) {
  const table = el('table', 'params-table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Type</th>
        <th>In</th>
        <th>Required</th>
        <th>Description</th>
      </tr>
    </thead>
  `;
  const body = document.createElement('tbody');
  endpoint.params.forEach(([name, type, where, required, description]) => {
    const tr = document.createElement('tr');
    [name, type, where, required, description].forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.appendChild(body);
  return table;
}

function renderCodeBlock(endpoint) {
  const samples = codeSamples(endpoint);
  const wrapper = document.createElement('div');
  const tabs = el('div', 'code-tabs');
  const block = el('div', 'code-block');
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  const copy = el('button', 'copy-button', 'Copy');
  copy.type = 'button';

  let active = 'curl';
  code.textContent = samples[active];

  ['curl', 'js'].forEach((kind) => {
    const button = el('button', `code-tab ${kind === active ? 'active' : ''}`, kind === 'js' ? 'JS' : 'curl');
    button.type = 'button';
    button.addEventListener('click', () => {
      active = kind;
      tabs.querySelectorAll('button').forEach((tab) => tab.classList.remove('active'));
      button.classList.add('active');
      code.textContent = samples[active];
      copy.textContent = 'Copy';
    });
    tabs.appendChild(button);
  });

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      copy.textContent = 'Copied!';
      window.setTimeout(() => { copy.textContent = 'Copy'; }, 1300);
    } catch {
      window.prompt('Copy this snippet:', code.textContent);
    }
  });

  pre.appendChild(code);
  block.append(copy, pre);
  wrapper.append(tabs, block);
  return wrapper;
}

function inputForParam(endpoint, [name, type, where, required, description]) {
  const label = document.createElement('label');
  const title = document.createElement('span');
  title.textContent = `${name}${required === 'Yes' ? ' *' : ''}`;
  label.appendChild(title);

  if (type === 'boolean') {
    const select = document.createElement('select');
    select.name = name;
    select.title = description;
    [
      ['', 'omit'],
      ['true', 'true'],
      ['false', 'false'],
    ].forEach(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      if ((endpoint.defaults[name] ?? '') === value) option.selected = true;
      select.appendChild(option);
    });
    label.appendChild(select);
    return label;
  }

  const input = document.createElement('input');
  input.name = name;
  input.type = type === 'number' ? 'number' : 'text';
  input.required = required === 'Yes';
  input.placeholder = description;
  input.value = endpoint.defaults[name] ?? '';
  label.appendChild(input);
  return label;
}

function renderTryIt(endpoint) {
  const wrapper = document.createElement('div');
  const form = el('form', 'try-form');
  const result = el('div', 'try-result');
  const resultHeader = el('div', 'try-result-header');
  const status = el('span', '', 'Not run yet');
  const url = el('span', '', defaultPath(endpoint));
  const pre = document.createElement('pre');
  pre.textContent = 'Submit the form to call the live API.';

  endpoint.params.forEach((param) => form.appendChild(inputForParam(endpoint, param)));
  const submit = el('button', 'btn primary', 'Try It');
  submit.type = 'submit';
  form.appendChild(submit);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    Object.keys(values).forEach((key) => {
      if (typeof values[key] === 'string') values[key] = values[key].trim();
    });
    const path = buildPath(endpoint.path, values);

    status.textContent = 'Loading...';
    status.style.color = '';
    url.textContent = path;
    pre.textContent = '';

    try {
      const response = await requestWithMeta(path);
      status.textContent = `HTTP ${response.status} ${response.statusText}`.trim();
      pre.textContent = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data, null, 2);
      status.style.color = response.ok ? '#bbf7d0' : '#fecaca';
    } catch (error) {
      status.textContent = 'Network error';
      status.style.color = '#fecaca';
      pre.textContent = error.message || String(error);
    }
  });

  resultHeader.append(status, url);
  result.append(resultHeader, pre);
  wrapper.append(form, result);
  return wrapper;
}

function renderEndpoint(endpoint) {
  const section = el('section', 'card endpoint-section');
  section.id = endpoint.slug;

  const head = el('div', 'endpoint-head');
  const titleWrap = document.createElement('div');
  const title = el('h2', '', endpoint.title);
  const description = el('p', 'muted', endpoint.description);
  titleWrap.append(title, description);

  const patternWrap = document.createElement('div');
  const method = el('span', 'method-badge', endpoint.method);
  const pattern = el('span', 'url-pattern', endpoint.path);
  patternWrap.append(method, document.createTextNode(' '), pattern);
  head.append(titleWrap, patternWrap);

  const paramsHeading = el('h3', '', 'Parameters');
  const responseHeading = el('h3', '', 'Response schema');
  const responseBlock = el('div', 'code-block');
  const responsePre = document.createElement('pre');
  const responseCode = document.createElement('code');
  responseCode.textContent = endpoint.response;
  responsePre.appendChild(responseCode);
  responseBlock.appendChild(responsePre);

  const samplesHeading = el('h3', '', 'Code samples');
  const tryHeading = el('h3', '', 'Try It');

  section.append(
    head,
    paramsHeading,
    renderParamsTable(endpoint),
    responseHeading,
    responseBlock,
    samplesHeading,
    renderCodeBlock(endpoint),
    tryHeading,
    renderTryIt(endpoint),
  );

  return section;
}

function renderDocs() {
  endpoints.forEach((endpoint) => {
    const link = document.createElement('a');
    link.href = `#${endpoint.slug}`;
    link.textContent = endpoint.title;
    docsNav.appendChild(link);
    docsContent.appendChild(renderEndpoint(endpoint));
  });
}

renderDocs();
