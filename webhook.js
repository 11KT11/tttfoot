import { kv } from '@vercel/kv';
import { buildGrid } from './criteria.js';

// ---- Config ----
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GRAPH = 'https://graph.facebook.com/v21.0/me/messages';

const HOME = '🔵'; // gracz, który stworzył pokój
const AWAY = '🔴'; // gracz, który dołączył
const FREE = '⬜';

// ---- Vercel serverless entry ----
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (body.object !== 'page') return res.status(404).send('Not found');
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        if (!senderId) continue;
        const text = event.message?.text?.trim();
        const payload = event.postback?.payload;
        try {
          await handleInput(senderId, text, payload);
        } catch (e) {
          console.error('handler error', e);
          await send(senderId, 'Ups, błąd. Napisz MENU.');
        }
      }
    }
    return res.status(200).send('EVENT_RECEIVED');
  }
  return res.status(405).send('Method Not Allowed');
}

// ---- Routing ----
async function handleInput(userId, text, payload) {
  const cmd = (payload || text || '').trim();
  const upper = cmd.toUpperCase();
  const roomId = await kv.get(`user:${userId}`);

  if (['MENU','START','POMOC','HELP'].includes(upper)) return send(userId, menuText());
  if (['NOWA','NEW'].includes(upper)) return createRoom(userId);
  if (upper.startsWith('GRAJ ') || upper.startsWith('JOIN ')) {
    return joinRoom(userId, upper.split(' ')[1]?.trim());
  }
  if (['SIATKA','BOARD','PLANSZA'].includes(upper)) {
    if (!roomId) return send(userId, 'Nie jesteś w grze. Napisz NOWA.');
    const room = await kv.get(`room:${roomId}`);
    return send(userId, fullBoardText(room, userId));
  }
  if (['STOP','KONIEC'].includes(upper)) {
    if (roomId) await endRoom(roomId, 'Gra zakończona. Napisz NOWA, by zagrać ponownie.');
    return;
  }

  // Ruch w grze: "<numer> <nazwisko>"  np. "1 Ronaldo"
  const m = cmd.match(/^([1-9])\s+(.+)$/);
  if (m) {
    if (!roomId) return send(userId, 'Nie jesteś w grze. Napisz NOWA albo GRAJ <kod>.');
    return attemptMove(roomId, userId, parseInt(m[1],10)-1, m[2].trim());
  }
  // sam numer bez nazwiska
  if (/^[1-9]$/.test(cmd)) {
    return send(userId, 'Podaj pole ORAZ piłkarza, np: 1 Ronaldo');
  }

  return send(userId, menuText());
}

// ---- Rooms ----
async function createRoom(userId) {
  const code = genCode();
  const { rows, cols } = buildGrid();
  const room = {
    code, players: [userId],
    rows, cols,
    owners: Array(9).fill(null),   // null | 0 | 1
    answers: Array(9).fill(null),  // canonical name once taken
    turn: 0, status: 'waiting',
  };
  await kv.set(`room:${code}`, room, { ex: 3600 });
  await kv.set(`user:${userId}`, code, { ex: 3600 });
  await send(userId,
    `✅ Pokój utworzony!\n\nKod: *${code}*\n\nWyślij znajomemu — on pisze:\nGRAJ ${code}\n\nCzekam na drugiego gracza...`);
}

async function joinRoom(userId, code) {
  if (!code) return send(userId, 'Podaj kod, np: GRAJ ABC12');
  const room = await kv.get(`room:${code}`);
  if (!room) return send(userId, 'Nie znaleziono pokoju o tym kodzie.');
  if (room.players.includes(userId)) return send(userId, 'Już jesteś w tym pokoju.');
  if (room.players.length >= 2) return send(userId, 'Pokój jest pełny.');

  room.players.push(userId);
  room.status = 'playing';
  await kv.set(`room:${code}`, room, { ex: 3600 });
  await kv.set(`user:${userId}`, code, { ex: 3600 });

  await send(room.players[0], `🎮 Przeciwnik dołączył! Grasz ${HOME}. Zaczynasz!`);
  await send(room.players[1], `🎮 Dołączyłeś! Grasz ${AWAY}.`);
  await broadcast(room);
}

// ---- Move with AI verification ----
async function attemptMove(code, userId, cell, playerName) {
  const room = await kv.get(`room:${code}`);
  if (!room || room.status !== 'playing') return send(userId, 'Gra nieaktywna. Napisz NOWA.');

  const pIndex = room.players.indexOf(userId);
  if (pIndex !== room.turn) return send(userId, '⏳ To nie twój ruch.');
  if (room.owners[cell] !== null) return send(userId, 'To pole jest już zajęte. Wybierz inne.');

  const rowIdx = Math.floor(cell / 3);
  const colIdx = cell % 3;
  const c1 = room.rows[rowIdx];
  const c2 = room.cols[colIdx];

  await send(userId, `⚖️ Sprawdzam: czy „${playerName}" pasuje do ${c1.label} × ${c2.label}...`);

  const result = await verifyWithAI(playerName, c1.ai, c2.ai);

  if (!result.valid) {
    return send(userId, `❌ Nie uznane: ${result.reason || 'nie spełnia obu kryteriów'}.\nSpróbuj inne pole lub innego piłkarza (wciąż twój ruch).`);
  }

  // sprawdź, czy ten piłkarz nie został już użyty na innym polu
  const dup = room.answers.findIndex(a => a && sameName(a, result.canonical));
  if (dup !== -1) {
    return send(userId, `⚠️ ${result.canonical} został już użyty w tej grze. Podaj innego piłkarza.`);
  }

  // zajmij pole
  room.owners[cell] = pIndex;
  room.answers[cell] = result.canonical;

  const winLine = checkWin(room.owners);
  const full = room.owners.every(o => o !== null);

  if (winLine) {
    room.status = 'done';
    await kv.set(`room:${code}`, room, { ex: 600 });
    await broadcast(room, { last: { cell, name: result.canonical, by: pIndex } });
    return finalize(room, `🏆 GOL ZWYCIĘSKI! ${mark(pIndex)} wygrywa mecz!`);
  }
  if (full) {
    room.status = 'done';
    await kv.set(`room:${code}`, room, { ex: 600 });
    await broadcast(room, { last: { cell, name: result.canonical, by: pIndex } });
    return finalize(room, countWinner(room));
  }

  room.turn = 1 - room.turn;
  await kv.set(`room:${code}`, room, { ex: 3600 });
  await broadcast(room, { last: { cell, name: result.canonical, by: pIndex } });
}

// ---- AI verification (Approach A: live check every answer) ----
async function verifyWithAI(player, crit1, crit2) {
  const prompt =
`Jesteś sędzią w piłkarskiej grze typu "grid". Zweryfikuj jedną odpowiedź.

Piłkarz podany przez gracza: "${player}"
Kryterium 1: ${crit1}
Kryterium 2: ${crit2}

Czy ten piłkarz spełnia OBA kryteria JEDNOCZEŚNIE? Uwzględnij całą karierę zawodnika (wszystkie kluby, w których kiedykolwiek występował) oraz reprezentację narodową, dla której grał oficjalnie. Bądź rygorystyczny: jeśli nie masz pewności lub piłkarz nie istnieje, uznaj za niepoprawne.

Odpowiedz WYŁĄCZNIE czystym JSON, bez markdown, bez dodatkowego tekstu:
{"valid": true albo false, "canonical": "pełne poprawne imię i nazwisko zawodnika", "reason": "krótkie uzasadnienie po polsku, maksymalnie 12 słów"}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) {
      console.error('AI error', await r.text());
      return { valid: false, reason: 'błąd weryfikacji, spróbuj ponownie' };
    }
    const data = await r.json();
    const txt = data.content
      .filter(b => b.type === 'text').map(b => b.text).join('')
      .replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(txt);
    return {
      valid: !!parsed.valid,
      canonical: parsed.canonical || player,
      reason: parsed.reason || '',
    };
  } catch (e) {
    console.error('verify parse error', e);
    return { valid: false, reason: 'nie udało się zweryfikować, spróbuj ponownie' };
  }
}

// ---- Rendering ----
function gridText(room) {
  let out = '';
  for (let i = 0; i < 9; i++) {
    out += room.owners[i] === 0 ? HOME : room.owners[i] === 1 ? AWAY : FREE;
    out += (i % 3 === 2) ? (i !== 8 ? '\n' : '') : ' ';
  }
  return out;
}

function legendText(room) {
  let out = 'POLA (wpisz: numer + piłkarz, np. „1 Ronaldo"):\n';
  let n = 1;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const taken = room.owners[(r*3)+c];
      const who = room.answers[(r*3)+c];
      const tag = taken === null ? '' : ` ${taken===0?HOME:AWAY} ${who}`;
      out += `${n}. ${room.rows[r].label} × ${room.cols[c].label}${tag}\n`;
      n++;
    }
  }
  return out;
}

function fullBoardText(room, userId) {
  return `${gridText(room)}\n\n${legendText(room)}`;
}

async function broadcast(room, opts = {}) {
  const { last } = opts;
  for (let i = 0; i < room.players.length; i++) {
    const uid = room.players[i];
    let head;
    if (room.status === 'done') head = '🏁 Mecz zakończony!';
    else if (room.turn === i) head = `🟢 TWÓJ RUCH (${mark(i)})`;
    else head = '🔴 Ruch przeciwnika...';
    let body = `${head}\n`;
    if (last) body += `\nOstatni gol: ${mark(last.by)} ${last.name} (pole ${last.cell+1})\n`;
    body += `\n${gridText(room)}\n\n${legendText(room)}`;
    await send(uid, body);
  }
}

async function finalize(room, msg) {
  for (const uid of room.players) {
    await send(uid, `${msg}\n\nNapisz NOWA, by zagrać ponownie.`);
    await kv.del(`user:${uid}`);
  }
}

async function endRoom(code, msg) {
  const room = await kv.get(`room:${code}`);
  if (!room) return;
  for (const uid of room.players) { await send(uid, msg); await kv.del(`user:${uid}`); }
  await kv.del(`room:${code}`);
}

// ---- Helpers ----
function checkWin(o) {
  const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const l of L) { const [a,b,c]=l; if (o[a]!==null && o[a]===o[b] && o[a]===o[c]) return l; }
  return null;
}
function countWinner(room) {
  const h = room.owners.filter(o=>o===0).length;
  const a = room.owners.filter(o=>o===1).length;
  if (h>a) return `🏆 ${HOME} wygrywa ${h}:${a} (więcej pól)!`;
  if (a>h) return `🏆 ${AWAY} wygrywa ${a}:${h} (więcej pól)!`;
  return `🤝 Remis ${h}:${a}!`;
}
function mark(i){ return i===0?HOME:AWAY; }
function sameName(a,b){
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z ]/g,'').trim();
  return norm(a)===norm(b);
}
function genCode(){
  const ch='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s='';
  for(let i=0;i<5;i++) s+=ch[Math.floor(Math.random()*ch.length)];
  return s;
}
function menuText(){
  return `⚽ FOOTY GRID — Piłkarskie Kółko-Krzyżyk ⚽\n\n`+
    `Każde pole to przecięcie dwóch kryteriów (np. Inter × Brazylia). `+
    `Wpisz piłkarza, który spełnia OBA — AI to sprawdzi. Zajmij 3 pola w linii!\n\n`+
    `NOWA — utwórz pokój\n`+
    `GRAJ <kod> — dołącz do znajomego\n`+
    `SIATKA — pokaż aktualną planszę\n`+
    `STOP — zakończ grę\n\n`+
    `Ruch: numer pola + piłkarz, np: „1 Ronaldo"`;
}

async function send(recipientId, text){
  const r = await fetch(`${GRAPH}?access_token=${PAGE_ACCESS_TOKEN}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ recipient:{id:recipientId}, messaging_type:'RESPONSE', message:{text} }),
  });
  if(!r.ok) console.error('send failed', await r.text());
}
