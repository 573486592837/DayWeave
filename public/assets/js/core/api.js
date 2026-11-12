export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...options });
  } catch (err) {
    throw new ApiError(0, { error: 'network' });
  }

  const type = res.headers.get('content-type') || '';
  let body = null;
  if (res.status !== 204) {
    body = type.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  }

  if (res.status === 401 && !location.pathname.endsWith('/login.html')) {
    location.replace('/login.html');
  }
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

function json(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  };
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (password) => request('/api/auth/login', json('POST', { password })),
  setup: (password) => request('/api/auth/setup', json('POST', { password })),
  logout: () => request('/api/auth/logout', json('POST')),
  getState: () => request('/api/state'),
  putState: (rev, data) => request('/api/state', json('PUT', { rev, data })),
  resetState: (password) => request('/api/state/reset', json('POST', { password })),
  changePassword: (oldPassword, newPassword) =>
    request('/api/auth/password', json('POST', { oldPassword, newPassword })),
  uploadAsset(file) {
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/assets', { method: 'POST', body: fd });
  },
  deleteAsset: (id) => request(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
