// A citizen's life beyond their routine: who they are (a name, an age and a birthday, a household),
// how they're doing (needs), and what they've done today (a diary, the hours spent on each thing,
// the work they got through). It all comes together in a passport card, which passport.js draws.
// The town (the leader window) runs this; other desktops' windows ask it for cards.
//
// Needs, 0 (empty) to 1 (full), follow what people are actually doing, in town time: energy (sleep
// restores it; work, school and exercise wear it down), food (meals fill you up), fun (TV, games, the
// pub, the playground; work, school and homework drain it), social (a good chat and company help; an
// argument or being snubbed doesn't), hygiene (a shower or a bath) and health (illness, smog).
// They feed back lightly: whatever's running low comes up in thought bubbles, lonely people start
// more conversations, and everyone's mood drifts with how their needs are going (see social.js).
import { traits, dice, dow, roleOf, SHIFTS, planFor, DAY_NAMES } from './routine.js';
import { rel, isFriend, moodOf, interestsOf, TOPICS, say } from './social.js';

const FIRST = ['ADA', 'ALEX', 'AMIR', 'ANA', 'ARLO', 'ASHA', 'BEA', 'BEN', 'CARA', 'CHEN', 'DAN', 'DEV', 'EDIE', 'ELI', 'EMMA', 'EZRA', 'FARAH', 'FINN', 'GIA', 'GUS', 'HANA', 'HUGO', 'IDA', 'IGOR', 'IRIS', 'IVY', 'JADE', 'JAY', 'JUNO', 'KAI', 'KAYA', 'KENJI', 'LEA', 'LEO', 'LILA', 'LOU', 'LUCA', 'LUZ', 'MAE', 'MALIK', 'MAYA', 'MILO', 'MINA', 'NIA', 'NICO', 'NOOR', 'OLLIE', 'OMAR', 'OTIS', 'PIA', 'PRIYA', 'QUINN', 'RAFA', 'REN', 'RIA', 'ROSA', 'RUBY', 'SAM', 'SANA', 'SOL', 'TARA', 'TEO', 'THEO', 'UMA', 'VERA', 'VIC', 'WREN', 'YARA', 'YUSUF', 'ZOE', 'ZARA', 'ARI', 'BO', 'CASS', 'DARA', 'ELLA', 'FELIX', 'GRACE', 'HAL', 'INES', 'JONAS', 'KIRA', 'LARS', 'MARA', 'NED', 'OLGA', 'PAZ', 'RAJ', 'SKY', 'TOM', 'VAL', 'WES', 'YUKI', 'ZED', 'ANYA', 'BRUNO', 'CLEO', 'DIEGO', 'ELSA', 'FREYA', 'GIL', 'HARPER', 'ISLA', 'JUDE', 'KOFI', 'LENA', 'MATEO', 'NADIA', 'OSCAR', 'PENNY', 'ROMY', 'SILAS', 'TESS', 'VIKTOR', 'WILLA', 'XAVI', 'YVES', 'ZINA'];
const LAST = ['ADAMS', 'ALVES', 'BAKER', 'BANKS', 'BELL', 'BERG', 'BROOKS', 'CHEN', 'COLE', 'COSTA', 'CRUZ', 'DIAZ', 'DIXON', 'DUBOIS', 'EGAN', 'ELLIS', 'EVANS', 'FISCHER', 'FORD', 'FOX', 'GARCIA', 'GRAY', 'GREEN', 'HALL', 'HART', 'HAYES', 'HILL', 'HOLT', 'HUANG', 'IBARRA', 'JONES', 'KANE', 'KHAN', 'KIM', 'KOVAC', 'LANE', 'LEE', 'LOPEZ', 'LUND', 'MARSH', 'MEYER', 'MORI', 'MOSS', 'NAKANO', 'NOVAK', 'NUNEZ', 'OKAFOR', 'OLSEN', 'PARK', 'PATEL', 'PEREZ', 'PRICE', 'QUINN', 'REED', 'REYES', 'ROSS', 'SATO', 'SHAH', 'SILVA', 'SMITH', 'STONE', 'SUZUKI', 'TANAKA', 'TRAN', 'UDDIN', 'VEGA', 'WARD', 'WEBB', 'WOLF', 'WONG', 'YANG', 'YILMAZ', 'YOUNG', 'ZHANG', 'ZIMMER'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const hhmm = (h) => { const m = Math.round(((h % 24) + 24) % 24 * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const and = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(' ')} AND ${list[list.length - 1]}`);

// ---------- who they are ----------
const housemates = (p, city) => city.people.filter((q) => q.hh === p.hh);
// The kind of household (saved; worked out for towns saved before households had kinds).
function kinOf(p, city) {
  if (p.kin) return p.kin;
  const hh = housemates(p, city), adults = hh.filter((q) => !q.kid).length;
  return (p.kin = hh.some((q) => q.kid) ? 'family' : adults <= 1 ? 'single' : adults >= 3 || dice(p.hh, 13)() < 0.3 ? 'roommates' : 'couple');
}
// [first, last]. Families share a surname, most couples do; nobody shares a first name at home.
export function nameOf(p, city) {
  if (p._name) return p._name;
  const r = dice(p.seed, 31), kin = kinOf(p, city), shared = kin === 'family' || (kin === 'couple' && dice(p.hh, 32)() < 0.7);
  const taken = housemates(p, city).filter((q) => q.id < p.id).map((q) => nameOf(q, city)[0]);
  let i = Math.floor(r() * FIRST.length);
  while (taken.includes(FIRST[i])) i = (i + 1) % FIRST.length;
  return (p._name = [FIRST[i], LAST[Math.floor((shared ? dice(p.hh, 33)() : r()) * LAST.length)]]);
}
const firstOf = (p, city) => nameOf(p, city)[0];
// Their birthday, as a day number (saved), and so their age.
function bornDay(p, city, w) {
  if (p.born !== undefined) return p.born;
  const r = dice(p.seed, 34), kin = kinOf(p, city), base = dice(p.hh, 35)();
  const age = p.kid ? 4 + Math.floor(r() * 9)
    : kin === 'family' ? 26 + Math.floor(base * 18) + Math.floor(r() * 5)
    : kin === 'couple' ? 21 + Math.floor(base ** 1.4 * 56) + Math.floor(r() * 5)
    : kin === 'roommates' ? 19 + Math.floor(r() * 14) : 20 + Math.floor(r() ** 1.3 * 62);
  return (p.born = w.day - Math.round(age * 365.25) - Math.floor(r() * 365));
}
const md = (day) => { const d = new Date(day * 864e5); return [d.getUTCMonth(), d.getUTCDate(), d.getUTCFullYear()]; };
function ageOf(p, city, w) { // whole years, by the calendar (so they're a year older on the day itself)
  const [bm, bd, by] = md(bornDay(p, city, w)), [m, d, y] = md(w.day);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
const birthday = (p, city, w) => { const [a, b] = md(bornDay(p, city, w)), [c, d] = md(w.day); return a === c && b === d; };

// What a building's called, from inside it (an office: the company on that floor).
const houseNo = (lot) => lot * 2 + 1;
function placeName(city, b, f) {
  if (b.type === 'home') return `NO ${houseNo(city.lots.indexOf(b))}`;
  if (b.type === 'office') return (b.L.companies?.find((c) => c.floors.includes(f)) || b.L.companies?.[0])?.name?.toUpperCase() || 'THE OFFICE';
  return (b.L.sign || b.L.T.name).toUpperCase();
}
const where = (city, p) => (!p.b ? null : city.lots.indexOf(p.b) === p.home.lot ? 'HOME' : placeName(city, p.b, p.f));
function workplace(city, p) {
  const b = p.job && city.lots[p.job.lot], s = b?.allSpots('work')[p.job.desk];
  return b ? placeName(city, b, s?.f ?? 0) : null;
}
export const ROLE_TITLE = { office: 'OFFICE WORKER', cashier: 'CASHIER', chef: 'CHEF', waiter: 'WAITER', bartender: 'BARTENDER', teacher: 'TEACHER', worker: 'FACTORY WORKER', firefighter: 'FIREFIGHTER', officer: 'POLICE OFFICER', doctor: 'DOCTOR', nurse: 'NURSE', security: 'SECURITY GUARD' };
const WEEKDAYS_ONLY = new Set(['office', 'teacher', 'worker']), LONG = new Set(['firefighter', 'officer', 'doctor', 'nurse', 'security']);

// A few words for their personality, from their habits.
function traitWords(p) {
  moodOf(p); // (sets up their chattiness, patience and cheerfulness)
  const T = traits(p), out = [];
  if (!p.kid && T.wake < 6.6) out.push('EARLY BIRD');
  if (!p.kid && T.wake > 7.6) out.push('LATE RISER');
  if (T.talkative > 0.68) out.push('CHATTY'); else if (T.talkative < 0.3) out.push('QUIET');
  if (T.cheerful > 0.22) out.push('CHEERFUL'); else if (T.cheerful < -0.15) out.push('GRUMPY');
  if (T.patience < 0.4) out.push('IMPATIENT'); else if (T.patience > 0.85) out.push('PATIENT');
  if (T.temper) out.push('HOT-HEADED');
  if (T.fitness === 'runner') out.push('RUNNER'); else if (T.fitness === 'gym') out.push('GYM REGULAR');
  if (!p.kid && T.social > 0.7) out.push('PARTY GOER'); else if (!p.kid && T.social < 0.12) out.push('HOMEBODY');
  if (T.lazy) out.push('LAZY');
  if (T.gait === 'hurry') out.push('ALWAYS RUSHING'); else if (T.gait === 'stroll') out.push('LAID BACK');
  if (!T.honest) out.push('LIGHT FINGERS');
  if (!T.breakfast) out.push('SKIPS BREAKFAST');
  return out.slice(0, 6);
}
const INTEREST_WORD = { movies: 'FILMS', town: 'THE TOWN', love: 'ROMANCE' };

// ---------- what they're doing ----------
const ACT_CAT = {
  sleep: 'sleep', nap: 'sleep', patient: 'sick', exam: 'sick', waitroom: 'sick', eat: 'eat', lunch: 'eat', dine: 'eat', fridge: 'eat',
  drink: 'fun', tv: 'fun', game: 'fun', play: 'fun', garden: 'fun', balcony: 'rest', rest: 'rest', coffee: 'rest',
  cook: 'chores', dishes: 'chores', browse: 'chores', pay: 'chores', toilet: 'wash', wash: 'wash', shower: 'wash', bath: 'wash', dress: 'wash',
  work: 'work', meet: 'work', print: 'work', front: 'work', homework: 'study', learn: 'school', exercise: 'exercise', jail: 'jail',
};
const MOVING = new Set(['walk', 'stairs', 'elev', 'drive', 'ride', 'board', 'door', 'exit', 'enter', 'curtain', 'switch']);
const OUTDOORS = new Set(['outing', 'playground', 'play']);
const blockKind = (p) => (p.wantKey || '').split('@')[0].split('+')[0];
// What kind of thing someone's doing right now (for their needs and the hours they spend).
function activity(p) {
  if (p.jail && p.b?.type === 'police') return 'jail';
  if (p.anim === 'sleep') return p.sick ? 'sick' : 'sleep';
  const s = p.plan[0], act = s?.act || s?.spot?.act, kind = blockKind(p);
  if (s?.t === 'staff' || s?.t === 'spray') return 'work';
  if (s?.t === 'meal') return 'eat';
  if (s?.t === 'slide' || s?.t === 'climb' || p.surface === 'climb') return 'fun';
  if (s?.t === 'queue') return 'chores';
  if (s?.t === 'turn') return 'rest'; // (waiting for the bathroom)
  if (s?.t === 'fight') return 'fight';
  if (act && !MOVING.has(s?.t)) return ACT_CAT[act] || 'rest';
  if (p.v > 0 || MOVING.has(s?.t)) return kind === 'run' ? 'exercise' : OUTDOORS.has(kind) && !p.b ? 'out' : 'travel';
  return OUTDOORS.has(kind) ? 'out' : 'rest';
}

// ---------- needs ----------
// 0 energy, 1 food, 2 fun, 3 social, 4 hygiene (each a change per town hour), and 5 health.
const RATES = {
  sleep: [null, -0.035, 0, 0, -0.02], eat: [-0.04, 2.2, 0.05, -0.02, -0.03], work: [-0.065, -0.14, -0.07, -0.04, -0.05],
  school: [-0.06, -0.14, -0.06, 0.03, -0.04], study: [-0.05, -0.13, -0.12, -0.04, -0.03], fun: [-0.03, -0.12, 0.45, -0.02, -0.03],
  out: [-0.06, -0.14, 0.3, 0.03, -0.05], exercise: [-0.22, -0.25, 0.12, -0.02, -0.5], wash: [-0.02, -0.1, 0.02, -0.03, 4],
  chores: [-0.06, -0.14, -0.06, -0.03, -0.05], travel: [-0.06, -0.14, -0.03, -0.03, -0.05], rest: [-0.02, -0.12, 0.04, -0.03, -0.03],
  sick: [-0.02, -0.08, -0.05, -0.03, -0.03], jail: [-0.05, -0.1, -0.15, -0.08, -0.06], fight: [-0.4, -0.2, -0.2, -0.1, -0.3],
};
function freshNeeds(p, w) { // a reasonable guess, the first time we see someone
  const awake = Math.max(0, w.hour - traits(p).wake); // (before their alarm, they're still asleep)
  return [clamp(1 - awake / 18, 0.15), 0.6, 0.6, 0.6, 0.8, p.sick ? 0.4 : 1];
}

// ---------- the diary ----------
// tag: a talk with the same people again soon after replaces the last one (so chats don't fill it up).
function jot(p, w, text, icon, tag) {
  const d = (p.diary ??= []);
  if (tag && d[0]?.[3] === tag && w.now - d[0][0] < 20 * 60e3) d.shift();
  d.unshift([w.now, text, icon, tag]); if (d.length > 24) d.pop();
}
const BLOCK_NOTE = {
  wake: ['WOKE UP', 'sun'], shower: ['HAD A SHOWER', 'sparkle'], breakfast: ['BREAKFAST', 'coffee'], brunch: ['BRUNCH', 'coffee'], lunch: ['LUNCH', 'plate'],
  lunchout: ['LUNCH OUT', 'noodles'], cook: ['COOKED DINNER', 'fire'], dinner: ['DINNER', 'plate'], eatout: ['DINNER OUT', 'pizza'],
  homework: ['HOMEWORK', 'pencil'], school: ['WENT TO SCHOOL', 'book'], play: ['PLAYED OUTSIDE', 'ball'], 'school-run': ['WALKED THE KIDS TO SCHOOL', 'baby'],
  work: ['WENT TO WORK', 'work'], shop: ['WENT SHOPPING', 'bag'], outing: ['WENT OUT FOR A WALK', 'tree'], hobby: ['HOBBY TIME', 'star'], run: ['WENT FOR A RUN', 'shoe'],
  gym: ['WENT TO THE GYM', 'dumbbell'], bar: ['OUT FOR A DRINK', 'beer'], playground: ['THE PLAYGROUND', 'swing'], bedtime: ['GOT READY FOR BED', 'moon'],
  unpack: ['UNPACKED BOXES', 'house'],
};
const FORCED_NOTE = {
  evac: ['FIRE ALARM: GOT OUT', 'siren'], fight: ['GOT INTO A FIGHT', 'angry'], arrest: ['GOT ARRESTED', 'siren'], patient: ['TAKEN TO HOSPITAL', 'siren'],
  crew: ['CALLED OUT TO A FIRE', 'fire'], call: ['CALLED OUT', 'siren'], police: ['CALLED OUT', 'siren'], ambulance: ['AMBULANCE CALL-OUT', 'siren'],
};
const TOPIC_WORD = { weather: 'THE WEATHER', town: 'THE TOWN', news: 'THE NEWS', fire: 'THE FIRE', crime: 'THE CRIME', weekend: 'THE WEEKEND', building: 'THE BUILDING WORK', smog: 'THE SMOG', movies: 'FILMS' };
// How a conversation went, in the diary. (Time spent talking is what helps their social need, see
// updateLife: conversations run in real seconds, so counting each one would depend on the clock speed.)
// The ones worth remembering always go in: an argument, storming off or being snubbed, gossip, a new
// friend. An ordinary chat, a phone call or a dull one, at most one every 45 minutes.
function talked(city, w, p, c, withIds) {
  if (c.kind === 'greet') return;
  const byId = (id) => city.people.find((q) => q.id === id), others = [...withIds].map(byId).filter(Boolean), names = and(others.map((q) => firstOf(q, city)));
  if (!names && c.kind !== 'phone') return; // (everyone else has gone)
  p.life.talks++;
  if (!p.friends) p.friends = new Set(city.people.filter((q) => q !== p && isFriend(rel(city, p, q))).map((q) => q.id)); // (the ones they had already)
  const fresh = others.filter((q) => !p.friends.has(q.id) && q.hh !== p.hh && isFriend(rel(city, p, q)));
  for (const q of fresh) { p.friends.add(q.id); jot(p, w, `BECAME FRIENDS WITH ${firstOf(q, city)}`, 'heart'); }
  const now = !fresh.length && !(w.now - (p.life.chatAt || 0) < 45 * 60e3); // (room for an everyday one)
  let note = null;
  if (c.kind === 'argue') note = [`ARGUED WITH ${names}`, 'angry'];
  else if (c.fed === p && c.rude) note = [`STORMED OFF FROM ${names}`, 'vein'];
  else if (c.fed && c.fed !== p && c.rude) note = [`${firstOf(c.fed, city)} SNAPPED AND LEFT`, 'broken'];
  else if (c.kind === 'gossip') note = [`GOSSIPED WITH ${names}${c.about ? ` ABOUT ${firstOf(c.about, city)}` : ''}`, 'eye'];
  else if (now && c.kind === 'phone') note = ['A PHONE CALL', 'phone'];
  else if (now && c.fed === p) note = [`GOT BORED OF ${names}`, 'tired'];
  else if (now && !c.fed) note = [`CHATTED WITH ${names} ABOUT ${TOPIC_WORD[c.topic] || c.topic.toUpperCase()}`, TOPICS[c.topic]?.[0] || 'smile'];
  if (note && now) p.life.chatAt = w.now;
  if (c.rude && c.fed !== p) p.needs[3] = clamp(p.needs[3] - 0.03); // (being snubbed stings)
  if (note) jot(p, w, note[0], note[1], `talk:${[...withIds].sort().join(',')}`);
}

// ---------- every half second (the town window only) ----------
let acc = 0, next = 0;
export function updateLife(city, w) {
  acc += w.dtTown;
  if (w.t < next) return;
  next = w.t + 0.5;
  const hrs = acc / 3.6e6; acc = 0;
  const rooms = new Map(); // company: how many people are in each room
  for (const p of city.people) if (p.b && p.anim !== 'sleep') { const k = `${city.lots.indexOf(p.b)}:${p.b.roomAt(p.f, p.x)?.id}`; rooms.set(k, (rooms.get(k) || 0) + 1); }
  for (const p of city.people) {
    const n = (p.needs ??= freshNeeds(p, w)), L = (p.life ??= { day: w.day, min: {}, done: {}, talks: 0, from: w.hour }); // from: when we started keeping track today
    if (L.day !== w.day) { // a new day
      Object.assign(L, { day: w.day, min: {}, done: {}, talks: 0, cheered: false, from: 0 });
      if (birthday(p, city, w)) { jot(p, w, `TURNED ${ageOf(p, city, w)} TODAY`, 'cake'); p.mood = clamp(moodOf(p) + 0.3, -1, 1); }
    }
    if (p.since === undefined && p.newcomer) { p.since = w.day; jot(p, w, `MOVED IN TO ${houseNo(p.home.lot)} MAIN ST`, 'house'); }
    // Needs follow what they're doing.
    let cat = activity(p);
    if (p.kid && p.b?.type === 'school' && w.hour >= 12.25 && w.hour < 12.75) cat = 'eat'; // school dinners
    const R = RATES[cat] || RATES.rest;
    L.min[cat] = (L.min[cat] || 0) + hrs * 60;
    n[0] = clamp(n[0] + (R[0] ?? 1.05 / traits(p).sleepLen) * hrs);
    for (let k = 1; k < 5; k++) n[k] = clamp(n[k] + R[k] * hrs);
    if (p.b && cat !== 'sleep' && rooms.get(`${city.lots.indexOf(p.b)}:${p.b.roomAt(p.f, p.x)?.id}`) > 1) n[3] = clamp(n[3] + 0.03 * hrs); // company
    if (p.convo && p.convo.kind !== 'greet') { const argue = p.convo.kind === 'argue'; n[3] = clamp(n[3] + (argue ? -0.4 : 0.45) * hrs); n[2] = clamp(n[2] + (argue ? -0.3 : 0.1) * hrs); } // talking
    const ill = p.sick ? (p.sick.ward ? 0.15 : 0.35) : 1;
    n[5] = clamp(n[5] + (ill - n[5]) * Math.min(1, hrs * (p.sick ? 0.4 : 0.1)) - (!p.b && (city.pollution || 0) > 0.25 ? 0.03 * city.pollution * hrs : 0));
    const avg = (n[0] + n[1] + n[2] + n[3] + n[4] + n[5]) / 6, low = Math.min(...n);
    p.feel = clamp(0.7 * (avg - 0.55) - (low < 0.12 ? 0.12 : 0), -0.4, 0.15); // (moves their mood, see social.js)
    // The diary: what's changed since last time.
    if (p.blockKey !== p._bk) {
      if (p.blockKey) { const kind = p.blockKey.split('@')[0], note = BLOCK_NOTE[kind]; if (note) jot(p, w, kind === 'work' && workplace(city, p) ? `WENT TO WORK AT ${workplace(city, p)}` : note[0], note[1]); }
      else if (p._bk) jot(p, w, 'FELL ASLEEP', 'zzz');
      p._bk = p.blockKey;
    }
    if (p.forced !== p._fk) {
      const note = FORCED_NOTE[p.forced];
      if (note) jot(p, w, note[0], note[1]);
      if (['crew', 'call', 'police', 'ambulance', 'arrest'].includes(p.forced) && p.job) L.done.callout = (L.done.callout || 0) + 1;
      p._fk = p.forced;
    }
    if (!!p.sick !== !!p._sk) { jot(p, w, p.sick ? (p.sick.ward ? 'HURT: IN HOSPITAL' : `CAME DOWN WITH ${(p.sick.kind || 'A BUG').toUpperCase()}`) : 'FEELING BETTER', p.sick ? 'sick' : 'smile'); p._sk = !!p.sick; }
    if (!!p.jail !== !!p._jk) { jot(p, w, p.jail ? 'LOCKED IN A CELL' : 'LET OUT OF THE CELL', p.jail ? 'siren' : 'sun'); p._jk = !!p.jail; }
    if (p._lc && p.convo !== p._lc) { talked(city, w, p, p._lc, p._lcWith); p._lc = null; }
    if (p.convo) { if (p.convo !== p._lc) { p._lc = p.convo; p._lcWith = new Set(); } for (const q of p.convo.members) if (q !== p) p._lcWith.add(q.id); }
    // A birthday: someone at home makes a fuss over dinner.
    if (!L.cheered && w.hour > 17 && w.hour < 21.5 && p.b && p.anim !== 'sleep' && birthday(p, city, w)) {
      const q = city.people.find((o) => o !== p && o.b === p.b && o.f === p.f && Math.abs(o.x - p.x) < 30 && o.anim !== 'sleep' && !o.convo && (o.hh === p.hh || isFriend(rel(city, o, p))));
      if (q) {
        L.cheered = true;
        say(q, ['party', '#HAPPY', 'cake'], { dur: 2.6, t: w.t }); say(p, ['love', 'cake'], { dur: 2.2, t: w.t + 1.2 });
        jot(p, w, `BIRTHDAY CAKE WITH ${firstOf(q, city)}`, 'cake'); jot(q, w, `SANG HAPPY BIRTHDAY TO ${firstOf(p, city)}`, 'party');
        p.mood = clamp(moodOf(p) + 0.2, -1, 1); n[3] = clamp(n[3] + 0.2);
      }
    }
  }
}

// ---------- the passport card ----------
// Everything the passport shows, as plain data (so another desktop's window can be sent it).
const STATS = { // today's work, from the tasks they finished (see runTask in venues.js)
  cashier: (d) => [['CUSTOMERS SERVED', d.scan], ['SHELVES STOCKED', d.reachHigh], ['FLOORS SWEPT', d.sweep]],
  waiter: (d) => [['ORDERS TAKEN', d.write], ['PLATES SERVED', d.place], ['TABLES WIPED', d.wipe]],
  bartender: (d) => [['DRINKS SERVED', d.place], ['GLASSES POLISHED', d.polish], ['CHATS AT THE BAR', d.talk]],
  chef: (d) => [['DISHES MADE', (d.chop || 0) + (d.cook || 0) + (d.pour || 0)], ['PANS WASHED', d.dishes], ['TASTINGS', d.taste]],
  teacher: (d) => [['LESSONS TAUGHT', (d.teach || 0) + (d.readAloud || 0)], ['BOARD WORK', d.writeBoard], ['KIDS HELPED', d.helpKid], ['BOOKS MARKED', d.mark]],
  doctor: (d) => [['PATIENTS SEEN', d.examine], ['NOTES WRITTEN', d.write], ['CALL-OUTS', d.callout]],
  nurse: (d) => [['PATIENTS CHECKED', d.examine], ['DRIPS CHANGED', d.adjust], ['FORMS FILLED', d.deskwork]],
  officer: (d) => [['REPORTS TYPED', d.type], ['FILES CHECKED', d.read], ['CALL-OUTS', d.callout]],
  firefighter: (d) => [['CALL-OUTS', d.callout], ['ENGINE POLISHED', d.polish], ['GEAR CHECKS', d.adjust]],
  worker: (d) => [['PARTS MADE', (d.operate || 0) + (d.screwStand || 0) + (d.hammerStand || 0)], ['CRATES MOVED', d.crouch], ['LINE CHECKS', d.write]],
  security: (d) => [['VISITORS GREETED', d.wave], ['CAMERA CHECKS', d.monitor], ['PARCELS SORTED', d.place]],
  office: (d, m) => [['EMAILS ANSWERED', Math.floor((m.work || 0) / 7)], ['REPORTS FILED', Math.floor((m.work || 0) / 50)], ['COFFEES', Math.floor((m.rest || 0) / 25)]],
};
const TASK = { work: 'WORK SHIFT', school: 'SCHOOL', homework: 'HOMEWORK', 'school-run': 'SCHOOL RUN', shop: 'SHOPPING', cook: 'COOK DINNER', run: 'GO FOR A RUN', gym: 'GYM', shower: 'SHOWER' };
const TRACKED = { work: 'work', school: 'school', homework: 'study' }; // done = they really spent the time on it
const NOW = { // what someone's doing, in words: act -> [text, icon]
  tv: ['WATCHING TV', 'tv'], game: ['PLAYING GAMES', 'gamepad'], drink: ['HAVING A DRINK', 'beer'], play: ['PLAYING', 'ball'], garden: ['WATERING THE PLANTS', 'flower'],
  shower: ['IN THE SHOWER', 'sparkle'], bath: ['HAVING A BATH', 'sparkle'], toilet: ['IN THE BATHROOM', 'shh'], wash: ['BRUSHING THEIR TEETH', 'sparkle'], dress: ['GETTING DRESSED', 'shoe'],
  cook: ['COOKING', 'fire'], dishes: ['DOING THE DISHES', 'sparkle'], browse: ['SHOPPING', 'bag'], pay: ['PAYING', 'money'], coffee: ['HAVING A COFFEE', 'coffee'],
  balcony: ['ON THE BALCONY', 'sun'], homework: ['DOING HOMEWORK', 'pencil'], learn: ['IN CLASS', 'book'], exercise: ['WORKING OUT', 'dumbbell'],
  exam: ['SEEING THE DOCTOR', 'pill'], waitroom: ['WAITING TO SEE THE DOCTOR', 'clock'], patient: ['IN A HOSPITAL BED', 'pill'], jail: ['IN A CELL', 'siren'],
  fridge: ['RAIDING THE FRIDGE', 'plate'], meet: ['IN A MEETING', 'work'], print: ['AT THE PRINTER', 'work'], rest: ['TAKING A BREAK', 'coffee'],
};
const DEST = { work: 'WORK', school: 'SCHOOL', 'school-run': 'SCHOOL', shop: 'THE SHOPS', bar: 'THE PUB', eatout: 'DINNER', lunchout: 'LUNCH', gym: 'THE GYM', playground: 'THE PLAYGROUND', play: 'THE PLAYGROUND', outing: 'TOWN', clinic: 'THE CLINIC', unpack: 'THE BOXES' };
function nowText(city, p, cat) {
  const s = p.plan[0], act = s?.act || s?.spot?.act, kind = blockKind(p), at = where(city, p), here = at ? (at === 'HOME' ? ' AT HOME' : ` AT ${at}`) : '';
  const c = p.convo;
  if (c && c.kind !== 'greet') {
    const names = and(c.members.filter((q) => q !== p).map((q) => firstOf(q, city)));
    return c.kind === 'phone' ? ['ON THE PHONE', 'phone'] : c.kind === 'argue' ? [`ARGUING WITH ${names}`, 'angry'] : c.kind === 'gossip' ? [`WHISPERING WITH ${names}`, 'eye'] : [`TALKING WITH ${names}`, 'smile'];
  }
  if (FORCED_NOTE[p.forced]) return [{ evac: 'OUTSIDE: FIRE ALARM', fight: 'IN A FIGHT', arrest: 'UNDER ARREST', patient: 'OFF TO HOSPITAL' }[p.forced] || 'ON A CALL-OUT', FORCED_NOTE[p.forced][1]];
  if (kind === 'await-truck') return ['WAITING FOR THE FURNITURE', 'clock'];
  if (kind === 'unpack') return ['UNPACKING', 'house'];
  if (cat === 'sleep') return [p.b?.type === 'fire' ? 'NAPPING AT THE STATION' : `ASLEEP${here}`, 'zzz'];
  if (cat === 'eat') return [`${kind === 'breakfast' ? 'HAVING BREAKFAST' : kind === 'lunch' || kind === 'lunchout' ? 'HAVING LUNCH' : kind === 'dinner' || kind === 'eatout' ? 'HAVING DINNER' : 'EATING'}${here}`, 'plate'];
  if (cat === 'work') return [`WORKING${here}`, 'work'];
  if (cat === 'travel') {
    if (DEST[kind]) return [`${p.inCar ? 'DRIVING' : 'ON THE WAY'} TO ${DEST[kind]}`, p.inCar ? 'car' : 'shoe'];
    if (kind === 'bedtime') return ['OFF TO BED', 'moon'];
    return at === 'HOME' ? ['MOVING ABOUT AT HOME', 'house'] : [`${p.inCar ? 'DRIVING' : 'WALKING'} HOME`, p.inCar ? 'car' : 'shoe'];
  }
  if (cat === 'out') return [kind === 'outing' ? 'OUT FOR A STROLL' : 'AT THE PLAYGROUND', kind === 'outing' ? 'tree' : 'swing'];
  if (cat === 'exercise' && kind === 'run') return ['OUT FOR A RUN', 'shoe'];
  if (s?.t === 'slide' || s?.t === 'climb') return ['ON THE SLIDE', 'swing'];
  if (s?.t === 'queue') return ['IN THE QUEUE', 'clock'];
  if (NOW[act]) return [NOW[act][0] + (['tv', 'drink', 'cook', 'dishes', 'coffee', 'rest'].includes(act) ? here : ''), NOW[act][1]];
  if (cat === 'sick') return [p.sick ? 'ILL' + here : 'AT THE CLINIC', 'thermo'];
  return [`RELAXING${here}`, 'smile'];
}
const word = (v, list) => list[v > 0.75 ? 0 : v > 0.45 ? 1 : v > 0.2 ? 2 : 3];

let version = 0;
export function card(city, w, p) {
  const T = traits(p), [first, last] = nameOf(p, city), kin = kinOf(p, city), hh = housemates(p, city), L = p.life || { min: {}, done: {}, talks: 0 };
  const role = p.kid ? null : roleOf(p, city), age = ageOf(p, city, w), [bm, bd] = md(bornDay(p, city, w)), n = p.needs || freshNeeds(p, w);
  const home = city.lots[p.home.lot], flat = home?.L.T.units === 'whole' ? '' : ` FLAT ${p.home.unit || 'G'}`;
  const hhText = kin === 'single' ? 'LIVES ALONE' : kin === 'couple' ? 'LIVES WITH THEIR PARTNER' : kin === 'roommates' ? `${hh.length} ROOMMATES` : `FAMILY OF ${hh.length}`;
  // The job, or school.
  const school = city.lots.find((b) => b?.type === 'school' && b.ready());
  let job, at = null, shift = null, days = null;
  if (p.kid) { job = school ? 'PUPIL' : 'NO SCHOOL IN TOWN YET'; at = school ? placeName(city, school, 0) : null; }
  else if (role) {
    job = ROLE_TITLE[role] || role.toUpperCase(); at = workplace(city, p);
    const sh = role === 'office' ? [T.officeStart, T.officeStart + 8.5] : SHIFTS[role]?.[(p.job.shift || 0) % SHIFTS[role].length];
    if (sh) shift = `${hhmm(sh[0])}-${hhmm(sh[1])}`;
    days = WEEKDAYS_ONLY.has(role) ? 'MON-FRI' : `OFF ${T.daysOff.slice(0, LONG.has(role) ? 3 : 2).sort((a, b) => a - b).map((d) => DAY_NAMES[d].slice(0, 3)).join(' ')}`;
  } else job = age >= 67 ? 'RETIRED' : 'LOOKING FOR WORK';
  // The calendar: last Sunday (for anything running past midnight) to the end of next week.
  const d0 = w.day - dow(w.day) - 1, cal = [];
  for (let d = d0; d < d0 + 15; d++) {
    const blocks = planFor(p, d, city).map((b) => [Math.round(b.from * 100) / 100, Math.round(b.to * 100) / 100, b.kind]);
    cal.push([DAY_NAMES[dow(d)].slice(0, 3), md(d)[1], MONTHS[md(d)[0]], blocks]);
  }
  const off = p.jail ? 'IN A CELL' : p.sick?.ward ? 'IN HOSPITAL' : p.sick ? 'OFF SICK' : null;
  // Today's to-do list.
  const h = w.hour, today = cal[w.day - d0][3], min = L.min || {};
  const tasks = today.filter(([, , k]) => TASK[k]).map(([from, to, k]) => {
    const len = (to - from) * 60, spent = TRACKED[k] && from >= (L.from || 0) ? (min[TRACKED[k]] || 0) : null; // (only if we saw it all)
    const prog = h < from ? 0 : spent !== null ? clamp(spent / len) : clamp((h - from) / (to - from));
    const state = h >= to ? ((spent !== null && spent < len * 0.25) || (k === 'shop' && p.shoppedDay !== w.day && from >= (L.from || 0)) ? 'missed' : 'done') : h >= from ? 'now' : 'later';
    return [k === 'work' && role ? `WORK: ${ROLE_TITLE[role] || ''}` : TASK[k], state, Math.round(prog * 100) / 100, hhmm(from)];
  });
  const stats = (STATS[role]?.(L.done || {}, min) || []).map(([k, v]) => [k, v || 0]);
  // Hours worked today (worked out from the clock for any part of the shift from before we were keeping track).
  const shifts = today.filter((b) => b[2] === 'work'), sh = role && shifts.length ? (role === 'office' ? [T.officeStart, T.officeStart + 8.5] : SHIFTS[role]?.[(p.job.shift || 0) % SHIFTS[role].length]) : null;
  const shiftLen = sh ? sh[1] - sh[0] : 0, worked = shifts.some((b) => b[0] < (L.from || 0)) && sh ? clamp(h - sh[0], 0, shiftLen) : (min.work || 0) / 60;
  // Who they know: their household, then everyone else they've met, the closest first.
  const byId = new Map(city.people.map((q) => [q.id, q])), seen = new Set([p.id]), rels = [];
  const label = (q, R) => {
    if (q.hh === p.hh) return kin === 'roommates' ? 'ROOMMATE' : kin === 'couple' || (!p.kid && !q.kid) ? 'PARTNER' : p.kid && q.kid ? 'SIBLING' : p.kid ? 'PARENT' : 'CHILD';
    if (R.aff < -0.5) return 'ENEMY'; if (R.aff < -0.2) return 'RIVAL'; if (R.aff < 0) return 'NOT KEEN';
    if (R.aff > 0.75 && R.fam >= 8) return 'BEST FRIEND'; if (isFriend(R)) return 'FRIEND';
    if (p.job && q.job?.lot === p.job.lot) return 'COWORKER'; if (q.home.lot === p.home.lot) return 'NEIGHBOUR';
    return R.fam >= 2 ? 'ACQUAINTANCE' : 'MET ONCE';
  };
  const add = (q) => { if (!q || seen.has(q.id)) return; seen.add(q.id); const R = rel(city, p, q); rels.push([q.id, nameOf(q, city).join(' '), label(q, R), Math.round(R.aff * 100) / 100, R.fam || 0, q.hh === p.hh ? 1 : 0]); };
  hh.forEach(add);
  const others = [];
  for (const [k, R] of city.rels || []) { const [a, b] = k.split(':').map(Number); if (a === p.id || b === p.id) others.push([byId.get(a === p.id ? b : a), R]); }
  for (const q of city.people) if (q.hh !== p.hh && ((p.job && q.job?.lot === p.job.lot) || q.home.lot === p.home.lot)) others.push([q, rel(city, p, q)]);
  others.sort((x, y) => y[1].aff * Math.min(1, (y[1].fam + 1) / 5) - x[1].aff * Math.min(1, (x[1].fam + 1) / 5)).forEach(([q]) => add(q));
  const [now, nowIcon] = nowText(city, p, activity(p));
  return {
    v: ++version, id: p.id, first, last, kid: p.kid, age, born: `${bd} ${MONTHS[bm]}`, bday: birthday(p, city, w), hh: hhText,
    home: home ? `${houseNo(p.home.lot)} MAIN ST${flat}` : 'NO HOME', homeKind: home?.L.T.name.toUpperCase() || '',
    since: p.since !== undefined ? `MOVED IN ${p.since === w.day ? 'TODAY' : `${md(p.since)[1]} ${MONTHS[md(p.since)[0]]}`}` : null,
    job, at, shift, days, now, nowIcon, needs: n.map((v) => Math.round(v * 100) / 100), mood: Math.round(moodOf(p) * 100) / 100,
    traits: traitWords(p), likes: interestsOf(p).map((k) => [INTEREST_WORD[k] || k.toUpperCase(), TOPICS[k]?.[0] || 'star']),
    words: [word(n[0], ['RESTED', 'OK', 'TIRED', 'EXHAUSTED']), word(n[1], ['FULL', 'OK', 'PECKISH', 'STARVING']), word(n[2], ['HAVING FUN', 'OK', 'BORED', 'VERY BORED']),
      word(n[3], ['CONTENT', 'OK', 'LONELY', 'VERY LONELY']), word(n[4], ['CLEAN', 'OK', 'GRUBBY', 'SMELLY']), p.sick ? (p.sick.ward ? 'HURT' : 'ILL') : word(n[5], ['HEALTHY', 'OK', 'POORLY', 'UNWELL'])],
    hour: Math.round(h * 100) / 100, today: w.day - d0, cal, off, workAt: at, tasks, stats, work: role ? [Math.round(Math.min(worked, shiftLen) * 10) / 10, Math.round(shiftLen * 10) / 10] : null,
    grades: p.kid ? ['MATHS', 'READING', 'SCIENCE', 'ART', 'SPORT'].map((s, i) => [s, 'ABBCCD'[Math.floor(dice(p.seed, 40 + i)() * 6)]]) : null,
    time: Object.entries(min).filter(([, m]) => m >= 1).sort((a, b) => b[1] - a[1]).map(([k, m]) => [k, Math.round(m)]), talks: L.talks || 0,
    rels: rels.slice(0, 18), diary: (p.diary || []).map(([t, text, icon]) => { const d = new Date(t); return [Math.floor((t - d.getTimezoneOffset() * 6e4) / 864e5) === w.day ? hhmm(d.getHours() + d.getMinutes() / 60) : DAY_NAMES[(d.getDay() + 6) % 7].slice(0, 3), text, icon]; }),
  };
}
// Hover label in town: just the name.
export const fullName = (p, city) => nameOf(p, city).join(' ');
