import { test, expect } from '@playwright/test';

// Cross-judge z-score normalization with known values (JUDGING.md math).
// Judge A is flat (3, 3 -> stdev 0 -> normalized == raw, the awkward-case
// fallback). Judge B spreads (1, 5). Single criterion, weight 100.

const API = 'http://localhost:8000';
const JUDGE_A = '00000000-0000-0000-0000-000000000002';
const JUDGE_B = '00000000-0000-0000-0000-000000000003';

async function apiLogin(request: any, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token as string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const closeTo = (a: number, b: number, tol = 0.05) => Math.abs(a - b) < tol;

async function setupScoredEvent(request: any) {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const slug = `norm-${stamp}`;
  const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
  const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
  const ja = await apiLogin(request, 'judge_a@dogfood.local', 'testpass123');
  const jb = await apiLogin(request, 'judge_b@dogfood.local', 'testpass123');
  const open = new Date(Date.now() - 86400000).toISOString();
  const close = new Date(Date.now() + 30 * 86400000).toISOString();

  let res = await request.post(`${API}/api/events`, {
    headers: auth(org),
    data: {
      name: `Norm ${stamp}`, slug, description: 'normalization math',
      submissions_open_at: open, submissions_close_at: close,
    },
  });
  const event = await res.json();
  res = await request.post(`${API}/api/events/${event.id}/tracks`, {
    headers: auth(org), data: { name: 'General' },
  });
  const track = await res.json();
  res = await request.post(`${API}/api/events/${event.id}/criteria`, {
    headers: auth(org),
    data: { name: 'Functionality', weight: 100, min_score: 1, max_score: 5 },
  });
  const criteria = await res.json();

  for (const jid of [JUDGE_A, JUDGE_B]) {
    res = await request.post(`${API}/api/events/${event.id}/judges/assign`, {
      headers: auth(org), data: { judge_id: jid, track_id: track.id },
    });
    expect(res.ok()).toBeTruthy();
  }

  await request.post(`${API}/api/events/${event.id}/teams`, {
    headers: auth(part), data: { name: `Norm Team ${stamp}` },
  });
  const ids: Record<string, string> = {};
  for (const name of [`Norm P1 ${stamp}`, `Norm P2 ${stamp}`]) {
    res = await request.post(`${API}/api/events/${slug}/projects`, {
      headers: auth(part),
      data: { title: name, summary: 'norm target', track_id: track.id },
    });
    const p = await res.json();
    ids[name] = p.id;
    res = await request.post(`${API}/api/events/${slug}/projects/${p.id}/submit`, {
      headers: auth(part),
    });
    expect(res.ok()).toBeTruthy();
  }
  const [p1, p2] = [`Norm P1 ${stamp}`, `Norm P2 ${stamp}`].map((n) => ids[n]);

  // Flat judge: 3 and 3. Spread judge: 1 and 5.
  for (const [tok, scores] of [
    [ja, [3, 3]],
    [jb, [1, 5]],
  ] as const) {
    for (const [pid, score] of [[p1, scores[0]], [p2, scores[1]]] as const) {
      res = await request.post(`${API}/api/judge/scores/${pid}`, {
        headers: auth(tok),
        data: [{ criteria_id: criteria.id, score }],
      });
      expect(res.ok()).toBeTruthy();
    }
  }
  return { slug, event, org, p1, p2 };
}

test.describe('Normalization math', () => {
  test('flat judge falls back to raw, spread judge normalized', async ({ request }) => {
    const { event, org, p1, p2 } = await setupScoredEvent(request);
    const res = await request.get(`${API}/api/events/${event.id}/normalization`, {
      headers: auth(org),
    });
    expect(res.ok()).toBeTruthy();
    const reports = await res.json();
    const byJudge: Record<string, any> = {};
    for (const r of reports) byJudge[r.judge_id] = r;

    // Flat judge: mean 3, std 0, normalized == raw
    expect(closeTo(byJudge[JUDGE_A].mean, 3)).toBe(true);
    expect(byJudge[JUDGE_A].std).toBe(0);
    expect(closeTo(byJudge[JUDGE_A].normalized_scores[p1], 3)).toBe(true);
    expect(closeTo(byJudge[JUDGE_A].normalized_scores[p2], 3)).toBe(true);

    // Spread judge: mean 3, std ~2.83; global [3,3,1,5] mean 3 std ~1.63
    // P1: (1-3)/2.83*1.63+3 ~= 1.85 ; P2 ~= 4.15
    expect(closeTo(byJudge[JUDGE_B].mean, 3)).toBe(true);
    expect(closeTo(byJudge[JUDGE_B].std, 2.83, 0.05)).toBe(true);
    expect(closeTo(byJudge[JUDGE_B].normalized_scores[p1], 1.85, 0.1)).toBe(true);
    expect(closeTo(byJudge[JUDGE_B].normalized_scores[p2], 4.15, 0.1)).toBe(true);
  });

  test('CSV carries normalized totals and ranks', async ({ request }) => {
    const { slug, org } = await setupScoredEvent(request);
    const res = await request.get(`${API}/api/events/${slug}/export.csv`, {
      headers: auth(org),
    });
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    const lines = text.replace(/\r/g, '').trim().split('\n');
    expect(lines[0]).toContain('Normalized Total');
    expect(lines[0]).toContain('Rank');
    const rows = lines.slice(1).map((l) => l.split(','));
    const byTitle: Record<string, string[]> = {};
    for (const r of rows) byTitle[r[0].replace(/"/g, '')] = r;
    const titles = Object.keys(byTitle).filter((t) => t.startsWith('Norm P'));
    expect(titles.length).toBe(2);
    // P2 outscores P1 after normalization -> rank 1 vs 2
    const rankOf = (t: string) => byTitle[t][byTitle[t].length - 1].replace(/"/g, '');
    const ranks = titles.map(rankOf).sort();
    expect(ranks).toEqual(['1', '2']);
  });
});
