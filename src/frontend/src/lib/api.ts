export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** Default event seeded from spec/fixtures.json (see backend seed.py). */
export const DEFAULT_EVENT_SLUG = 'sample-hack-2026';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  get denied() {
    return this.status === 401 || this.status === 403;
  }
}

type FetchOptions = RequestInit & { json?: unknown };

/**
 * Real backend consumer: cookie session, credentials included.
 * Never stores session in localStorage — the backend sets an
 * httpOnly `session` cookie on POST /api/auth/login.
 * Callers must treat 401/403 as access-denied, not generic errors.
 */
export async function api<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { json, headers, ...rest } = opts;
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    ...rest,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = (data as { detail?: string }).detail || JSON.stringify(data);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** GET that returns null instead of throwing on 401/403 (for access-denied panels). */
export async function apiOptional<T>(path: string): Promise<{ data: T | null; denied: boolean }> {
  try {
    return { data: await api<T>(path), denied: false };
  } catch (e) {
    if (e instanceof ApiError && e.denied) return { data: null, denied: true };
    throw e;
  }
}

export function isSubmissionsClosedMessage(message: string) {
  return /closed|deadline|past/i.test(message);
}
