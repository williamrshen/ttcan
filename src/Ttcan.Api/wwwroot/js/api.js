export const baseUrl = window.location.origin;

async function parseJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const data = await parseJson(response);

  if (!response.ok) {
    const message = typeof data === 'string'
      ? data
      : data?.title || data?.message || `Request failed with HTTP ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

export async function requestWithMeta(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const data = await parseJson(response);
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data,
  };
}

function queryString(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

export function searchPlayers(name, options = {}) {
  return request(`/api/players/search${queryString({ name })}`, options);
}

export function getProfile(playerId, { refresh = false } = {}) {
  return request(`/api/players/${encodeURIComponent(playerId)}${queryString({ refresh: refresh || undefined })}`);
}

export function getRatings(playerId, { refresh = false } = {}) {
  return request(`/api/players/${encodeURIComponent(playerId)}/ratings${queryString({ refresh: refresh || undefined })}`);
}

export function getMatches(playerId, { refresh = false } = {}) {
  return request(`/api/players/${encodeURIComponent(playerId)}/matches${queryString({ refresh: refresh || undefined })}`);
}

export function getHeadToHead(playerId, { opponent = '' } = {}) {
  return request(`/api/players/${encodeURIComponent(playerId)}/head-to-head${queryString({ opponent })}`);
}

export function getActivity(playerId) {
  return request(`/api/players/${encodeURIComponent(playerId)}/activity`);
}

export function buildPath(pattern, values = {}) {
  let path = pattern.replaceAll('{id}', encodeURIComponent(values.id ?? ''));
  const query = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (key === 'id' || value === undefined || value === null || value === '') return;
    query.set(key, value);
  });

  const queryText = query.toString();
  return queryText ? `${path}?${queryText}` : path;
}
