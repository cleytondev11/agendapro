// AgendaPro Beleza — servidor (Node.js 18+, sem dependências obrigatórias).
// Dados: arquivo data/db.json (padrão) ou PostgreSQL se a variável DATABASE_URL existir.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('./webpush');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_URL = process.env.DATABASE_URL;
const PUSH_SUBJECT = process.env.PUSH_EMAIL ? 'mailto:' + process.env.PUSH_EMAIL : 'mailto:contato@agendapro.app';
const PUBLIC = path.join(__dirname, 'public');
const COLS = ['users', 'profissionais', 'servicos', 'produtos', 'agendamentos', 'compras', 'vendas', 'lancamentos'];

/* ---------------- armazenamento ---------------- */
let DB, pool;
const blank = () => ({ config: null, users: [], profissionais: [], servicos: [], produtos: [], agendamentos: [], compras: [], vendas: [], lancamentos: [], sessions: {}, pushSubs: [], vapid: null, version: 1 });

async function loadDB() {
  if (DB_URL) {
    const { Pool } = require('pg'); // npm install pg (só quando usar PostgreSQL)
    pool = new Pool({ connectionString: DB_URL, ssl: /localhost|127\.0\.0\.1/.test(DB_URL) ? false : { rejectUnauthorized: false } });
    await pool.query('CREATE TABLE IF NOT EXISTS agendapro (id TEXT PRIMARY KEY, data JSONB NOT NULL)');
    const r = await pool.query("SELECT data FROM agendapro WHERE id='main'");
    DB = Object.assign(blank(), r.rows[0]?.data || {});
    console.log('Banco: PostgreSQL');
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const f = path.join(DATA_DIR, 'db.json');
    DB = Object.assign(blank(), fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
    console.log('Banco: arquivo', f);
  }
  if (!DB.vapid) { DB.vapid = webpush.generateVapidKeys(); await flush(); }
}

let writing = false, dirty = false;
async function flush() {
  if (writing) { dirty = true; return; }
  writing = true;
  try {
    do {
      dirty = false;
      const json = JSON.stringify(DB);
      if (pool) await pool.query("INSERT INTO agendapro (id, data) VALUES ('main', $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data", [json]);
      else { const f = path.join(DATA_DIR, 'db.json'); fs.writeFileSync(f + '.tmp', json); fs.renameSync(f + '.tmp', f); }
    } while (dirty);
  } catch (e) { console.error('Erro ao salvar dados:', e); }
  finally { writing = false; }
}
function changed() { DB.version++; flush(); }

/* ---------------- utilidades ---------------- */
const uid = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const digits = s => String(s || '').replace(/\D/g, '');
const str = (s, max = 200) => String(s ?? '').trim().slice(0, max);
const n = v => Number.isFinite(+v) ? +v : 0;

function hashPw(pw) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex'); }
function checkPw(pw, h) {
  if (!h || !h.includes(':')) return false;
  const [salt, k] = h.split(':'); const a = Buffer.from(k, 'hex'), b = crypto.scryptSync(String(pw), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const pubUser = ({ senha, ...u }) => ({ ...u, hasSenha: !!senha });
const isConfigured = () => !!DB.config && DB.users.some(u => u.role === 'admin');

function agora(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
const toMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const toHora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function slotsLivres(data, profId, duracao) {
  const c = DB.config;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return [];
  const dow = new Date(data + 'T12:00:00Z').getUTCDay();
  if (!c.dias.includes(dow)) return [];
  const now = agora(c.tz);
  if (data < now.data) return [];
  const ini = toMin(c.abre), fim = toMin(c.fecha), passo = Number(c.intervalo) || 30;
  const ocup = DB.agendamentos.filter(a => a.data === data && a.profId === profId && a.status !== 'cancelado')
    .map(a => [toMin(a.hora), toMin(a.hora) + (a.duracao || 30)]);
  const out = [];
  for (let t = ini; t + duracao <= fim; t += passo) {
    if (data === now.data && t <= now.min) continue;
    if (ocup.some(([a, b]) => t < b && t + duracao > a)) continue;
    out.push(toHora(t));
  }
  return out;
}

function pushAdmins(title, body) {
  const payload = JSON.stringify({ title, body, url: '/' });
  for (const s of [...DB.pushSubs]) {
    webpush.send(s.sub, payload, DB.vapid, PUSH_SUBJECT).catch(err => {
      if (err.statusCode === 404 || err.statusCode === 410) { DB.pushSubs = DB.pushSubs.filter(x => x !== s); flush(); }
      else console.warn('Falha no push:', err.message);
    });
  }
}
const fmtData = s => s.split('-').reverse().join('/');

/* ---------------- proteção de login ---------------- */
const tentativas = new Map();
function bloqueado(ip) { const t = tentativas.get(ip); return t && t.n >= 10 && Date.now() - t.t < 15 * 60e3; }
function falhou(ip) { const t = tentativas.get(ip); if (!t || Date.now() - t.t > 15 * 60e3) tentativas.set(ip, { n: 1, t: Date.now() }); else t.n++; }

function novaSessao(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const agoraMs = Date.now();
  for (const [k, s] of Object.entries(DB.sessions)) if (s.exp < agoraMs) delete DB.sessions[k];
  DB.sessions[token] = { uid: user.id, exp: agoraMs + 90 * 864e5 };
  flush();
  return token;
}

/* ---------------- rotas ---------------- */
const routes = [];
const route = (method, pattern, auth, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), auth, fn });
class HttpErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpErr(status, msg); };

route('GET', '/api/public', null, () => ({
  configured: isConfigured(),
  config: DB.config ? { negocio: DB.config.negocio, nicho: DB.config.nicho, abre: DB.config.abre, fecha: DB.config.fecha, intervalo: DB.config.intervalo, dias: DB.config.dias, tz: DB.config.tz } : null,
  servicos: DB.servicos.filter(s => s.ativo !== false).map(({ id, nome, preco, duracao }) => ({ id, nome, preco, duracao })),
  profissionais: DB.profissionais.filter(p => p.ativo !== false).map(({ id, nome }) => ({ id, nome })),
  vapidPublic: DB.vapid?.publicKey
}));

route('POST', '/api/setup', null, (req, b) => {
  if (isConfigured()) fail(403, 'O sistema já foi configurado.');
  if (!str(b.login) || String(b.senha || '').length < 4) fail(400, 'Informe usuário e senha (mínimo 4 caracteres).');
  const keep = { vapid: DB.vapid, sessions: {}, pushSubs: [] };
  DB = Object.assign(blank(), keep);
  DB.config = { negocio: str(b.negocio, 80) || 'Meu negócio', nicho: str(b.nicho, 30), abre: '09:00', fecha: '19:00', intervalo: 30, dias: [1, 2, 3, 4, 5, 6], tz: str(b.tz, 60) || 'America/Sao_Paulo' };
  const admin = { id: uid(), nome: str(b.nome, 80), login: str(b.login, 60).toLowerCase(), senha: hashPw(b.senha), role: 'admin', tel: '', criado: agora(DB.config.tz).data };
  DB.users.push(admin);
  DB.profissionais.push({ id: uid(), nome: admin.nome, ativo: true });
  DB.servicos = (Array.isArray(b.servicos) ? b.servicos : []).slice(0, 50).map(s => ({ id: uid(), nome: str(s.nome, 80), preco: n(s.preco), duracao: n(s.duracao) || 30, ativo: true }));
  DB.produtos = (Array.isArray(b.produtos) ? b.produtos : []).slice(0, 50).map(p => ({ id: uid(), nome: str(p.nome, 80), custo: n(p.custo), preco: n(p.preco), qtd: n(p.qtd), min: n(p.min) }));
  changed();
  return { token: novaSessao(admin), user: pubUser(admin) };
});

route('POST', '/api/login', null, (req, b) => {
  if (bloqueado(req.ip)) fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
  const login = str(b.login).toLowerCase(), tel = digits(login);
  const u = DB.users.find(u => u.login === login || (tel.length >= 10 && u.login === tel));
  if (!u || !checkPw(b.senha, u.senha)) { falhou(req.ip); fail(401, 'Usuário ou senha incorretos.'); }
  if (u.bloqueado) fail(403, 'Acesso bloqueado. Fale com o estabelecimento.');
  return { token: novaSessao(u), user: pubUser(u) };
});

route('POST', '/api/register', null, (req, b) => {
  if (!isConfigured()) fail(400, 'Sistema ainda não configurado.');
  const tel = digits(b.tel), nome = str(b.nome, 80);
  if (!nome) fail(400, 'Informe seu nome.');
  if (tel.length < 10 || tel.length > 13) fail(400, 'Informe um telefone com DDD.');
  if (String(b.senha || '').length < 4) fail(400, 'A senha precisa ter pelo menos 4 caracteres.');
  let u = DB.users.find(u => u.login === tel);
  if (u && u.senha) fail(409, 'Já existe uma conta com esse telefone. Use a aba Entrar.');
  if (u) { u.senha = hashPw(b.senha); u.nome = nome; }
  else { u = { id: uid(), nome, login: tel, tel: str(b.tel, 30), senha: hashPw(b.senha), role: 'cliente', criado: agora(DB.config.tz).data }; DB.users.push(u); }
  changed();
  return { token: novaSessao(u), user: pubUser(u) };
});

route('POST', '/api/logout', 'any', req => { delete DB.sessions[req.token]; flush(); return { ok: true }; });
route('GET', '/api/me', 'any', req => ({ user: pubUser(req.user) }));
route('PUT', '/api/me', 'any', (req, b) => {
  if (str(b.nome)) req.user.nome = str(b.nome, 80);
  if (b.senha) { if (String(b.senha).length < 4) fail(400, 'Senha muito curta.'); req.user.senha = hashPw(b.senha); }
  changed(); return { user: pubUser(req.user) };
});

/* ----- cliente ----- */
route('GET', '/api/slots', 'any', req => {
  const q = req.query, sv = DB.servicos.find(s => s.id === q.get('servicoId') && s.ativo !== false);
  if (!sv) fail(400, 'Serviço inválido.');
  return { slots: slotsLivres(q.get('data'), q.get('profId'), sv.duracao) };
});
route('POST', '/api/agendar', 'any', (req, b) => {
  const sv = DB.servicos.find(s => s.id === b.servicoId && s.ativo !== false);
  const pr = DB.profissionais.find(p => p.id === b.profId && p.ativo !== false);
  if (!sv || !pr) fail(400, 'Serviço ou profissional inválido.');
  const ativos = DB.agendamentos.filter(a => a.clienteId === req.user.id && a.status === 'agendado' && a.data >= agora(DB.config.tz).data);
  if (req.user.role === 'cliente' && ativos.length >= 5) fail(400, 'Você já tem 5 horários marcados. Cancele algum para marcar outro.');
  if (!slotsLivres(b.data, pr.id, sv.duracao).includes(b.hora)) fail(409, 'Esse horário acabou de ser ocupado. Escolha outro.');
  const a = { id: uid(), status: 'agendado', criadoPor: 'cliente', criadoEm: new Date().toISOString(), clienteId: req.user.id, clienteNome: req.user.nome, tel: req.user.tel, servicoId: sv.id, servicoNome: sv.nome, valor: sv.preco, duracao: sv.duracao, profId: pr.id, data: b.data, hora: b.hora, obs: str(b.obs, 200) };
  DB.agendamentos.push(a);
  changed();
  pushAdmins('📅 Novo agendamento', `${a.clienteNome} — ${a.servicoNome}\n${fmtData(a.data)} às ${a.hora}`);
  return { agendamento: a };
});
route('GET', '/api/meus', 'any', req => ({ agendamentos: DB.agendamentos.filter(a => a.clienteId === req.user.id) }));
route('POST', '/api/meus/:id/cancelar', 'any', (req, b, p) => {
  const a = DB.agendamentos.find(a => a.id === p.id && a.clienteId === req.user.id);
  if (!a || a.status !== 'agendado') fail(404, 'Agendamento não encontrado.');
  a.status = 'cancelado'; a.canceladoPor = 'cliente';
  changed();
  pushAdmins('❌ Agendamento cancelado', `${a.clienteNome} cancelou ${a.servicoNome}\n${fmtData(a.data)} às ${a.hora}`);
  return { ok: true };
});

/* ----- administrador ----- */
function snapshot() {
  const d = { config: DB.config };
  for (const c of COLS) d[c] = c === 'users' ? DB.users.map(pubUser) : DB[c];
  return d;
}
route('GET', '/api/db', 'admin', req => {
  const v = +req.query.get('v');
  return v === DB.version ? { v, same: true } : { v: DB.version, data: snapshot() };
});
route('POST', '/api/sync', 'admin', (req, b) => {
  const changes = Array.isArray(b.changes) ? b.changes : [];
  for (const ch of changes) {
    if (ch.col === 'config') { if (ch.doc && typeof ch.doc === 'object') DB.config = { ...DB.config, ...ch.doc }; continue; }
    if (!COLS.includes(ch.col)) continue;
    const arr = DB[ch.col];
    if (ch.op === 'del') {
      if (ch.col === 'users' && arr.find(u => u.id === ch.id)?.role === 'admin') continue;
      DB[ch.col] = arr.filter(x => x.id !== ch.id);
      continue;
    }
    const doc = ch.doc;
    if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string') continue;
    if (ch.col === 'users') {
      const { novaSenha, hasSenha, senha, ...clean } = doc;
      const ex = arr.find(u => u.id === doc.id);
      if (ex) {
        const keep = { senha: ex.senha, role: ex.role, ...(ex.role === 'admin' ? { login: ex.login } : {}) };
        Object.assign(ex, clean, keep);
        if (novaSenha && ex.role === 'cliente') ex.senha = hashPw(novaSenha);
      } else arr.push({ ...clean, role: 'cliente', senha: novaSenha ? hashPw(novaSenha) : '' });
      continue;
    }
    const i = arr.findIndex(x => x.id === doc.id);
    if (i >= 0) arr[i] = doc; else arr.push(doc);
  }
  changed();
  return { v: DB.version };
});
route('POST', '/api/senha', 'admin', (req, b) => {
  if (!checkPw(b.atual, req.user.senha)) fail(400, 'Senha atual incorreta.');
  if (String(b.nova || '').length < 4) fail(400, 'Nova senha muito curta.');
  const login = str(b.login, 60).toLowerCase();
  if (login && DB.users.some(u => u.login === login && u.id !== req.user.id)) fail(409, 'Esse usuário já existe.');
  if (login) req.user.login = login;
  req.user.senha = hashPw(b.nova);
  changed(); return { ok: true };
});
route('POST', '/api/push/subscribe', 'admin', (req, b) => {
  if (!b.sub?.endpoint || !b.sub?.keys?.p256dh) fail(400, 'Inscrição inválida.');
  DB.pushSubs = DB.pushSubs.filter(s => s.sub.endpoint !== b.sub.endpoint);
  DB.pushSubs.push({ uid: req.user.id, sub: b.sub, em: new Date().toISOString() });
  flush(); return { ok: true };
});
route('POST', '/api/push/teste', 'admin', () => { pushAdmins('🔔 Teste', 'As notificações estão funcionando!'); return { ok: true, aparelhos: DB.pushSubs.length }; });
route('GET', '/api/backup', 'admin', () => {
  const d = { config: DB.config, backupEm: new Date().toISOString() };
  for (const c of COLS) d[c] = DB[c];
  return d;
});
route('POST', '/api/restore', 'admin', (req, b) => {
  if (!b.config || !Array.isArray(b.users)) fail(400, 'Arquivo de backup inválido.');
  DB.config = b.config;
  for (const c of COLS) if (Array.isArray(b[c])) DB[c] = b[c];
  if (!DB.users.some(u => u.id === req.user.id)) DB.users.push(req.user); // não se trancar para fora
  DB.users.forEach(u => { if (u.senha && !u.senha.includes(':')) u.senha = ''; }); // senhas de backups antigos
  changed(); return { ok: true };
});
route('POST', '/api/reset', 'admin', (req, b) => {
  if (b.confirm !== 'APAGAR') fail(400, 'Confirmação inválida.');
  DB = Object.assign(blank(), { vapid: DB.vapid });
  changed(); return { ok: true };
});

/* ---------------- http ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 15e6) {
  return new Promise((ok, ko) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { ko(new HttpErr(413, 'Dados muito grandes.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { ko(new HttpErr(400, 'JSON inválido.')); } });
    req.on('error', ko);
  });
}

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (pathname === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  const ext = path.extname(file);
  const noCache = ['.html', '.js', '.css', '.json'].includes(ext);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-cache' : 'public, max-age=604800' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  req.ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  req.query = url.searchParams;
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  try {
    const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!r) fail(404, 'Rota não encontrada.');
    if (r.auth) {
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const s = token && DB.sessions[token];
      if (!s || s.exp < Date.now()) fail(401, 'Faça login novamente.');
      const u = DB.users.find(u => u.id === s.uid);
      if (!u || u.bloqueado) fail(401, 'Faça login novamente.');
      if (r.auth === 'admin' && u.role !== 'admin') fail(403, 'Acesso restrito ao administrador.');
      req.user = u; req.token = token;
    }
    const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
    const out = await r.fn(req, body, url.pathname.match(r.re).groups || {});
    send(res, 200, out);
  } catch (e) {
    if (!(e instanceof HttpErr)) console.error(e);
    send(res, e.status || 500, { erro: e instanceof HttpErr ? e.message : 'Erro interno no servidor.' });
  }
});

loadDB().then(() => server.listen(PORT, () => console.log(`AgendaPro rodando em http://localhost:${PORT}`)))
  .catch(e => { console.error('Não foi possível iniciar:', e); process.exit(1); });
