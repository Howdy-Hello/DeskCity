// People talking: speech bubbles, conversations, relationships and moods.
//
// Bubbles. A bubble holds a few tokens: pixel icons (a face, a heart, a bowl of noodles, a football,
// a fire...) or short words in the pixel font (HI, BYE, LOL). Styles: 'say' (a speech bubble with a
// tail), 'think' (a cloud with little circles), 'shout' (spiky and red), 'whisper' (dotted and grey)
// and 'phone'. Bubbles fade in and out and stack so they don't cover each other.
//
// Conversations. Two or more people take turns: the speaker says something about the topic (a
// picture or two, maybe a question or an exclamation), the others react (laugh, nod, a heart, a
// thumbs up). Each listener's interest changes with every turn: up if it's one of their interests
// or they like the speaker, down if the speaker goes on and on or they're impatient. Bored people
// check their watch, yawn and say "..."; annoyed ones cross their arms and leave, politely
// ("gotta go") or, with a temper, storming off, and whoever's left feels it. A chatty speaker who
// sees them drifting changes the subject (a light bulb). People who don't get on argue (shouting,
// pointing). Two people who both know a third whisper about them. Someone alone takes a phone call.
// Friends and housemates join a group that's already talking.
//
// Where: passing on the pavement or in a corridor (people who know each other wave; friends stop for
// a chat), waiting for and riding the lift, queueing, the clinic waiting room, sitting together (the
// dinner table, a restaurant table, the bar, the office lunch table, the sofa), the playground,
// kids whispering in class (until the teacher says SHH), the crowd outside a fire alarm. Never in
// the bathroom, asleep, under arrest, or running late.
//
// What about: everyone has three interests (food, work, money, family, sports, games, films, music,
// travel, shopping, health, news, the town, books, pets, love; children: games, school, sports,
// pets, films, food), and the town gives them more: a fire last night, the smog, an arrest, a new
// building going up, the weekend coming; and where they are (food at a restaurant, beer at the pub).
//
// Relationships. Every pair has a liking (-1..1) and a familiarity (how many times they've talked).
// Housemates start close; neighbours and coworkers know each other by sight. Good conversations make
// friends; annoying ones and arguments sour things. Saved with the town.
//
// Moods. Everyone has a mood (-1..1) around their own baseline: a good chat lifts it, being
// annoyed or argued with lowers it. Now and then people think about what's next (dinner, a beer,
// bed, work) or how they feel (tired, ill, the smog, the weekend), in a thought bubble.
import { traits, dice, isWeekend, dow } from './routine.js';
import { textWidth, painter } from './draw.js';

// ---------- icons ----------
const PAL = {
  k: '#1e1e22', w: '#ffffff', y: '#f7c948', o: '#f39c12', r: '#e74c3c', R: '#a93226', p: '#ff8fb1', g: '#2ecc71', G: '#1e8449',
  b: '#3498db', B: '#1f5f9e', c: '#9fd5f5', n: '#8b5a2b', N: '#5d3a1a', l: '#d5d8dc', d: '#7f8c8d', v: '#8e44ad', s: '#f5cba7',
};
const ART = {
  smile: ['.yyyyy.', 'yyyyyyy', 'yykykyy', 'yyyyyyy', 'ykyyyky', 'yykkkyy', '.yyyyy.'],
  laugh: ['.yyyyy.', 'yyyyyyy', 'ykkykky', 'yyyyyyy', 'ykkkkky', 'yykrkyy', '.yyyyy.'],
  sad: ['.yyyyy.', 'yyyyyyy', 'yykykyy', 'yyyyyyc', 'yykkkyc', 'ykyyyky', '.yyyyy.'],
  angry: ['.rrrrr.', 'rkrrrkr', 'rrkrkrr', 'rrrrrrr', 'rrkkkrr', 'rkrrrkr', '.rrrrr.'],
  annoyed: ['.yyyyy.', 'yyyyyyy', 'ykkykky', 'yyyyyyy', 'yyyyyyy', 'yykkkky', '.yyyyy.'],
  surprised: ['.yyyyy.', 'ykyyyky', 'yyyyyyy', 'yyykyyy', 'yykykyy', 'yyykyyy', '.yyyyy.'],
  tired: ['.yyyyy.', 'yyyyyyy', 'ykkykky', 'yyyyyyy', 'yyykyyy', 'yyyyyyy', '.yyyyy.'],
  sick: ['.ggggg.', 'ggggggg', 'gkgggkg', 'ggggggg', 'gglllgg', 'glllllg', '.ggggg.'],
  masked: ['.yyyyy.', 'yyyyyyy', 'yykykyy', 'lllllll', 'lllllll', 'ylllllv', '.yyyyy.'],
  love: ['.yyyyy.', 'yyyyyyy', 'yryyyry', 'yyyyyyy', 'ykyyyky', 'yykkkyy', '.yyyyy.'],
  cool: ['.yyyyy.', 'yyyyyyy', 'kkkkkkk', 'ykkykky', 'yyyyyyy', 'yykkkky', '.yyyyy.'],
  heart: [['.rr.rr.', 'rrrrrrr', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], ['.......', '..r.r..', '.rrrrr.', '.rrrrr.', '..rrr..', '...r...', '.......']],
  broken: ['.rr.rr.', 'rrr.rrr', 'rrr.rr.', 'rrrr.rr', '.rr.rr.', '..r.r..', '...r...'],
  wave: ['.y.y.y.', '.y.y.y.', 'yyyyyy.', 'yyyyyyy', '.yyyyy.', '..yyy..', '.......'],
  up: ['...y...', '..yy...', '..yy...', 'kyyyyy.', 'kyyyyy.', 'kyyyyy.', '.kkkkk.'],
  down: ['.kkkkk.', 'kyyyyy.', 'kyyyyy.', 'kyyyyy.', '..yy...', '..yy...', '...y...'],
  question: ['..kkk..', '.k...k.', '.....k.', '...kk..', '...k...', '.......', '...k...'],
  exclaim: ['...r...', '...r...', '...r...', '...r...', '...r...', '.......', '...r...'],
  sweat: ['...c...', '..ccc..', '.ccccc.', '.ccwcc.', '.ccccc.', '..ccc..', '.......'],
  vein: [['rr...rr', 'r.....r', '.......', '.......', '.......', 'r.....r', 'rr...rr'], ['.......', '.rr.rr.', '.r...r.', '.......', '.r...r.', '.rr.rr.', '.......']],
  sparkle: ['...y...', '...y...', '..yyy..', 'yyywyyy', '..yyy..', '...y...', '...y...'],
  star: ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', '.y...y.'],
  idea: ['..yyy..', '.yyyyy.', '.yywyy.', '.yyyyy.', '..yyy..', '..ddd..', '..ddd..'],
  check: ['......g', '.....gg', 'g...gg.', 'gg.gg..', '.ggg...', '..g....', '.......'],
  cross: ['r.....r', '.r...r.', '..r.r..', '...r...', '..r.r..', '.r...r.', 'r.....r'],
  zzz: [['kkkk...', '...k...', '..k....', 'kkkk...', '....kkk', '.....k.', '....kkk'], ['.......', 'kkkk...', '..k....', 'kkkk...', '.....kk', '....k..', '....kk.']],
  note: [['...kk..', '...k.k.', '...k..k', '...k...', '.kkk...', 'kkkk...', '.kk....'], ['..kk...', '..k.k..', '..k..k.', '..k....', 'kkk....', 'kkk....', '.k.....']],
  sun: ['y..y..y', '.y.y.y.', '..yyy..', 'yyyyyyy', '..yyy..', '.y.y.y.', 'y..y..y'],
  rain: ['..lll..', '.lllll.', 'lllllll', '.lllll.', '.b.b.b.', 'b.b.b..', '.......'],
  umbrella: ['..bbb..', '.bbbbb.', 'bbbbbbb', '...k...', '...k...', '.k.k...', '..k....'],
  moon: ['..yyy..', '.yy....', 'yy.....', 'yy.....', 'yy.....', '.yy....', '..yyy..'],
  coffee: ['..w.w..', '.w.w...', 'lllllll', 'lnnnnll', 'lnnnnl.l', 'llllll.', '.llll..'],
  beer: ['.wwww..', '.oooo..', '.ooookk', '.owoo.k', '.ooookk', '.oooo..', '.llll..'],
  cheers: ['ww..ww.', 'oo..oo.', 'ooo.ooo', 'oooyooo', '.oo.oo.', '.ll.ll.', '.......'],
  noodles: ['.d.d.d.', '..d.d..', 'yyyyyyy', 'ryyyyyr', 'rrrrrrr', '.rrrrr.', '..rrr..'],
  bao: ['...d...', '..dwd..', '.dwdwd.', 'dwwwwwd', 'dwwwwwd', '.ddddd.', '.......'],
  pizza: ['ooooooo', '.ryyry.', '..yyy..', '..yry..', '...y...', '...y...', '.......'],
  cake: ['...r...', '...y...', '.wwwww.', '.ppppp.', '.wwwww.', '.ppppp.', '.......'],
  plate: ['.......', '.......', '..rgo..', 'lllllll', '.ddddd.', '.......', '.......'],
  work: ['..nnn..', '..n.n..', 'NNNNNNN', 'nnnnnnn', 'nnnynnn', 'nnnnnnn', 'NNNNNNN'],
  laptop: ['.ddddd.', '.dbbbd.', '.dbbbd.', '.ddddd.', 'ddddddd', 'lllllll', '.......'],
  money: ['...g...', '.ggggg.', 'gg.g...', '.ggggg.', '...g.gg', '.ggggg.', '...g...'],
  chartup: ['......g', '.....g.', '..g.g..', '.g.g...', 'g......', 'kkkkkkk', '.......'],
  chartdown: ['r......', '.r.....', '..r.r..', '...r.r.', '......r', 'kkkkkkk', '.......'],
  house: ['...r...', '..rrr..', '.rrrrr.', 'rrrrrrr', '.yyyyy.', '.ybyny.', '.yyyny.'],
  tv: ['.k...k.', '..k.k..', 'ddddddd', 'dbbbbbd', 'dbbbbbd', 'ddddddd', '.d...d.'],
  bed: ['.......', 'n......', 'nwwbbbb', 'nbbbbbb', 'nnnnnnn', 'n.....n', '.......'],
  baby: ['..yyy..', '.yyyyy.', '.ykyky.', '.yyyyy.', '..ppp..', '.ppppp.', '..p.p..'],
  person: ['..kkk..', '.k...k.', '.k...k.', '..kkk..', '...k...', '.kkkkk.', '...k...'],
  dog: ['n......', 'nnn....', 'nkn...n', '.nnnnnn', '..nnnnn', '..n...n', '..n...n'],
  cat: ['d...d..', 'dd.dd..', 'ddddd..', 'dkdkd.d', 'ddddd.d', '.ddddd.', '.d..d..'],
  ball: ['.kkkkk.', 'kwwkwwk', 'kwkkkwk', 'kkwwwkk', 'kwkkkwk', 'kwwkwwk', '.kkkkk.'],
  shoe: ['.......', '...b...', '..bbb..', '.bbbbb.', 'bbbbbbb', 'kkkkkkk', '.......'],
  dumbbell: ['.......', 'dd...dd', 'dd...dd', 'ddddddd', 'dd...dd', 'dd...dd', '.......'],
  gamepad: ['.......', '.ddddd.', 'ddkdddd', 'dkkkdrd', 'ddkddgd', '.ddddd.', '.......'],
  film: ['kwkwkwk', 'kkkkkkk', 'wwwwwww', 'wkkkkkw', 'wkkkkkw', 'wwwwwww', '.......'],
  plane: ['...b...', '...b...', '.bbbbb.', 'bbbbbbb', '...b...', '..bbb..', '.......'],
  car: ['.......', '..rrr..', '.rcrcr.', 'rrrrrrr', 'rrrrrrr', '.k...k.', '.......'],
  bag: ['..k.k..', '.k...k.', 'ppppppp', 'ppppppp', 'ppppppp', 'ppppppp', '.......'],
  pill: ['.......', '..rrww.', '.rrrwww', '.rrrwww', '..rrww.', '.......', '.......'],
  thermo: ['...l...', '..lrl..', '..lrl..', '..lrl..', '..lrl..', '.rrrrr.', '..rrr..'],
  news: ['lllllll', 'lkklkkl', 'lllllll', 'lkkkkkl', 'lllllll', 'lkkkkkl', 'lllllll'],
  phone: ['.kkkk..', '.kbbk..', '.kbbk..', '.kbbk..', '.kbbk..', '.kkkk..', '.......'],
  book: ['bbb.rrr', 'bwb.rwr', 'bwb.rwr', 'bwb.rwr', 'bbbkrrr', '...k...', '.......'],
  pencil: ['.....pk', '....yp.', '...yy..', '..yy...', '.yy....', 'nk.....', 'k......'],
  fire: [['...r...', '..rr...', '.rrorr.', '.rooor.', 'rroyorr', 'rooyoor', '.rrrrr.'], ['....r..', '...rr..', '.rrorr.', '.rooor.', 'rroyorr', 'rooyoor', '.rrrrr.']],
  factory: ['.d.....', 'dd.d...', 'd.dd...', '.n..n..', '.n..n..', 'nnnnnnn', 'nwnwnwn'],
  siren: [['.......', '..rbb..', '.rrbbb.', '.rrbbb.', 'ddddddd', '.......', '.......'], ['.......', '..bbr..', '.bbbrr.', '.bbbrr.', 'ddddddd', '.......', '.......']],
  tree: ['..ggg..', '.ggggg.', 'ggggggg', '.ggggg.', '...n...', '...n...', '..nnn..'],
  flower: ['..p.p..', '...y...', '..p.p..', '...g...', '.g.g...', '..gg...', '...g...'],
  ring: ['...c...', '..ccc..', '.k...k.', 'k.....k', 'k.....k', '.k...k.', '..kkk..'],
  eye: ['.......', '..kkk..', '.kwwwk.', 'kwwkwwk', '.kwwwk.', '..kkk..', '.......'],
  clock: ['..kkk..', '.kwwwk.', 'kwwkwwk', 'kwwkkwk', 'kwwwwwk', '.kwwwk.', '..kkk..'],
  calendar: ['.r...r.', 'rrrrrrr', 'wwwwwww', 'wkwkwkw', 'wwwwwww', 'wkwkwkw', 'wwwwwww'],
  party: ['y..p..b', '..r..g.', '.o.....', 'oo..y..', 'ooo...p', 'oooo.r.', '.......'],
  hardhat: ['.......', '..yyy..', '.yyyyy.', 'yyyyyyy', 'kkkkkkk', '.......', '.......'],
  swing: ['ddddddd', 'd.....d', 'd.k.k.d', 'd.k.k.d', 'd.rrr.d', 'd.....d', 'd.....d'],
  bike: ['.......', '....kk.', '..kk.k.', '.k.kk..', 'kkk.kkk', 'k.k.k.k', 'kkk.kkk'],
  shh: ['...y...', '..yy...', '..yy...', '.yyyy..', '.yyyy..', '..yy...', '.......'],
};
// Drawn once into little images (two frames for the animated ones).
const iconCache = new Map();
export function iconImage(name, frame) {
  const art = ART[name];
  if (!art) return null;
  const frames = Array.isArray(art[0]) ? art : [art], rows = frames[frame % frames.length], key = `${name}:${frame % frames.length}`;
  if (!iconCache.has(key)) {
    const w = Math.max(...rows.map((r) => r.length)), cv = document.createElement('canvas'); cv.width = w; cv.height = rows.length;
    const g = cv.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(x, y, 1, 1); } }));
    iconCache.set(key, cv);
  }
  return iconCache.get(key);
}
export const ICON_NAMES = Object.keys(ART);

// ---------- bubbles ----------
// p.bubble = { style, tokens, t0, dur }. Tokens: icon names, or '#WORD' for a word in the pixel font.
export function say(p, tokens, opts = {}) {
  if (!p || !tokens?.length) return;
  p.bubble = { id: ++bubbleId, style: opts.style || 'say', tokens: tokens.slice(0, 4), t0: opts.t ?? lastT, dur: opts.dur ?? 2.4 };
}
const tokenWidth = (tk) => (tk.startsWith('#') ? textWidth(tk.slice(1)) : iconImage(tk, 0)?.width ?? 0);
const STYLE = {
  say: { fill: '#ffffff', edge: '#2c2c34' }, think: { fill: '#f4f6fb', edge: '#7f8794' },
  shout: { fill: '#fff4f0', edge: '#c0392b' }, whisper: { fill: '#eceef2', edge: '#9aa0a8' }, phone: { fill: '#eef7ff', edge: '#2e6da4' },
};
let lastT = 0, bubbleId = 0;
export const bubbleNow = () => lastT;
const talking = (p, t) => p.bubble && t - p.bubble.t0 < p.bubble.dur;
// Every bubble for people drawn this frame, placed so they don't cover each other.
export function drawBubbles(ctx, people, t) {
  lastT = t;
  const list = [];
  for (const p of people) {
    const bb = p.bubble;
    if (!bb) continue;
    const age = t - bb.t0;
    if (age > bb.dur || age < 0) { if (age > bb.dur) p.bubble = null; continue; }
    if (p.headT !== t) continue; // not drawn this frame (off screen, in a car, hidden)
    const w = bb.tokens.reduce((s, tk) => s + tokenWidth(tk), 0) + (bb.tokens.length - 1) * 2 + 6, h = 11;
    list.push({ p, bb, w, h, x: Math.round(p.headX - w / 2), y: Math.round(p.headY - 5 - h), age });
  }
  list.sort((a, b) => b.y - a.y);
  const placed = [];
  for (const it of list) {
    for (let k = 0; k < 4 && placed.some((o) => it.x < o.x + o.w + 1 && it.x + it.w + 1 > o.x && it.y < o.y + o.h + 1 && it.y + it.h + 1 > o.y); k++) it.y -= it.h + 2;
    placed.push(it);
    drawBubble(ctx, it, t);
  }
}
function drawBubble(ctx, { p, bb, w, h, x, y, age }, t) {
  const S = STYLE[bb.style] || STYLE.say, a = Math.min(1, age / 0.15, (bb.dur - age) / 0.3), alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * Math.max(0, a);
  const px = (xx, yy, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(xx, yy, ww, hh); };
  // body with rounded corners
  px(x + 1, y, w - 2, h, S.edge); px(x, y + 1, w, h - 2, S.edge);
  px(x + 1, y + 1, w - 2, h - 2, S.fill);
  if (bb.style === 'whisper') for (let k = x + 1; k < x + w - 1; k += 2) { px(k, y, 1, 1, S.fill); px(k, y + h - 1, 1, 1, S.fill); } // dotted edge
  if (bb.style === 'shout') { px(x - 1, y - 1, 2, 2, S.edge); px(x + w - 1, y - 1, 2, 2, S.edge); px(x - 1, y + h - 1, 2, 2, S.edge); px(x + w - 1, y + h - 1, 2, 2, S.edge); px(x + Math.round(w / 2), y - 2, 1, 2, S.edge); } // spikes
  // the tail, down to the speaker's head (a trail of little circles for a thought)
  const hx = Math.round(p.headX), hy = Math.round(p.headY) - 4, tx = Math.max(x + 2, Math.min(x + w - 3, hx));
  if (bb.style === 'think') { px(tx, y + h + 1, 2, 2, S.edge); if (hy - (y + h + 3) > 1) px(hx, hy - 1, 1, 1, S.edge); }
  else {
    px(tx, y + h - 1, 2, 1, S.fill); px(tx, y + h, 2, 1, S.fill); px(tx - 1, y + h, 1, 1, S.edge); px(tx + 2, y + h - 1, 1, 2, S.edge);
    px(tx + (hx >= tx ? 1 : 0), y + h + 1, 1, 1, S.edge);
    if (hy > y + h + 2) for (let yy = y + h + 2; yy < hy; yy++) px(tx + (hx >= tx ? 1 : 0), yy, 1, 1, S.edge); // a longer tail when lifted out of the way
  }
  // the tokens
  let cx = x + 3;
  const frame = Math.floor(t * 2.5);
  for (const tk of bb.tokens) {
    if (tk.startsWith('#')) { painter(ctx).text(tk.slice(1), cx, y + 3, bb.style === 'shout' ? '#c0392b' : '#1e1e22'); cx += textWidth(tk.slice(1)) + 2; continue; }
    const img = iconImage(tk, frame);
    if (img) { ctx.drawImage(img, cx, y + 2 + Math.floor((7 - img.height) / 2)); cx += img.width + 2; }
  }
  ctx.globalAlpha = alpha;
}

// ---------- relationships ----------
const pairKey = (a, b) => (a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`);
// How two people feel about each other: { aff (-1..1), fam (times they've talked) }.
export function rel(city, a, b) {
  const k = pairKey(a, b), r = city.rels.get(k);
  if (r) return r;
  if (a.hh === b.hh) return { aff: 0.7, fam: 30 }; // family, housemates
  const work = a.job && b.job && a.job.lot === b.job.lot, home = a.home.lot === b.home.lot;
  return { aff: 0.05 + (work ? 0.1 : 0), fam: work || home ? 2 : 0 }; // coworkers and neighbours know each other by sight
}
function bond(city, a, b, dAff, t) {
  const r = { ...rel(city, a, b) };
  r.aff = Math.max(-1, Math.min(1, r.aff + dAff)); r.fam = (r.fam || 0) + 1; r.last = t;
  city.rels.set(pairKey(a, b), r);
  return r;
}
export const isFriend = (r) => r.aff > 0.5 && r.fam >= 4;

// ---------- topics ----------
const INTERESTS = ['food', 'work', 'money', 'family', 'sports', 'games', 'movies', 'music', 'travel', 'shopping', 'health', 'news', 'town', 'books', 'pets', 'love'];
const KID_INTERESTS = ['games', 'school', 'sports', 'pets', 'movies', 'food'];
export const TOPICS = {
  weather: ['sun', 'rain', 'umbrella', 'sun', 'moon'], food: ['noodles', 'bao', 'pizza', 'cake', 'coffee'], work: ['work', 'laptop', 'chartup', 'chartdown', 'clock'],
  money: ['money', 'chartup', 'chartdown', 'bag'], family: ['baby', 'heart', 'house', 'person'], sports: ['ball', 'shoe', 'dumbbell', 'star'],
  games: ['gamepad', 'star', 'laptop'], movies: ['film', 'tv', 'star'], music: ['note', 'star'], travel: ['plane', 'car', 'sun'],
  shopping: ['bag', 'money', 'star'], health: ['pill', 'thermo', 'shoe'], news: ['news', 'tv', 'eye'], town: ['house', 'hardhat', 'tree', 'car'],
  books: ['book', 'star'], pets: ['dog', 'cat', 'heart'], love: ['heart', 'ring', 'flower'], school: ['pencil', 'book', 'star', 'question'],
  beer: ['beer', 'cheers', 'note'], fire: ['fire', 'surprised', 'sweat'], smog: ['factory', 'masked', 'sick'], crime: ['siren', 'eye', 'surprised'],
  weekend: ['calendar', 'party', 'sun'], building: ['hardhat', 'house', 'star'], gossip: ['eye', 'person', 'exclaim'], tv: ['tv', 'film', 'laugh'],
};
export function interestsOf(p) {
  const T = traits(p);
  if (!T.interests) { const r = dice(p.seed, 0, 77), list = p.kid ? KID_INTERESTS : INTERESTS; T.interests = []; while (T.interests.length < 3) { const k = list[Math.floor(r() * list.length)]; if (!T.interests.includes(k)) T.interests.push(k); } }
  return T.interests;
}
// What there is to talk about here and now, as [topic, weight] (the weights favour what's going on).
function topicsFor(city, w, members, place) {
  const list = [['weather', 1]];
  for (const p of members) for (const k of interestsOf(p)) list.push([k, 2]);
  if (place === 'pub') list.push(['beer', 4], ['sports', 2], ['music', 2]);
  if (place === 'food') list.push(['food', 4]);
  if (place === 'work') list.push(['work', 3], ['money', 1]);
  if (place === 'school' || place === 'playground') list.push(['school', 3], ['games', 2]);
  if (place === 'sofa') list.push(['tv', 4], ['movies', 2]);
  if (place === 'fire') list.push(['fire', 12]);
  if (city.lots.some((b) => b?.fire) || city.lastFire > w.now - 8 * 3600e3) list.push(['fire', 4]);
  if ((city.pollution || 0) > 0.25) list.push(['smog', 3 + 6 * city.pollution]);
  if (city.crimes.length) list.push(['crime', 3]);
  if (city.lots.some((b) => b?.build || b?.upgrade)) list.push(['building', 2]);
  const d = dow(w.day);
  if (d === 4 && w.hour > 15 || d >= 5) list.push(['weekend', 3]);
  return list;
}
const pickWeighted = (list, r = Math.random) => { const total = list.reduce((s, [, k]) => s + k, 0); let x = r() * total; for (const [v, k] of list) { if ((x -= k) <= 0) return v; } return list[0][0]; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const likes = (p, topic) => interestsOf(p).includes(topic) || (topic === 'weather' && Math.random() < 0.3) || ['fire', 'crime', 'smog', 'gossip', 'weekend'].includes(topic);

// ---------- personalities ----------
function persona(p) {
  const T = traits(p);
  if (T.talkative === undefined) {
    const r = dice(p.seed, 0, 78);
    T.talkative = p.kid ? 0.5 + r() * 0.5 : (r() + r()) / 2; // how much they like a chat
    T.patience = 0.25 + r() * 0.75;                        // how long before they've had enough
    T.cheerful = (r() - 0.4) * 0.8;                         // their usual mood
  }
  return T;
}
export const moodOf = (p) => (p.mood ?? persona(p).cheerful);

// ---------- conversations ----------
// c = { kind: 'chat' | 'argue' | 'gossip' | 'phone' | 'greet', members, topic, place, turns, maxTurns, next, speaker, streak, interest: Map, standing, about }
const MIN_GAP = { greet: 0, chat: 3, argue: 3, gossip: 3, phone: 2 };
function available(p, w) {
  if (p.convo || p.forced && p.forced !== 'evac' || p.aboard || p.inCar || p.jail || p.rush && p.v > 0 || p.cuffed) return false; // (running late: no time to talk)
  if (p.surface === 'air' || p.surface === 'climb' || p.anim === 'sleep' || p.anim === 'stairs') return false;
  if ((p.socialNext || 0) > w.t) return false;
  const s = p.plan[0], act = s?.act || s?.spot?.act;
  if (['toilet', 'shower', 'bath', 'wash', 'sleep', 'nap', 'patient', 'jail', 'exam', 'exercise'].includes(act)) return false;
  if (p.b && p.b.roomAt(p.f, p.x)?.kind === 'washroom') return false;
  if (s && !['walk', 'do', 'meal', 'hold', 'staff', 'queue', 'turn', 'elev', 'chat', 'slide'].includes(s.t) || s?.t === 'slide' && s.i) return false; // (kids queueing for the slide chat too)
  if (s?.t === 'staff' && !['waiter', 'bartender', 'cashier', 'firefighter', 'officer', 'nurse', 'worker', 'security'].includes(s.role)) return false;
  return true;
}
const seated = (p) => !!p.hip || p.surface === 'elev' || ['do', 'meal', 'staff', 'hold', 'queue', 'turn'].includes(p.plan[0]?.t) && !(p.v > 0);
// What kind of place two people are in, for the topic and how likely they are to talk.
function placeOf(p) {
  const b = p.b, r = b?.roomAt(p.f, p.x);
  if (p.forced === 'evac') return 'fire';
  if (!b) return 'street';
  if (r?.kind === 'pub') return 'pub';
  if (r && ['diner', 'cafe'].includes(r.kind)) return 'food';
  if (r?.kind === 'classroom') return 'school';
  if (r?.kind === 'playground') return 'playground';
  if (p.surface === 'elev' || p.plan[0]?.t === 'elev') return 'lift';
  if (b.type === 'office' || p.plan[0]?.t === 'staff') return 'work';
  if (r?.kind === 'living' && p.anim === 'tv') return 'sofa';
  if (r?.kind === 'kitchen') return 'kitchen';
  if (r?.kind === 'er') return 'clinic';
  return 'home';
}
const PLACE_CHANCE = { pub: 3, food: 2.5, kitchen: 2, sofa: 1.2, lift: 0.2, clinic: 1.2, playground: 3, school: 0.35, work: 0.35, home: 1.4, street: 1, fire: 3 };

function start(city, w, kind, members, opts = {}) {
  const c = { kind, members, place: opts.place || placeOf(members[0]), turns: 0, next: w.t + 0.3, speaker: members[0], streak: 0, interest: new Map(), standing: !!opts.standing, about: opts.about || null };
  c.topic = kind === 'gossip' ? 'gossip' : pickWeighted(topicsFor(city, w, members, c.place));
  c.maxTurns = kind === 'greet' ? 1 : kind === 'argue' ? 4 + Math.floor(Math.random() * 4) : kind === 'phone' ? 4 + Math.floor(Math.random() * 6) : 5 + Math.floor(Math.random() * 9);
  for (const p of members) {
    const others = members.filter((q) => q !== p), aff = others.length ? others.reduce((s, q) => s + rel(city, p, q).aff, 0) / others.length : 0.3;
    const again = others.some((q) => w.t - (rel(city, p, q).last ?? -1e9) < 150); // you again?
    c.interest.set(p, Math.max(0.3, Math.min(0.95, 0.5 + 0.3 * aff + 0.15 * persona(p).talkative - (again ? 0.25 : 0))));
    p.convo = c;
  }
  if (c.standing) for (const p of members) if (p.plan[0]?.t !== 'chat') p.plan.unshift({ t: 'chat', convo: c });
  city.convos.push(c);
  return c;
}
function end(city, c, w) {
  if (c.ended) return;
  c.ended = true;
  for (const p of c.members) {
    if (p.convo === c) p.convo = null;
    p.talkAnim = null;
    p.socialNext = w.t + (10 + 40 * (1 - persona(p).talkative)) * (0.7 + Math.random() * 0.6);
  }
  if (c.kind === 'greet' || c.kind === 'phone') return;
  // How it went: a good chat makes friends; annoying someone or arguing sours things.
  for (const p of c.members) for (const q of c.members) {
    if (p.id >= q.id) continue;
    const ip = c.interest.get(p) ?? 0.5, iq = c.interest.get(q) ?? 0.5;
    const d = c.kind === 'argue' ? -0.2 : (Math.min(ip, iq) - 0.4) * 0.25 + (c.rude ? -0.15 : 0);
    bond(city, p, q, d, w.t);
  }
  for (const p of c.members) p.mood = Math.max(-1, Math.min(1, moodOf(p) + (c.kind === 'argue' ? -0.25 : ((c.interest.get(p) ?? 0.5) - 0.45) * 0.4)));
}

// One turn: the speaker says something, the others react; interest goes up or down.
function turn(city, c, w) {
  const S = c.speaker, others = c.members.filter((q) => q !== S), r = Math.random();
  const style = c.kind === 'argue' ? 'shout' : c.kind === 'gossip' ? 'whisper' : c.kind === 'phone' ? 'phone' : 'say';
  let tokens;
  if (c.kind === 'greet') {
    const R = rel(city, S, others[0]);
    tokens = isFriend(R) ? ['wave', '#HEY'] : R.fam > 3 ? ['wave'] : R.fam >= 2 ? ['smile'] : [pick(['smile', '#HI', 'sun'])];
    say(S, tokens, { style, dur: 1.8, t: w.t });
    if (others[0] && Math.random() < 0.7) say(others[0], isFriend(R) ? ['wave', 'smile'] : ['smile'], { dur: 1.6, t: w.t + 0.5 });
    return;
  }
  if (c.turns === 0) { // openers
    tokens = c.kind === 'phone' ? ['phone', '#HI'] : c.kind === 'argue' ? ['angry', 'exclaim'] : c.kind === 'gossip' ? ['#PSST', 'eye'] : rel(city, S, others[0]).fam > 3 ? ['#HEY', 'smile'] : ['#HI'];
  } else if (c.kind === 'argue') {
    tokens = [pick(['vein', 'angry', 'exclaim', 'down', '#NO', '#WHAT']), pick([...TOPICS[c.topic], 'cross', 'down'])];
  } else {
    const t1 = pick(TOPICS[c.topic] || TOPICS.weather), extra = r < 0.25 ? 'question' : r < 0.42 ? 'exclaim' : r < 0.55 ? (moodOf(S) > 0 ? 'smile' : 'sad') : r < 0.62 ? 'laugh' : null;
    tokens = [t1];
    if (Math.random() < 0.4) { const t2 = pick(TOPICS[c.topic] || TOPICS.weather); if (t2 !== t1) tokens.push(t2); }
    if (extra) tokens.push(extra);
  }
  say(S, tokens, { style, dur: 1.8 + Math.random() * 1.2, t: w.t });
  S.talkAnim = c.kind === 'argue' ? 'point' : c.kind === 'phone' ? 'call' : 'talk';
  if (c.kind === 'phone') return;
  // The listeners: interest up or down, and a reaction.
  for (const L of others) {
    const P = persona(L), R = rel(city, L, S);
    let i = c.interest.get(L) ?? 0.5;
    if (c.kind === 'argue') { i -= 0.08; c.interest.set(L, i); L.talkAnim = Math.random() < 0.5 ? 'hips' : 'point'; if (Math.random() < 0.5) say(L, [pick(['angry', 'vein', '#NO', 'cross'])], { style: 'shout', dur: 1.4, t: w.t + 0.9 }); continue; }
    i += -0.05 - 0.1 * (1 - P.patience) + (likes(L, c.topic) ? 0.08 : -0.03) - 0.07 * Math.max(0, c.streak - 1) + 0.05 * R.aff + (Math.random() - 0.5) * 0.1;
    c.interest.set(L, i);
    let react = null;
    if (i > 0.5) { react = Math.random() < 0.55 ? pick(R.aff > 0.5 && !L.kid && Math.random() < 0.3 ? ['heart', 'love'] : ['laugh', 'smile', 'up', '#LOL', '#WOW', 'surprised', 'star']) : null; L.talkAnim = react === 'laugh' || react === '#LOL' ? 'laugh' : 'nod'; }
    else if (i > 0.27) { react = Math.random() < 0.45 ? pick(['#...', 'tired', 'clock', '#OK', 'question']) : null; L.talkAnim = pick(['watch', 'look', 'yawn', 'attend']); }
    else { react = pick(['annoyed', '#MEH', 'vein', 'sweat']); L.talkAnim = 'wait'; } // arms crossed, foot tapping
    if (react) say(L, [react], { dur: 1.3 + Math.random() * 0.6, t: w.t + 0.8 + Math.random() * 0.5 });
  }
  if (c.kind !== 'gossip') c.interest.set(S, Math.min(1, (c.interest.get(S) ?? 0.5) + 0.03));
}

// Who goes next: mostly turn and turn about, the chatty more often, sometimes on and on.
function nextSpeaker(c) {
  const prev = c.speaker, others = c.members.filter((q) => q !== prev);
  if (!others.length) return prev;
  const keep = persona(prev).talkative * 0.35;
  if (Math.random() < keep) { c.streak++; return prev; }
  c.streak = 0;
  return others.reduce((a, q) => (persona(q).talkative + Math.random() * 0.4 > persona(a).talkative + Math.random() * 0.4 ? q : a));
}

function tick(city, c, w) {
  // Someone's been pulled away (their plans changed, they got up, the lift came): wrap up.
  const gone = c.members.find((p) => !city.people.includes(p) || p.aboard || p.inCar || p.anim === 'sleep' || (c.standing ? p.plan[0]?.t !== 'chat' : !stillHere(p, c)));
  if (gone) {
    if (c.kind !== 'greet' && c.turns > 0 && city.people.includes(gone) && !gone.aboard && c.members.some((q) => q.hh !== gone.hh)) say(gone, [pick(['clock', 'wave']), '#BYE'], { dur: 1.6, t: w.t });
    return end(city, c, w);
  }
  if (c.members.length > 1 && c.kind !== 'phone') { // too far apart now?
    const [a, b] = c.members;
    if (a.b !== b.b || a.f !== b.f || Math.abs(a.x - b.x) > 30) return end(city, c, w);
  }
  if (w.t < c.next) return;
  if (c.place === 'school' && c.turns >= 2) { // whispering in class: the teacher notices
    const S = c.members[0], teacher = city.people.find((q) => q.b === S.b && q.f === S.f && q.plan[0]?.t === 'staff' && q.plan[0].role === 'teacher');
    if (teacher && Math.random() < 0.5) {
      say(teacher, ['#SHH'], { style: 'shout', dur: 1.8, t: w.t }); teacher.dir = Math.sign(S.x - teacher.x) || teacher.dir;
      for (const q of c.members) say(q, [pick(['sweat', 'surprised'])], { dur: 1.4, t: w.t + 0.6 });
      return end(city, c, w);
    }
  }
  // Somebody's had enough: they leave, politely or not.
  const fed = c.kind !== 'greet' && c.kind !== 'phone' && c.members.find((p) => (c.interest.get(p) ?? 1) < 0.2);
  if (fed) {
    const rude = persona(fed).patience < 0.5 && (traits(fed).temper || (c.interest.get(fed) ?? 0) < 0.14 || moodOf(fed) < -0.2) || c.kind === 'argue';
    say(fed, rude ? [pick(['vein', 'angry']), pick(['#BYE', '#UGH', '#NO'])] : [pick(['clock', 'sweat']), '#BYE'], { style: rude ? 'shout' : 'say', dur: 1.8, t: w.t });
    fed.talkAnim = rude ? 'hips' : 'wave';
    for (const q of c.members) if (q !== fed) { say(q, [rude ? pick(['sad', 'surprised', 'broken', 'angry']) : pick(['wave', 'smile', '#OK'])], { dur: 1.5, t: w.t + 0.7 }); q.mood = moodOf(q) - (rude ? 0.15 : 0.02); }
    c.rude = rude; c.fed = fed;
    if (c.members.length > 2) { // the rest carry on without them
      c.members = c.members.filter((q) => q !== fed); fed.convo = null; fed.talkAnim = null; fed.socialNext = w.t + 40;
      if (c.standing) fed.plan = fed.plan.filter((s) => s.convo !== c);
      c.next = w.t + 2; return;
    }
    return end(city, c, w);
  }
  if (c.turns >= c.maxTurns) { // a natural end
    const S = c.speaker, R = rel(city, S, c.members.find((q) => q !== S) || S);
    if (c.kind !== 'greet') say(S, c.kind === 'argue' ? ['angry', '#HMPH'] : c.kind === 'phone' ? ['phone', '#BYE'] : isFriend(R) ? ['wave', 'heart'] : ['wave', '#BYE'], { style: c.kind === 'argue' ? 'shout' : 'say', dur: 1.8, t: w.t });
    c.next = Infinity; c.closing = w.t + 1.2;
    return;
  }
  // Drifting? A chatty speaker changes the subject.
  const avg = c.members.reduce((s, q) => s + (c.interest.get(q) ?? 0.5), 0) / c.members.length;
  if (c.kind === 'chat' && avg < 0.42 && c.turns > 1 && persona(c.speaker).talkative > 0.45 && Math.random() < 0.6) {
    const options = topicsFor(city, w, c.members, c.place).filter(([k]) => k !== c.topic);
    c.topic = pickWeighted(options);
    say(c.speaker, ['idea', pick(TOPICS[c.topic] || TOPICS.weather)], { dur: 2, t: w.t });
    for (const q of c.members) c.interest.set(q, Math.min(1, (c.interest.get(q) ?? 0.5) + 0.12));
    c.turns++; c.next = w.t + 2.4; return;
  }
  turn(city, c, w);
  c.turns++;
  c.next = w.t + (c.kind === 'greet' ? 2 : 2.2 + Math.random() * 1.3);
  if (c.kind !== 'greet') c.speaker = nextSpeaker(c);
  if (c.kind === 'greet') c.closing = w.t + 1.8;
}
// A seated (or riding, or working) conversation goes on while they stay put.
function stillHere(p, c) {
  if (c.kind === 'greet') return true;
  if (c.kind === 'phone') return !(p.v > 0) || p.plan[0]?.t === 'walk';
  const s = p.plan[0];
  return !(p.v > 0) && (['do', 'meal', 'staff', 'hold', 'queue', 'turn', 'elev'].includes(s?.t) || s?.t === 'slide' && !s.i);
}

// ---------- every frame ----------
let nextLook = 0, nextThought = 0;
export function updateSocial(city, w) {
  lastT = w.t;
  city.convos ??= []; city.rels ??= new Map();
  for (const c of city.convos) {
    if (c.closing && w.t >= c.closing) end(city, c, w);
    else if (!c.ended) tick(city, c, w);
  }
  city.convos = city.convos.filter((c) => !c.ended);
  for (const p of city.people) {
    if (!p.convo) p.talkAnim = null;
    if (p.mood !== undefined || p.feel) p.mood = moodOf(p) + (persona(p).cheerful + (p.feel || 0) - moodOf(p)) * Math.min(1, w.dt / 900); // (p.feel: how their needs are going, see life.js)
  }
  // Look for new conversations a couple of times a second.
  if (w.t >= nextLook) { nextLook = w.t + 0.6; meet(city, w); }
  if (w.t >= nextThought) { nextThought = w.t + 1.2; thoughts(city, w); }
  if (w.t >= nextAmbient) { nextAmbient = w.t + 0.5; ambient(city, w); }
}

// What people say while doing things: chanting at the protest, shouting in a fight, the kids on the
// swings, ordering dinner, thanking the waiter, waiting too long for the lift...
const BY_ANIM = {
  chant: ['shout', 0.5, [['factory', 'cross'], ['#NO', 'factory'], ['masked', '#STOP'], ['#SMOG', 'down'], ['tree', 'up']]],
  protest: ['shout', 0.4, [['factory', 'cross'], ['#NO', '#SMOG'], ['angry', 'factory']]],
  punch: ['shout', 0.5, [['vein', 'angry'], ['angry', 'exclaim'], ['#OI', 'exclaim']]],
  reel: ['shout', 0.5, [['#OW'], ['sweat', 'surprised'], ['#HEY', 'exclaim']]],
  handsup: ['say', 0.4, [['sweat'], ['#OK', '#OK'], ['sad']]],
  cuffed: ['say', 0.25, [['sweat'], ['broken'], ['sad']]],
  call: ['phone', 0.6, [['phone', 'siren'], ['phone', 'exclaim'], ['siren', 'question']]],
  spray: ['shout', 0.35, [['fire', 'exclaim'], ['#BACK', 'exclaim'], ['sweat', 'fire']]],
  swing: ['say', 0.25, [['#YAY'], ['star'], ['laugh'], ['#WHEE']]],
  slideDown: ['say', 0.5, [['#WHEE'], ['#YAY'], ['laugh']]],
  climb: ['say', 0.1, [['#WOW'], ['sweat']]],
  lift: ['think', 0.2, [['sweat'], ['dumbbell', 'star'], ['dumbbell', 'up']]],
  bench: ['think', 0.2, [['sweat'], ['dumbbell']]],
  examine: ['say', 0.25, [['thermo'], ['pill'], ['#OK'], ['question']]],
  teach: ['say', 0.2, [['book'], ['pencil', 'question'], ['idea'], ['star']]],
  writeBoard: ['say', 0.1, [['pencil'], ['idea']]],
  handUp: ['say', 0.6, [['question'], ['idea'], ['exclaim']]],
  learn: ['think', 0.06, [['question'], ['pencil'], ['tired'], ['ball'], ['gamepad']]],
  jail: ['think', 0.2, [['broken'], ['sad'], ['clock'], ['angry']]],
  shake: ['say', 0.1, [['cheers'], ['note']]],
  sweep: ['think', 0.05, [['note'], ['tired']]],
  monitor: ['think', 0.08, [['eye'], ['tv'], ['coffee']]],
  tv: ['think', 0.03, [['laugh'], ['surprised'], ['tv', 'heart'], ['ball', 'exclaim']]],
  cook: ['think', 0.05, [['noodles'], ['cake', 'star'], ['note']]],
  dishes: ['think', 0.04, [['tired'], ['note'], ['sweat']]],
};
let nextAmbient = 0;
function ambient(city, w) {
  for (const p of city.people) {
    if (p.convo || p.aboard || p.inCar || talking(p, w.t) || (p.remarkAt || 0) > w.t) continue;
    const s = p.plan[0];
    // At a table or the bar: tell the waiter what you'd like, thank them when it comes, grumble if it doesn't.
    if (s?.t === 'meal' && s.b) {
      const o = s.b.orders.find((x) => x.p === p.id), st = o?.state;
      if (o && st !== p.orderSeen) {
        p.orderSeen = st;
        if (st === 'ordered') remarkNow(p, w, s.kind === 'bar' ? [pick(['beer', 'beer', 'cheers', 'coffee'])] : [pick(TOPICS.food), pick(['#PLS', 'smile', null])].filter(Boolean));
        if (st === 'served') remarkNow(p, w, [pick(['#THX', '#THX', 'smile', 'heart', 'star'])]);
        continue;
      }
      if (o && st !== 'served' && w.now - o.at > 25 * 60e3 && Math.random() < 0.1) { remarkNow(p, w, ['clock', pick(['annoyed', 'question', 'sad'])], 'think', 8); continue; }
    }
    if (s?.t === 'staff' && s.role === 'waiter' && p.anim === 'write' && Math.random() < 0.3) { remarkNow(p, w, [pick(['#OK', 'question', 'check'])]); continue; }
    if (s?.t === 'staff' && s.role === 'waiter' && p.anim === 'place' && p.tool === 'plate' && Math.random() < 0.4) { remarkNow(p, w, [pick(['#ENJOY', 'smile', 'star'])]); continue; }
    if (s?.t === 'staff' && s.role === 'cashier' && p.anim === 'scan' && Math.random() < 0.15) { remarkNow(p, w, [pick(['money', '#THX', '#NEXT', 'bag'])]); continue; }
    if (s?.t === 'do' && s.act === 'pay' && s.started && !s.said) { s.said = true; remarkNow(p, w, [pick(['money', 'bag', '#THX'])]); continue; }
    // Waiting for the lift that won't come; a queue that won't move.
    if (s?.t === 'elev' && p.surface !== 'elev') { s.w0 ??= w.t; if (w.t - s.w0 > 14 && Math.random() < 0.15) { remarkNow(p, w, ['clock', pick(['annoyed', 'tired', 'question'])], 'think', 6); continue; } }
    if (s?.t === 'queue') { s.w0 ??= w.t; if (w.t - s.w0 > 10 && Math.random() < 0.1) { remarkNow(p, w, ['clock', pick(['annoyed', 'tired'])], 'think', 8); continue; } }
    // The fire alarm: outside with everyone else, or can't be bothered.
    if (p.forced === 'evac' && p.plan[0]?.t === 'hold' && Math.random() < 0.06) { remarkNow(p, w, [pick(['fire', 'siren', 'eye']), pick(['surprised', 'sweat', 'question', 'tired'])], 'say', 6); continue; }
    if (p.b?.alarm && !p.forced && !p.kid && traits(p).lazy && Math.random() < 0.08) { remarkNow(p, w, [pick(['#MEH', 'tired', 'zzz'])], 'think', 10); continue; }
    if (p.forced === 'police' && s?.t === 'hold' && Math.random() < 0.4) { remarkNow(p, w, ['#STOP', 'exclaim'], 'shout', 4); continue; }
    if (p.rush && p.v > 0 && Math.random() < 0.05) { remarkNow(p, w, ['clock', 'sweat'], 'think', 8); continue; }
    const A = BY_ANIM[p.anim];
    if (A && Math.random() < A[1]) remarkNow(p, w, pick(A[2]), A[0], A[0] === 'think' ? 10 : 4);
  }
}
function remarkNow(p, w, tokens, style = 'say', gap = 4) {
  say(p, tokens, { style, dur: style === 'think' ? 2.4 : 1.9, t: w.t });
  p.remarkAt = w.t + gap + Math.random() * gap;
}
// Talking shows: the speaker's hands, the listeners' reactions (sitting or standing).
export function talkPose(p) {
  const a = p.talkAnim;
  if (!a || !p.convo) return null;
  if (p.hip) return a === 'talk' || a === 'point' ? 'talkSit' : a === 'laugh' ? 'laughSit' : a === 'call' ? 'callSit' : null;
  return a;
}

function meet(city, w) {
  const cap = 1 + Math.floor(city.people.length / 5);
  if (city.convos.length >= cap) return;
  const free = city.people.filter((p) => available(p, w));
  // Phone calls: now and then someone on their own.
  if (Math.random() < 0.06) {
    const p = pick(free.filter((q) => !q.kid && (q.v > 0 || seated(q)) && q.plan[0]?.t !== 'staff') || []);
    if (p && Math.random() < persona(p).talkative) { start(city, w, 'phone', [p]); return; }
  }
  for (const p of free) {
    if (p.convo) continue;
    for (const q of free) {
      if (q === p || q.convo || q.b !== p.b || q.f !== p.f || (q.kid !== p.kid && q.hh !== p.hh && !(p.b?.type === 'school'))) continue;
      const dx = Math.abs(q.x - p.x);
      const walkP = p.v > 0, walkQ = q.v > 0;
      if (walkP || walkQ) { // passing each other: a wave if they know each other (friends might stop)
        if (dx > 8 || (!p.b && Math.abs((p.depth || 0) - (q.depth || 0)) > 3)) continue;
        const R = rel(city, p, q);
        if (p.hh === q.hh || Math.random() > (R.fam < 2 ? 0.12 * (1 + moodOf(p) + moodOf(q)) : 0.5)) continue; // strangers now and then, if they're in a good mood
        if ((p.waved?.[q.id] || 0) > w.t - 120) continue;
        (p.waved ??= {})[q.id] = w.t; (q.waved ??= {})[p.id] = w.t; // (not p.greeted: that's the security guard's nod, see venues.js)
        const stop = isFriend(R) && walkP && walkQ && !p.b && Math.random() < 0.35 * (persona(p).talkative + persona(q).talkative);
        start(city, w, stop ? 'chat' : 'greet', [p, q], { standing: stop });
        break;
      }
      // Both settled nearby: sitting at the same table, side by side on stools, waiting together...
      const sameRoom = !p.b || p.b.roomAt(p.f, p.x) === q.b.roomAt(q.f, q.x);
      if (!sameRoom || dx > (seated(p) && seated(q) ? 22 : 12)) continue;
      const R = rel(city, p, q), place = placeOf(p);
      const lonely = 2 - Math.min(p.needs?.[3] ?? 1, q.needs?.[3] ?? 1); // (needs[3]: social, see life.js)
      const chance = 0.05 * lonely * (PLACE_CHANCE[place] ?? 1) * (0.4 + persona(p).talkative + persona(q).talkative) * (0.6 + Math.max(-0.5, R.aff)) * (R.fam ? 1.3 : 0.7);
      if (Math.random() > chance) continue;
      // Who else? Gossip about a third person they both know, an argument if they don't get on.
      const third = free.find((o) => o !== p && o !== q && !o.convo && o.b === p.b && o.f === p.f && Math.abs(o.x - p.x) < 40 && Math.abs(o.x - p.x) > 12 && rel(city, p, o).fam > 1 && rel(city, q, o).fam > 1);
      if (R.aff < -0.25 && Math.random() < 0.65) continue; // people who don't get on mostly keep out of each other's way
      const kind = R.aff < -0.25 || (traits(p).temper && moodOf(p) < -0.3 && Math.random() < 0.4) ? 'argue' : third && Math.random() < 0.18 && !p.kid ? 'gossip' : 'chat';
      const c = start(city, w, kind, [p, q], { place, about: third || null });
      // Friends and housemates nearby join in.
      for (const o of free) if (c.members.length < 4 && o !== p && o !== q && !o.convo && o.b === p.b && o.f === p.f && Math.abs(o.x - p.x) < 20 && rel(city, o, p).aff > 0.3 && kind === 'chat' && Math.random() < 0.5) { c.members.push(o); o.convo = c; c.interest.set(o, 0.6); }
      break;
    }
  }
}

// Now and then someone thinks about what's next or how they feel.
function thoughts(city, w) {
  const p = pick(city.people);
  if (!p || p.convo || talking(p, w.t) || p.anim === 'sleep' || p.aboard || p.inCar || p.forced) return;
  if (Math.random() > 0.35) return;
  const h = w.hour, d = dow(w.day), key = (p.wantKey || '').split('@')[0].split(':')[0], m = moodOf(p);
  const options = [];
  if (p.sick) options.push(['sick', 'thermo'], ['pill']);
  if ((city.pollution || 0) > 0.35 && !p.b) options.push(['masked', 'factory']);
  if (h >= 22 || h < 6) options.push(['bed', 'zzz'], ['tired']);
  if (key === 'work' && p.v > 0) options.push(['work', 'clock'], ['coffee']);
  if (key === 'eatout' || key === 'cook' || (h > 17.5 && h < 19.5)) options.push(['noodles'], ['plate'], ['pizza']);
  if (key === 'bar') options.push(['beer'], ['cheers']);
  if (key === 'gym' || key === 'run') options.push(['dumbbell'], ['shoe']);
  if (key === 'shop') options.push(['bag'], ['money']);
  if (key === 'school' || key === 'homework') options.push(['pencil'], ['book']);
  if (key === 'playground' || key === 'play') options.push(['swing'], ['ball']);
  if (key === 'bedtime') options.push(['bed']);
  if (d === 4 && h > 15) options.push(['party'], ['calendar', 'smile']);
  if (d === 0 && h < 10) options.push(['calendar', 'sad'], ['coffee', 'tired']);
  const n = p.needs || []; // [energy, food, fun, social, hygiene] (see life.js): whatever's running low comes to mind
  if (n[0] < 0.25) options.push(['tired'], ['zzz'], ['bed', 'question']);
  if (n[1] < 0.25) options.push(['plate', 'question'], ['noodles'], ['pizza'], ['bao']);
  if (n[2] < 0.2) options.push(['annoyed'], ['tv', 'question'], ['gamepad']);
  if (n[3] < 0.2) options.push(['person', 'question'], ['phone'], ['sad']);
  if (n[4] < 0.2) options.push(['sweat'], ['sweat', 'question']);
  if (m > 0.4) options.push(['smile'], ['note'], ['heart']);
  if (m < -0.35) options.push(['sad'], ['annoyed'], ['broken']);
  if (!options.length) options.push(['note'], [pick(TOPICS[pick(interestsOf(p))] || ['smile'])]);
  say(p, pick(options), { style: 'think', dur: 2.6, t: w.t });
}

// ---------- saving ----------
export const saveRels = (city) => [...(city.rels || new Map())].filter(([, r]) => r.fam > 0).map(([k, r]) => [k, Math.round(r.aff * 100) / 100, r.fam]);
export function loadRels(city, list) {
  city.rels = new Map();
  for (const [k, aff, fam] of list || []) city.rels.set(k, { aff, fam });
}
// Something said that isn't part of a conversation (ordering food, an alarm, an arrest...), if p isn't busy talking.
export function remark(p, tokens, style = 'say', dur = 2) { if (p && !p.convo) say(p, tokens, { style, dur }); }
// Dev panel: start one now.
export function forceTalk(city, w, kind) {
  const free = city.people.filter((p) => available(p, w) || p.socialNext > w.t && !p.convo);
  if (kind === 'phone') { const p = pick(free.filter((q) => !q.kid)); if (!p) return 'NOBODY FREE'; start(city, w, 'phone', [p]); return 'A PHONE CALL'; }
  for (const p of free) for (const q of free) {
    if (p === q || q.b !== p.b || q.f !== p.f || Math.abs(q.x - p.x) > 24) continue;
    const third = kind === 'gossip' ? city.people.find((o) => o !== p && o !== q && o.b === p.b) : null;
    start(city, w, kind, [p, q], { standing: !(stillHere(p, { kind }) && stillHere(q, { kind })), about: third });
    if (kind === 'argue') bond(city, p, q, -0.3, w.t);
    return kind === 'argue' ? 'AN ARGUMENT' : kind === 'gossip' ? 'GOSSIP' : 'A CHAT';
  }
  return 'NOBODY NEAR ENOUGH';
}
