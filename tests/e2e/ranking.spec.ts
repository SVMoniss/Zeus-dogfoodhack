import { test, expect } from '@playwright/test';

// Multi-method ranking comparison, robustness verdicts, team receipts,
// per-stage CSV exports. Controlled data: flat judge (3,3) + spread
// judge (1,5) over two projects, single criterion weight 100.

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

async function setupRankedEvent(request: any) {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const slug = `rank-${stamp}`;
  const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
  const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
  const ja = await apiLogin(request, 'judge_a@dogfood.local', 'testpass123');
  const jb = await apiLogin(request, 'judge_b@dogfood.local', 'testpass123');
  const open = new Date(Date.now() - 86400000).toISOString();
  const close = new Date(Date.now() + 30 * 86400000).toISOString();

  let res = await request.post(`${API}/api/events`, {
    headers: auth(org),
    data: {
      name: `Rank ${stamp}`, slug, description: 'ranking suite',
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
    headers: auth(part), data: { name: `Rank Team ${stamp}` },
  });
  const ids: Record<string, string> = {};
  for (const name of [`Rank P1 ${stamp}`, `Rank P2 ${stamp}`]) {
    res = await request.post(`${API}/api/events/${slug}/projects`, {
      headers: auth(part),
      data: { title: name, summary: 'rank target', track_id: track.id },
    });
    const p = await res.json();
    ids[name] = p.id;
    await request.post(`${API}/api/events/${slug}/projects/${p.id}/submit`, {
      headers: auth(part),
    });
  }
  const [p1, p2] = [`Rank P1 ${stamp}`, `Rank P2 ${stamp}`].map((n) => ids[n]);
  for (const [tok, scores] of [
    [ja, [3, 3]],
    [jb, [1, 5]],
  ] as const) {
    for (const [pid, score] of [[p1, scores[0]], [p2, scores[1]]] as const) {
      res = await request.post(`${API}/api/judge/scores/${pid}`, {
        headers: auth(tok),
        data: [{ criteria_id: criteria.id, score, comment: 'Solid effort' }],
      });
      expect(res.ok()).toBeTruthy();
    }
  }
  return { slug, event, org, part, p1, p2 };
}

test.describe('Ranking comparison', () => {
  test('four methods agree: ROBUST boundary', async ({ request }) => {
    const { event, org, p1, p2 } = await setupRankedEvent(request);
    const res = await request.get(`${API}/api/events/${event.id}/ranking?k=1`, {
      headers: auth(org),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Object.keys(body.methods).sort()).toEqual(
      ['borda', 'bradley_terry', 'calibrated_average', 'raw_average'].sort(),
    );
    expect(body.methods.raw_average[0]).toBe(p2);
    expect(body.methods.calibrated_average[0]).toBe(p2);
    expect(body.boundary.above).toEqual([p2]);
    expect(body.boundary.below).toEqual([p1]);
    expect(body.verdict).toBe('ROBUST');
  });

  test('team receipt shows averages, feedback and ranks', async ({ request }) => {
    const { slug, part } = await setupRankedEvent(request);
    const res = await request.get(`${API}/api/events/${slug}/teams/my/receipt`, {
      headers: auth(part),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.projects.length).toBe(2);
    for (const p of body.projects) {
      expect(p.criteria[0].average).toBeGreaterThan(0);
      expect(p.ranks.raw_average).toBeTruthy();
    }
    // Judges are anonymized, never named
    const blob = JSON.stringify(body);
    expect(blob).not.toContain('judge_a@dogfood.local');
    expect(blob).toContain('Judge 1');
    expect(body.boundary_verdict).toBe('ROBUST');
  });

  test('per-stage CSV exports', async ({ request }) => {
    const { slug, org } = await setupRankedEvent(request);
    for (const [path, header] of [
      ['assignments', 'Judge ID'],
      ['reviews', 'Judge ID'],
      ['audit', 'Action'],
    ] as const) {
      const res = await request.get(`${API}/api/events/${slug}/export/${path}.csv`, {
        headers: auth(org),
      });
      expect(res.ok()).toBeTruthy();
      expect((await res.text()).split('\n')[0]).toContain(header);
    }
    // Participant is refused all three
    const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
    const res = await request.get(`${API}/api/events/${slug}/export/reviews.csv`, {
      headers: auth(part),
    });
    expect(res.status()).toBe(403);
  });
});
