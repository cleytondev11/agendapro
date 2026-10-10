// AgendaPro Beleza — servidor multiempresa (Node.js 18+).
// Cada empresa assinante tem link próprio (/nome-do-negocio) e dados separados.
// A Central (/central) cria e gerencia os acessos. Login dela vem das variáveis CENTRAL_USUARIO e CENTRAL_SENHA.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('./webpush');
const NICHOS = require('./public/nichos.js');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_URL = process.env.DATABASE_URL;
const PUSH_SUBJECT = process.env.PUSH_EMAIL ? 'mailto:' + process.env.PUSH_EMAIL : 'mailto:contato@agendapro.app';
const CENTRAL_USUARIO = (process.env.CENTRAL_USUARIO || 'admin').trim().toLowerCase();
const CENTRAL_SENHA = process.env.CENTRAL_SENHA || '';
const SUPORTE = String(process.env.SUPORTE_WHATSAPP || '5561992522517').replace(/\D/g, '');
const DIAS_TESTE = 3;
const VALOR_PADRAO = 39.9;
const TZ_PADRAO = 'America/Sao_Paulo';
const PUBLIC = path.join(__dirname, 'public');
const COLS = ['users', 'profissionais', 'servicos', 'produtos', 'agendamentos', 'compras', 'vendas', 'lancamentos'];
const RESERVADOS = new Set(['api', 'central', 'entrar', 'site', 'm', 'icons', 'assets', 'static', 'admin', 'login', 'sw.js', 'manifest.json']);

/* ================= armazenamento ================= */
// meta: { vapid, sessions (da Central) } · empresas: { [slug]: dados da empresa }
let META = { vapid: null, sessions: {}, centralSubs: [], eventos: [], lidosAte: '', testesUsados: [] };
const EMP = {};
let pool;
const INICIO = new Date().toISOString();

const blankEmp = () => ({ meta: {}, config: null, users: [], profissionais: [], servicos: [], produtos: [], agendamentos: [], compras: [], vendas: [], lancamentos: [], sessions: {}, pushSubs: [], version: 1 });

async function loadDB() {
  if (DB_URL) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: DB_URL, ssl: /localhost|127\.0\.0\.1/.test(DB_URL) ? false : { rejectUnauthorized: false },
      max: 4, idleTimeoutMillis: 20000, connectionTimeoutMillis: 15000, keepAlive: true
    });
    // O Neon desliga conexões ociosas. Sem este aviso, a queda derrubava o servidor inteiro.
    pool.on('error', e => console.warn('Conexão com o banco caiu (vai reconectar sozinho):', e.message));
    await pool.query('CREATE TABLE IF NOT EXISTS agendapro (id TEXT PRIMARY KEY, data JSONB NOT NULL)');
    const r = await pool.query('SELECT id, data FROM agendapro');
    for (const row of r.rows) {
      if (row.id === 'meta') META = Object.assign(META, row.data);
      else if (row.id.startsWith('t:')) EMP[row.id.slice(2)] = Object.assign(blankEmp(), row.data);
      else if (row.id === 'main') var legado = row.data;
    }
    if (legado && !META.migrado) migrarLegado(legado);
    console.log('Banco: PostgreSQL ·', Object.keys(EMP).length, 'empresa(s)');
  } else {
    fs.mkdirSync(path.join(DATA_DIR, 'empresas'), { recursive: true });
    const fm = path.join(DATA_DIR, 'meta.json');
    if (fs.existsSync(fm)) META = Object.assign(META, JSON.parse(fs.readFileSync(fm, 'utf8')));
    for (const f of fs.readdirSync(path.join(DATA_DIR, 'empresas')).filter(f => f.endsWith('.json')))
      EMP[f.slice(0, -5)] = Object.assign(blankEmp(), JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'empresas', f), 'utf8')));
    const old = path.join(DATA_DIR, 'db.json');
    if (fs.existsSync(old) && !META.migrado) migrarLegado(JSON.parse(fs.readFileSync(old, 'utf8')));
    console.log('Banco: arquivos em', DATA_DIR, '·', Object.keys(EMP).length, 'empresa(s)');
  }
  if (!META.vapid) { META.vapid = webpush.generateVapidKeys(); marcar('meta'); }
  // Preço padrão mudou de R$ 49,90 para R$ 39,90: quem estava no padrão antigo passa para o novo (planos ajustados ficam como estão).
  if (!META.preco3990) {
    for (const E of Object.values(EMP)) if (Math.abs(Number(E.meta?.valor) - 49.9) < 0.004) { E.meta.valor = VALOR_PADRAO; marcar('t:' + E.meta.slug); }
    META.preco3990 = true; marcar('meta');
  }
  if (!CENTRAL_SENHA) console.warn('⚠️  Defina a variável CENTRAL_SENHA para usar a Central (/central).');
  await flush();
}

// Converte o banco da versão de empresa única para a primeira empresa da Central.
function migrarLegado(d) {
  META.migrado = true; marcar('meta');
  if (!d?.config || !Array.isArray(d.users)) return;
  if (d.vapid) META.vapid = d.vapid;
  const slug = slugLivre(d.config.negocio || 'minha-empresa');
  const e = Object.assign(blankEmp(), d);
  delete e.vapid;
  e.meta = { slug, criado: hojeSP(), vence: '', bloqueado: false, valor: 0, donoTel: '', obs: 'Migrada da versão anterior' };
  e.pushSubs = [];
  EMP[slug] = e; marcar('t:' + slug);
  console.log('Empresa existente migrada para /' + slug);
}

const sujos = new Set();
const ST = { gravadas: 0, ultimaGravacao: '', ultimoErro: '', ultimoErroEm: '', falhasSeguidas: 0 };
let writing = null, retryT = null;
function marcar(key) { sujos.add(key); }

async function gravar(key) {
  const slug = key.startsWith('t:') ? key.slice(2) : null;
  const data = key === 'meta' ? META : EMP[slug];
  if (pool) {
    if (data) await pool.query('INSERT INTO agendapro (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [key, JSON.stringify(data)]);
    else await pool.query('DELETE FROM agendapro WHERE id = $1', [key]);
  } else {
    const f = key === 'meta' ? path.join(DATA_DIR, 'meta.json') : path.join(DATA_DIR, 'empresas', slug + '.json');
    if (data) { fs.writeFileSync(f + '.tmp', JSON.stringify(data)); fs.renameSync(f + '.tmp', f); }
    else if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

// Grava tudo o que está pendente. Se o banco falhar, a alteração CONTINUA pendente e é tentada de novo.
function flush() {
  if (writing) return writing;
  writing = (async () => {
    while (sujos.size) {
      const key = sujos.values().next().value;
      sujos.delete(key);
      try {
        await gravar(key);
        ST.gravadas++; ST.ultimaGravacao = new Date().toISOString(); ST.falhasSeguidas = 0;
      } catch (e) {
        sujos.add(key); // devolve para a fila: não perde nada
        ST.ultimoErro = e.message; ST.ultimoErroEm = new Date().toISOString(); ST.falhasSeguidas++;
        console.error(`Erro ao salvar (${key}), nova tentativa em instantes:`, e.message);
        const espera = Math.min(8000, 500 * 2 ** Math.min(ST.falhasSeguidas, 4));
        clearTimeout(retryT); retryT = setTimeout(flush, espera);
        break;
      }
    }
  })().finally(() => { writing = null; });
  return writing;
}
// Espera a gravação de verdade (usado na Central: só confirma depois que está no banco).
async function gravarAgora(tentativas = 4) {
  for (let i = 0; i < tentativas; i++) {
    await flush();
    if (!sujos.size) return true;
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  return !sujos.size;
}
setInterval(() => { if (sujos.size) flush(); }, 10000);
// O Render avisa antes de desligar: grava o que estiver pendente.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => {
  console.log('Desligando: gravando alterações pendentes…');
  await Promise.race([gravarAgora(3), new Promise(r => setTimeout(r, 8000))]);
  process.exit(0);
});

function changed(E) { E.version++; marcar('t:' + E.meta.slug); flush(); }
function salvar(E) { marcar('t:' + E.meta.slug); flush(); }
const ERRO_BANCO = 'Não foi possível salvar no banco de dados agora. Tente de novo em alguns segundos.';

/* ================= utilidades ================= */
const uid = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const digits = s => String(s || '').replace(/\D/g, '');
const str = (s, max = 200) => String(s ?? '').trim().slice(0, max);
const n = v => Number.isFinite(+v) ? +v : 0;
const isoData = s => /^\d{4}-\d{2}-\d{2}$/.test(s);

function hashPw(pw) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex'); }
function checkPw(pw, h) {
  if (!h || !h.includes(':')) return false;
  const [salt, k] = h.split(':'); const a = Buffer.from(k, 'hex'), b = crypto.scryptSync(String(pw), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function igual(a, b) { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); }
const pubUser = ({ senha, ...u }) => ({ ...u, hasSenha: !!senha });

function agora(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz || TZ_PADRAO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
const hojeSP = () => agora(TZ_PADRAO).data;
function somaDias(data, dias) { const d = new Date((isoData(data) ? data : hojeSP()) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); }
const toMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const toHora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtData = s => String(s).split('-').reverse().join('/');
const brl = v => 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');

function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'empresa';
}
function slugLivre(nome) {
  const base = slugify(nome); let s = base, i = 2;
  while (EMP[s] || RESERVADOS.has(s)) s = `${base}-${i++}`;
  return s;
}
const LOGIN_RE = /^[a-z0-9._@+-]{3,80}$/;
// Usuário de dono e de funcionário é único no sistema todo (o /entrar procura em todas as empresas).
function loginEmUso(login, excetoSlug, excetoId) {
  for (const [slug, E] of Object.entries(EMP))
    if (E.users.some(u => (u.role === 'admin' || u.role === 'func') && u.login === login && !(slug === excetoSlug && u.id === excetoId))) return true;
  return false;
}

function situacao(E) {
  if (E.meta.bloqueado) return 'bloqueada';
  if (E.meta.vence && hojeSP() > E.meta.vence) return 'vencida';
  return 'ativa';
}

function slotsLivres(E, data, profId, duracao) {
  const c = E.config;
  if (!isoData(data)) return [];
  const dow = new Date(data + 'T12:00:00Z').getUTCDay();
  if (!c.dias.includes(dow)) return [];
  const now = agora(c.tz);
  if (data < now.data || data > somaDias(now.data, 90)) return [];
  const ini = toMin(c.abre), fim = toMin(c.fecha), passo = Number(c.intervalo) || 30;
  const ocup = E.agendamentos.filter(a => a.data === data && a.profId === profId && a.status !== 'cancelado')
    .map(a => [toMin(a.hora), toMin(a.hora) + (a.duracao || 30)]);
  const out = [];
  for (let t = ini; t + duracao <= fim; t += passo) {
    if (data === now.data && t <= now.min) continue;
    if (ocup.some(([a, b]) => t < b && t + duracao > a)) continue;
    out.push(toHora(t));
  }
  return out;
}

// Envia para todos os aparelhos do dono. Remove inscrições mortas (404/410) ou feitas com outra chave (401/403).
// profId: só o funcionário dessa agenda (e o dono) recebem. apenasUid: só os aparelhos desse usuário.
async function pushAdmins(E, title, body, profId, apenasUid) {
  const payload = JSON.stringify({ title, body, url: '/' + E.meta.slug });
  const subs = E.pushSubs.filter(s => {
    if (apenasUid) return s.uid === apenasUid;
    const u = E.users.find(u => u.id === s.uid);
    if (!u) return false;
    if (u.role === 'admin') return true;
    return u.role === 'func' && profId && u.profId === profId;
  });
  const res = await Promise.all(subs.map(s => webpush.send(s.sub, payload, META.vapid, PUSH_SUBJECT)
    .then(() => ({ ok: true, aparelho: s.aparelho || '' }))
    .catch(err => ({ ok: false, aparelho: s.aparelho || '', status: err.statusCode || 0, erro: err.message, sub: s }))));
  const mortas = res.filter(r => !r.ok && [401, 403, 404, 410].includes(r.status)).map(r => r.sub);
  if (mortas.length) { E.pushSubs = E.pushSubs.filter(x => !mortas.includes(x)); salvar(E); }
  res.filter(r => !r.ok).forEach(r => console.warn(`[push ${E.meta.slug}] falhou (${r.status}):`, r.erro));
  E.meta.ultimoPush = { em: new Date().toISOString(), enviados: res.filter(r => r.ok).length, falhas: res.filter(r => !r.ok).length };
  return res.map(({ sub, ...r }) => r);
}

/* ----- notificações da Central ----- */
function evento(tipo, titulo, texto, slug) {
  META.eventos.unshift({ id: uid(), tipo, titulo, texto, slug: slug || '', em: new Date().toISOString() });
  META.eventos = META.eventos.slice(0, 200);
  marcar('meta'); flush();
  pushCentral(titulo, texto);
}
async function pushCentral(title, body) {
  const payload = JSON.stringify({ title, body, url: '/central' });
  const subs = [...META.centralSubs];
  const res = await Promise.all(subs.map(s => webpush.send(s.sub, payload, META.vapid, PUSH_SUBJECT)
    .then(() => ({ ok: true, aparelho: s.aparelho || '' }))
    .catch(err => ({ ok: false, aparelho: s.aparelho || '', status: err.statusCode || 0, erro: err.message, sub: s }))));
  const mortas = res.filter(r => !r.ok && [401, 403, 404, 410].includes(r.status)).map(r => r.sub);
  if (mortas.length) { META.centralSubs = META.centralSubs.filter(x => !mortas.includes(x)); marcar('meta'); flush(); }
  res.filter(r => !r.ok).forEach(r => console.warn('[push central] falhou:', r.erro));
  return res.map(({ sub, ...r }) => r);
}
// Uma vez por hora: avisa (Central e dono) quem vence amanhã e quem venceu.
function verificarVencimentos() {
  const hoje = hojeSP(), amanha = somaDias(hoje, 1);
  for (const E of Object.values(EMP)) {
    const m = E.meta; if (!m.vence || m.bloqueado) continue;
    m.avisos = m.avisos || {};
    const nome = E.config.negocio, oque = m.trial ? 'O teste grátis' : 'A assinatura';
    if (m.vence === amanha && m.avisos.v1 !== m.vence) {
      m.avisos.v1 = m.vence; salvar(E);
      evento('vence', `⏳ ${nome}: vence amanhã`, `${oque} termina em ${fmtData(m.vence)}. Hora de chamar no WhatsApp.`, m.slug);
      pushAdmins(E, m.trial ? '⏳ Seu teste grátis termina amanhã' : '⏳ Sua assinatura vence amanhã', `Renove para continuar usando o AgendaPro. Valor: R$ ${valorPlano(E).toFixed(2).replace('.', ',')}/mês${ehAjustado(E) ? ' (plano ajustado)' : ''}.`);
    }
    if (hoje > m.vence && m.avisos.v0 !== m.vence) {
      m.avisos.v0 = m.vence; salvar(E);
      evento('venceu', `⛔ ${nome}: ${m.trial ? 'teste terminou' : 'assinatura vencida'}`, `${oque} venceu em ${fmtData(m.vence)}. O acesso foi bloqueado.`, m.slug);
    }
  }
}
setInterval(verificarVencimentos, 60 * 60e3);

/* ----- proteção de login ----- */
const tentativas = new Map();
function bloqueado(ip) { const t = tentativas.get(ip); return t && t.n >= 10 && Date.now() - t.t < 15 * 60e3; }
function falhou(ip) { const t = tentativas.get(ip); if (!t || Date.now() - t.t > 15 * 60e3) tentativas.set(ip, { n: 1, t: Date.now() }); else t.n++; }

function novaSessao(store, uidv) {
  const token = crypto.randomBytes(32).toString('hex'), agoraMs = Date.now();
  for (const [k, s] of Object.entries(store)) if (s.exp < agoraMs) delete store[k];
  store[token] = { uid: uidv, exp: agoraMs + 90 * 864e5 };
  return token;
}

/* ================= rotas ================= */
const routes = [];
// auth: null | 'any' | 'admin' (da empresa) | 'central'
const route = (method, pattern, auth, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), auth, fn });
class HttpErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpErr(status, msg); };
const T = '/api/t/:slug';

/* ----- portal do assinante (login sem saber o link) ----- */
route('POST', '/api/login-dono', null, (req, b) => {
  if (bloqueado(req.ip)) fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
  const login = str(b.login).toLowerCase();
  for (const E of Object.values(EMP)) {
    const u = E.users.find(u => (u.role === 'admin' || u.role === 'func') && u.login === login);
    if (u && checkPw(b.senha, u.senha)) {
      if (u.bloqueado) fail(403, 'Seu acesso foi desativado. Fale com o responsável.');
      if (situacao(E) !== 'ativa') fail(403, E.meta.trial ? 'Seu teste grátis terminou. Fale com o suporte para assinar.' : 'Acesso suspenso. Fale com o suporte para renovar.');
      const token = novaSessao(E.sessions, u.id); salvar(E);
      return { slug: E.meta.slug, token };
    }
  }
  falhou(req.ip); fail(401, 'Usuário ou senha incorretos.');
});

/* ----- dados da empresa (logo, CNPJ, endereço) ----- */
const CAMPOS_EMPRESA = ['razao', 'cnpj', 'cpf', 'telefone', 'email', 'instagram', 'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
function limparEmpresa(e) {
  if (!e || typeof e !== 'object') return {};
  const out = {};
  for (const k of CAMPOS_EMPRESA) out[k] = str(e[k], k === 'rua' || k === 'complemento' ? 120 : 80);
  out.mostrarEndereco = e.mostrarEndereco !== false;
  const logo = String(e.logo || '');
  out.logo = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) && logo.length < 600000 ? logo : '';
  return out;
}
// O que o cliente pode ver (sem CPF, CNPJ e e-mail).
function empresaPublica(E) {
  const e = E.config.empresa || {};
  const pub = { logo: e.logo ? `/m/${E.meta.slug}.logo?v=${e.logo.length}` : '', mostrarEndereco: e.mostrarEndereco !== false };
  if (pub.mostrarEndereco) for (const k of ['telefone', 'instagram', 'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf']) pub[k] = e[k] || '';
  return pub;
}

/* ----- Pix do estabelecimento (sinal dos agendamentos) ----- */
const TIPOS_CHAVE = ['cpf', 'cnpj', 'celular', 'email', 'aleatoria'];
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .,@+\-]/g, '').trim();
function chavePixNormal(tipo, chave) {
  const c = str(chave, 77);
  if (tipo === 'cpf' || tipo === 'cnpj') return digits(c);
  if (tipo === 'celular') { const d = digits(c).replace(/^55(?=\d{10,11}$)/, ''); return d.length >= 10 ? '+55' + d : ''; }
  if (tipo === 'email') return c.toLowerCase();
  return c.toLowerCase();
}
function limparPix(x) {
  if (!x || typeof x !== 'object') return {};
  const tipo = TIPOS_CHAVE.includes(x.tipo) ? x.tipo : 'aleatoria';
  const pct = Math.round(n(x.sinalPadrao));
  return {
    ativo: !!x.ativo, tipo, chave: str(x.chave, 77), nome: str(x.nome, 60), cidade: str(x.cidade, 40),
    sinalPadrao: pct >= 0 && pct <= 100 ? pct : 30
  };
}
// % do sinal do serviço: o do serviço (se definido) ou o padrão. 0 = sem sinal.
function pctSinal(E, sv) {
  const px = E.config.pix || {};
  if (!px.ativo || !chavePixNormal(px.tipo, px.chave)) return 0;
  const v = sv && sv.sinal !== undefined && sv.sinal !== null && sv.sinal !== '' ? n(sv.sinal) : n(px.sinalPadrao ?? 30);
  return Math.max(0, Math.min(100, Math.round(v)));
}
function crc16(s) {
  let c = 0xFFFF;
  for (const b of Buffer.from(s, 'utf8')) { c ^= b << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; }
  return c.toString(16).toUpperCase().padStart(4, '0');
}
const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
// Código Pix "copia e cola" (BR Code) com o valor do sinal.
function brCode(chave, nome, cidade, valor, txid) {
  const conta = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', chave);
  const corpo = tlv('00', '01') + tlv('26', conta) + tlv('52', '0000') + tlv('53', '986') + tlv('54', Number(valor).toFixed(2)) + tlv('58', 'BR')
    + tlv('59', (semAcento(nome) || 'Recebedor').slice(0, 25)) + tlv('60', (semAcento(cidade).toUpperCase() || 'BRASIL').slice(0, 15))
    + tlv('62', tlv('05', (String(txid || '').replace(/[^A-Za-z0-9]/g, '') || '***').slice(0, 25))) + '6304';
  return corpo + crc16(corpo);
}
function whatsEmpresa(E) {
  const d = digits((E.config.empresa || {}).telefone) || digits(E.meta.donoTel);
  return d ? (d.length <= 11 ? '55' + d : d) : '';
}
function pixDoAgendamento(E, a) {
  if (!a.sinal || !['pendente', 'informado'].includes(a.sinal.status)) return undefined;
  const px = E.config.pix || {}, chave = chavePixNormal(px.tipo, px.chave);
  if (!chave) return undefined;
  const nome = px.nome || E.config.negocio;
  return { codigo: brCode(chave, nome, px.cidade || (E.config.empresa || {}).cidade, a.sinal.valor, 'AG' + a.id), chave: px.chave, tipo: px.tipo, nome, whats: whatsEmpresa(E) };
}
const comPix = (E, a) => { const pix = pixDoAgendamento(E, a); return pix ? { ...a, pix } : a; };

/* ----- plano ajustado (valor especial definido na Central) ----- */
const PIX_ASSIN = { chave: process.env.PIX_CHAVE || '7e158db6-1929-40ae-86d0-7484c64a9c84', nome: process.env.PIX_NOME || 'Cleyton de Souza Santos', cidade: process.env.PIX_CIDADE || 'SAO PAULO' };
const valorPlano = E => Number(E.meta.valor) > 0 ? Number(E.meta.valor) : VALOR_PADRAO;
const ehAjustado = E => Number(E.meta.valor) > 0 && Math.abs(Number(E.meta.valor) - VALOR_PADRAO) > 0.004;
function assinaturaInfo(E) {
  const v = valorPlano(E), aj = ehAjustado(E);
  return { vence: E.meta.vence || '', trial: !!E.meta.trial, valor: v, ajustado: aj,
    pix: aj ? brCode(PIX_ASSIN.chave, PIX_ASSIN.nome, PIX_ASSIN.cidade, v, 'AJ' + E.meta.slug.replace(/[^a-z0-9]/gi, '').slice(0, 20)) : '' };
}

/* ----- empresa: público ----- */
route('GET', T + '/public', 'empresa', req => {
  const E = req.E, sit = situacao(E);
  // Quem está abrindo (se já entrou antes): usado para mostrar a mensagem certa quando o acesso está suspenso.
  const ses = E.sessions[String(req.headers.authorization || '').replace(/^Bearer /, '')];
  const papel = ses && ses.exp > Date.now() ? E.users.find(u => u.id === ses.uid)?.role || '' : '';
  return {
    papel, empresa: empresaPublica(E), assinatura: papel === 'admin' ? assinaturaInfo(E) : undefined,
    configured: true, situacao: sit, suporte: SUPORTE, trial: !!E.meta.trial, valor: valorPlano(E),
    config: { negocio: E.config.negocio, nicho: E.config.nicho, abre: E.config.abre, fecha: E.config.fecha, intervalo: E.config.intervalo, dias: E.config.dias, tz: E.config.tz },
    servicos: sit === 'ativa' ? E.servicos.filter(s => s.ativo !== false).map(s => ({ id: s.id, nome: s.nome, preco: s.preco, duracao: s.duracao, sinal: pctSinal(E, s) })) : [],
    whats: whatsEmpresa(E),
    profissionais: sit === 'ativa' ? E.profissionais.filter(p => p.ativo !== false).map(({ id, nome }) => ({ id, nome })) : [],
    vapidPublic: META.vapid?.publicKey
  };
});

route('POST', T + '/login', 'empresa', (req, b) => {
  const E = req.E;
  if (bloqueado(req.ip)) fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
  const login = str(b.login).toLowerCase(), tel = digits(login);
  const u = E.users.find(u => u.login === login || (tel.length >= 10 && u.login === tel));
  if (!u || !checkPw(b.senha, u.senha)) { falhou(req.ip); fail(401, 'Usuário ou senha incorretos.'); }
  if (u.bloqueado) fail(403, 'Acesso bloqueado. Fale com o estabelecimento.');
  const token = novaSessao(E.sessions, u.id); salvar(E);
  return { token, user: pubUser(u) };
});

route('POST', T + '/register', 'empresa', (req, b) => {
  const E = req.E;
  const tel = digits(b.tel), nome = str(b.nome, 80);
  if (!nome) fail(400, 'Informe seu nome.');
  if (tel.length < 10 || tel.length > 13) fail(400, 'Informe um telefone com DDD.');
  if (String(b.senha || '').length < 4) fail(400, 'A senha precisa ter pelo menos 4 caracteres.');
  let u = E.users.find(u => u.login === tel);
  if (u && (u.senha || u.role === 'admin')) fail(409, 'Já existe uma conta com esse telefone. Use a aba Entrar.');
  if (u) { u.senha = hashPw(b.senha); u.nome = nome; }
  else { u = { id: uid(), nome, login: tel, tel: str(b.tel, 30), senha: hashPw(b.senha), role: 'cliente', criado: agora(E.config.tz).data }; E.users.push(u); }
  const token = novaSessao(E.sessions, u.id);
  changed(E);
  return { token, user: pubUser(u) };
});

route('POST', T + '/logout', 'any', req => { delete req.E.sessions[req.token]; salvar(req.E); return { ok: true }; });
route('GET', T + '/me', 'any', req => ({ user: pubUser(req.user), assinatura: req.user.role !== 'cliente' ? assinaturaInfo(req.E) : undefined }));
route('PUT', T + '/me', 'any', (req, b) => {
  if (str(b.nome)) req.user.nome = str(b.nome, 80);
  if (b.senha) { if (String(b.senha).length < 4) fail(400, 'Senha muito curta.'); req.user.senha = hashPw(b.senha); }
  changed(req.E); return { user: pubUser(req.user) };
});

/* ----- empresa: cliente ----- */
route('GET', T + '/slots', 'any', req => {
  const E = req.E, q = req.query, sv = E.servicos.find(s => s.id === q.get('servicoId') && s.ativo !== false);
  if (!sv) fail(400, 'Serviço inválido.');
  return { slots: slotsLivres(E, q.get('data'), q.get('profId'), sv.duracao) };
});
route('POST', T + '/agendar', 'any', (req, b) => {
  const E = req.E;
  const sv = E.servicos.find(s => s.id === b.servicoId && s.ativo !== false);
  const pr = E.profissionais.find(p => p.id === b.profId && p.ativo !== false);
  if (!sv || !pr) fail(400, 'Serviço ou profissional inválido.');
  const ativos = E.agendamentos.filter(a => a.clienteId === req.user.id && a.status === 'agendado' && a.data >= agora(E.config.tz).data);
  if (req.user.role === 'cliente' && ativos.length >= 5) fail(400, 'Você já tem 5 horários marcados. Cancele algum para marcar outro.');
  if (!slotsLivres(E, b.data, pr.id, sv.duracao).includes(b.hora)) fail(409, 'Esse horário acabou de ser ocupado. Escolha outro.');
  const a = { id: uid(), status: 'agendado', criadoPor: 'cliente', criadoEm: new Date().toISOString(), clienteId: req.user.id, clienteNome: req.user.nome, tel: req.user.tel, servicoId: sv.id, servicoNome: sv.nome, valor: sv.preco, duracao: sv.duracao, profId: pr.id, data: b.data, hora: b.hora, obs: str(b.obs, 200) };
  const pct = pctSinal(E, sv), vSinal = Math.round(n(sv.preco) * pct) / 100;
  if (pct > 0 && vSinal >= 0.01) a.sinal = { pct, valor: vSinal, status: 'pendente' };
  E.agendamentos.push(a);
  changed(E);
  pushAdmins(E, '📅 Novo agendamento', `${a.clienteNome} — ${a.servicoNome}\n${fmtData(a.data)} às ${a.hora}${E.profissionais.length > 1 ? ' · ' + pr.nome : ''}${a.sinal ? `\nSinal de ${brl(a.sinal.valor)} aguardando Pix` : ''}`, a.profId);
  return { agendamento: comPix(E, a) };
});
route('GET', T + '/meus', 'any', req => ({ agendamentos: req.E.agendamentos.filter(a => a.clienteId === req.user.id).map(a => a.status === 'agendado' ? comPix(req.E, a) : a) }));
// Cliente avisa que pagou o sinal (o comprovante vai pelo WhatsApp; o dono confirma no app).
route('POST', T + '/meus/:id/sinal', 'any', (req, b, p) => {
  const E = req.E, a = E.agendamentos.find(a => a.id === p.id && a.clienteId === req.user.id);
  if (!a || a.status !== 'agendado' || !a.sinal) fail(404, 'Agendamento não encontrado.');
  if (a.sinal.status === 'pendente') {
    a.sinal.status = 'informado'; a.sinal.informadoEm = new Date().toISOString();
    changed(E);
    pushAdmins(E, '💠 Sinal pago (confira)', `${a.clienteNome} informou o Pix de ${brl(a.sinal.valor)}\n${a.servicoNome} · ${fmtData(a.data)} às ${a.hora}`, a.profId);
  }
  return { ok: true, whats: whatsEmpresa(E) };
});
// Regra: cancelou até o dia anterior → sinal devolvido. No dia do horário → sinal não é devolvido (precisa reagendar e pagar de novo).
route('POST', T + '/meus/:id/cancelar', 'any', (req, b, p) => {
  const E = req.E, a = E.agendamentos.find(a => a.id === p.id && a.clienteId === req.user.id);
  if (!a || a.status !== 'agendado') fail(404, 'Agendamento não encontrado.');
  const hoje = agora(E.config.tz).data;
  if (a.data < hoje) fail(400, 'Esse horário já passou.');
  const antecedencia = hoje < a.data;
  a.status = 'cancelado'; a.canceladoPor = 'cliente';
  a.cancelamento = { em: new Date().toISOString(), antecedencia };
  let extra = '', reembolso = 'sem-sinal';
  if (a.sinal) {
    if (a.sinal.status === 'pendente') { a.sinal.status = 'nao-pago'; reembolso = 'nao-pago'; }
    else if (['informado', 'pago'].includes(a.sinal.status)) {
      a.sinal.status = antecedencia ? 'devolver' : 'retido';
      reembolso = antecedencia ? 'devolver' : 'retido';
      extra = antecedencia ? `\n↩️ Devolver o sinal de ${brl(a.sinal.valor)} (cancelou com antecedência)` : `\n🔒 Sinal de ${brl(a.sinal.valor)} não será devolvido (cancelou no dia)`;
    }
  }
  changed(E);
  pushAdmins(E, '❌ Cliente cancelou', `${a.clienteNome} cancelou ${a.servicoNome}\n${fmtData(a.data)} às ${a.hora}${extra}`, a.profId);
  return { ok: true, reembolso, valor: a.sinal?.valor || 0 };
});
// Esqueci minha senha: avisa o estabelecimento, que cria uma nova senha e envia no WhatsApp do cliente.
const pedidosSenha = new Map();
route('POST', T + '/esqueci', 'empresa', (req, b) => {
  const E = req.E, tel = digits(b.tel);
  if (tel.length < 10) fail(400, 'Informe o telefone com DDD que você usou no cadastro.');
  const k = req.ip + '|' + E.meta.slug, t = pedidosSenha.get(k) || [];
  const recentes = t.filter(x => Date.now() - x < 60 * 60e3);
  if (recentes.length >= 5) fail(429, 'Muitos pedidos. Tente de novo mais tarde ou chame o estabelecimento no WhatsApp.');
  recentes.push(Date.now()); pedidosSenha.set(k, recentes);
  const u = E.users.find(u => u.role === 'cliente' && (u.login === tel || digits(u.tel) === tel));
  if (u && !u.bloqueado) {
    const novo = !u.pedidoSenha;
    u.pedidoSenha = new Date().toISOString();
    changed(E);
    if (novo || recentes.length === 1) pushAdmins(E, '🔑 Cliente esqueceu a senha', `${u.nome} (${u.tel || tel}) pediu uma nova senha.\nAbra Clientes para gerar e enviar no WhatsApp.`);
  }
  return { ok: true, encontrado: !!u, whats: whatsEmpresa(E) };
});

/* ----- avisos para o cliente (o estabelecimento cancelou, mudou o horário, confirmou o sinal…) ----- */
function avisosCliente(E, antes, a) {
  if (!a || !a.clienteId || !antes) return;
  const quando = `${fmtData(a.data)} às ${a.hora}`, neg = E.config.negocio;
  let t = '', m = '';
  if (antes.status === 'agendado' && a.status === 'cancelado' && a.canceladoPor !== 'cliente') {
    t = '❌ Seu horário foi cancelado';
    m = `${neg} cancelou ${a.servicoNome} de ${quando}.`;
    if (a.sinal && ['devolver', 'devolvido'].includes(a.sinal.status)) m += `\nSeu sinal de ${brl(a.sinal.valor)} será devolvido.`;
    m += '\nToque para remarcar.';
  } else if (antes.status === 'agendado' && a.status === 'agendado' && (antes.data !== a.data || antes.hora !== a.hora)) {
    t = '🔁 Seu horário mudou';
    m = `${a.servicoNome} em ${neg}: agora ${quando} (antes ${fmtData(antes.data)} às ${antes.hora}).`;
  } else if (antes.sinal && a.sinal && antes.sinal.status !== a.sinal.status) {
    if (a.sinal.status === 'pago') { t = '✅ Sinal confirmado'; m = `${neg} confirmou seu Pix de ${brl(a.sinal.valor)}. Seu horário de ${quando} está garantido.`; }
    if (a.sinal.status === 'devolvido') { t = '↩️ Sinal devolvido'; m = `${neg} devolveu seu sinal de ${brl(a.sinal.valor)}.`; }
  }
  if (t) pushAdmins(E, t, m, null, a.clienteId).catch(() => { });
}

/* ----- empresa: dono ----- */
function snapshot(E, user) {
  if (user && user.role === 'func') {
    // Funcionário: só a própria agenda, os serviços e a lista de clientes (nome e telefone).
    const meus = E.agendamentos.filter(a => a.profId === user.profId);
    const ids = new Set(meus.map(a => a.id));
    const { cpf, ...empresaSemCpf } = E.config.empresa || {};
    return {
      config: { ...E.config, empresa: empresaSemCpf }, servicos: E.servicos, profissionais: E.profissionais.map(({ id, nome, ativo }) => ({ id, nome, ativo })),
      users: E.users.filter(u => u.role === 'cliente').map(({ id, nome, tel, role }) => ({ id, nome, tel, role })),
      agendamentos: meus, lancamentos: E.lancamentos.filter(l => ids.has(l.ref)),
      produtos: [], compras: [], vendas: []
    };
  }
  const d = { config: E.config };
  for (const c of COLS) d[c] = c === 'users' ? E.users.map(pubUser) : E[c];
  return d;
}
route('GET', T + '/db', 'staff', req => {
  const v = +req.query.get('v');
  return v === req.E.version ? { v, same: true } : { v: req.E.version, data: snapshot(req.E, req.user) };
});
// Funcionário só altera agendamentos da própria agenda e lança a entrada ao concluir.
function syncFuncionario(E, user, changes) {
  for (const ch of changes) {
    if (ch.op === 'del' && ch.col === 'agendamentos') { // funcionário só remove bloqueios da própria agenda
      const ex = E.agendamentos.find(a => a.id === ch.id);
      if (ex && ex.status === 'bloqueio' && ex.profId === user.profId) E.agendamentos = E.agendamentos.filter(a => a.id !== ch.id);
      continue;
    }
    const doc = ch.doc;
    if (ch.op !== 'put' || !doc || typeof doc.id !== 'string') continue;
    if (ch.col === 'agendamentos') {
      const ex = E.agendamentos.find(a => a.id === doc.id);
      if (doc.profId !== user.profId || (ex && ex.profId !== user.profId)) continue;
      const antes = ex ? JSON.parse(JSON.stringify(ex)) : null;
      if (ex) Object.assign(ex, doc); else E.agendamentos.push(doc);
      avisosCliente(E, antes, ex);
    } else if (ch.col === 'lancamentos') {
      const ag = E.agendamentos.find(a => a.id === doc.ref);
      if (doc.tipo !== 'entrada' || !ag || ag.profId !== user.profId || E.lancamentos.some(l => l.id === doc.id)) continue;
      E.lancamentos.push({ ...doc, por: user.nome });
    }
  }
  changed(E);
  return { v: E.version };
}
route('POST', T + '/sync', 'staff', (req, b) => {
  const E = req.E;
  if (req.user.role === 'func') return syncFuncionario(E, req.user, Array.isArray(b.changes) ? b.changes : []);
  for (const ch of Array.isArray(b.changes) ? b.changes : []) {
    if (ch.col === 'config') {
      if (ch.doc && typeof ch.doc === 'object') { const { nicho, ...resto } = ch.doc; if ('empresa' in resto) resto.empresa = limparEmpresa(resto.empresa); if ('pix' in resto) resto.pix = limparPix(resto.pix); E.config = { ...E.config, ...resto }; } // nicho só pela Central
      continue;
    }
    if (!COLS.includes(ch.col)) continue;
    const arr = E[ch.col];
    if (ch.op === 'del') {
      if (ch.col === 'users' && arr.find(u => u.id === ch.id)?.role === 'admin') continue;
      E[ch.col] = arr.filter(x => x.id !== ch.id);
      continue;
    }
    const doc = ch.doc;
    if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string') continue;
    if (ch.col === 'users') {
      const { novaSenha, hasSenha, senha, ...clean } = doc;
      const ex = arr.find(u => u.id === doc.id);
      if (ex) {
        const keep = { senha: ex.senha, role: ex.role, pedidoSenha: ex.pedidoSenha, ...(ex.role === 'admin' ? { login: ex.login, bloqueado: false } : {}), ...(ex.role === 'func' ? { login: ex.login, profId: ex.profId } : {}) };
        Object.assign(ex, clean, keep);
        if (!ex.pedidoSenha) delete ex.pedidoSenha;
        if (novaSenha && ex.role === 'cliente') {
          ex.senha = hashPw(novaSenha); delete ex.pedidoSenha;
          for (const [k, s] of Object.entries(E.sessions)) if (s.uid === ex.id) delete E.sessions[k];
        }
      } else arr.push({ ...clean, role: 'cliente', senha: novaSenha ? hashPw(novaSenha) : '' });
      continue;
    }
    const i = arr.findIndex(x => x.id === doc.id);
    const antes = ch.col === 'agendamentos' && i >= 0 ? arr[i] : null;
    if (i >= 0) arr[i] = doc; else arr.push(doc);
    if (antes) avisosCliente(E, antes, doc);
  }
  changed(E);
  return { v: E.version };
});
route('POST', T + '/senha', 'admin', (req, b) => {
  if (!checkPw(b.atual, req.user.senha)) fail(400, 'Senha atual incorreta.');
  if (String(b.nova || '').length < 4) fail(400, 'Nova senha muito curta.');
  const login = str(b.login, 60).toLowerCase();
  if (login && loginEmUso(login, req.E.meta.slug, req.user.id)) fail(409, 'Esse usuário já está em uso. Escolha outro.');
  if (login) req.user.login = login;
  req.user.senha = hashPw(b.nova);
  changed(req.E); return { ok: true };
});
// Equipe e clientes inscrevem o aparelho. Clientes: até 3 aparelhos cada, sem empurrar os aparelhos da equipe para fora.
route('POST', T + '/push/subscribe', 'any', (req, b) => {
  const E = req.E;
  if (!b.sub?.endpoint || !b.sub?.keys?.p256dh || String(b.sub.endpoint).length > 1000) fail(400, 'Inscrição inválida.');
  E.pushSubs = E.pushSubs.filter(s => s.sub.endpoint !== b.sub.endpoint);
  E.pushSubs.push({ uid: req.user.id, sub: b.sub, em: new Date().toISOString(), aparelho: str(b.aparelho, 60) });
  const papel = s => E.users.find(u => u.id === s.uid)?.role || '';
  const minhas = E.pushSubs.filter(s => s.uid === req.user.id);
  if (req.user.role === 'cliente' && minhas.length > 3) E.pushSubs = E.pushSubs.filter(s => s.uid !== req.user.id || minhas.slice(-3).includes(s));
  const equipe = E.pushSubs.filter(s => papel(s) !== 'cliente'), clientes = E.pushSubs.filter(s => papel(s) === 'cliente');
  E.pushSubs = [...equipe.slice(-20), ...clientes.slice(-500)];
  salvar(E); return { ok: true, aparelhos: E.pushSubs.filter(s => s.uid === req.user.id).length };
});
route('POST', T + '/push/teste', 'any', async req => {
  const cli = req.user.role === 'cliente';
  const resultados = await pushAdmins(req.E, '🔔 Avisos ativados', cli ? `Você será avisado aqui sobre seus horários em ${req.E.config.negocio}.` : 'Notificações funcionando! Você será avisado a cada novo agendamento.', null, req.user.id);
  return { resultados, aparelhos: resultados.length };
});
route('POST', T + '/push/remover', 'any', (req, b) => {
  req.E.pushSubs = req.E.pushSubs.filter(s => s.sub.endpoint !== b.endpoint); salvar(req.E); return { ok: true };
});
/* ----- equipe (funcionários com acesso ao app) ----- */
route('POST', T + '/equipe', 'admin', async (req, b) => {
  const E = req.E, nome = str(b.nome, 80);
  let pr = b.profId ? E.profissionais.find(p => p.id === b.profId) : null;
  if (b.profId && !pr) fail(404, 'Funcionário não encontrado.');
  if (!pr) { if (!nome) fail(400, 'Informe o nome do funcionário.'); pr = { id: uid(), nome, ativo: true }; E.profissionais.push(pr); }
  if (nome) pr.nome = nome;
  if (b.tel !== undefined) pr.tel = str(b.tel, 30);
  if (b.ativo !== undefined) pr.ativo = !!b.ativo;
  let u = E.users.find(x => x.role === 'func' && x.profId === pr.id);
  if (b.login) {
    const login = str(b.login, 80).toLowerCase();
    if (!LOGIN_RE.test(login)) fail(400, 'Usuário: mínimo 3 caracteres, sem espaços nem acentos.');
    if (loginEmUso(login, E.meta.slug, u?.id) || E.users.some(x => x.login === login && x.id !== u?.id)) fail(409, 'Esse usuário já está em uso. Escolha outro (ex.: nome.sobrenome).');
    if (!u && String(b.senha || '').length < 4) fail(400, 'Crie uma senha com pelo menos 4 caracteres.');
    if (!u) { u = { id: uid(), role: 'func', profId: pr.id, criado: hojeSP() }; E.users.push(u); }
    u.login = login;
  }
  if (u) {
    u.nome = pr.nome; u.tel = pr.tel || '';
    if (b.senha) { if (String(b.senha).length < 4) fail(400, 'Senha: mínimo 4 caracteres.'); u.senha = hashPw(b.senha); for (const [k, s] of Object.entries(E.sessions)) if (s.uid === u.id) delete E.sessions[k]; }
    u.bloqueado = pr.ativo === false;
    if (u.bloqueado) for (const [k, s] of Object.entries(E.sessions)) if (s.uid === u.id) delete E.sessions[k];
  }
  changed(E); if (!(await gravarAgora())) fail(503, ERRO_BANCO);
  return { ok: true, profId: pr.id };
});
route('DELETE', T + '/equipe/:profId/acesso', 'admin', async (req, b, p) => {
  const E = req.E, u = E.users.find(x => x.role === 'func' && x.profId === p.profId);
  if (u) {
    E.users = E.users.filter(x => x !== u);
    for (const [k, s] of Object.entries(E.sessions)) if (s.uid === u.id) delete E.sessions[k];
    E.pushSubs = E.pushSubs.filter(s => s.uid !== u.id);
  }
  changed(E); if (!(await gravarAgora())) fail(503, ERRO_BANCO);
  return { ok: true };
});

route('GET', T + '/backup', 'admin', req => {
  const d = { config: req.E.config, backupEm: new Date().toISOString() };
  for (const c of COLS) d[c] = req.E[c];
  return d;
});
route('POST', T + '/restore', 'admin', (req, b) => {
  const E = req.E;
  if (!b.config || !Array.isArray(b.users)) fail(400, 'Arquivo de backup inválido.');
  const nicho = E.config.nicho;
  E.config = { ...b.config, nicho };
  for (const c of COLS) if (c !== 'users' && Array.isArray(b[c])) E[c] = b[c];
  // usuários: mantém o dono atual e restaura só os clientes
  E.users = E.users.filter(u => u.role === 'admin' || u.role === 'func').concat(b.users.filter(u => u.role === 'cliente').map(u => ({ ...u, senha: u.senha && u.senha.includes(':') ? u.senha : '' })));
  changed(E); return { ok: true };
});

/* ================= Central ================= */
route('POST', '/api/central/login', null, (req, b) => {
  if (!CENTRAL_SENHA) fail(503, 'Central desativada: configure CENTRAL_SENHA no servidor.');
  if (bloqueado(req.ip)) fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
  if (!igual(str(b.login).toLowerCase(), CENTRAL_USUARIO) || !igual(String(b.senha || ''), CENTRAL_SENHA)) { falhou(req.ip); fail(401, 'Usuário ou senha incorretos.'); }
  const token = novaSessao(META.sessions, 'central'); marcar('meta'); flush();
  return { token };
});
route('POST', '/api/central/logout', 'central', req => { delete META.sessions[req.token]; marcar('meta'); flush(); return { ok: true }; });

function resumo(E) {
  const mes = hojeSP().slice(0, 7);
  const dono = E.users.find(u => u.role === 'admin');
  return {
    slug: E.meta.slug, negocio: E.config.negocio, nicho: E.config.nicho,
    dono: dono?.nome || '', login: dono?.login || '', donoTel: E.meta.donoTel || '',
    criado: E.meta.criado, vence: E.meta.vence || '', valor: valorPlano(E), ajustado: ehAjustado(E), obs: E.meta.obs || '',
    bloqueado: !!E.meta.bloqueado, situacao: situacao(E),
    clientes: E.users.filter(u => u.role === 'cliente').length,
    agMes: E.agendamentos.filter(a => (a.data || '').startsWith(mes) && a.status !== 'cancelado' && a.status !== 'bloqueio').length,
    agApp: E.agendamentos.filter(a => (a.data || '').startsWith(mes) && a.criadoPor === 'cliente').length,
    ultimoUso: E.agendamentos.map(a => a.criadoEm || '').sort().pop()?.slice(0, 10) || '',
    aparelhosPush: E.pushSubs.length, trial: !!E.meta.trial, email: E.meta.email || '', origem: E.meta.origem || '',
    funcionarios: E.users.filter(u => u.role === 'func').length,
    pagInformado: E.meta.pagInformado || null, pagPendente: E.meta.pagPendente || null, temLogo: !!E.config.empresa?.logo, cnpj: E.config.empresa?.cnpj || ''
  };
}
route('GET', '/api/central/empresas', 'central', () => ({
  banco: { tipo: pool ? 'postgres' : 'arquivo', pendentes: sujos.size, ultimaGravacao: ST.ultimaGravacao, ultimoErro: sujos.size ? ST.ultimoErro : '', iniciadoEm: INICIO },
  hoje: hojeSP(), suporte: SUPORTE, vapidPublic: META.vapid?.publicKey, aparelhosCentral: META.centralSubs.length,
  eventos: META.eventos.slice(0, 60), lidosAte: META.lidosAte || '', naoLidos: META.eventos.filter(e => e.em > (META.lidosAte || '')).length,
  empresas: Object.values(EMP).map(resumo).sort((a, b) => a.negocio.localeCompare(b.negocio)) }));

async function criarEmpresa(b, extraMeta = {}) {
  const negocio = str(b.negocio, 80), nicho = str(b.nicho, 30), login = str(b.login, 80).toLowerCase();
  if (!negocio) fail(400, 'Informe o nome do negócio.');
  if (!NICHOS[nicho]) fail(400, 'Escolha o nicho.');
  if (!LOGIN_RE.test(login)) fail(400, 'Usuário: mínimo 3 caracteres, sem espaços nem acentos.');
  if (String(b.senha || '').length < 4) fail(400, 'Senha: mínimo 4 caracteres.');
  if (loginEmUso(login)) fail(409, 'Esse usuário já está em uso por outro assinante.');
  let slug = slugify(b.slug || negocio);
  if (b.slug) { if (EMP[slug] || RESERVADOS.has(slug)) fail(409, `O link /${slug} já está em uso.`); }
  else slug = slugLivre(negocio);
  const E = blankEmp(), hoje = hojeSP(), N = NICHOS[nicho];
  E.meta = { slug, criado: hoje, vence: isoData(b.vence) ? b.vence : '', bloqueado: false, valor: n(b.valor), donoTel: str(b.donoTel, 30), email: str(b.email, 120).toLowerCase(), obs: str(b.obs, 300), trial: !!b.trial, ...extraMeta };
  E.config = { negocio, nicho, abre: '09:00', fecha: '19:00', intervalo: 30, dias: [1, 2, 3, 4, 5, 6], tz: TZ_PADRAO };
  const dono = { id: uid(), nome: str(b.dono, 80) || negocio, login, senha: hashPw(b.senha), role: 'admin', tel: str(b.donoTel, 30), criado: hoje };
  E.users.push(dono);
  E.profissionais.push({ id: uid(), nome: dono.nome, ativo: true });
  E.servicos = N.servicos.map(([nome, preco, duracao]) => ({ id: uid(), nome, preco, duracao, ativo: true }));
  E.produtos = N.produtos.map(([nome, custo, preco, qtd]) => ({ id: uid(), nome, custo, preco, qtd, min: Math.max(2, Math.round(qtd / 3)) }));
  EMP[slug] = E; changed(E);
  if (!(await gravarAgora())) { delete EMP[slug]; sujos.delete('t:' + slug); fail(503, ERRO_BANCO); }
  return E;
}
route('POST', '/api/central/empresas', 'central', async (req, b) => ({ empresa: resumo(await criarEmpresa(b)) }));

/* ----- "já paguei": avisa a Central (o comprovante vai pelo WhatsApp) ----- */
const avisosPg = new Map();
route('POST', '/api/pagamento-informado', null, (req, b) => {
  const lst = (avisosPg.get(req.ip) || []).filter(t => Date.now() - t < 36e5);
  if (lst.length >= 5) return { ok: true };
  avisosPg.set(req.ip, [...lst, Date.now()]);
  const E = EMP[str(b.slug, 60)], anual = b.plano === 'anual', ajust = b.plano === 'ajustado' && E && ehAjustado(E);
  const nome = E ? E.config.negocio : (str(b.negocio, 80) || 'Visitante do site');
  const txt = ajust ? `ajustado · R$ ${valorPlano(E).toFixed(2).replace('.', ',')}` : anual ? 'anual · R$ 399,90' : 'mensal · R$ 39,90';
  evento('pago', `💰 Pagamento informado: ${nome}`, `Plano ${txt}. Confira o comprovante no WhatsApp e libere em "${E?.meta.trial ? 'Ativar plano' : 'Renovar'}" (${anual ? '365' : '30'} dias).`, E ? E.meta.slug : '');
  if (E) { E.meta.pagInformado = { plano: ajust ? 'ajustado' : anual ? 'anual' : 'mensal', em: new Date().toISOString() }; delete E.meta.pagPendente; salvar(E); }
  return { ok: true };
});

/* ----- teste grátis pelo site ----- */
const cadastrosIp = new Map();
route('POST', '/api/teste', null, async (req, b) => {
  const nome = str(b.nome, 80), loja = str(b.loja, 80), nicho = str(b.nicho, 30), email = str(b.email, 120).toLowerCase(), whats = digits(b.whatsapp);
  if (nome.split(/\s+/).length < 2) fail(400, 'Informe seu nome completo.');
  if (loja.length < 2) fail(400, 'Informe o nome da sua loja.');
  if (!NICHOS[nicho]) fail(400, 'Escolha o seu ramo.');
  if (whats.length < 10 || whats.length > 13) fail(400, 'Informe um WhatsApp com DDD.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !LOGIN_RE.test(email)) fail(400, 'Informe um e-mail válido.');
  if (String(b.senha || '').length < 6) fail(400, 'Crie uma senha com pelo menos 6 caracteres.');
  const tel = whats.replace(/^55(?=\d{10,11}$)/, '');
  const ja = Object.values(EMP).find(E => E.meta.email === email || digits(E.meta.donoTel).replace(/^55(?=\d{10,11}$)/, '') === tel || E.users.some(u => u.role === 'admin' && u.login === email));
  const assinar = ['mensal', 'anual'].includes(b.assinar) ? b.assinar : '';
  if (assinar && ja) { // já tem conta e quer assinar: se a senha confere, segue para o pagamento dessa conta
    const dono = ja.users.find(u => u.role === 'admin');
    if (dono && dono.login === email && checkPw(b.senha, dono.senha)) {
      ja.meta.pagPendente = { plano: assinar, em: new Date().toISOString() };
      const token = novaSessao(ja.sessions, dono.id); salvar(ja);
      evento('assinatura', `🛒 Quer assinar: ${ja.config.negocio}`, `Plano ${assinar}. Conta já existente (${email}). Aguardando o Pix.`, ja.meta.slug);
      return { slug: ja.meta.slug, token, login: email, vence: ja.meta.vence, existente: true };
    }
    fail(409, 'Já existe uma conta com esse e-mail ou WhatsApp. Use a mesma senha da sua conta, ou siga para o pagamento abaixo.');
  }
  if (ja || META.testesUsados.includes(email) || META.testesUsados.includes(tel)) fail(409, assinar ? 'Já existe uma conta com esse e-mail ou WhatsApp. Use a mesma senha da sua conta, ou siga para o pagamento abaixo.' : 'Já existe uma conta com esse e-mail ou WhatsApp. Entre em /entrar ou chame no WhatsApp para assinar.');
  const ip = cadastrosIp.get(req.ip) || []; const recentes = ip.filter(t => Date.now() - t < 864e5);
  if (recentes.length >= 3) fail(429, 'Muitos cadastros deste aparelho hoje. Chame no WhatsApp.');
  cadastrosIp.set(req.ip, [...recentes, Date.now()]);
  const vence = somaDias(hojeSP(), DIAS_TESTE);
  const E = await criarEmpresa({ negocio: loja, nicho, login: email, senha: b.senha, dono: nome, donoTel: str(b.whatsapp, 30), email, vence, valor: VALOR_PADRAO, trial: true, obs: assinar ? `Assinatura pelo site (plano ${assinar}) · aguardando Pix` : 'Teste grátis pelo site' }, { origem: 'site', ...(assinar ? { pagPendente: { plano: assinar, em: new Date().toISOString() } } : {}) });
  META.testesUsados.push(email, tel); marcar('meta');
  const dono = E.users.find(u => u.role === 'admin');
  const token = novaSessao(E.sessions, dono.id); salvar(E);
  if (assinar) evento('assinatura', `🛒 Nova assinatura: ${loja}`, `${nome} · ${NICHOS[nicho].label} · plano ${assinar} · WhatsApp ${str(b.whatsapp, 30)} · ${email}. Conta criada (3 dias liberados) e aguardando o Pix.`, E.meta.slug);
  else evento('teste', `🎉 Novo teste grátis: ${loja}`, `${nome} · ${NICHOS[nicho].label} · WhatsApp ${str(b.whatsapp, 30)} · ${email}`, E.meta.slug);
  return { slug: E.meta.slug, token, login: email, vence };
});

route('POST', '/api/central/eventos/lidos', 'central', () => { META.lidosAte = new Date().toISOString(); marcar('meta'); flush(); return { ok: true }; });
route('POST', '/api/central/push/subscribe', 'central', (req, b) => {
  if (!b.sub?.endpoint || !b.sub?.keys?.p256dh) fail(400, 'Inscrição inválida.');
  META.centralSubs = META.centralSubs.filter(s => s.sub.endpoint !== b.sub.endpoint);
  META.centralSubs.push({ sub: b.sub, aparelho: str(b.aparelho, 60), em: new Date().toISOString() });
  META.centralSubs = META.centralSubs.slice(-10);
  marcar('meta'); flush(); return { ok: true, aparelhos: META.centralSubs.length };
});
route('POST', '/api/central/push/teste', 'central', async () => ({ resultados: await pushCentral('🔔 Central AgendaPro', 'Notificações da Central funcionando! Você será avisado de cada teste grátis novo e dos vencimentos.') }));

const empCentral = slug => EMP[slug] || fail(404, 'Empresa não encontrada.');
route('PUT', '/api/central/empresas/:slug', 'central', async (req, b, p) => {
  const E = empCentral(p.slug);
  if (b.negocio !== undefined && str(b.negocio)) E.config.negocio = str(b.negocio, 80);
  if (b.nicho !== undefined) {
    if (!NICHOS[b.nicho]) fail(400, 'Nicho inválido.');
    if (b.nicho !== E.config.nicho && b.recarregarServicos) E.servicos = NICHOS[b.nicho].servicos.map(([nome, preco, duracao]) => ({ id: uid(), nome, preco, duracao, ativo: true }));
    E.config.nicho = b.nicho;
  }
  if (b.vence !== undefined) E.meta.vence = isoData(b.vence) ? b.vence : '';
  if (b.valor !== undefined) {
    const novo = Math.max(0, Math.round(n(b.valor) * 100) / 100), antes = valorPlano(E);
    E.meta.valor = novo;
    if (Math.abs(valorPlano(E) - antes) > 0.004) pushAdmins(E, ehAjustado(E) ? '💲 Seu plano foi ajustado' : '💲 Valor do plano atualizado', `Sua mensalidade do AgendaPro agora é R$ ${valorPlano(E).toFixed(2).replace('.', ',')}/mês${ehAjustado(E) ? ' (plano ajustado)' : ''}.`).catch(() => { });
  }
  if (b.donoTel !== undefined) E.meta.donoTel = str(b.donoTel, 30);
  if (b.obs !== undefined) E.meta.obs = str(b.obs, 300);
  if (b.bloqueado !== undefined) E.meta.bloqueado = !!b.bloqueado;
  if (b.trial !== undefined) E.meta.trial = !!b.trial;
  if (b.email !== undefined) E.meta.email = str(b.email, 120).toLowerCase();
  const dono = E.users.find(u => u.role === 'admin');
  if (b.dono !== undefined && str(b.dono) && dono) dono.nome = str(b.dono, 80);
  if (b.login !== undefined && dono) {
    const login = str(b.login, 60).toLowerCase();
    if (!LOGIN_RE.test(login)) fail(400, 'Usuário inválido.');
    if (loginEmUso(login, E.meta.slug, dono.id)) fail(409, 'Esse usuário já está em uso por outro assinante.');
    dono.login = login;
  }
  changed(E); if (!(await gravarAgora())) fail(503, ERRO_BANCO);
  return { empresa: resumo(E) };
});
route('POST', '/api/central/empresas/:slug/renovar', 'central', async (req, b, p) => {
  const E = empCentral(p.slug), dias = Math.min(Math.max(parseInt(b.dias) || 30, 1), 3660);
  const base = E.meta.vence && E.meta.vence > hojeSP() ? E.meta.vence : hojeSP();
  E.meta.vence = somaDias(base, dias); E.meta.bloqueado = false; E.meta.trial = false; E.meta.avisos = {}; delete E.meta.pagInformado; delete E.meta.pagPendente;
  changed(E); if (!(await gravarAgora())) fail(503, ERRO_BANCO);
  return { empresa: resumo(E) };
});
route('POST', '/api/central/empresas/:slug/senha', 'central', async (req, b, p) => {
  const E = empCentral(p.slug), dono = E.users.find(u => u.role === 'admin');
  if (String(b.senha || '').length < 4) fail(400, 'Senha: mínimo 4 caracteres.');
  dono.senha = hashPw(b.senha);
  for (const [k, s] of Object.entries(E.sessions)) if (s.uid === dono.id) delete E.sessions[k];
  changed(E); if (!(await gravarAgora())) fail(503, ERRO_BANCO);
  return { ok: true };
});
route('DELETE', '/api/central/empresas/:slug', 'central', async (req, b, p) => {
  const E = empCentral(p.slug);
  if (b.confirm !== E.meta.slug) fail(400, 'Digite o link da empresa para confirmar.');
  delete EMP[p.slug]; marcar('t:' + p.slug);
  if (!(await gravarAgora())) fail(503, ERRO_BANCO);
  return { ok: true };
});
route('GET', '/api/central/empresas/:slug/backup', 'central', (req, b, p) => {
  const E = empCentral(p.slug), d = { config: E.config, meta: E.meta, backupEm: new Date().toISOString() };
  for (const c of COLS) d[c] = E[c];
  return d;
});

/* ================= http ================= */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

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
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let INDEX_HTML = null;
function paginaEmpresa(res, slug) {
  INDEX_HTML = INDEX_HTML || fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const E = slug && EMP[slug];
  let html = INDEX_HTML;
  if (E) {
    html = html.replace('<title>AgendaPro Beleza</title>', `<title>${escHtml(E.config.negocio)} · Agendamento</title>`)
      .replace('href="/manifest.json"', `href="/m/${slug}.webmanifest"`);
    if (E.config.empresa?.logo) html = html.replace(/href="\/icons\/icon-192\.png"/g, `href="/m/${slug}.logo"`);
  }
  res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
  res.end(html);
}
function manifestEmpresa(res, slug) {
  const E = EMP[slug];
  if (!E) { res.writeHead(404); return res.end(); }
  const cor = NICHOS[E.config.nicho]?.cor || '#14121a';
  res.writeHead(200, { 'Content-Type': MIME['.webmanifest'], 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify({
    name: E.config.negocio, short_name: E.config.negocio.slice(0, 12), description: 'Agende seu horário online',
    id: '/' + slug, start_url: '/' + slug, scope: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#14121a', theme_color: cor, lang: 'pt-BR',
    icons: E.config.empresa?.logo
      ? [{ src: `/m/${slug}.logo`, sizes: '512x512', type: E.config.empresa.logo.slice(5, E.config.empresa.logo.indexOf(';')), purpose: 'any' }, { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' }]
      : [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
  }));
}
function logoEmpresa(res, slug) {
  const l = EMP[slug]?.config.empresa?.logo;
  if (!l) { res.writeHead(302, { Location: '/icons/icon-192.png' }); return res.end(); }
  const i = l.indexOf(';base64,');
  res.writeHead(200, { 'Content-Type': l.slice(5, i), 'Cache-Control': 'public, max-age=300' });
  res.end(Buffer.from(l.slice(i + 8), 'base64'));
}
function serveStatic(req, res, pathname) {
  const seg = decodeURIComponent(pathname).split('/').filter(Boolean);
  if (seg.length === 0) {                                               // site de vendas (se faltar, abre o login)
    if (!fs.existsSync(path.join(PUBLIC, 'site.html'))) return paginaEmpresa(res, null);
    pathname = '/site.html';
  }
  else if (seg[0] === 'entrar' && seg.length === 1) return paginaEmpresa(res, null); // login do assinante
  else if (seg[0] === 'central' && seg.length === 1) pathname = '/central.html';
  else if (seg[0] === 'm' && seg.length === 2 && seg[1].endsWith('.webmanifest')) return manifestEmpresa(res, seg[1].replace('.webmanifest', ''));
  else if (seg[0] === 'm' && seg.length === 2 && seg[1].endsWith('.logo')) return logoEmpresa(res, seg[1].replace('.logo', ''));
  else if (seg.length === 1 && !seg[0].includes('.')) return paginaEmpresa(res, seg[0]);
  const file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Não encontrado'); }
  const ext = path.extname(file), size = fs.statSync(file).size;
  const head = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ['.html', '.js', '.css', '.json'].includes(ext) ? 'no-cache' : 'public, max-age=604800', 'Accept-Ranges': 'bytes' };
  // Vídeo: responde por partes (Range) — o iPhone exige isso para tocar.
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    let ini = m[1] ? +m[1] : size - +m[2], fim = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (ini < 0) ini = 0;
    if (ini >= size || ini > fim) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${ini}-${fim}/${size}`, 'Content-Length': fim - ini + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start: ini, end: fim }).pipe(res);
  }
  res.writeHead(200, { ...head, 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function autenticar(store, req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const s = token && store[token];
  if (!s || s.exp < Date.now()) fail(401, 'Faça login novamente.');
  req.token = token;
  return s;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  req.ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  req.query = url.searchParams;
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  try {
    const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!r) fail(404, 'Rota não encontrada.');
    const params = url.pathname.match(r.re).groups || {};
    if (r.auth === 'central') autenticar(META.sessions, req);
    else if (r.auth) {
      const E = EMP[params.slug];
      if (!E) fail(404, 'Empresa não encontrada. Confira o link.');
      req.E = E;
      if (r.auth !== 'empresa') {
        const s = autenticar(E.sessions, req);
        const u = E.users.find(u => u.id === s.uid);
        if (!u || u.bloqueado) fail(401, 'Faça login novamente.');
        if (r.auth === 'admin' && u.role !== 'admin') fail(403, 'Acesso restrito ao administrador.');
        if (r.auth === 'staff' && u.role !== 'admin' && u.role !== 'func') fail(403, 'Acesso restrito à equipe.');
        req.user = u;
      }
      if (situacao(E) !== 'ativa' && !url.pathname.endsWith('/public')) fail(423, situacao(E) === 'vencida' ? 'Assinatura vencida. Fale com o suporte para renovar.' : 'Acesso suspenso. Fale com o suporte.');
    }
    const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    send(res, 200, await r.fn(req, body, params));
  } catch (e) {
    if (!(e instanceof HttpErr)) console.error(e);
    send(res, e.status || 500, { erro: e instanceof HttpErr ? e.message : 'Erro interno no servidor.' });
  }
});

loadDB().then(() => { setTimeout(verificarVencimentos, 5000); return server.listen(PORT, () => console.log(`AgendaPro rodando em http://localhost:${PORT}  ·  Central: /central`)); })
  .catch(e => { console.error('Não foi possível iniciar:', e); process.exit(1); });
