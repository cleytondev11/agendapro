/* AgendaPro Beleza — app (PWA) conectado ao servidor.
   Clientes agendam do próprio celular; o painel do dono recebe na hora. */

// Link da empresa: agendapro.com/nome-do-negocio  →  SLUG = 'nome-do-negocio'
const SLUG = (s => s === 'entrar' ? '' : s)(decodeURIComponent(location.pathname.split('/')[1] || '').toLowerCase());
const TOK_KEY = 'agendapro_token_' + SLUG;
const POLL_MS = 15000;

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PAGTOS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'];
const CAT_SAIDA = ['Aluguel', 'Energia/Água', 'Internet', 'Salários/Comissões', 'Compra de produtos', 'Manutenção', 'Marketing', 'Impostos', 'Outros'];
const CAT_ENTRADA = ['Serviço', 'Venda de produto', 'Outros'];
const COLS = ['users', 'profissionais', 'servicos', 'produtos', 'agendamentos', 'compras', 'vendas', 'lancamentos'];
const CLI_VIEWS = ['agendar', 'meus', 'perfil'];
const FUNC_VIEWS = ['agenda', 'resumo', 'perfil'];
const staff = () => me?.role === 'admin' || me?.role === 'func';
const isFunc = () => me?.role === 'func';

/* ---------------- utils ---------------- */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
const fmtData = s => s ? s.split('-').reverse().join('/') : '';
const toMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const toHora = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const mesAtual = () => today().slice(0, 7);
const num = v => parseFloat(String(v).replace(',', '.')) || 0;
const clone = o => JSON.parse(JSON.stringify(o));

function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------------- servidor ---------------- */
let TOKEN = localStorage.getItem(TOK_KEY) || '';
async function api(method, url, body) {
  let r;
  try {
    r = await fetch(url.startsWith('/api/login-dono') ? url : url.replace(/^\/api\//, `/api/t/${encodeURIComponent(SLUG)}/`), { method, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { setOffline(true); throw new Error('Sem conexão com o servidor.'); }
  setOffline(false);
  let j = null; try { j = await r.json(); } catch { }
  if (r.status === 401 && TOKEN && !url.startsWith('/api/login')) { setToken(''); me = null; boot(); throw new Error(j?.erro || 'Sessão expirada.'); }
  if (r.status === 423) { clearInterval(pollT); renderSuspenso(j?.erro); throw new Error(j?.erro || 'Acesso suspenso.'); }
  if (!r.ok) throw new Error(j?.erro || 'Erro no servidor.');
  return j;
}
function setToken(t) { TOKEN = t; t ? localStorage.setItem(TOK_KEY, t) : localStorage.removeItem(TOK_KEY); }
function setOffline(on) {
  let b = $('#offline');
  if (on && !b) { b = document.createElement('div'); b.id = 'offline'; b.className = 'offline'; b.textContent = 'Sem conexão — tentando reconectar…'; document.body.appendChild(b); }
  if (!on && b) b.remove();
}

/* ---------------- estado ---------------- */
const blank = () => ({ config: null, users: [], profissionais: [], servicos: [], produtos: [], agendamentos: [], compras: [], vendas: [], lancamentos: [] });
let S = blank(), snap = blank(), VER = -1, PUB = null;
let me = null, view = '', ASSIN = null;
const ui = { agendaData: today(), agendaProf: '', finMes: mesAtual(), busca: '', book: {}, slots: {}, novos: new Set() };
const byId = (col, id) => S[col].find(x => x.id === id);

/* Envia ao servidor apenas o que mudou desde a última sincronização. */
let syncQ = Promise.resolve(), syncing = 0;
function save() {
  if (!staff()) return;
  const changes = [];
  if (JSON.stringify(S.config) !== JSON.stringify(snap.config)) changes.push({ col: 'config', op: 'put', doc: clone(S.config) });
  for (const c of COLS) {
    const old = new Map(snap[c].map(d => [d.id, JSON.stringify(d)]));
    const cur = new Set();
    for (const d of S[c]) { cur.add(d.id); const j = JSON.stringify(d); if (old.get(d.id) !== j) changes.push({ col: c, op: 'put', doc: JSON.parse(j) }); }
    for (const id of old.keys()) if (!cur.has(id)) changes.push({ col: c, op: 'del', id });
  }
  S.users.forEach(u => { if (u.novaSenha) { delete u.novaSenha; u.hasSenha = true; } });
  snap = clone(S);
  if (!changes.length) return;
  syncing++;
  syncQ = syncQ.then(() => api('POST', '/api/sync', { changes }))
    .then(r => { if (r.v === VER + 1) VER = r.v; })
    .catch(e => { toast('Não salvou: ' + e.message, 4000); pull(true).then(() => rerender()); })
    .finally(() => syncing--);
}

async function pull(force) {
  const r = await api('GET', '/api/db?v=' + (force ? -1 : VER));
  if (r.same) return false;
  const primeira = VER === -1;
  const antes = new Map(S.agendamentos.map(a => [a.id, a.status]));
  S = Object.assign(blank(), r.data); snap = clone(S); VER = r.v;
  if (!primeira) avisarNovidades(antes);
  return true;
}

function avisarNovidades(antes) {
  const novos = S.agendamentos.filter(a => a.criadoPor === 'cliente' && !antes.has(a.id));
  const cancel = S.agendamentos.filter(a => a.canceladoPor === 'cliente' && a.status === 'cancelado' && antes.get(a.id) === 'agendado');
  if (!novos.length && !cancel.length) return;
  novos.forEach(a => ui.novos.add(a.id));
  const msg = novos.length
    ? `📅 Novo agendamento: ${novos[0].clienteNome} — ${fmtData(novos[0].data)} às ${novos[0].hora}${novos.length > 1 ? ` (+${novos.length - 1})` : ''}`
    : `❌ ${cancel[0].clienteNome} cancelou ${fmtData(cancel[0].data)} às ${cancel[0].hora}`;
  toast(msg, 6000); beep(); navigator.vibrate?.(200);
  if (document.hidden && window.Notification?.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification('AgendaPro', { body: msg, icon: 'icons/icon-192.png' }));
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(.15, ctx.currentTime + i * .18); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + i * .18 + .16); o.start(ctx.currentTime + i * .18); o.stop(ctx.currentTime + i * .18 + .17); });
  } catch { }
}

let pollT = null;
function startPolling() {
  clearInterval(pollT);
  pollT = setInterval(poll, POLL_MS);
}
async function poll() {
  if (!staff() || syncing || document.hidden) return;
  try { if (await pull(false)) rerender(); } catch { }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
window.addEventListener('online', poll);
let renderPendente = false;
function rerender() {
  if (!$('#modal').classList.contains('hidden')) { renderPendente = true; return; }
  if (view) go(view, true);
}

function applyTheme() {
  const cor = S.config ? (NICHOS[S.config.nicho]?.cor || '#d9668f') : '#d9668f';
  document.documentElement.style.setProperty('--ac', cor);
}
function lancar(tipo, descricao, valor, categoria, data = today(), ref = '', pagamento = '') {
  S.lancamentos.push({ id: uid(), tipo, descricao, valor: num(valor), categoria, data, ref, pagamento });
}

/* ---------------- sessão ---------------- */
async function boot() {
  if (!SLUG) return renderPortal();
  try { PUB = await api('GET', '/api/public'); }
  catch (e) { return /não encontrada/i.test(e.message) ? renderNaoEncontrada() : renderErro(e.message); }
  S.config = PUB.config; applyTheme();
  if (PUB.situacao !== 'ativa') { me = PUB.papel ? { role: PUB.papel } : null; return renderSuspenso(); }
  me = null;
  if (TOKEN) { try { const r = await api('GET', '/api/me'); me = r.user; ASSIN = r.assinatura || null; } catch { } }
  if (!me) return renderLogin();
  if (isFunc()) {
    VER = -1; await pull(true); applyTheme(); startPolling(); garantirPush();
    go(FUNC_VIEWS.includes(view) ? view : 'agenda');
  } else if (me.role === 'admin') {
    VER = -1; await pull(true); applyTheme(); startPolling(); garantirPush();
    go(view && !CLI_VIEWS.includes(view) ? view : 'dashboard');
  } else {
    clearInterval(pollT);
    S.servicos = PUB.servicos; S.profissionais = PUB.profissionais;
    go(CLI_VIEWS.includes(view) ? view : 'agendar');
  }
}
async function logout() {
  try { await api('POST', '/api/logout'); } catch { }
  setToken(''); me = null; view = ''; clearInterval(pollT); S = blank(); boot();
}
const empresaInfo = () => (S.config && S.config.empresa) || (PUB && PUB.empresa) || {};
const logoBox = icon => { const l = empresaInfo().logo; return l ? `<div class="logo logo-img"><img src="${l}" alt=""></div>` : `<div class="logo">${icon}</div>`; };
const telaSimples = (icon, titulo, html) => `<div class="auth"><div class="auth-card"><div class="brand"><div class="logo">${icon}</div><h1>${titulo}</h1></div>${html}</div></div>`;
function renderErro(msg) {
  $('#app').innerHTML = telaSimples('⚠️', 'Sem conexão', `<p class="mut" style="margin-top:10px">${esc(msg)} Verifique sua internet.</p><button class="btn block" onclick="boot()">Tentar de novo</button>`);
}
function renderNaoEncontrada() {
  $('#app').innerHTML = telaSimples('🔎', 'Link não encontrado', `<p class="mut" style="margin-top:10px">Confira se o endereço está certo. Se você é assinante, entre pela página inicial.</p><a class="btn block" href="/entrar">Ir para o login do assinante</a>`);
}
function renderSuspenso(msg) {
  const sup = PUB?.suporte, trial = PUB?.trial;
  const dono = me?.role === 'admin', func = me?.role === 'func';
  const valor = 'R$ ' + Number(PUB?.valor || 49.9).toFixed(2).replace('.', ',') + '/mês';
  const titulo = dono ? (trial ? 'Seu teste grátis terminou' : esc(msg || 'Sua assinatura está suspensa ou vencida.'))
    : func ? 'O acesso está suspenso no momento.' : 'A agenda online está temporariamente indisponível.';
  const texto = dono ? (trial ? `Gostou? Assine por <b>${valor}</b> e continue de onde parou: sua agenda, clientes e configurações estão guardados.` : 'Renove para voltar a usar o sistema. Seus dados estão guardados.')
    : func ? 'Fale com o responsável pelo estabelecimento.' : 'Entre em contato direto com o estabelecimento para marcar seu horário.';
  $('#app').innerHTML = telaSimples(trial && dono ? '🎁' : '⏸️', esc(PUB?.config?.negocio || 'Agenda'), `
    <p style="margin-top:14px;font-weight:700">${titulo}</p>
    <p class="mut small" style="margin-top:6px">${texto}</p>
    ${dono ? `<button class="btn block" onclick="abrirAssinatura()">${trial ? '💳 Assinar agora com Pix' : '💳 Renovar com Pix'}</button>
      <p class="mut small" style="margin-top:10px;text-align:center">Mensal R$ 49,90 · Anual R$ 399,90 (33% off)</p>` : ''}
    ${dono && sup ? `<a class="btn ghost block" target="_blank" rel="noopener" href="https://wa.me/${sup}?text=${encodeURIComponent('Olá! Preciso de ajuda com o acesso do AgendaPro. Negócio: ' + (PUB?.config?.negocio || '') + ' (link /' + SLUG + ').')}">💬 Falar com o suporte</a>` : ''}
    ${dono || func ? '<button class="btn ghost block" onclick="setToken(\'\');location.reload()">Sair</button>' : '<p class="small" style="margin-top:18px"><a href="/entrar" style="color:var(--mut)">É o dono? Entrar no painel</a></p>'}`);
}

/* ---------------- portal do assinante (página inicial) ---------------- */
function renderPortal() {
  document.title = 'AgendaPro · Área do assinante';
  $('#app').innerHTML = `
  <div class="auth"><div class="auth-card">
    <div class="brand"><div class="logo">✨</div><div><h1>AgendaPro</h1><div class="mut small">Área do assinante</div></div></div>
    <form id="f" style="margin-top:18px">
      <label>Usuário ou e-mail</label><input name="login" required autocomplete="username" autocapitalize="none">
      <label>Senha</label><input name="senha" type="password" required autocomplete="current-password">
      <div class="err" id="err"></div>
      <button class="btn block">Entrar no meu painel</button>
      <p class="mut small" style="margin-top:12px">Funcionários também entram por aqui, com o usuário criado pelo dono.</p>
      <p class="mut small" style="margin-top:12px">É cliente e quer agendar? Use o link que o estabelecimento enviou para você.</p>
      <p class="small" style="margin-top:8px"><a href="/" style="color:var(--mut)">Conhecer o AgendaPro</a></p>
    </form>
  </div></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('.btn'); btn.disabled = true;
    try {
      const r = await api('POST', '/api/login-dono', f);
      localStorage.setItem('agendapro_token_' + r.slug, r.token);
      location.href = '/' + r.slug;
    } catch (err) { $('#err').textContent = err.message; btn.disabled = false; }
  };
}

/* ---------------- login / cadastro de cliente ---------------- */
function renderLogin(tab = 'entrar') {
  const c = PUB.config, n = NICHOS[c.nicho] || NICHOS.barbearia;
  $('#app').innerHTML = `
  <div class="auth"><div class="auth-card">
    <div class="brand">${logoBox(n.icon)}<div><h1>${esc(c.negocio)}</h1><div class="mut small">${n.label} · agendamento online</div></div></div>
    <div class="tabs"><button class="${tab === 'entrar' ? 'on' : ''}" onclick="renderLogin('entrar')">Entrar</button><button class="${tab === 'cad' ? 'on' : ''}" onclick="renderLogin('cad')">Criar conta</button></div>
    ${tab === 'entrar' ? `
    <form id="f">
      <label>Telefone (ou usuário)</label><input name="login" required autocomplete="username" autocapitalize="none" inputmode="text">
      <label>Senha</label><input name="senha" type="password" required autocomplete="current-password">
      <div class="err" id="err"></div>
      <button class="btn block">Entrar</button>
      <p class="mut small" style="margin-top:12px">Primeira vez? Toque em <b>Criar conta</b> para agendar seu horário.</p>
    </form>` : `
    <form id="f">
      <label>Nome completo</label><input name="nome" required autocomplete="name">
      <label>Telefone / WhatsApp</label><input name="tel" required inputmode="tel" autocomplete="tel" placeholder="(61) 90000-0000">
      <label>Crie uma senha</label><input name="senha" type="password" required minlength="4" autocomplete="new-password">
      <div class="err" id="err"></div>
      <button class="btn block">Criar conta e agendar</button>
      <p class="mut small" style="margin-top:10px">Nas próximas vezes, entre com seu telefone e essa senha.</p>
    </form>`}
  </div></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('.btn');
    btn.disabled = true;
    try {
      const r = await api('POST', tab === 'entrar' ? '/api/login' : '/api/register', f);
      setToken(r.token); boot();
    } catch (err) { $('#err').textContent = err.message; btn.disabled = false; }
  };
}

/* ---------------- shell / navegação ---------------- */
const NAV_ADMIN = [
  ['dashboard', '📊', 'Dashboard'], ['agenda', '📅', 'Agenda'], ['vendas', '🛍️', 'Vendas'], ['financeiro', '💰', 'Financeiro'],
  ['estoque', '📦', 'Estoque'], ['compras', '🧾', 'Compras'], ['clientes', '👥', 'Clientes'], ['equipe', '🧑‍💼', 'Equipe'], ['servicos', '✂️', 'Serviços'], ['config', '⚙️', 'Ajustes']
];
const NAV_FUNC = [['agenda', '📅', 'Minha agenda'], ['resumo', '📈', 'Meu mês'], ['perfil', '👤', 'Perfil']];
const NAV_CLI = [['agendar', '➕', 'Agendar'], ['meus', '📅', 'Meus horários'], ['perfil', '👤', 'Perfil']];

function shell(title, actions, body) {
  const nav = me.role === 'admin' ? NAV_ADMIN : isFunc() ? NAV_FUNC : NAV_CLI;
  const n = NICHOS[S.config.nicho] || NICHOS.barbearia;
  const bottom = me.role === 'admin' ? nav.slice(0, 4) : nav;
  const extra = me.role === 'admin' ? nav.slice(4) : [];
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="brand">${logoBox(n.icon)}<h1>${esc(S.config.negocio)}</h1></div>
      <nav class="nav">${nav.map(([k, i, l]) => `<a class="${view === k ? 'on' : ''}" onclick="go('${k}')"><span class="i">${i}</span>${l}</a>`).join('')}</nav>
      <div class="me"><b>${esc(me.nome)}</b><div class="mut">${me.role === 'admin' ? 'Administrador' : isFunc() ? 'Funcionário(a)' : 'Cliente'}</div><button class="btn ghost sm" style="margin-top:8px" onclick="logout()">Sair</button></div>
    </aside>
    <main class="main">
      ${avisoVencimento()}
      <div class="top"><h2>${title}</h2><div class="acts">${actions || ''}</div></div>
      ${body}
    </main>
  </div>
  <nav class="bnav">${bottom.map(([k, i, l]) => `<a class="${view === k ? 'on' : ''}" onclick="go('${k}')"><span class="i">${i}</span>${l}</a>`).join('')}
    ${extra.length ? `<a class="${extra.some(x => x[0] === view) ? 'on' : ''}" onclick="$('#more').classList.toggle('open')"><span class="i">☰</span>Mais</a>` : ''}</nav>
  <div class="more-menu nav" id="more">${extra.map(([k, i, l]) => `<a class="${view === k ? 'on' : ''}" onclick="go('${k}')"><span class="i">${i}</span>${l}</a>`).join('')}
    <a onclick="logout()"><span class="i">🚪</span>Sair</a></div>`;
}

function abrirAssinatura(plano) {
  if (!window.AgendaProAssinar) return toast('Não foi possível abrir o pagamento. Recarregue a página.');
  AgendaProAssinar.abrir({ plano, negocio: (S.config || PUB?.config || {}).negocio, slug: SLUG, login: me?.login });
}
function avisoVencimento() {
  if (me?.role !== 'admin' || !ASSIN?.vence) return '';
  const dias = Math.round((new Date(ASSIN.vence + 'T12:00') - new Date(today() + 'T12:00')) / 864e5);
  if (ASSIN.trial) {
    const valor = 'R$ ' + Number(ASSIN.valor || 49.9).toFixed(2).replace('.', ',');
    const link = `<button class="btn sm" style="background:#fff;color:#2a1640" onclick="abrirAssinatura()">Assinar agora</button>`;
    return `<div class="card" style="background:linear-gradient(120deg,#7a4fd6,#c0569a);color:#fff;border:0;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><b>🎁 Teste grátis: ${dias <= 0 ? 'último dia hoje' : `faltam ${dias} dia(s)`}</b><div class="small" style="opacity:.9">Válido até ${fmtData(ASSIN.vence)}. Depois, ${valor}/mês para continuar.</div></div>${link}</div>`;
  }
  if (dias > 5) return '';
  const sup = ` <a href="#" style="color:#1a1300;text-decoration:underline" onclick="abrirAssinatura();return false">Renovar agora</a>`;
  return `<div class="card" style="background:var(--warn);color:#1a1300;border:0;margin-bottom:14px;font-weight:700">⏳ Sua assinatura ${dias <= 0 ? 'vence hoje' : `vence em ${dias} dia(s)`} (${fmtData(ASSIN.vence)}).${sup}</div>`;
}

function go(v, keepScroll) {
  if (isFunc()) { if (!FUNC_VIEWS.includes(v)) v = 'agenda'; }
  else if (me.role !== 'admin' && !CLI_VIEWS.includes(v)) v = 'agendar';
  else if (me.role === 'admin' && CLI_VIEWS.includes(v)) v = 'dashboard';
  const mudou = v !== view;
  view = v;
  if (v === 'agendar' && mudou) ui.slots = {};
  ({ dashboard: vDashboard, agenda: vAgenda, vendas: vVendas, financeiro: vFinanceiro, estoque: vEstoque, compras: vCompras, clientes: vClientes, equipe: vEquipe, servicos: vServicos, config: vConfig, agendar: vAgendar, meus: vMeus, perfil: isFunc() ? vPerfilFunc : vPerfil, resumo: vResumo })[v]();
  if (!keepScroll) window.scrollTo(0, 0);
}

/* ---------------- modal ---------------- */
function openModal(title, html, onSubmit) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').classList.remove('hidden');
  const f = $('#modal-body form');
  if (f && onSubmit) f.onsubmit = async e => {
    e.preventDefault();
    try { if ((await onSubmit(Object.fromEntries(new FormData(f)), f)) !== false) closeModal(); }
    catch (err) { const m = $('#mErr'); m ? m.textContent = err.message : toast(err.message); }
  };
  const first = $('#modal-body input, #modal-body select'); if (first) setTimeout(() => first.focus(), 50);
}
function closeModal() {
  $('#modal').classList.add('hidden'); $('#modal-body').innerHTML = '';
  if (renderPendente) { renderPendente = false; rerender(); }
}
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
const foot = (txt = 'Salvar') => `<div class="modal-foot"><button type="button" class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn">${txt}</button></div>`;
const opts = (arr, sel, val = x => x.id, lbl = x => x.nome) => arr.map(x => `<option value="${esc(val(x))}" ${val(x) === sel ? 'selected' : ''}>${esc(lbl(x))}</option>`).join('');

/* ---------------- disponibilidade (painel do dono) ---------------- */
function slotsLivres(data, profId, duracao, ignorarId) {
  const c = S.config;
  const dow = new Date(data + 'T12:00').getDay();
  if (!c.dias.includes(dow)) return [];
  const ini = toMin(c.abre), fim = toMin(c.fecha), passo = Number(c.intervalo) || 30;
  const agora = new Date(), minAgora = agora.getHours() * 60 + agora.getMinutes();
  const ocup = S.agendamentos.filter(a => a.data === data && a.profId === profId && a.status !== 'cancelado' && a.id !== ignorarId)
    .map(a => [toMin(a.hora), toMin(a.hora) + (a.duracao || 30)]);
  const out = [];
  for (let t = ini; t + duracao <= fim; t += passo) {
    if (data === today() && t <= minAgora) continue;
    if (ocup.some(([a, b]) => t < b && t + duracao > a)) continue;
    out.push(toHora(t));
  }
  return out;
}
const profsAtivos = () => S.profissionais.filter(p => p.ativo !== false);
const servAtivos = () => S.servicos.filter(s => s.ativo !== false);
const tagApp = a => a.criadoPor === 'cliente' ? ' <span class="pill app">📱 app</span>' : '';

/* ================= ADMIN ================= */

function vDashboard() {
  const hoje = today(), mes = mesAtual();
  const lm = S.lancamentos.filter(l => l.data.startsWith(mes));
  const entMes = lm.filter(l => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0);
  const saiMes = lm.filter(l => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0);
  const entHoje = S.lancamentos.filter(l => l.data === hoje && l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0);
  const agHoje = S.agendamentos.filter(a => a.data === hoje && a.status !== 'cancelado');
  const concMes = S.agendamentos.filter(a => a.data.startsWith(mes) && a.status === 'concluido');
  const ticket = concMes.length ? concMes.reduce((s, a) => s + a.valor, 0) / concMes.length : 0;
  const baixo = S.produtos.filter(p => p.qtd <= p.min);
  const novosCli = S.users.filter(u => u.role === 'cliente' && (u.criado || '').startsWith(mes)).length;
  const viaApp = S.agendamentos.filter(a => a.criadoPor === 'cliente' && a.data.startsWith(mes)).length;

  const prox = S.agendamentos.filter(a => a.status === 'agendado' && a.data >= hoje)
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)).slice(0, 8);

  const rank = {};
  concMes.forEach(a => { rank[a.servicoNome] = (rank[a.servicoNome] || 0) + a.valor; });
  const top = Object.entries(rank).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = top[0]?.[1] || 1;

  shell('Dashboard', `<button class="btn ghost" onclick="formMetas()">🎯 Metas</button><button class="btn" onclick="novoAgendamento()">+ Agendamento</button>`, `
  ${blocoMetas()}
  <div class="grid kpis">
    <div class="card kpi"><div class="l">Faturamento hoje</div><div class="v">${brl(entHoje)}</div><div class="s">${agHoje.length} atendimento(s) hoje</div></div>
    <div class="card kpi"><div class="l">Entradas no mês</div><div class="v pos">${brl(entMes)}</div><div class="s">${concMes.length} serviços concluídos</div></div>
    <div class="card kpi"><div class="l">Saídas no mês</div><div class="v neg">${brl(saiMes)}</div><div class="s">despesas + compras</div></div>
    <div class="card kpi"><div class="l">Lucro do mês</div><div class="v ${entMes - saiMes >= 0 ? 'pos' : 'neg'}">${brl(entMes - saiMes)}</div><div class="s">entradas − saídas</div></div>
    <div class="card kpi"><div class="l">Ticket médio</div><div class="v">${brl(ticket)}</div><div class="s">por serviço no mês</div></div>
    <div class="card kpi"><div class="l">Agendados pelo app</div><div class="v">${viaApp}</div><div class="s">${novosCli} cliente(s) novo(s) no mês</div></div>
  </div>
  <div class="grid two" style="margin-top:12px">
    <div class="card"><h3>Entradas × saídas — últimos 14 dias</h3><canvas id="ch" class="chart"></canvas>
      <div class="small mut" style="display:flex;gap:14px;margin-top:6px"><span><b style="color:var(--ac)">■</b> Entradas</span><span><b style="color:var(--mut)">■</b> Saídas</span></div></div>
    <div class="card"><h3>Próximos atendimentos</h3>
      ${prox.length ? `<div class="list">${prox.map(a => `<div class="item ${ui.novos.has(a.id) ? 'novo' : ''}"><div class="hour">${a.hora}</div><div class="grow"><div class="t">${esc(a.clienteNome)}${tagApp(a)}</div><div class="d">${esc(a.servicoNome)} · ${a.data === hoje ? 'hoje' : fmtData(a.data)}</div></div></div>`).join('')}</div>` : '<div class="empty">Nenhum horário marcado.</div>'}
    </div>
  </div>
  <div class="grid two" style="margin-top:12px">
    <div class="card"><h3>Serviços que mais faturaram no mês</h3>
      ${top.length ? `<div class="bars">${top.map(([n, v]) => `<div class="bar"><div class="lbl"><span>${esc(n)}</span><b>${brl(v)}</b></div><div class="tr"><div class="fl" style="width:${(v / topMax * 100).toFixed(0)}%"></div></div></div>`).join('')}</div>` : '<div class="empty">Conclua atendimentos para ver o ranking.</div>'}
    </div>
    <div class="card"><h3>Estoque baixo</h3>
      ${baixo.length ? `<div class="list">${baixo.map(p => `<div class="item"><div class="grow"><div class="t">${esc(p.nome)}</div><div class="d">mínimo ${p.min}</div></div><span class="pill baixo">${p.qtd} un</span></div>`).join('')}</div>` : '<div class="empty">Tudo em ordem 👍</div>'}
    </div>
  </div>`);
  drawChart();
}

/* ----- metas do mês ----- */
function diasUteisMes(mes) {
  const [y, m] = mes.split('-').map(Number), total = new Date(y, m, 0).getDate(), hoje = today(), dias = S.config.dias;
  let tot = 0, passados = 0, restantes = 0;
  for (let d = 1; d <= total; d++) {
    const iso = `${mes}-${pad(d)}`;
    if (!dias.includes(new Date(iso + 'T12:00').getDay())) continue;
    tot++;
    if (iso < hoje) passados++; else restantes++;
  }
  return { tot, passados, restantes };
}
function realizadoMes(mes) {
  return {
    faturamento: S.lancamentos.filter(l => l.tipo === 'entrada' && l.data.startsWith(mes)).reduce((s, l) => s + l.valor, 0),
    atendimentos: S.agendamentos.filter(a => a.status === 'concluido' && a.data.startsWith(mes)).length,
    vendas: S.vendas.filter(v => v.data.startsWith(mes)).reduce((s, v) => s + v.total, 0),
    clientes: S.users.filter(u => u.role === 'cliente' && (u.criado || '').startsWith(mes)).length
  };
}
const METAS = [
  ['faturamento', '💰 Faturamento', true],
  ['atendimentos', '✂️ Atendimentos concluídos', false],
  ['vendas', '🛍️ Venda de produtos', true],
  ['clientes', '👥 Clientes novos', false]
];
function blocoMetas() {
  const metas = S.config.metas || {}, mes = mesAtual();
  const ativas = METAS.filter(([k]) => metas[k] > 0);
  if (!ativas.length) return `<div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="font-size:1.8rem">🎯</div><div class="grow" style="flex:1;min-width:180px"><b>Defina suas metas do mês</b><div class="mut small">Faturamento, atendimentos, vendas e clientes novos, com o quanto falta por dia.</div></div>
    <button class="btn sm" onclick="formMetas()">Definir metas</button></div>`;
  const real = realizadoMes(mes), du = diasUteisMes(mes);
  const ritmo = du.tot ? du.passados / du.tot : 0;
  const fmt = (k, v) => METAS.find(m => m[0] === k)[2] ? brl(v) : Math.round(v);
  const nomeMes = new Date(mes + '-15T12:00').toLocaleDateString('pt-BR', { month: 'long' });
  return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px"><h3 style="margin:0">🎯 Metas de ${nomeMes}</h3><span class="mut small">${du.restantes} dia(s) de atendimento restantes</span></div>
    <div class="metas">${ativas.map(([k, label]) => {
      const meta = metas[k], feito = real[k], pct = Math.min(100, feito / meta * 100), falta = Math.max(0, meta - feito);
      const porDia = du.restantes ? falta / du.restantes : falta;
      const adiantado = feito / meta >= ritmo;
      const status = feito >= meta ? '<span class="pos">Meta batida! 🎉</span>'
        : `Faltam <b>${fmt(k, falta)}</b>${du.restantes ? ` · ~${fmt(k, METAS.find(m => m[0] === k)[2] ? porDia : Math.ceil(porDia))}/dia` : ''} · <span class="${adiantado ? 'pos' : 'neg'}">${adiantado ? 'no ritmo' : 'abaixo do ritmo'}</span>`;
      return `<div class="meta"><div class="lbl"><span>${label}</span><span><b>${fmt(k, feito)}</b> <span class="mut small">de ${fmt(k, meta)} · ${Math.round(feito / meta * 100)}%</span></span></div>
        <div class="tr"><div class="fl ${feito >= meta ? 'ok' : ''}" style="width:${pct.toFixed(1)}%"></div>${ritmo > 0 && ritmo < 1 ? `<div class="ritmo" style="left:${(ritmo * 100).toFixed(1)}%" title="Onde você deveria estar hoje"></div>` : ''}</div>
        <div class="s">${status}</div></div>`;
    }).join('')}</div>
    <div class="mut small" style="margin-top:10px">A linha branca mostra onde você deveria estar hoje para bater a meta no fim do mês.</div>
  </div>`;
}
function formMetas() {
  const m = S.config.metas || {};
  const ant = new Date(mesAtual() + '-01T12:00'); ant.setMonth(ant.getMonth() - 1);
  const real = realizadoMes(iso(ant).slice(0, 7));
  openModal('🎯 Metas do mês', `
  <form>
    <p class="mut small">Deixe em branco o que não quiser acompanhar. As metas valem para todo mês até você mudar.</p>
    ${METAS.map(([k, label, dinheiro]) => `<label>${label}${dinheiro ? ' (R$)' : ''} <span class="mut">· mês passado: ${dinheiro ? brl(real[k]) : real[k]}</span></label>
      <input name="${k}" inputmode="decimal" value="${m[k] || ''}" placeholder="${dinheiro ? 'Ex.: 8000' : 'Ex.: 120'}">`).join('')}
    ${foot()}
  </form>`, f => {
    S.config.metas = Object.fromEntries(METAS.map(([k]) => [k, num(f[k])]));
    save(); toast('Metas salvas'); go(view);
  });
}

function drawChart() {
  const cv = $('#ch'); if (!cv) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const ac = css.getPropertyValue('--ac').trim(), ln = css.getPropertyValue('--line').trim(), mut = css.getPropertyValue('--mut').trim();
  const dias = [...Array(14)].map((_, i) => addDays(today(), i - 13));
  const ent = dias.map(d => S.lancamentos.filter(l => l.data === d && l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0));
  const sai = dias.map(d => S.lancamentos.filter(l => l.data === d && l.tipo === 'saida').reduce((s, l) => s + l.valor, 0));
  const max = Math.max(50, ...ent, ...sai);
  const padL = 46, padB = 22, cw = (W - padL) / dias.length, bw = Math.max(3, cw / 2 - 3);
  g.font = '11px Manrope, sans-serif'; g.fillStyle = mut; g.strokeStyle = ln; g.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = (H - padB) - (H - padB - 8) * i / 3;
    g.globalAlpha = .5; g.beginPath(); g.moveTo(padL, y); g.lineTo(W, y); g.stroke(); g.globalAlpha = 1;
    g.fillText('R$' + Math.round(max * i / 3), 0, y + 4);
  }
  dias.forEach((d, i) => {
    const x = padL + i * cw + 2;
    const h1 = (H - padB - 8) * ent[i] / max, h2 = (H - padB - 8) * sai[i] / max;
    g.fillStyle = ac; g.fillRect(x, H - padB - h1, bw, h1);
    g.fillStyle = mut; g.fillRect(x + bw + 2, H - padB - h2, bw, h2);
    if (i % 2 === 1 || W > 500) { g.fillStyle = mut; g.fillText(d.slice(8), x, H - 6); }
  });
}

/* ----- agenda ----- */
function vAgenda() {
  const d = ui.agendaData;
  const lista = S.agendamentos.filter(a => a.data === d && (isFunc() ? a.profId === me.profId : !ui.agendaProf || a.profId === ui.agendaProf)).sort((a, b) => a.hora.localeCompare(b.hora));
  const prev = lista.filter(a => a.status !== 'cancelado').reduce((s, a) => s + a.valor, 0);
  shell(isFunc() ? 'Minha agenda' : 'Agenda', `<button class="btn" onclick="novoAgendamento()">+ Agendamento</button>`, `
  <div class="filters">
    <button class="btn ghost sm" onclick="ui.agendaData=addDays(ui.agendaData,-1);vAgenda()">◀</button>
    <input type="date" value="${d}" onchange="ui.agendaData=this.value;vAgenda()">
    <button class="btn ghost sm" onclick="ui.agendaData=addDays(ui.agendaData,1);vAgenda()">▶</button>
    <button class="btn ghost sm" onclick="ui.agendaData=today();vAgenda()">Hoje</button>
    ${S.profissionais.length > 1 && !isFunc() ? `<select onchange="ui.agendaProf=this.value;vAgenda()"><option value="">Todos profissionais</option>${opts(profsAtivos(), ui.agendaProf)}</select>` : ''}
  </div>
  <div class="card">
    <div class="small mut" style="margin-bottom:6px">${DIAS[new Date(d + 'T12:00').getDay()]}, ${fmtData(d)} · ${lista.filter(a => a.status !== 'cancelado').length} agendamento(s) · previsto ${brl(prev)}</div>
    ${lista.length ? `<div class="list">${lista.map(a => {
      const extra = [S.profissionais.length > 1 ? esc(byId('profissionais', a.profId)?.nome || '') : '', a.tel ? esc(a.tel) : '', a.pagamento || '', a.obs ? '“' + esc(a.obs) + '”' : '', a.canceladoPor === 'cliente' ? 'cancelado pelo cliente' : ''].filter(Boolean).join(' · ');
      const wa = a.tel ? `https://wa.me/55${a.tel.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')}?text=${encodeURIComponent(`Olá ${a.clienteNome}! Confirmando seu horário em ${S.config.negocio}: ${fmtData(a.data)} às ${a.hora} (${a.servicoNome}).`)}` : '';
      return `<div class="ag ${ui.novos.has(a.id) ? 'novo' : ''} ${a.status}">
        <div class="ag-hora">${a.hora}<small>${a.duracao} min</small></div>
        <div class="ag-info">
          <div class="ag-top"><b>${esc(a.clienteNome)}</b>${tagApp(a)}<span class="pill ${a.status}">${a.status}</span></div>
          <div class="d">${esc(a.servicoNome)} · <b style="color:var(--tx)">${brl(a.valor)}</b></div>
          ${extra ? `<div class="d">${extra}</div>` : ''}
          ${a.status === 'agendado' || wa ? `<div class="ag-acts">
            ${a.status === 'agendado' ? `<button class="btn ok sm" onclick="concluir('${a.id}')">✓ Concluir</button><button class="btn ghost sm" onclick="novoAgendamento('${a.id}')">Editar</button><button class="btn ghost sm" onclick="cancelarAg('${a.id}')">Cancelar</button>` : ''}
            ${wa ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${wa}">💬 WhatsApp</a>` : ''}
          </div>` : ''}
        </div>
      </div>`;
    }).join('')}</div>` : '<div class="empty">Agenda livre neste dia.</div>'}
  </div>`);
}

function novoAgendamento(id) {
  const a = id ? byId('agendamentos', id) : null;
  const clientes = S.users.filter(u => u.role === 'cliente').sort((x, y) => x.nome.localeCompare(y.nome));
  openModal(a ? 'Editar agendamento' : 'Novo agendamento', `
  <form>
    <label>Cliente</label>
    <select name="clienteId" id="mCli"><option value="">— Cliente avulso (digitar nome) —</option>${opts(clientes, a?.clienteId, x => x.id, x => x.nome + (x.tel ? ' · ' + x.tel : ''))}</select>
    <div class="row" id="avulso"><div><label>Nome</label><input name="nome" value="${esc(a && !a.clienteId ? a.clienteNome : '')}"></div><div><label>Telefone</label><input name="tel" inputmode="tel" value="${esc(a && !a.clienteId ? a.tel : '')}"></div></div>
    <label>Serviço</label><select name="servicoId" id="mSv" required>${opts(servAtivos(), a?.servicoId, x => x.id, x => `${x.nome} — ${brl(x.preco)} (${x.duracao}min)`)}</select>
    <label>Profissional</label><select name="profId" id="mPr">${opts(isFunc() ? S.profissionais.filter(p => p.id === me.profId) : profsAtivos(), a?.profId || (isFunc() ? me.profId : ''))}</select>
    <div class="row"><div><label>Data</label><input type="date" name="data" id="mDt" required value="${a?.data || ui.agendaData}"></div>
      <div><label>Horário</label><select name="hora" id="mHr" required></select></div></div>
    <label>Observação</label><input name="obs" value="${esc(a?.obs || '')}">
    <div class="err" id="mErr"></div>
    ${foot(a ? 'Salvar' : 'Agendar')}
  </form>`, f => {
    const sv = byId('servicos', f.servicoId), cli = f.clienteId ? byId('users', f.clienteId) : null;
    const nome = cli ? cli.nome : f.nome.trim();
    if (!nome) { $('#mErr').textContent = 'Informe o cliente.'; return false; }
    if (!f.hora) { $('#mErr').textContent = 'Sem horário livre nesse dia.'; return false; }
    const dados = { clienteId: cli?.id || '', clienteNome: nome, tel: cli ? cli.tel : f.tel, servicoId: sv.id, servicoNome: sv.nome, valor: sv.preco, duracao: sv.duracao, profId: f.profId, data: f.data, hora: f.hora, obs: f.obs };
    if (a) Object.assign(a, dados); else S.agendamentos.push({ id: uid(), status: 'agendado', criadoPor: 'admin', criadoEm: new Date().toISOString(), ...dados });
    save(); toast(a ? 'Agendamento atualizado' : 'Agendado!'); ui.agendaData = f.data; go(view === 'dashboard' ? 'dashboard' : 'agenda');
  });
  const upd = () => {
    const sv = byId('servicos', $('#mSv').value), pr = $('#mPr').value, dt = $('#mDt').value;
    const livres = sv && dt ? slotsLivres(dt, pr, sv.duracao, a?.id) : [];
    if (a && a.data === dt && !livres.includes(a.hora)) livres.unshift(a.hora);
    $('#mHr').innerHTML = livres.length ? livres.map(h => `<option ${a?.hora === h ? 'selected' : ''}>${h}</option>`).join('') : '<option value="">Sem horários</option>';
  };
  const togAv = () => $('#avulso').classList.toggle('hidden', !!$('#mCli').value);
  ['#mSv', '#mPr', '#mDt'].forEach(s => $(s).onchange = upd); $('#mCli').onchange = togAv;
  upd(); togAv();
}

function concluir(id) {
  const a = byId('agendamentos', id);
  openModal('Concluir atendimento', `
  <form>
    <p class="mut">${esc(a.clienteNome)} · ${esc(a.servicoNome)}</p>
    <div class="row"><div><label>Valor cobrado</label><input name="valor" inputmode="decimal" value="${a.valor}"></div>
      <div><label>Forma de pagamento</label><select name="pag">${PAGTOS.map(p => `<option>${p}</option>`).join('')}</select></div></div>
    ${foot('Concluir e lançar')}
  </form>`, f => {
    a.status = 'concluido'; a.valor = num(f.valor); a.pagamento = f.pag;
    lancar('entrada', `${a.servicoNome} — ${a.clienteNome}`, a.valor, 'Serviço', a.data < today() ? a.data : today(), a.id, f.pag);
    save(); toast('Atendimento concluído'); go(view, true);
  });
}
function cancelarAg(id) {
  if (!confirm('Cancelar este agendamento?')) return;
  byId('agendamentos', id).status = 'cancelado'; save(); go(view, true);
}

/* ----- vendas ----- */
function vVendas() {
  const lista = [...S.vendas].sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  const mes = mesAtual(), totMes = S.vendas.filter(v => v.data.startsWith(mes)).reduce((s, v) => s + v.total, 0);
  shell('Vendas', `<button class="btn" onclick="formItens('venda')">+ Nova venda</button>`, `
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="card kpi"><div class="l">Vendido no mês</div><div class="v">${brl(totMes)}</div></div>
    <div class="card kpi"><div class="l">Vendas no mês</div><div class="v">${S.vendas.filter(v => v.data.startsWith(mes)).length}</div></div>
  </div>
  <div class="card">${lista.length ? `<div class="tbl-wrap"><table><tr><th>Data</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th>Total</th><th></th></tr>
  ${lista.map(v => `<tr><td>${fmtData(v.data)}</td><td>${esc(v.cliente || '—')}</td><td>${v.itens.map(i => `${i.qtd}× ${esc(i.nome)}`).join(', ')}</td><td>${v.pagamento}</td><td><b>${brl(v.total)}</b></td><td><button class="icon-btn" onclick="excluirMov('venda','${v.id}')">🗑️</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Nenhuma venda registrada.</div>'}</div>`);
}

/* ----- compras ----- */
function vCompras() {
  const lista = [...S.compras].sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  const mes = mesAtual(), totMes = S.compras.filter(v => v.data.startsWith(mes)).reduce((s, v) => s + v.total, 0);
  shell('Compras', `<button class="btn" onclick="formItens('compra')">+ Nova compra</button>`, `
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="card kpi"><div class="l">Comprado no mês</div><div class="v neg">${brl(totMes)}</div></div>
    <div class="card kpi"><div class="l">Pedidos no mês</div><div class="v">${S.compras.filter(v => v.data.startsWith(mes)).length}</div></div>
  </div>
  <div class="card">${lista.length ? `<div class="tbl-wrap"><table><tr><th>Data</th><th>Fornecedor</th><th>Itens</th><th>Pagamento</th><th>Total</th><th></th></tr>
  ${lista.map(v => `<tr><td>${fmtData(v.data)}</td><td>${esc(v.fornecedor || '—')}</td><td>${v.itens.map(i => `${i.qtd}× ${esc(i.nome)}`).join(', ')}</td><td>${v.pagamento}</td><td><b>${brl(v.total)}</b></td><td><button class="icon-btn" onclick="excluirMov('compra','${v.id}')">🗑️</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Nenhuma compra registrada. As compras dão entrada no estoque e lançam a saída no financeiro.</div>'}</div>`);
}

function formItens(tipo) {
  if (!S.produtos.length) { toast('Cadastre produtos no Estoque primeiro'); return go('estoque'); }
  const venda = tipo === 'venda';
  const clientes = S.users.filter(u => u.role === 'cliente');
  openModal(venda ? 'Nova venda' : 'Nova compra', `
  <form>
    <div class="row"><div><label>Data</label><input type="date" name="data" value="${today()}" required></div>
      <div><label>${venda ? 'Cliente' : 'Fornecedor'}</label><input name="quem" ${venda ? 'list="dlCli"' : ''} placeholder="${venda ? 'opcional' : 'Ex.: Distribuidora X'}"></div></div>
    ${venda ? `<datalist id="dlCli">${clientes.map(c => `<option value="${esc(c.nome)}">`).join('')}</datalist>` : ''}
    <label>Itens <span class="mut">(produto · qtd · ${venda ? 'preço un.' : 'custo un.'})</span></label>
    <div class="lines" id="lines"></div>
    <button type="button" class="btn ghost sm" id="addLn">+ item</button>
    <label>Forma de pagamento</label><select name="pag">${PAGTOS.map(p => `<option>${p}</option>`).join('')}</select>
    <div class="total-line"><span>Total</span><span id="tot">R$ 0,00</span></div>
    <div class="err" id="mErr"></div>
    ${foot(venda ? 'Registrar venda' : 'Registrar compra')}
  </form>`, (f, form) => {
    const itens = [...form.querySelectorAll('.ln')].map(ln => {
      const p = byId('produtos', ln.querySelector('select').value);
      return { prodId: p.id, nome: p.nome, qtd: num(ln.querySelector('.q').value), un: num(ln.querySelector('.u').value) };
    }).filter(i => i.qtd > 0);
    if (!itens.length) { $('#mErr').textContent = 'Adicione ao menos um item.'; return false; }
    if (venda) {
      const falta = itens.find(i => byId('produtos', i.prodId).qtd < i.qtd);
      if (falta && !confirm(`Estoque de "${falta.nome}" insuficiente. Registrar mesmo assim?`)) return false;
    }
    const total = itens.reduce((s, i) => s + i.qtd * i.un, 0);
    const id = uid();
    itens.forEach(i => {
      const p = byId('produtos', i.prodId);
      if (venda) p.qtd -= i.qtd; else { p.qtd += i.qtd; p.custo = i.un; }
    });
    if (venda) {
      S.vendas.push({ id, data: f.data, cliente: f.quem, itens, total, pagamento: f.pag });
      lancar('entrada', `Venda: ${itens.map(i => i.nome).join(', ')}`, total, 'Venda de produto', f.data, id, f.pag);
    } else {
      S.compras.push({ id, data: f.data, fornecedor: f.quem, itens, total, pagamento: f.pag });
      lancar('saida', `Compra${f.quem ? ' — ' + f.quem : ''}`, total, 'Compra de produtos', f.data, id, f.pag);
    }
    save(); toast(venda ? 'Venda registrada' : 'Compra registrada'); go(view);
  });
  const addLine = () => {
    const div = document.createElement('div'); div.className = 'ln';
    div.innerHTML = `<select>${opts(S.produtos, '', x => x.id, x => `${x.nome} (${x.qtd})`)}</select><input class="q" inputmode="decimal" value="1"><input class="u" inputmode="decimal"><button type="button" class="icon-btn">✕</button>`;
    const sel = div.querySelector('select'), u = div.querySelector('.u');
    const fill = () => { const p = byId('produtos', sel.value); u.value = venda ? p.preco : p.custo; calc(); };
    sel.onchange = fill; div.querySelector('.q').oninput = calc; u.oninput = calc;
    div.querySelector('button').onclick = () => { div.remove(); calc(); };
    $('#lines').appendChild(div); fill();
  };
  const calc = () => {
    const t = [...document.querySelectorAll('#lines .ln')].reduce((s, ln) => s + num(ln.querySelector('.q').value) * num(ln.querySelector('.u').value), 0);
    $('#tot').textContent = brl(t);
  };
  $('#addLn').onclick = addLine; addLine();
}

function excluirMov(tipo, id) {
  if (!confirm(`Excluir esta ${tipo}? O estoque e o financeiro serão estornados.`)) return;
  const col = tipo === 'venda' ? 'vendas' : 'compras';
  const m = byId(col, id);
  m.itens.forEach(i => { const p = byId('produtos', i.prodId); if (p) p.qtd += tipo === 'venda' ? i.qtd : -i.qtd; });
  S[col] = S[col].filter(x => x.id !== id);
  S.lancamentos = S.lancamentos.filter(l => l.ref !== id);
  save(); go(view, true);
}

/* ----- estoque ----- */
function vEstoque() {
  const q = ui.busca.toLowerCase();
  const lista = S.produtos.filter(p => p.nome.toLowerCase().includes(q)).sort((a, b) => a.nome.localeCompare(b.nome));
  const valorCusto = S.produtos.reduce((s, p) => s + Math.max(0, p.qtd) * p.custo, 0);
  shell('Estoque', `<button class="btn" onclick="formProduto()">+ Produto</button>`, `
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="card kpi"><div class="l">Produtos</div><div class="v">${S.produtos.length}</div></div>
    <div class="card kpi"><div class="l">Valor em estoque</div><div class="v">${brl(valorCusto)}</div><div class="s">a preço de custo</div></div>
    <div class="card kpi"><div class="l">Abaixo do mínimo</div><div class="v ${S.produtos.some(p => p.qtd <= p.min) ? 'neg' : ''}">${S.produtos.filter(p => p.qtd <= p.min).length}</div></div>
  </div>
  <div class="filters"><input placeholder="Buscar produto…" value="${esc(ui.busca)}" oninput="buscar(this.value,vEstoque)"></div>
  <div class="card">${lista.length ? `<div class="tbl-wrap"><table><tr><th>Produto</th><th>Qtd</th><th>Mín.</th><th>Custo</th><th>Venda</th><th></th></tr>
  ${lista.map(p => `<tr><td><b>${esc(p.nome)}</b>${p.preco ? '' : ' <span class="pill">uso interno</span>'}</td><td>${p.qtd <= p.min ? `<span class="pill baixo">${p.qtd}</span>` : p.qtd}</td><td>${p.min}</td><td>${brl(p.custo)}</td><td>${p.preco ? brl(p.preco) : '—'}</td>
  <td class="acts"><button class="btn ghost sm" onclick="ajusteEstoque('${p.id}')">±</button><button class="icon-btn" onclick="formProduto('${p.id}')">✏️</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Nenhum produto.</div>'}</div>`);
}
function buscar(v, fn) {
  ui.busca = v; clearTimeout(window._b);
  window._b = setTimeout(() => { fn(); const i = document.querySelector('.filters input'); i.focus(); i.setSelectionRange(99, 99); }, 250);
}
function formProduto(id) {
  const p = id ? byId('produtos', id) : null;
  openModal(p ? 'Editar produto' : 'Novo produto', `
  <form>
    <label>Nome</label><input name="nome" required value="${esc(p?.nome || '')}">
    <div class="row"><div><label>Preço de custo</label><input name="custo" inputmode="decimal" value="${p?.custo ?? ''}"></div>
      <div><label>Preço de venda <span class="mut">(0 = uso interno)</span></label><input name="preco" inputmode="decimal" value="${p?.preco ?? ''}"></div></div>
    <div class="row"><div><label>Quantidade atual</label><input name="qtd" inputmode="decimal" value="${p?.qtd ?? 0}" ${p ? 'disabled' : ''}></div>
      <div><label>Estoque mínimo</label><input name="min" inputmode="decimal" value="${p?.min ?? 2}"></div></div>
    ${p ? `<p class="mut small" style="margin-top:8px">Para mudar a quantidade use Compras, Vendas ou o botão ±.</p><button type="button" class="btn bad sm" style="margin-top:10px" onclick="if(confirm('Excluir produto?')){S.produtos=S.produtos.filter(x=>x.id!=='${p.id}');save();closeModal();vEstoque()}">Excluir produto</button>` : ''}
    ${foot()}
  </form>`, f => {
    const d = { nome: f.nome.trim(), custo: num(f.custo), preco: num(f.preco), min: num(f.min) };
    if (p) Object.assign(p, d); else S.produtos.push({ id: uid(), qtd: num(f.qtd), ...d });
    save(); vEstoque();
  });
}
function ajusteEstoque(id) {
  const p = byId('produtos', id);
  openModal('Ajuste de estoque', `
  <form><p class="mut">${esc(p.nome)} — atual: <b>${p.qtd}</b></p>
    <div class="row"><div><label>Tipo</label><select name="t"><option value="-">Saída (uso no atendimento / perda)</option><option value="+">Entrada (sem compra)</option></select></div>
    <div><label>Quantidade</label><input name="q" inputmode="decimal" required value="1"></div></div>
    ${foot('Ajustar')}</form>`, f => { p.qtd += (f.t === '-' ? -1 : 1) * num(f.q); save(); vEstoque(); });
}

/* ----- financeiro ----- */
function vFinanceiro() {
  const mes = ui.finMes;
  const lista = S.lancamentos.filter(l => l.data.startsWith(mes)).sort((a, b) => b.data.localeCompare(a.data));
  const ent = lista.filter(l => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0);
  const sai = lista.filter(l => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0);
  const porPag = {}; lista.filter(l => l.tipo === 'entrada').forEach(l => { const k = l.pagamento || 'Outros'; porPag[k] = (porPag[k] || 0) + l.valor; });
  const porCat = {}; lista.filter(l => l.tipo === 'saida').forEach(l => { porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor; });
  const barras = (o) => { const e = Object.entries(o).sort((a, b) => b[1] - a[1]), m = e[0]?.[1] || 1; return e.length ? `<div class="bars">${e.map(([n, v]) => `<div class="bar"><div class="lbl"><span>${esc(n)}</span><b>${brl(v)}</b></div><div class="tr"><div class="fl" style="width:${(v / m * 100).toFixed(0)}%"></div></div></div>`).join('')}</div>` : '<div class="empty">Sem dados.</div>'; };
  shell('Financeiro', `<button class="btn ghost" onclick="formLanc('saida')">− Saída</button><button class="btn" onclick="formLanc('entrada')">+ Entrada</button>`, `
  <div class="filters"><input type="month" value="${mes}" onchange="ui.finMes=this.value;vFinanceiro()"><button class="btn ghost sm" onclick="exportCSV()">Exportar CSV</button></div>
  <div class="grid kpis">
    <div class="card kpi"><div class="l">Entradas</div><div class="v pos">${brl(ent)}</div></div>
    <div class="card kpi"><div class="l">Saídas</div><div class="v neg">${brl(sai)}</div></div>
    <div class="card kpi"><div class="l">Saldo</div><div class="v ${ent - sai >= 0 ? 'pos' : 'neg'}">${brl(ent - sai)}</div></div>
  </div>
  <div class="grid two" style="margin-top:12px">
    <div class="card"><h3>Entradas por forma de pagamento</h3>${barras(porPag)}</div>
    <div class="card"><h3>Saídas por categoria</h3>${barras(porCat)}</div>
  </div>
  <div class="card" style="margin-top:12px"><h3>Lançamentos</h3>
  ${lista.length ? `<div class="list">${lista.map(l => `<div class="item"><div class="grow"><div class="t">${esc(l.descricao)}</div><div class="d">${fmtData(l.data)} · ${esc(l.categoria)}${l.pagamento ? ' · ' + l.pagamento : ''}</div></div>
    <b class="${l.tipo === 'entrada' ? 'pos' : 'neg'}">${l.tipo === 'entrada' ? '+' : '−'} ${brl(l.valor)}</b>
    ${!l.ref ? `<button class="icon-btn" onclick="if(confirm('Excluir lançamento?')){S.lancamentos=S.lancamentos.filter(x=>x.id!=='${l.id}');save();vFinanceiro()}">🗑️</button>` : '<span style="width:30px"></span>'}</div>`).join('')}</div>` : '<div class="empty">Nenhum lançamento neste mês.</div>'}
  </div>`);
}
function formLanc(tipo) {
  const cats = tipo === 'entrada' ? CAT_ENTRADA : CAT_SAIDA;
  openModal(tipo === 'entrada' ? 'Nova entrada' : 'Nova saída / despesa', `
  <form>
    <label>Descrição</label><input name="d" required placeholder="${tipo === 'entrada' ? 'Ex.: Pacote mensal' : 'Ex.: Conta de luz'}">
    <div class="row"><div><label>Valor</label><input name="v" inputmode="decimal" required></div><div><label>Data</label><input type="date" name="dt" value="${today()}"></div></div>
    <div class="row"><div><label>Categoria</label><select name="c">${cats.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div><label>Pagamento</label><select name="p">${PAGTOS.map(p => `<option>${p}</option>`).join('')}</select></div></div>
    ${foot()}
  </form>`, f => { lancar(tipo, f.d, f.v, f.c, f.dt, '', f.p); save(); ui.finMes = f.dt.slice(0, 7); vFinanceiro(); });
}
function exportCSV() {
  const rows = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Pagamento', 'Valor']]
    .concat(S.lancamentos.filter(l => l.data.startsWith(ui.finMes)).map(l => [fmtData(l.data), l.tipo, l.descricao, l.categoria, l.pagamento || '', l.valor.toFixed(2).replace('.', ',')]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  baixar(`financeiro-${ui.finMes}.csv`, '﻿' + csv, 'text/csv');
}
function baixar(nome, conteudo, tipo) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ----- clientes ----- */
function vClientes() {
  const q = ui.busca.toLowerCase();
  const cli = S.users.filter(u => u.role === 'cliente' && (u.nome.toLowerCase().includes(q) || (u.tel || '').includes(q))).sort((a, b) => a.nome.localeCompare(b.nome));
  const stats = id => { const ag = S.agendamentos.filter(a => a.clienteId === id && a.status === 'concluido'); return { n: ag.length, tot: ag.reduce((s, a) => s + a.valor, 0), ult: ag.map(a => a.data).sort().pop() }; };
  shell('Clientes', `<button class="btn" onclick="formCliente()">+ Cliente</button>`, `
  <div class="filters"><input placeholder="Buscar por nome ou telefone…" value="${esc(ui.busca)}" oninput="buscar(this.value,vClientes)"></div>
  <div class="card">${cli.length ? `<div class="list">${cli.map(c => { const s = stats(c.id); return `
    <div class="item"><div class="grow"><div class="t">${esc(c.nome)}${c.hasSenha ? ' <span class="pill app">📱 usa o app</span>' : ''}</div><div class="d">${esc(c.tel || '')} · ${s.n} visita(s) · ${brl(s.tot)}${s.ult ? ' · última ' + fmtData(s.ult) : ''}</div></div>
    ${c.tel ? `<a class="icon-btn" target="_blank" rel="noopener" href="https://wa.me/55${c.tel.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')}">💬</a>` : ''}
    <button class="icon-btn" onclick="formCliente('${c.id}')">✏️</button></div>`; }).join('')}</div>` : '<div class="empty">Nenhum cliente ainda. Envie o link de agendamento (em Ajustes) para seus clientes se cadastrarem.</div>'}</div>`);
}
function formCliente(id) {
  const c = id ? byId('users', id) : null;
  openModal(c ? 'Editar cliente' : 'Novo cliente', `
  <form>
    <label>Nome</label><input name="nome" required value="${esc(c?.nome || '')}">
    <label>Telefone / WhatsApp</label><input name="tel" required inputmode="tel" value="${esc(c?.tel || '')}">
    <label>Senha de acesso ao app <span class="mut">(opcional${c?.hasSenha ? ', deixe vazio para manter' : ''})</span></label><input name="senha" type="password" minlength="4" autocomplete="new-password">
    <label>Anotações</label><textarea name="obs" rows="2">${esc(c?.obs || '')}</textarea>
    <label><input type="checkbox" name="bloq" ${c?.bloqueado ? 'checked' : ''} style="width:auto;margin-right:6px">Bloquear acesso ao app</label>
    <div class="err" id="mErr"></div>
    ${foot()}
  </form>`, f => {
    const tel = f.tel.replace(/\D/g, '');
    if (tel.length < 10) { $('#mErr').textContent = 'Telefone com DDD.'; return false; }
    if (S.users.some(u => u.login === tel && u.id !== id)) { $('#mErr').textContent = 'Já existe cliente com esse telefone.'; return false; }
    const d = { nome: f.nome.trim(), tel: f.tel.trim(), login: tel, obs: f.obs, bloqueado: !!f.bloq };
    if (f.senha) d.novaSenha = f.senha;
    if (c) Object.assign(c, d); else S.users.push({ id: uid(), role: 'cliente', criado: today(), hasSenha: false, ...d });
    save(); vClientes();
  });
}

/* ----- serviços ----- */
function vServicos() {
  shell('Serviços', `<button class="btn" onclick="formServico()">+ Serviço</button>`, `
  <p class="mut small" style="margin-bottom:10px">Os serviços ativos aparecem para os clientes na tela de agendamento.</p>
  <div class="card"><div class="list">${S.servicos.map(s => `
    <div class="item"><div class="grow"><div class="t">${esc(s.nome)} ${s.ativo === false ? '<span class="pill">inativo</span>' : ''}</div><div class="d">${s.duracao} min</div></div>
    <b>${brl(s.preco)}</b><button class="icon-btn" onclick="formServico('${s.id}')">✏️</button></div>`).join('') || '<div class="empty">Nenhum serviço.</div>'}</div></div>`);
}
function formServico(id) {
  const s = id ? byId('servicos', id) : null;
  openModal(s ? 'Editar serviço' : 'Novo serviço', `
  <form>
    <label>Nome</label><input name="nome" required value="${esc(s?.nome || '')}">
    <div class="row"><div><label>Preço</label><input name="preco" inputmode="decimal" required value="${s?.preco ?? ''}"></div>
    <div><label>Duração (min)</label><input name="dur" type="number" min="5" step="5" required value="${s?.duracao ?? 30}"></div></div>
    <label><input type="checkbox" name="ativo" ${s?.ativo === false ? '' : 'checked'} style="width:auto;margin-right:6px">Disponível para agendamento</label>
    ${foot()}
  </form>`, f => {
    const d = { nome: f.nome.trim(), preco: num(f.preco), duracao: parseInt(f.dur) || 30, ativo: !!f.ativo };
    if (s) Object.assign(s, d); else S.servicos.push({ id: uid(), ...d });
    save(); vServicos();
  });
}

/* ----- ajustes ----- */
function vConfig() {
  const c = S.config;
  const link = location.origin + '/' + SLUG;
  const convite = `Agende seu horário em ${c.negocio} pelo celular: ${link}`;
  const pushOk = 'serviceWorker' in navigator && 'PushManager' in window;
  const emp = c.empresa || {};
  const endTxt = enderecoTexto(emp);
  shell('Ajustes', '', `
  <div class="card empresa-card" style="margin-bottom:12px">
    <div class="emp-logo">${emp.logo ? `<img src="${emp.logo}" alt="Logomarca">` : `<span>${(NICHOS[c.nicho] || {}).icon || '🏢'}</span>`}</div>
    <div class="grow" style="min-width:0">
      <h3 style="margin:0">${esc(c.negocio)}</h3>
      <div class="d">${[emp.razao, emp.cnpj ? 'CNPJ ' + emp.cnpj : '', emp.cpf ? 'CPF ' + emp.cpf : ''].filter(Boolean).map(esc).join(' · ') || '<span class="mut">Razão social, CNPJ e CPF não informados</span>'}</div>
      <div class="d">${endTxt ? '📍 ' + esc(endTxt) : '<span class="mut">Endereço não informado</span>'}${emp.telefone ? ' · 📞 ' + esc(emp.telefone) : ''}</div>
    </div>
    <button class="btn sm" onclick="formEmpresa()">🏢 Dados da empresa</button>
  </div>
  <div class="grid two">
    <div>
      <div class="card"><h3>Link de agendamento para clientes</h3>
        <p class="mut small">Envie este link. O cliente cria a conta com o telefone, agenda de casa e o horário aparece aqui na hora.</p>
        <div class="share"><input id="lnk" value="${esc(link)}" readonly><button class="btn sm" onclick="copiar()">Copiar</button></div>
        <div class="acts" style="margin-top:10px"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(convite)}">💬 Enviar no WhatsApp</a></div>
      </div>
      <div class="card" style="margin-top:12px"><h3>🔔 Notificações de novos agendamentos</h3>
        <p class="mut small">Aviso no celular quando um cliente agendar ou cancelar, mesmo com o app fechado. Ative em cada aparelho que você usa.</p>
        ${(() => { const [ic, txt] = statusPush(); return `<p class="small" style="margin-top:10px">${ic} ${txt}</p>`; })()}
        <div class="acts" style="margin-top:10px">${'PushManager' in window ? `<button class="btn sm" onclick="ativarPush()">${window.Notification?.permission === 'granted' ? 'Reativar neste aparelho' : 'Ativar neste aparelho'}</button><button class="btn ghost sm" id="btnTeste" onclick="testarPush()">Enviar teste</button>` : ''}</div>
        <p class="small" id="pushRes" style="margin-top:10px"></p>
      </div>
      <div class="card" style="margin-top:12px"><h3>Horário de atendimento</h3>
        <form id="fc">
          <label>Nicho</label><input value="${esc((NICHOS[c.nicho] || {}).icon + ' ' + (NICHOS[c.nicho] || {}).label)}" disabled>
          <div class="row"><div><label>Abre às</label><input type="time" name="abre" value="${c.abre}"></div><div><label>Fecha às</label><input type="time" name="fecha" value="${c.fecha}"></div></div>
          <label>Intervalo entre horários (min)</label><select name="intervalo">${[10, 15, 20, 30, 45, 60].map(m => `<option ${m == c.intervalo ? 'selected' : ''}>${m}</option>`).join('')}</select>
          <label>Dias de atendimento</label>
          <div class="chips wrap">${DIAS.map((d, i) => `<label class="chip ${c.dias.includes(i) ? 'on' : ''}" style="margin:0"><input type="checkbox" name="d${i}" ${c.dias.includes(i) ? 'checked' : ''} class="hidden" onchange="this.parentNode.classList.toggle('on',this.checked)"><b>${d}</b></label>`).join('')}</div>
          <button class="btn block">Salvar ajustes</button>
        </form>
      </div>
    </div>
    <div>
      <div class="card"><h3>Equipe</h3>
        <p class="mut small">${S.profissionais.filter(p => p.ativo !== false).length} profissional(is) ativo(s). Cadastre funcionários e dê a cada um o próprio acesso ao app.</p>
        <button class="btn ghost sm" style="margin-top:10px" onclick="go('equipe')">🧑‍💼 Gerenciar equipe</button>
      </div>
      <div class="card" style="margin-top:12px"><h3>Assinatura</h3>
        <p class="small">${ASSIN?.vence ? `${ASSIN.trial ? 'Teste grátis' : 'Válida'} até <b>${fmtData(ASSIN.vence)}</b>` : 'Ativa'}</p>
        <div class="acts" style="margin-top:10px"><button class="btn sm" onclick="abrirAssinatura()">💳 ${ASSIN?.trial ? 'Assinar' : 'Renovar'} com Pix</button><button class="btn ghost sm" onclick="abrirAssinatura('anual')">Plano anual −33%</button></div>
        <p class="small" style="margin-top:8px">${PUB.suporte ? `<a style="color:var(--ac)" target="_blank" rel="noopener" href="https://wa.me/${PUB.suporte}">Falar com o suporte</a>` : ''}</p>
      </div>
      <div class="card" style="margin-top:12px"><h3>Acesso do administrador</h3>
        <button class="btn ghost sm" onclick="formSenhaAdmin()">Trocar usuário / senha</button>
      </div>
      <div class="card" style="margin-top:12px"><h3>Backup</h3>
        <p class="mut small">Os dados ficam no servidor. Baixe uma cópia de segurança de vez em quando.</p>
        <div class="acts" style="margin-top:10px">
          <button class="btn ghost sm" onclick="baixarBackup()">Baixar backup</button>
          <label class="btn ghost sm" style="margin:0;color:var(--tx)">Restaurar<input type="file" accept=".json" class="hidden" onchange="restaurar(this.files[0])"></label>
        </div>
      </div>
    </div>
  </div>`);
  $('#fc').onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const dias = DIAS.map((_, i) => f['d' + i] ? i : -1).filter(i => i >= 0);
    if (!dias.length) return toast('Escolha ao menos um dia');
    Object.assign(c, { abre: f.abre, fecha: f.fecha, intervalo: Number(f.intervalo), dias });
    save(); applyTheme(); toast('Ajustes salvos'); vConfig();
  };
}
/* ----- dados da empresa ----- */
const soDig = v => String(v || '').replace(/\D/g, '');
function enderecoTexto(e) {
  if (!e) return '';
  const l1 = [e.rua, e.numero].filter(Boolean).join(', ') + (e.complemento ? ' - ' + e.complemento : '');
  return [l1, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/'), e.cep ? 'CEP ' + e.cep : ''].filter(x => x && x.trim()).join(' · ');
}
function cpfValido(v) {
  const d = soDig(v); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const t of [9, 10]) { let s = 0; for (let i = 0; i < t; i++) s += +d[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +d[t]) return false; }
  return true;
}
// Aceita CNPJ numérico e o novo CNPJ alfanumérico (letras nas 12 primeiras posições).
function cnpjValido(v) {
  const c = String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const val = ch => ch.charCodeAt(0) - 48;
  const dv = n => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += val(c[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === +c[12] && dv(13) === +c[13];
}
const mascCPF = v => soDig(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const mascCNPJ = v => { const c = String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14); return c.replace(/^(\w{2})(\w)/, '$1.$2').replace(/^(\w{2})\.(\w{3})(\w)/, '$1.$2.$3').replace(/\.(\w{3})(\w)/, '.$1/$2').replace(/(\w{4})(\w)/, '$1-$2'); };
const mascCEP = v => soDig(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
const mascTel = v => { const d = soDig(v).slice(0, 11); return d.length > 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d; };
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

// Reduz a imagem para 512x512 (sem cortar), para a logo ficar leve.
function prepararLogo(file) {
  return new Promise((ok, ko) => {
    if (!/^image\//.test(file.type)) return ko(new Error('Escolha um arquivo de imagem (PNG, JPG ou WEBP).'));
    if (file.size > 8e6) return ko(new Error('Imagem muito grande. Use uma de até 8 MB.'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const T = 512, cv = document.createElement('canvas'); cv.width = cv.height = T;
      const g = cv.getContext('2d'), k = Math.min(T / img.width, T / img.height), w = img.width * k, h = img.height * k;
      g.drawImage(img, (T - w) / 2, (T - h) / 2, w, h);
      URL.revokeObjectURL(url);
      let d = cv.toDataURL('image/png');
      if (d.length > 350000) { g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, T, T); d = cv.toDataURL('image/jpeg', .86); }
      ok(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Não foi possível ler essa imagem.')); };
    img.src = url;
  });
}
function formEmpresa() {
  const c = S.config, e = c.empresa || {};
  let logo = e.logo || '';
  openModal('🏢 Dados da empresa', `
  <form autocomplete="off">
    <div class="logo-up">
      <div class="emp-logo big" id="lgPrev">${logo ? `<img src="${logo}" alt="">` : '<span>🏢</span>'}</div>
      <div style="min-width:0">
        <b>Logomarca</b>
        <p class="mut small">Aparece no app, na tela de agendamento dos seus clientes e no ícone do app quando instalado. PNG com fundo transparente fica melhor.</p>
        <div class="acts" style="margin-top:8px">
          <label class="btn sm" style="margin:0">📷 ${logo ? 'Trocar logo' : 'Enviar logo'}<input type="file" accept="image/*" id="lgFile" class="hidden"></label>
          <button type="button" class="btn ghost sm ${logo ? '' : 'hidden'}" id="lgDel">Remover</button>
        </div>
      </div>
    </div>
    <label>Nome da empresa <span class="mut">(aparece para os clientes)</span></label><input name="negocio" required value="${esc(c.negocio)}">
    <label>Razão social <span class="mut">(opcional)</span></label><input name="razao" value="${esc(e.razao || '')}">
    <div class="row">
      <div><label>CNPJ</label><input name="cnpj" id="eCnpj" value="${esc(e.cnpj || '')}" placeholder="00.000.000/0000-00" autocapitalize="characters"></div>
      <div><label>CPF do responsável</label><input name="cpf" id="eCpf" inputmode="numeric" value="${esc(e.cpf || '')}" placeholder="000.000.000-00"></div>
    </div>
    <div class="row">
      <div><label>Telefone / WhatsApp</label><input name="telefone" id="eTel" inputmode="tel" value="${esc(e.telefone || '')}"></div>
      <div><label>E-mail</label><input name="email" type="email" value="${esc(e.email || '')}"></div>
    </div>
    <label>Instagram</label><input name="instagram" value="${esc(e.instagram || '')}" placeholder="@suaempresa" autocapitalize="none">
    <h4 class="sec">Endereço</h4>
    <div class="row">
      <div><label>CEP</label><input name="cep" id="eCep" inputmode="numeric" value="${esc(e.cep || '')}" placeholder="00000-000"></div>
      <div><label>Número</label><input name="numero" id="eNum" value="${esc(e.numero || '')}"></div>
    </div>
    <p class="mut small" id="cepMsg" style="margin-top:4px"></p>
    <label>Rua / Avenida</label><input name="rua" id="eRua" value="${esc(e.rua || '')}">
    <label>Complemento</label><input name="complemento" value="${esc(e.complemento || '')}" placeholder="Sala, loja, ponto de referência">
    <label>Bairro</label><input name="bairro" id="eBairro" value="${esc(e.bairro || '')}">
    <div class="row">
      <div><label>Cidade</label><input name="cidade" id="eCidade" value="${esc(e.cidade || '')}"></div>
      <div><label>UF</label><select name="uf" id="eUf"><option value=""></option>${UFS.map(u => `<option ${u === e.uf ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
    </div>
    <label style="margin-top:12px"><input type="checkbox" name="mostrarEndereco" ${e.mostrarEndereco === false ? '' : 'checked'} style="width:auto;margin-right:6px">Mostrar endereço e telefone para os clientes na tela de agendamento</label>
    <div class="err" id="mErr"></div>
    ${foot()}
  </form>`, f => {
    if (f.cnpj && !cnpjValido(f.cnpj)) { $('#mErr').textContent = 'CNPJ inválido. Confira os números.'; return false; }
    if (f.cpf && !cpfValido(f.cpf)) { $('#mErr').textContent = 'CPF inválido. Confira os números.'; return false; }
    c.negocio = f.negocio.trim() || c.negocio;
    c.empresa = {
      logo, razao: f.razao.trim(), cnpj: f.cnpj.trim(), cpf: f.cpf.trim(), telefone: f.telefone.trim(), email: f.email.trim(),
      instagram: f.instagram.trim(), cep: f.cep.trim(), rua: f.rua.trim(), numero: f.numero.trim(), complemento: f.complemento.trim(),
      bairro: f.bairro.trim(), cidade: f.cidade.trim(), uf: f.uf, mostrarEndereco: !!f.mostrarEndereco
    };
    save(); toast('Dados da empresa salvos'); vConfig();
  });
  const mask = (id, fn) => { const i = $(id); i.addEventListener('input', () => { i.value = fn(i.value); }); };
  mask('#eCpf', mascCPF); mask('#eCnpj', mascCNPJ); mask('#eCep', mascCEP); mask('#eTel', mascTel);
  $('#eCep').addEventListener('input', async () => {
    const cep = soDig($('#eCep').value); if (cep.length !== 8) return;
    $('#cepMsg').textContent = 'Buscando endereço…';
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then(r => r.json());
      if (r.erro) throw 0;
      $('#eRua').value = r.logradouro || $('#eRua').value; $('#eBairro').value = r.bairro || $('#eBairro').value;
      $('#eCidade').value = r.localidade || ''; $('#eUf').value = r.uf || '';
      $('#cepMsg').textContent = '✓ Endereço encontrado. Confira e preencha o número.'; $('#eNum').focus();
    } catch { $('#cepMsg').textContent = 'Não encontramos esse CEP. Preencha o endereço manualmente.'; }
  });
  $('#lgFile').addEventListener('change', async ev => {
    const file = ev.target.files[0]; if (!file) return;
    try { logo = await prepararLogo(file); $('#lgPrev').innerHTML = `<img src="${logo}" alt="">`; $('#lgDel').classList.remove('hidden'); }
    catch (err) { $('#mErr').textContent = err.message; }
  });
  $('#lgDel').addEventListener('click', () => { logo = ''; $('#lgPrev').innerHTML = '<span>🏢</span>'; $('#lgDel').classList.add('hidden'); });
}

function copiar() {
  const i = $('#lnk'); i.select();
  (navigator.clipboard?.writeText(i.value) || Promise.reject()).then(() => toast('Link copiado'), () => { document.execCommand('copy'); toast('Link copiado'); });
}
function formProf() {
  openModal('Novo profissional', `<form><label>Nome</label><input name="nome" required>${foot()}</form>`,
    f => { S.profissionais.push({ id: uid(), nome: f.nome.trim(), ativo: true }); save(); vConfig(); });
}
function formSenhaAdmin() {
  openModal('Trocar usuário / senha', `<form><label>Usuário</label><input name="login" value="${esc(me.login)}" required autocapitalize="none">
    <label>Senha atual</label><input type="password" name="atual" required autocomplete="current-password"><label>Nova senha</label><input type="password" name="nova" minlength="4" required autocomplete="new-password">
    <div class="err" id="mErr"></div>${foot()}</form>`, async f => {
    await api('POST', '/api/senha', f); me.login = f.login.trim().toLowerCase(); toast('Senha alterada');
  });
}
async function baixarBackup() {
  try { const d = await api('GET', '/api/backup'); baixar('agendapro-backup-' + today() + '.json', JSON.stringify(d), 'application/json'); }
  catch (e) { toast(e.message); }
}
function restaurar(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.config || !Array.isArray(d.users)) throw new Error('Arquivo de backup inválido.');
      if (!confirm('Substituir os dados atuais pelo backup?')) return;
      await api('POST', '/api/restore', d); toast('Backup restaurado'); boot();
    } catch (e) { alert(e.message || 'Arquivo de backup inválido.'); }
  };
  r.readAsText(file);
}

/* ----- notificações push ----- */
function b64ToU8(b64) {
  const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
function nomeAparelho() {
  const ua = navigator.userAgent;
  const so = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Outro';
  const nav = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
  return `${so}${nav ? ' · ' + nav : ''}${matchMedia('(display-mode: standalone)').matches ? ' (app)' : ''}`;
}
const chaveIgual = (sub, chave) => {
  const k = sub?.options?.applicationServerKey; if (!k) return true;
  const a = new Uint8Array(k), b = b64ToU8(chave);
  return a.length === b.length && a.every((x, i) => x === b[i]);
};
// Cria (ou recria, se foi feita com outra chave) a inscrição deste aparelho e registra no servidor.
async function inscreverAparelho() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !chaveIgual(sub, PUB.vapidPublic)) { await sub.unsubscribe().catch(() => { }); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(PUB.vapidPublic) });
  return api('POST', '/api/push/subscribe', { sub: sub.toJSON(), aparelho: nomeAparelho() });
}
// Ao abrir o painel: se a permissão já foi dada, garante silenciosamente que o servidor conhece este aparelho.
async function garantirPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return;
    await inscreverAparelho();
  } catch (e) { console.warn('push:', e); }
}
function statusPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !window.Notification) {
    return /iPhone|iPad/.test(navigator.userAgent)
      ? ['⚠️', 'No iPhone, as notificações só funcionam com o app instalado: toque em Compartilhar → <b>Adicionar à Tela de Início</b>, abra pelo ícone e ative aqui (iOS 16.4 ou mais novo).']
      : ['⚠️', 'Este navegador não suporta notificações. Use o Chrome.'];
  }
  if (Notification.permission === 'denied') return ['🚫', 'As notificações estão <b>bloqueadas</b> para este site. Toque no cadeado ao lado do endereço → <b>Permissões / Notificações</b> → <b>Permitir</b>, e depois toque em Ativar.'];
  if (Notification.permission === 'granted') return ['✅', 'Ativadas neste aparelho. Toque em <b>Enviar teste</b> para conferir.'];
  return ['🔕', 'Ainda não ativadas neste aparelho.'];
}
async function ativarPush() {
  try {
    if (Notification.permission === 'denied') return alert('As notificações estão bloqueadas para este site.\n\nToque no cadeado ao lado do endereço → Permissões → Notificações → Permitir. Depois toque em Ativar de novo.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Permissão de notificação não concedida'); return go(view, true); }
    const r = await inscreverAparelho();
    toast(`🔔 Ativado! ${r.aparelhos} aparelho(s) recebendo avisos`, 3500);
    go(view, true); setTimeout(testarPush, 800);
  } catch (e) { alert('Não foi possível ativar: ' + e.message); }
}
async function testarPush() {
  const btn = $('#btnTeste'); if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    if (Notification.permission === 'granted') await inscreverAparelho().catch(() => { });
    const r = await api('POST', '/api/push/teste');
    const ok = r.resultados.filter(x => x.ok).length, falha = r.resultados.filter(x => !x.ok);
    const el = $('#pushRes');
    const html = !r.resultados.length ? '⚠️ Nenhum aparelho ativado ainda. Toque em <b>Ativar neste aparelho</b>.'
      : `${ok ? `✅ Enviado para ${ok} aparelho(s). A notificação deve chegar em alguns segundos.` : ''}${falha.length ? `<br>❌ ${falha.length} aparelho(s) recusaram (${esc(falha.map(f => f.aparelho || f.status).join(', '))}) e foram removidos. Toque em <b>Ativar neste aparelho</b> de novo.` : ''}
         <br><span class="mut">Não chegou? Veja se as notificações do navegador estão permitidas nas configurações do celular e se o modo economia de bateria não está bloqueando.</span>`;
    if (el) el.innerHTML = html; else toast(ok ? 'Teste enviado' : 'Falhou', 3000);
  } catch (e) { toast(e.message); }
  if (btn) { btn.disabled = false; btn.textContent = 'Enviar teste'; }
}

/* ================= CLIENTE ================= */
function vAgendar() {
  const b = ui.book;
  const profs = profsAtivos();
  if (!b.profId || !profs.some(p => p.id === b.profId)) b.profId = profs[0]?.id;
  const sv = b.servicoId ? byId('servicos', b.servicoId) : null;
  const dias = [...Array(30)].map((_, i) => addDays(today(), i)).filter(d => S.config.dias.includes(new Date(d + 'T12:00').getDay()));
  if (!b.data || !dias.includes(b.data)) b.data = dias[0];
  const key = `${b.servicoId}|${b.profId}|${b.data}`;
  const livres = ui.slots[key];
  if (sv && !livres) carregarSlots(key);
  if (b.hora && livres && !livres.includes(b.hora)) b.hora = '';
  const passo = profs.length > 1 ? 1 : 0;
  shell(`Olá, ${esc(me.nome.split(' ')[0])}!`, '', `
  <p class="mut">Escolha o serviço, o dia e o horário em ${esc(S.config.negocio)}.</p>
  ${cardLocal()}
  <div class="step"><span class="n">1</span>Serviço</div>
  <div class="svc-grid">${servAtivos().map(s => `<button class="svc ${s.id === b.servicoId ? 'on' : ''}" onclick="ui.book.servicoId='${s.id}';ui.book.hora='';vAgendar()"><b>${esc(s.nome)}</b><span class="mut small">${s.duracao} min</span><div class="p">${brl(s.preco)}</div></button>`).join('')}</div>
  ${passo ? `<div class="step"><span class="n">2</span>Profissional</div>
  <div class="chips">${profs.map(p => `<button class="chip ${p.id === b.profId ? 'on' : ''}" onclick="ui.book.profId='${p.id}';ui.book.hora='';vAgendar()"><b style="font-size:.9rem">${esc(p.nome)}</b></button>`).join('')}</div>` : ''}
  <div class="step"><span class="n">${2 + passo}</span>Dia</div>
  <div class="chips">${dias.map(d => { const dt = new Date(d + 'T12:00'); return `<button class="chip ${d === b.data ? 'on' : ''}" onclick="ui.book.data='${d}';ui.book.hora='';vAgendar()"><small>${d === today() ? 'Hoje' : DIAS[dt.getDay()]}</small><b>${dt.getDate()}</b><small>${dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></button>`; }).join('')}</div>
  <div class="step"><span class="n">${3 + passo}</span>Horário</div>
  ${!sv ? '<p class="mut">Escolha um serviço para ver os horários.</p>' : !livres ? '<div class="loading">Buscando horários livres…</div>' : livres.length ? `<div class="slots">${livres.map(h => `<button class="slot ${h === b.hora ? 'on' : ''}" onclick="ui.book.hora='${h}';vAgendar()">${h}</button>`).join('')}</div>` : '<p class="mut">Sem horários livres neste dia. Tente outro.</p>'}
  ${sv && b.hora ? `<div class="card summary"><div class="item" style="padding:0"><div class="grow"><div class="t">${esc(sv.nome)} · ${brl(sv.preco)}</div><div class="d">${fmtData(b.data)} às ${b.hora}</div></div><button class="btn" id="btnConf" onclick="confirmarCliente()">Confirmar</button></div></div>` : ''}`, );
}
function cardLocal() {
  const e = empresaInfo(); if (!e || e.mostrarEndereco === false) return '';
  const end = enderecoTexto(e), tel = soDig(e.telefone);
  if (!end && !tel && !e.instagram) return '';
  const mapa = end ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end.replace(/ · CEP.*/, ''))}` : '';
  return `<div class="card local">${end ? `<div>📍 ${esc(end)}</div>` : ''}<div class="acts" style="margin-top:8px">
    ${mapa ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${mapa}">🗺️ Como chegar</a>` : ''}
    ${tel ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/55${tel.replace(/^55(?=\d{10,11}$)/, '')}">💬 WhatsApp</a>` : ''}
    ${e.instagram ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://instagram.com/${esc(e.instagram.replace(/^@/, ''))}">📸 ${esc(e.instagram.startsWith('@') ? e.instagram : '@' + e.instagram)}</a>` : ''}</div></div>`;
}
async function carregarSlots(key) {
  if (carregarSlots[key]) return; carregarSlots[key] = 1;
  const [servicoId, profId, data] = key.split('|');
  try { ui.slots[key] = (await api('GET', `/api/slots?servicoId=${servicoId}&profId=${profId}&data=${data}`)).slots; }
  catch (e) { ui.slots[key] = []; toast(e.message); }
  delete carregarSlots[key];
  if (view === 'agendar') go('agendar', true);
}
async function confirmarCliente() {
  const b = ui.book, btn = $('#btnConf'); btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    await api('POST', '/api/agendar', { servicoId: b.servicoId, profId: b.profId, data: b.data, hora: b.hora });
    ui.book = {}; ui.slots = {}; toast('Horário agendado! ✨'); go('meus');
  } catch (e) {
    toast(e.message, 4000); ui.slots = {}; b.hora = ''; vAgendar();
  }
}
async function vMeus() {
  shell('Meus horários', `<button class="btn" onclick="go('agendar')">+ Agendar</button>`, '<div class="loading">Carregando…</div>');
  let meus;
  try { meus = (await api('GET', '/api/meus')).agendamentos; } catch (e) { $('.main .loading').textContent = e.message; return; }
  if (view !== 'meus') return;
  meus.sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));
  const futuros = meus.filter(a => a.status === 'agendado' && a.data >= today()).reverse();
  const hist = meus.filter(a => !futuros.includes(a));
  const linha = a => `<div class="item"><div class="hour">${a.hora}</div><div class="grow"><div class="t">${esc(a.servicoNome)}</div><div class="d">${DIAS[new Date(a.data + 'T12:00').getDay()]}, ${fmtData(a.data)} · ${brl(a.valor)}</div></div><span class="pill ${a.status}">${a.status}</span>
    ${a.status === 'agendado' && a.data >= today() ? `<button class="btn ghost sm" onclick="cancelarCli('${a.id}')">Cancelar</button>` : ''}</div>`;
  shell('Meus horários', `<button class="btn" onclick="go('agendar')">+ Agendar</button>`, `
  <div class="card"><h3>Próximos</h3>${futuros.length ? `<div class="list">${futuros.map(linha).join('')}</div>` : '<div class="empty">Nenhum horário marcado.</div>'}</div>
  ${hist.length ? `<div class="card" style="margin-top:12px"><h3>Histórico</h3><div class="list">${hist.map(linha).join('')}</div></div>` : ''}`);
}
async function cancelarCli(id) {
  if (!confirm('Cancelar este horário?')) return;
  try { await api('POST', `/api/meus/${id}/cancelar`); toast('Horário cancelado'); vMeus(); } catch (e) { toast(e.message); }
}
function vPerfil() {
  shell('Perfil', '', `
  <div class="card" style="max-width:480px">
    <form id="fp"><label>Nome</label><input name="nome" value="${esc(me.nome)}" required>
      <label>Telefone</label><input value="${esc(me.tel)}" disabled>
      <label>Nova senha <span class="mut">(opcional)</span></label><input type="password" name="senha" minlength="4" autocomplete="new-password">
      <button class="btn block">Salvar</button></form>
    <button class="btn ghost block" onclick="logout()">Sair</button>
  </div>`);
  $('#fp').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    try { me = (await api('PUT', '/api/me', f)).user; toast('Perfil atualizado'); } catch (err) { toast(err.message); }
  };
}

/* ================= EQUIPE (dono) ================= */
function vEquipe() {
  const mes = mesAtual();
  const acesso = id => S.users.find(u => u.role === 'func' && u.profId === id);
  const dono = S.users.find(u => u.role === 'admin');
  shell('Equipe', `<button class="btn" onclick="formFunc()">+ Funcionário</button>`, `
  <p class="mut small" style="margin-bottom:12px">Cada funcionário com acesso entra pelo <b>${esc(location.host)}/entrar</b> (ou pelo seu link) com o usuário e a senha que você criar. Ele vê e cuida <b>só da própria agenda</b> e recebe notificação só dos clientes dele. Financeiro, estoque, vendas e clientes continuam só com você.</p>
  <div class="card"><div class="list">${S.profissionais.map(p => {
    const u = acesso(p.id), ags = S.agendamentos.filter(a => a.profId === p.id && a.data.startsWith(mes));
    const conc = ags.filter(a => a.status === 'concluido'), fat = conc.reduce((s, a) => s + a.valor, 0);
    const ehDono = dono && p.nome === dono.nome && !u;
    return `<div class="item"><div class="grow"><div class="t">${esc(p.nome)} ${p.ativo === false ? '<span class="pill">inativo</span>' : ''}${ehDono ? ' <span class="pill app">você</span>' : ''}</div>
      <div class="d">${u ? `🔑 acesso: <b style="color:var(--tx)">${esc(u.login)}</b>` : ehDono ? 'usa o seu acesso de dono' : 'sem acesso ao app'} · ${conc.length} atendimento(s) no mês · ${brl(fat)}</div></div>
      <div class="acts"><button class="btn ghost sm" onclick="formFunc('${p.id}')">${u ? 'Editar' : ehDono ? 'Editar' : 'Dar acesso'}</button></div></div>`;
  }).join('') || '<div class="empty">Nenhum profissional ainda.</div>'}</div></div>`);
}
function formFunc(profId) {
  const p = profId ? byId('profissionais', profId) : null;
  const u = p ? S.users.find(x => x.role === 'func' && x.profId === p.id) : null;
  const sugestao = (p?.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().split(/\s+/).slice(0, 2).join('.');
  openModal(p ? 'Funcionário: ' + p.nome : 'Novo funcionário', `
  <form autocomplete="off">
    <label>Nome</label><input name="nome" required value="${esc(p?.nome || '')}" id="fNome">
    <label>Telefone / WhatsApp <span class="mut">(opcional)</span></label><input name="tel" inputmode="tel" value="${esc(p?.tel || '')}">
    <label style="margin-top:16px"><input type="checkbox" name="temAcesso" id="fAcc" ${u || !p ? 'checked' : ''} style="width:auto;margin-right:6px">Dar acesso ao app para este funcionário</label>
    <div id="boxAcc">
      <div class="row">
        <div><label>Usuário</label><input name="login" id="fLogin" autocapitalize="none" value="${esc(u?.login || sugestao)}" placeholder="ex.: sara.lima"></div>
        <div><label>${u ? 'Nova senha <span class="mut">(vazio = manter)</span>' : 'Senha'}</label><input name="senha" id="fSenha" autocomplete="new-password" minlength="4" placeholder="mín. 4 caracteres"></div>
      </div>
      <p class="mut small" style="margin-top:6px">Ele entra em <b>${esc(location.host)}/entrar</b> com esse usuário e senha.</p>
    </div>
    ${p ? `<label style="margin-top:14px"><input type="checkbox" name="ativo" ${p.ativo === false ? '' : 'checked'} style="width:auto;margin-right:6px">Ativo (aparece para os clientes agendarem)</label>` : ''}
    ${u ? `<button type="button" class="btn bad sm" style="margin-top:12px" onclick="removerAcesso('${p.id}')">Remover acesso ao app</button>` : ''}
    <div class="err" id="mErr"></div>
    ${foot()}
  </form>`, async f => {
    const body = { profId: p?.id, nome: f.nome.trim(), tel: f.tel, ativo: p ? !!f.ativo : true };
    if (f.temAcesso) {
      body.login = f.login.trim().toLowerCase();
      if (!body.login) { $('#mErr').textContent = 'Informe o usuário.'; return false; }
      if (!u && !f.senha) { $('#mErr').textContent = 'Crie uma senha para o primeiro acesso.'; return false; }
      if (f.senha) body.senha = f.senha;
    }
    await api('POST', '/api/equipe', body);
    if (!f.temAcesso && u) await api('DELETE', `/api/equipe/${p.id}/acesso`);
    await pull(true);
    if (f.temAcesso && (f.senha || !u)) {
      const msg = `Olá ${body.nome.split(' ')[0]}! Seu acesso ao app da ${S.config.negocio}:\n\n🔗 ${location.origin}/entrar\n👤 Usuário: ${body.login}\n🔑 Senha: ${f.senha}\n\nLá você vê a sua agenda e é avisado(a) de cada cliente novo. Ative as notificações em "Meu mês".`;
      const tel = (f.tel || '').replace(/\D/g, '');
      openModal('✅ Acesso pronto', `<p class="mut small">Envie para o funcionário. Anote a senha: ela não fica visível depois.</p>
        <div class="card" style="white-space:pre-wrap;margin-top:10px;font-size:.9rem">${esc(msg)}</div>
        <div class="modal-foot">${tel ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/55${tel.replace(/^55(?=\d{10,11}$)/, '')}?text=${encodeURIComponent(msg)}">💬 Enviar no WhatsApp</a>` : ''}<button class="btn ghost" onclick="closeModal()">Fechar</button></div>`);
      vEquipe(); return false;
    }
    toast('Equipe atualizada'); vEquipe();
  });
  const sync = () => $('#boxAcc').classList.toggle('hidden', !$('#fAcc').checked);
  $('#fAcc').onchange = sync; sync();
  if (!p) $('#fNome').oninput = () => { $('#fLogin').value = $('#fNome').value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().split(/\s+/).slice(0, 2).join('.'); };
}
async function removerAcesso(profId) {
  if (!confirm('Remover o acesso deste funcionário? A agenda dele continua, só o login deixa de funcionar.')) return;
  try { await api('DELETE', `/api/equipe/${profId}/acesso`); await pull(true); closeModal(); toast('Acesso removido'); vEquipe(); } catch (e) { toast(e.message); }
}

/* ================= FUNCIONÁRIO ================= */
function vResumo() {
  const mes = mesAtual(), hoje = today();
  const meus = S.agendamentos.filter(a => a.profId === me.profId);
  const conc = meus.filter(a => a.status === 'concluido' && a.data.startsWith(mes));
  const hojeL = meus.filter(a => a.data === hoje && a.status !== 'cancelado');
  const prox = meus.filter(a => a.status === 'agendado' && a.data >= hoje).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)).slice(0, 8);
  const [ic, txt] = statusPush();
  shell(`Olá, ${esc(me.nome.split(' ')[0])}!`, '', `
  <div class="grid kpis">
    <div class="card kpi"><div class="l">Hoje</div><div class="v">${hojeL.length}</div><div class="s">atendimento(s) na sua agenda</div></div>
    <div class="card kpi"><div class="l">Concluídos no mês</div><div class="v">${conc.length}</div></div>
    <div class="card kpi"><div class="l">Faturado no mês</div><div class="v pos">${brl(conc.reduce((s, a) => s + a.valor, 0))}</div></div>
  </div>
  <div class="grid two" style="margin-top:12px">
    <div class="card"><h3>Seus próximos clientes</h3>${prox.length ? `<div class="list">${prox.map(a => `<div class="item"><div class="hour">${a.hora}</div><div class="grow"><div class="t">${esc(a.clienteNome)}${tagApp(a)}</div><div class="d">${esc(a.servicoNome)} · ${a.data === hoje ? 'hoje' : fmtData(a.data)}</div></div></div>`).join('')}</div>` : '<div class="empty">Nenhum horário marcado.</div>'}</div>
    <div class="card"><h3>🔔 Notificações</h3>
      <p class="mut small">Receba um aviso no celular quando um cliente marcar ou cancelar com você.</p>
      <p class="small" style="margin-top:10px">${ic} ${txt}</p>
      <div class="acts" style="margin-top:10px">${'PushManager' in window ? `<button class="btn sm" onclick="ativarPush()">${window.Notification?.permission === 'granted' ? 'Reativar neste aparelho' : 'Ativar neste aparelho'}</button><button class="btn ghost sm" id="btnTeste" onclick="testarPush()">Enviar teste</button>` : ''}</div>
      <p class="small" id="pushRes" style="margin-top:10px"></p>
    </div>
  </div>`);
}
function vPerfilFunc() {
  shell('Perfil', '', `
  <div class="card" style="max-width:480px">
    <p class="mut small">Usuário de acesso: <b style="color:var(--tx)">${esc(me.login)}</b></p>
    <form id="fp"><label>Nova senha</label><input type="password" name="senha" minlength="4" required autocomplete="new-password">
      <button class="btn block">Trocar senha</button></form>
    <button class="btn ghost block" onclick="logout()">Sair</button>
  </div>`);
  $('#fp').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    try { me = (await api('PUT', '/api/me', { senha: f.senha })).user; toast('Senha alterada'); e.target.reset(); } catch (err) { toast(err.message); }
  };
}

window.addEventListener('resize', () => { if (view === 'dashboard') drawChart(); });
boot();
