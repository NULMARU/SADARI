import { assets } from './assets.js';

const COOKIE = 'sadari_session';
const DURATION = 4200;
const MAX_IDLE = 24 * 60 * 60 * 1000;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
async function identity(request) {
  const cookieName = new URL(request.url).protocol === 'https:' ? '__Host-sadari_session' : COOKIE;
  const existing = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const raw = /^[a-f0-9]{64}$/.test(existing || '') ? existing : token();
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return { id: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''), cookie: existing === raw ? null : `${cookieName}=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}` };
}
function randomInt(n) {
  const bound = Math.floor(4294967296 / n) * n;
  let value;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= bound);
  return value % n;
}
export function makeGame(players, results, now = Date.now()) {
  // A uniformly shuffled destination permutation, then adjacent swaps create its ladder.
  const targets = Array.from({ length: players.length }, (_, i) => i);
  for (let i = targets.length - 1; i > 0; i--) { const j = randomInt(i + 1); [targets[i], targets[j]] = [targets[j], targets[i]]; }
  const order = Array.from({ length: players.length }, (_, i) => i);
  const swaps = [];
  for (let i = 0; i < targets.length; i++) {
    let at = order.indexOf(targets[i]);
    while (at > i) { swaps.push(at - 1); [order[at - 1], order[at]] = [order[at], order[at - 1]]; at--; }
  }
  // Paired crossings add movement without changing the uniformly sampled outcome.
  for (let i = 0; i < players.length; i++) { const col = randomInt(players.length - 1); const at = randomInt(swaps.length + 1); swaps.splice(at, 0, col, col); }
  const lines = swaps.map((col, i) => ({ col, y: (i + 1) / (swaps.length + 1) }));
  const matches = players.map((player, start) => { let end = start; for (const line of lines) { if (line.col === end) end++; else if (line.col === end - 1) end--; } return { player, result: results[end], end }; });
  return { roundId: crypto.randomUUID(), status: 'waiting', players, results, lines, matches, played: players.map(() => false), active: null, createdAt: now };
}
function database(env) { if (!env.DB) fail('게임 서버를 준비 중입니다. 잠시 후 다시 시도해 주세요.', 503); return env.DB; }
async function read(db) { return db.prepare('SELECT * FROM rooms WHERE id = 1').first(); }
async function cas(db, row, state, now) {
  const result = await db.prepare('UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE id = 1 AND version = ? AND owner = ? AND state = ?').bind(JSON.stringify(state), now, row.version, row.owner, row.state).run();
  return result.meta.changes === 1;
}
async function settle(db, now) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await read(db);
    if (!row) return null;
    if (row.updated_at + MAX_IDLE <= now) {
      const expired = await db.prepare('DELETE FROM rooms WHERE id = 1 AND version = ? AND updated_at <= ?').bind(row.version, now - MAX_IDLE).run();
      if (expired.meta.changes) return null;
      continue;
    }
    const state = JSON.parse(row.state);
    if (!state.active || state.active.endAt > now || state.status !== 'playing') return row;
    state.played[state.active.index] = true;
    state.active = null;
    if (state.played.every(Boolean)) state.status = 'finished';
    if (await cas(db, row, state, now)) return { ...row, state: JSON.stringify(state), version: row.version + 1, updated_at: now };
  }
  fail('게임 상태를 갱신 중입니다. 잠시 후 다시 시도해 주세요.', 409);
}
function publicState(row, id, now) {
  if (!row) return { room: null, isHost: false, serverNow: now };
  const state = JSON.parse(row.state);
  return { room: { ...state, matches: state.matches.map((match, i) => state.played[i] || state.status === 'finished' ? match : null), version: row.version }, isHost: row.owner === id, serverNow: now, expiresAt: row.updated_at + MAX_IDLE };
}
function validatePlayers(body) {
  if (!Array.isArray(body.players) || !Array.isArray(body.results) || body.players.length < 2 || body.players.length > 10 || body.results.length !== body.players.length) fail('참가자는 2~10명으로 설정해 주세요.');
  const clean = values => values.map(v => { if (typeof v !== 'string' || !v.trim() || v.trim().length > 24) fail('이름과 결과를 1~24자로 입력해 주세요.'); return v.trim(); });
  const players = clean(body.players), results = clean(body.results);
  if (new Set(players).size !== players.length) fail('참가자 이름은 서로 다르게 입력해 주세요.');
  return { players, results };
}
export async function api(request, env) {
  const person = await identity(request);
  let response;
  try {
    const db = database(env), now = Date.now(), url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/state') {
      response = json(publicState(await settle(db, now), person.id, now));
    } else if (request.method === 'POST' && url.pathname === '/api/action') {
      if (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/json')) fail('올바른 게임 화면에서 다시 시도해 주세요.', 403);
      const raw = await request.text();
      if (raw.length > 10000) fail('입력 내용이 너무 큽니다.', 413);
      let body; try { body = JSON.parse(raw); } catch { fail('입력 내용을 확인해 주세요.'); }
      if (!body || typeof body !== 'object') fail('입력 내용을 확인해 주세요.');
      let row = await settle(db, now);
      if (body.action === 'create') {
        const { players, results } = validatePlayers(body);
        const state = makeGame(players, results, now);
        if (row && row.updated_at + MAX_IDLE > now) fail('이미 열린 게임이 있습니다. 현재 게임에 참여해 주세요.', 409);
        if (row) {
          const result = await db.prepare('UPDATE rooms SET owner = ?, state = ?, version = version + 1, updated_at = ? WHERE id = 1 AND version = ? AND updated_at <= ?').bind(person.id, JSON.stringify(state), now, row.version, now - MAX_IDLE).run();
          if (!result.meta.changes) fail('다른 사람이 먼저 방을 열었습니다.', 409);
        } else {
          const result = await db.prepare('INSERT INTO rooms (id, owner, state, version, updated_at) VALUES (1, ?, ?, 1, ?) ON CONFLICT(id) DO NOTHING').bind(person.id, JSON.stringify(state), now).run();
          if (!result.meta.changes) fail('다른 사람이 먼저 방을 열었습니다.', 409);
        }
      } else {
        if (!row) fail('게임이 종료되었습니다. 새 게임을 열어 주세요.', 409);
        const state = JSON.parse(row.state);
        if (body.roundId !== state.roundId) fail('게임이 변경되었습니다. 새 화면에서 다시 눌러 주세요.', 409);
        if (['start', 'skip', 'reset'].includes(body.action) && row.owner !== person.id) fail('방장만 사용할 수 있는 기능입니다.', 403);
        if (body.action === 'reset') {
          const result = await db.prepare('DELETE FROM rooms WHERE id = 1 AND owner = ? AND version = ? AND state = ?').bind(person.id, row.version, row.state).run();
          if (!result.meta.changes) fail('게임 상태가 바뀌었습니다. 다시 시도해 주세요.', 409);
        } else {
          if (body.action === 'start') { if (state.status !== 'waiting') fail('이미 시작한 게임입니다.', 409); state.status = 'playing'; }
          else if (body.action === 'skip') { if (state.status !== 'playing') fail('진행 중인 게임에서 사용할 수 있습니다.', 409); state.active = null; state.played = state.played.map(() => true); state.status = 'finished'; }
          else if (body.action === 'play') {
            if (state.status !== 'playing') fail('방장이 게임을 시작하면 참여할 수 있습니다.', 409);
            if (state.active) fail('다른 참가자가 진행 중입니다. 잠시만 기다려 주세요.', 409);
            if (!Number.isInteger(body.index) || body.index < 0 || body.index >= state.players.length) fail('참가자를 다시 선택해 주세요.');
            if (state.played[body.index]) fail('이미 결과를 확인한 참가자입니다.', 409);
            state.active = { index: body.index, startAt: now, endAt: now + DURATION };
          } else fail('지원하지 않는 동작입니다.');
          if (!await cas(db, row, state, now)) fail('다른 참가자가 먼저 선택했습니다. 잠시 후 다시 눌러 주세요.', 409);
        }
      }
      response = json(publicState(await read(db), person.id, now));
    } else response = json({ error: '페이지를 찾을 수 없습니다.' }, 404);
  } catch (error) {
    if (!error.status) console.error('SADARI API', error.message);
    response = json({ error: error.status ? error.message : '서버 연결이 잠시 원활하지 않습니다. 다시 시도해 주세요.' }, error.status || 503);
  }
  if (person.cookie) response.headers.set('Set-Cookie', person.cookie);
  return response;
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    let response;
    if (path.startsWith('/api/')) response = await api(request, env);
    else if (!['GET', 'HEAD'].includes(request.method)) response = new Response('Method not allowed', { status: 405 });
    else {
      const asset = assets[path === '/' ? '/index.html' : path];
      response = asset ? new Response(request.method === 'HEAD' ? null : asset.body, { headers: { 'Content-Type': asset.type, 'Cache-Control': 'no-cache' } }) : new Response('Not found', { status: 404 });
    }
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'same-origin');
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'");
    return response;
  }
};

