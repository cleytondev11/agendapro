/* AgendaPro Beleza — PWA de gestão para barbearia, lash, manicure/pedicure e salão.
   Dados salvos no próprio aparelho (localStorage). Para uso com vários aparelhos
   ao mesmo tempo, troque as funções load()/save() por chamadas à sua API. */

const DB_KEY = 'agendapro_db_v1';
const SESS_KEY = 'agendapro_sess_v1';

const NICHOS = {
  barbearia: {
    label: 'Barbearia', icon: '💈', cor: '#c8a24a',
    servicos: [['Corte masculino', 40, 30], ['Barba', 30, 20], ['Corte + barba', 60, 50], ['Pezinho', 15, 10], ['Sobrancelha', 15, 10], ['Pigmentação', 35, 30]],
    produtos: [['Pomada modeladora', 18, 45, 10], ['Óleo para barba', 15, 40, 8], ['Shampoo anticaspa', 12, 35, 6], ['Lâmina descartável (cx)', 25, 0, 5]]
  },
  lash: {
    label: 'Lash / Cílios', icon: '👁️', cor: '#d9668f',
    servicos: [['Fio a fio', 130, 120], ['Volume brasileiro', 150, 120], ['Volume russo', 180, 150], ['Manutenção', 80, 60], ['Remoção', 40, 30], ['Lash lifting', 100, 60]],
    produtos: [['Cola para extensão', 60, 0, 3], ['Fios 0.07 (caixa)', 35, 0, 5], ['Removedor em gel', 25, 0, 2], ['Escovinhas (pct)', 8, 15, 10]]
  },
  manicure: {
    label: 'Manicure & Pedicure', icon: '💅', cor: '#e0607e',
    servicos: [['Manicure', 30, 40], ['Pedicure', 35, 45], ['Pé e mão', 60, 80], ['Esmaltação em gel', 70, 60], ['Alongamento em gel', 150, 120], ['Spa dos pés', 50, 40]],
    produtos: [['Esmalte (un)', 6, 15, 20], ['Acetona 500ml', 9, 0, 4], ['Lixa (pct)', 10, 0, 5], ['Gel construtor', 45, 0, 2]]
  },
  cabeleireira: {
    label: 'Salão / Cabeleireira', icon: '💇‍♀️', cor: '#9a72e0',
    servicos: [['Corte feminino', 70, 60], ['Escova', 50, 45], ['Hidratação', 80, 60], ['Coloração', 150, 120], ['Luzes / Mechas', 300, 240], ['Progressiva', 250, 180]],
    produtos: [['Shampoo profissional', 40, 75, 4], ['Máscara de hidratação', 55, 95, 4], ['Tinta (tubo)', 18, 0, 10], ['Água oxigenada', 14, 0, 4]]
  }
};
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PAGTOS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'];
const CAT_SAIDA = ['Aluguel', 'Energia/Água', 'Internet', 'Salários/Comissões', 'Compra de produtos', 'Manutenção', 'Marketing', 'Impostos', 'Outros'];
const CAT_ENTRADA = ['Serviço', 'Venda de produto', 'Outros'];

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

async function hash(txt) {
  const data = new TextEncoder().encode('agendapro:' + txt);
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const b of data) h = ((h << 5) + h + b) | 0; return 'x' + (h >>> 0).toString(16);
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- dados ---------------- */
let S = load();
let me = null;
let view = '';
const ui = { agendaData: today(), agendaProf: '', finMes: mesAtual(), busca: '', book: {} };

function blank() {
  return { config: null, users: [], profissionais: [], servicos: [], produtos: [], agendamentos: [], compras: [], vendas: [], lancamentos: [] };
}
function load() {
  try { return Object.assign(blank(), JSON.parse(localStorage.getItem(DB_KEY)) || {}); } catch { return blank(); }
}
function save() { localStorage.setItem(DB_KEY, JSON.stringify(S)); }
const byId = (col, id) => S[col].find(x => x.id === id);

function applyTheme() {
  const cor = S.config ? (NICHOS[S.config.nicho]?.cor || '#d9668f') : '#d9668f';
  document.documentElement.style.setProperty('--ac', cor);
}

function seedNicho(nicho) {
  const n = NICHOS[nicho];
  S.servicos = n.servicos.map(([nome, preco, duracao]) => ({ id: uid(), nome, preco, duracao, ativo: true }));
  if (!S.produtos.length) S.produtos = n.produtos.map(([nome, custo, preco, qtd]) => ({ id: uid(), nome, custo, preco, qtd, min: Math.max(2, Math.round(qtd / 3)) }));
}

function lancar(tipo, descricao, valor, categoria, data = today(), ref = '', pagamento = '') {
  S.lancamentos.push({ id: uid(), tipo, descricao, valor: num(valor), categoria, data, ref, pagamento });
}

/* ---------------- sessão ---------------- */
function boot() {
  applyTheme();
  const sid = localStorage.getItem(SESS_KEY);
  me = sid ? byId('users', sid) : null;
  if (!S.config || !S.users.some(u => u.role === 'admin')) return renderSetup();
  if (!me) return renderLogin();
  go(me.role === 'admin' ? (view && view !== 'agendar' && view !== 'meus' ? view : 'dashboard') : 'agendar');
}
function logout() { localStorage.removeItem(SESS_KEY); me = null; view = ''; renderLogin(); }

/* ---------------- primeira configuração ---------------- */
function renderSetup() {
  let nicho = 'barbearia';
  $('#app').innerHTML = `
  <div class="auth"><div class="auth-card" style="max-width:460px">
    <div class="brand"><div class="logo">✨</div><h1>AgendaPro</h1></div>
    <p class="mut small">Primeiro acesso: configure seu negócio e crie o login do administrador.</p>
    <label>Qual é o seu nicho?</label>
    <div class="nichos" id="nichos">${Object.entries(NICHOS).map(([k, n]) => `
      <button type="button" class="nicho ${k === nicho ? 'on' : ''}" data-k="${k}"><span>${n.icon}</span><b>${n.label}</b></button>`).join('')}</div>
    <form id="f">
      <label>Nome do estabelecimento</label><input name="negocio" required placeholder="Ex.: Studio Bella">
      <label>Seu nome</label><input name="nome" required>
      <div class="row">
        <div><label>Usuário (login)</label><input name="login" required autocomplete="username" autocapitalize="none"></div>
        <div><label>Senha</label><input name="senha" type="password" required minlength="4" autocomplete="new-password"></div>
      </div>
      <div class="err" id="err"></div>
      <button class="btn block">Criar e entrar</button>
    </form>
  </div></div>`;
  $('#nichos').onclick = e => {
    const b = e.target.closest('.nicho'); if (!b) return;
    nicho = b.dataset.k;
    document.querySelectorAll('.nicho').forEach(x => x.classList.toggle('on', x === b));
    document.documentElement.style.setProperty('--ac', NICHOS[nicho].cor);
  };
  document.documentElement.style.setProperty('--ac', NICHOS[nicho].cor);
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    S = blank();
    S.config = { negocio: f.negocio.trim(), nicho, abre: '09:00', fecha: '19:00', intervalo: 30, dias: [1, 2, 3, 4, 5, 6] };
    const admin = { id: uid(), nome: f.nome.trim(), login: f.login.trim().toLowerCase(), senha: await hash(f.senha), role: 'admin', tel: '', criado: today() };
    S.users.push(admin);
    S.profissionais.push({ id: uid(), nome: f.nome.trim(), ativo: true });
    seedNicho(nicho);
    save(); localStorage.setItem(SESS_KEY, admin.id); boot();
  };
}

/* ---------------- login / cadastro de cliente ---------------- */
function renderLogin(tab = 'entrar') {
  const c = S.config, n = NICHOS[c.nicho];
  $('#app').innerHTML = `
  <div class="auth"><div class="auth-card">
    <div class="brand"><div class="logo">${n.icon}</div><div><h1>${esc(c.negocio)}</h1><div class="mut small">${n.label}</div></div></div>
    <div class="tabs"><button class="${tab === 'entrar' ? 'on' : ''}" onclick="renderLogin('entrar')">Entrar</button><button class="${tab === 'cad' ? 'on' : ''}" onclick="renderLogin('cad')">Sou cliente novo</button></div>
    ${tab === 'entrar' ? `
    <form id="f">
      <label>Usuário ou telefone</label><input name="login" required autocomplete="username" autocapitalize="none">
      <label>Senha</label><input name="senha" type="password" required autocomplete="current-password">
      <div class="err" id="err"></div>
      <button class="btn block">Entrar</button>
    </form>` : `
    <form id="f">
      <label>Nome completo</label><input name="nome" required>
      <label>Telefone / WhatsApp</label><input name="tel" required inputmode="tel" placeholder="(61) 90000-0000">
      <label>Crie uma senha</label><input name="senha" type="password" required minlength="4" autocomplete="new-password">
      <div class="err" id="err"></div>
      <button class="btn block">Criar conta e agendar</button>
      <p class="mut small" style="margin-top:10px">Seu login será o seu telefone (só números).</p>
    </form>`}
  </div></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (tab === 'entrar') {
      const login = f.login.trim().toLowerCase(), loginTel = login.replace(/\D/g, '');
      const h = await hash(f.senha);
      const u = S.users.find(u => (u.login === login || (loginTel && u.login === loginTel)) && u.senha === h);
      if (!u) return $('#err').textContent = 'Usuário ou senha incorretos.';
      if (u.bloqueado) return $('#err').textContent = 'Acesso bloqueado. Fale com o estabelecimento.';
      localStorage.setItem(SESS_KEY, u.id); boot();
    } else {
      const tel = f.tel.replace(/\D/g, '');
      if (tel.length < 10) return $('#err').textContent = 'Informe um telefone com DDD.';
      const ex = S.users.find(u => u.login === tel);
      if (ex && ex.senha) return $('#err').textContent = 'Já existe uma conta com esse telefone. Use a aba Entrar.';
      let u = ex;
      if (u) { u.senha = await hash(f.senha); u.nome = f.nome.trim(); }
      else { u = { id: uid(), nome: f.nome.trim(), login: tel, tel: f.tel.trim(), senha: await hash(f.senha), role: 'cliente', criado: today() }; S.users.push(u); }
      save(); localStorage.setItem(SESS_KEY, u.id); boot();
    }
  };
}

/* ---------------- shell / navegação ---------------- */
const NAV_ADMIN = [
  ['dashboard', '📊', 'Dashboard'], ['agenda', '📅', 'Agenda'], ['vendas', '🛍️', 'Vendas'], ['financeiro', '💰', 'Financeiro'],
  ['estoque', '📦', 'Estoque'], ['compras', '🧾', 'Compras'], ['clientes', '👥', 'Clientes'], ['servicos', '✂️', 'Serviços'], ['config', '⚙️', 'Ajustes']
];
const NAV_CLI = [['agendar', '➕', 'Agendar'], ['meus', '📅', 'Meus horários'], ['perfil', '👤', 'Perfil']];

function shell(title, actions, body) {
  const nav = me.role === 'admin' ? NAV_ADMIN : NAV_CLI;
  const n = NICHOS[S.config.nicho];
  const bottom = me.role === 'admin' ? nav.slice(0, 4) : nav;
  const extra = me.role === 'admin' ? nav.slice(4) : [];
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="brand"><div class="logo">${n.icon}</div><h1>${esc(S.config.negocio)}</h1></div>
      <nav class="nav">${nav.map(([k, i, l]) => `<a class="${view === k ? 'on' : ''}" onclick="go('${k}')"><span class="i">${i}</span>${l}</a>`).join('')}</nav>
      <div class="me"><b>${esc(me.nome)}</b><div class="mut">${me.role === 'admin' ? 'Administrador' : 'Cliente'}</div><button class="btn ghost sm" style="margin-top:8px" onclick="logout()">Sair</button></div>
    </aside>
    <main class="main">
      <div class="top"><h2>${title}</h2><div class="acts">${actions || ''}</div></div>
      ${body}
    </main>
  </div>
  <nav class="bnav">${bottom.map(([k, i, l]) => `<a class="${view === k ? 'on' : ''}" onclick="go('${k}')"><span class="i">${i}</span>${l}</a>`).join('')}
    ${extra.length ? `<a class="${extra.some(x => x[0] === view) ? 'on' : ''}" onclick="$('#more').classList.toggle('open')"><span class="i">☰</span>Mais</a>` : ''}</nav>
  <div class="more-menu nav" id="more">${extra.map(([k, i, l]) => `<a class="${view === k ? 'on' : ''}" onclick="go('${k}')"><span class="i">${i}</span>${l}</a>`).join('')}
    <a onclick="logout()"><span class="i">🚪</span>Sair</a></div>`;
}

function go(v) {
  view = v;
  const r = { dashboard: vDashboard, agenda: vAgenda, vendas: vVendas, financeiro: vFinanceiro, estoque: vEstoque, compras: vCompras, clientes: vClientes, servicos: vServicos, config: vConfig, agendar: vAgendar, meus: vMeus, perfil: vPerfil }[v];
  if (me.role !== 'admin' && !['agendar', 'meus', 'perfil'].includes(v)) return go('agendar');
  r(); window.scrollTo(0, 0);
}

/* ---------------- modal ---------------- */
function openModal(title, html, onSubmit) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').classList.remove('hidden');
  const f = $('#modal-body form');
  if (f && onSubmit) f.onsubmit = async e => { e.preventDefault(); if ((await onSubmit(Object.fromEntries(new FormData(f)), f)) !== false) closeModal(); };
  const first = $('#modal-body input, #modal-body select'); if (first) setTimeout(() => first.focus(), 50);
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-body').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
const foot = (txt = 'Salvar') => `<div class="modal-foot"><button type="button" class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn">${txt}</button></div>`;
const opts = (arr, sel, val = x => x.id, lbl = x => x.nome) => arr.map(x => `<option value="${esc(val(x))}" ${val(x) === sel ? 'selected' : ''}>${esc(lbl(x))}</option>`).join('');

/* ---------------- disponibilidade ---------------- */
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

  const prox = S.agendamentos.filter(a => a.status === 'agendado' && (a.data > hoje || (a.data === hoje)))
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)).slice(0, 6);

  const rank = {};
  concMes.forEach(a => { rank[a.servicoNome] = (rank[a.servicoNome] || 0) + a.valor; });
  const top = Object.entries(rank).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = top[0]?.[1] || 1;

  shell('Dashboard', `<button class="btn" onclick="novoAgendamento()">+ Agendamento</button>`, `
  <div class="grid kpis">
    <div class="card kpi"><div class="l">Faturamento hoje</div><div class="v">${brl(entHoje)}</div><div class="s">${agHoje.length} atendimento(s) na agenda</div></div>
    <div class="card kpi"><div class="l">Entradas no mês</div><div class="v pos">${brl(entMes)}</div><div class="s">${concMes.length} serviços concluídos</div></div>
    <div class="card kpi"><div class="l">Saídas no mês</div><div class="v neg">${brl(saiMes)}</div><div class="s">despesas + compras</div></div>
    <div class="card kpi"><div class="l">Lucro do mês</div><div class="v ${entMes - saiMes >= 0 ? 'pos' : 'neg'}">${brl(entMes - saiMes)}</div><div class="s">entradas − saídas</div></div>
    <div class="card kpi"><div class="l">Ticket médio</div><div class="v">${brl(ticket)}</div><div class="s">por serviço no mês</div></div>
    <div class="card kpi"><div class="l">Clientes novos</div><div class="v">${novosCli}</div><div class="s">${S.users.filter(u => u.role === 'cliente').length} no total</div></div>
  </div>
  <div class="grid two" style="margin-top:12px">
    <div class="card"><h3>Entradas × saídas — últimos 14 dias</h3><canvas id="ch" class="chart"></canvas>
      <div class="small mut" style="display:flex;gap:14px;margin-top:6px"><span><b style="color:var(--ac)">■</b> Entradas</span><span><b style="color:var(--mut)">■</b> Saídas</span></div></div>
    <div class="card"><h3>Próximos atendimentos</h3>
      ${prox.length ? `<div class="list">${prox.map(a => `<div class="item"><div class="hour">${a.hora}</div><div class="grow"><div class="t">${esc(a.clienteNome)}</div><div class="d">${esc(a.servicoNome)} · ${a.data === hoje ? 'hoje' : fmtData(a.data)}</div></div></div>`).join('')}</div>` : '<div class="empty">Nenhum horário marcado.</div>'}
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
  const lista = S.agendamentos.filter(a => a.data === d && (!ui.agendaProf || a.profId === ui.agendaProf)).sort((a, b) => a.hora.localeCompare(b.hora));
  const prev = lista.filter(a => a.status !== 'cancelado').reduce((s, a) => s + a.valor, 0);
  shell('Agenda', `<button class="btn" onclick="novoAgendamento()">+ Agendamento</button>`, `
  <div class="filters">
    <button class="btn ghost sm" onclick="ui.agendaData=addDays(ui.agendaData,-1);vAgenda()">◀</button>
    <input type="date" value="${d}" onchange="ui.agendaData=this.value;vAgenda()">
    <button class="btn ghost sm" onclick="ui.agendaData=addDays(ui.agendaData,1);vAgenda()">▶</button>
    <button class="btn ghost sm" onclick="ui.agendaData=today();vAgenda()">Hoje</button>
    ${S.profissionais.length > 1 ? `<select onchange="ui.agendaProf=this.value;vAgenda()"><option value="">Todos profissionais</option>${opts(profsAtivos(), ui.agendaProf)}</select>` : ''}
  </div>
  <div class="card">
    <div class="small mut" style="margin-bottom:6px">${DIAS[new Date(d + 'T12:00').getDay()]}, ${fmtData(d)} · ${lista.filter(a => a.status !== 'cancelado').length} agendamento(s) · previsto ${brl(prev)}</div>
    ${lista.length ? `<div class="list">${lista.map(a => `
      <div class="item">
        <div class="hour">${a.hora}</div>
        <div class="grow"><div class="t">${esc(a.clienteNome)}</div>
          <div class="d">${esc(a.servicoNome)} · ${brl(a.valor)} · ${a.duracao}min${S.profissionais.length > 1 ? ' · ' + esc(byId('profissionais', a.profId)?.nome || '') : ''}${a.tel ? ' · ' + esc(a.tel) : ''}${a.pagamento ? ' · ' + a.pagamento : ''}</div></div>
        <span class="pill ${a.status}">${a.status}</span>
        ${a.status === 'agendado' ? `<div class="acts"><button class="btn ok sm" onclick="concluir('${a.id}')">Concluir</button><button class="btn ghost sm" onclick="novoAgendamento('${a.id}')">Editar</button><button class="btn ghost sm" onclick="cancelarAg('${a.id}')">✕</button></div>` : ''}
        ${a.tel ? `<a class="icon-btn" title="WhatsApp" target="_blank" rel="noopener" href="https://wa.me/55${a.tel.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${a.clienteNome}! Confirmando seu horário em ${S.config.negocio}: ${fmtData(a.data)} às ${a.hora} (${a.servicoNome}).`)}">💬</a>` : ''}
      </div>`).join('')}</div>` : '<div class="empty">Agenda livre neste dia.</div>'}
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
    <label>Profissional</label><select name="profId" id="mPr">${opts(profsAtivos(), a?.profId)}</select>
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
    if (a) Object.assign(a, dados); else S.agendamentos.push({ id: uid(), status: 'agendado', criadoPor: 'admin', ...dados });
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
    save(); toast('Atendimento concluído'); go(view);
  });
}
function cancelarAg(id) {
  if (!confirm('Cancelar este agendamento?')) return;
  byId('agendamentos', id).status = 'cancelado'; save(); go(view);
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
  save(); go(view);
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
  <div class="filters"><input placeholder="Buscar produto…" value="${esc(ui.busca)}" oninput="ui.busca=this.value;clearTimeout(window._b);window._b=setTimeout(()=>{vEstoque();const i=document.querySelector('.filters input');i.focus();i.setSelectionRange(99,99)},250)"></div>
  <div class="card">${lista.length ? `<div class="tbl-wrap"><table><tr><th>Produto</th><th>Qtd</th><th>Mín.</th><th>Custo</th><th>Venda</th><th></th></tr>
  ${lista.map(p => `<tr><td><b>${esc(p.nome)}</b>${p.preco ? '' : ' <span class="pill">uso interno</span>'}</td><td>${p.qtd <= p.min ? `<span class="pill baixo">${p.qtd}</span>` : p.qtd}</td><td>${p.min}</td><td>${brl(p.custo)}</td><td>${p.preco ? brl(p.preco) : '—'}</td>
  <td class="acts"><button class="btn ghost sm" onclick="ajusteEstoque('${p.id}')">±</button><button class="icon-btn" onclick="formProduto('${p.id}')">✏️</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Nenhum produto.</div>'}</div>`);
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
  <div class="filters"><input placeholder="Buscar por nome ou telefone…" value="${esc(ui.busca)}" oninput="ui.busca=this.value;clearTimeout(window._b);window._b=setTimeout(()=>{vClientes();const i=document.querySelector('.filters input');i.focus();i.setSelectionRange(99,99)},250)"></div>
  <div class="card">${cli.length ? `<div class="list">${cli.map(c => { const s = stats(c.id); return `
    <div class="item"><div class="grow"><div class="t">${esc(c.nome)}</div><div class="d">${esc(c.tel || '')} · ${s.n} visita(s) · ${brl(s.tot)}${s.ult ? ' · última ' + fmtData(s.ult) : ''}${c.senha ? '' : ' · sem acesso ao app'}</div></div>
    ${c.tel ? `<a class="icon-btn" target="_blank" rel="noopener" href="https://wa.me/55${c.tel.replace(/\D/g, '')}">💬</a>` : ''}
    <button class="icon-btn" onclick="formCliente('${c.id}')">✏️</button></div>`; }).join('')}</div>` : '<div class="empty">Nenhum cliente ainda. Clientes também podem se cadastrar sozinhos pela tela de login.</div>'}</div>`);
}
function formCliente(id) {
  const c = id ? byId('users', id) : null;
  openModal(c ? 'Editar cliente' : 'Novo cliente', `
  <form>
    <label>Nome</label><input name="nome" required value="${esc(c?.nome || '')}">
    <label>Telefone / WhatsApp</label><input name="tel" required inputmode="tel" value="${esc(c?.tel || '')}">
    <label>Senha de acesso ao app <span class="mut">(opcional${c?.senha ? ', deixe vazio para manter' : ''})</span></label><input name="senha" type="password" minlength="4" autocomplete="new-password">
    <label>Anotações</label><textarea name="obs" rows="2">${esc(c?.obs || '')}</textarea>
    <div class="err" id="mErr"></div>
    ${foot()}
  </form>`, async f => {
    const tel = f.tel.replace(/\D/g, '');
    if (S.users.some(u => u.login === tel && u.id !== id)) { $('#mErr').textContent = 'Já existe cliente com esse telefone.'; return false; }
    const d = { nome: f.nome.trim(), tel: f.tel.trim(), login: tel, obs: f.obs };
    if (f.senha) d.senha = await hash(f.senha);
    if (c) Object.assign(c, d); else S.users.push({ id: uid(), role: 'cliente', criado: today(), senha: '', ...d });
    save(); vClientes();
  });
}

/* ----- serviços ----- */
function vServicos() {
  shell('Serviços', `<button class="btn" onclick="formServico()">+ Serviço</button>`, `
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
  shell('Ajustes', '', `
  <div class="grid two">
    <div class="card"><h3>Estabelecimento</h3>
      <form id="fc">
        <label>Nome</label><input name="negocio" value="${esc(c.negocio)}" required>
        <label>Nicho</label><select name="nicho">${Object.entries(NICHOS).map(([k, n]) => `<option value="${k}" ${k === c.nicho ? 'selected' : ''}>${n.icon} ${n.label}</option>`).join('')}</select>
        <div class="row"><div><label>Abre às</label><input type="time" name="abre" value="${c.abre}"></div><div><label>Fecha às</label><input type="time" name="fecha" value="${c.fecha}"></div></div>
        <label>Intervalo entre horários (min)</label><select name="intervalo">${[10, 15, 20, 30, 45, 60].map(m => `<option ${m == c.intervalo ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <label>Dias de atendimento</label>
        <div class="chips">${DIAS.map((d, i) => `<label class="chip ${c.dias.includes(i) ? 'on' : ''}" style="margin:0"><input type="checkbox" name="d${i}" ${c.dias.includes(i) ? 'checked' : ''} class="hidden" onchange="this.parentNode.classList.toggle('on',this.checked)"><b>${d}</b></label>`).join('')}</div>
        <button class="btn block">Salvar ajustes</button>
      </form>
    </div>
    <div>
      <div class="card"><h3>Profissionais</h3>
        <div class="list">${S.profissionais.map(p => `<div class="item"><div class="grow"><div class="t">${esc(p.nome)}</div></div>${p.ativo === false ? '<span class="pill">inativo</span>' : ''}
          <button class="btn ghost sm" onclick="byId('profissionais','${p.id}').ativo=${p.ativo === false};save();vConfig()">${p.ativo === false ? 'Ativar' : 'Desativar'}</button></div>`).join('')}</div>
        <button class="btn ghost sm" style="margin-top:10px" onclick="formProf()">+ Profissional</button>
      </div>
      <div class="card" style="margin-top:12px"><h3>Acesso do administrador</h3>
        <button class="btn ghost sm" onclick="formSenhaAdmin()">Trocar minha senha</button>
      </div>
      <div class="card" style="margin-top:12px"><h3>Backup</h3>
        <p class="mut small">Os dados ficam salvos neste aparelho. Faça backup com frequência.</p>
        <div class="acts" style="margin-top:10px">
          <button class="btn ghost sm" onclick="baixar('agendapro-backup-'+today()+'.json',JSON.stringify(S),'application/json')">Baixar backup</button>
          <label class="btn ghost sm" style="margin:0;color:var(--tx)">Restaurar<input type="file" accept=".json" class="hidden" onchange="restaurar(this.files[0])"></label>
          <button class="btn bad sm" onclick="if(prompt('Isso apaga TODOS os dados. Digite APAGAR para confirmar')==='APAGAR'){localStorage.removeItem(DB_KEY);localStorage.removeItem(SESS_KEY);S=blank();boot()}">Zerar sistema</button>
        </div>
      </div>
    </div>
  </div>`);
  $('#fc').onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const dias = DIAS.map((_, i) => f['d' + i] ? i : -1).filter(i => i >= 0);
    if (!dias.length) return toast('Escolha ao menos um dia');
    const trocou = f.nicho !== c.nicho;
    Object.assign(c, { negocio: f.negocio.trim(), nicho: f.nicho, abre: f.abre, fecha: f.fecha, intervalo: Number(f.intervalo), dias });
    if (trocou && confirm(`Carregar a lista padrão de serviços de ${NICHOS[f.nicho].label}? (os serviços atuais serão substituídos)`)) seedNicho(f.nicho);
    save(); applyTheme(); toast('Ajustes salvos'); vConfig();
  };
}
function formProf() {
  openModal('Novo profissional', `<form><label>Nome</label><input name="nome" required>${foot()}</form>`,
    f => { S.profissionais.push({ id: uid(), nome: f.nome.trim(), ativo: true }); save(); vConfig(); });
}
function formSenhaAdmin() {
  openModal('Trocar senha', `<form><label>Usuário</label><input name="login" value="${esc(me.login)}" required autocapitalize="none">
    <label>Senha atual</label><input type="password" name="a" required><label>Nova senha</label><input type="password" name="n" minlength="4" required>
    <div class="err" id="mErr"></div>${foot()}</form>`, async f => {
    if (await hash(f.a) !== me.senha) { $('#mErr').textContent = 'Senha atual incorreta.'; return false; }
    me.login = f.login.trim().toLowerCase(); me.senha = await hash(f.n); save(); toast('Senha alterada');
  });
}
function restaurar(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.config || !Array.isArray(d.users)) throw 0;
      if (!confirm('Substituir os dados atuais pelo backup?')) return;
      S = Object.assign(blank(), d); save(); toast('Backup restaurado'); boot();
    } catch { alert('Arquivo de backup inválido.'); }
  };
  r.readAsText(file);
}

/* ================= CLIENTE ================= */
function vAgendar() {
  const b = ui.book;
  const profs = profsAtivos();
  if (!b.profId || !profs.some(p => p.id === b.profId)) b.profId = profs[0]?.id;
  const sv = b.servicoId ? byId('servicos', b.servicoId) : null;
  const dias = [...Array(21)].map((_, i) => addDays(today(), i)).filter(d => S.config.dias.includes(new Date(d + 'T12:00').getDay()));
  if (!b.data || !dias.includes(b.data)) b.data = dias[0];
  const livres = sv && b.data ? slotsLivres(b.data, b.profId, sv.duracao) : [];
  if (b.hora && !livres.includes(b.hora)) b.hora = '';
  shell(`Olá, ${esc(me.nome.split(' ')[0])}!`, '', `
  <p class="mut">Escolha o serviço, o dia e o horário.</p>
  <div class="step"><span class="n">1</span>Serviço</div>
  <div class="svc-grid">${servAtivos().map(s => `<button class="svc ${s.id === b.servicoId ? 'on' : ''}" onclick="ui.book.servicoId='${s.id}';ui.book.hora='';vAgendar()"><b>${esc(s.nome)}</b><span class="mut small">${s.duracao} min</span><div class="p">${brl(s.preco)}</div></button>`).join('')}</div>
  ${profs.length > 1 ? `<div class="step"><span class="n">2</span>Profissional</div>
  <div class="chips">${profs.map(p => `<button class="chip ${p.id === b.profId ? 'on' : ''}" onclick="ui.book.profId='${p.id}';ui.book.hora='';vAgendar()"><b style="font-size:.9rem">${esc(p.nome)}</b></button>`).join('')}</div>` : ''}
  <div class="step"><span class="n">${profs.length > 1 ? 3 : 2}</span>Dia</div>
  <div class="chips">${dias.map(d => { const dt = new Date(d + 'T12:00'); return `<button class="chip ${d === b.data ? 'on' : ''}" onclick="ui.book.data='${d}';ui.book.hora='';vAgendar()"><small>${d === today() ? 'Hoje' : DIAS[dt.getDay()]}</small><b>${dt.getDate()}</b><small>${dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></button>`; }).join('')}</div>
  <div class="step"><span class="n">${profs.length > 1 ? 4 : 3}</span>Horário</div>
  ${!sv ? '<p class="mut">Escolha um serviço para ver os horários.</p>' : livres.length ? `<div class="slots">${livres.map(h => `<button class="slot ${h === b.hora ? 'on' : ''}" onclick="ui.book.hora='${h}';vAgendar()">${h}</button>`).join('')}</div>` : '<p class="mut">Sem horários livres neste dia. Tente outro.</p>'}
  ${sv && b.hora ? `<div class="card summary"><div class="item" style="padding:0"><div class="grow"><div class="t">${esc(sv.nome)} · ${brl(sv.preco)}</div><div class="d">${fmtData(b.data)} às ${b.hora}</div></div><button class="btn" onclick="confirmarCliente()">Confirmar</button></div></div>` : ''}`);
}
function confirmarCliente() {
  const b = ui.book, sv = byId('servicos', b.servicoId);
  if (!slotsLivres(b.data, b.profId, sv.duracao).includes(b.hora)) { toast('Esse horário acabou de ser ocupado'); return vAgendar(); }
  S.agendamentos.push({ id: uid(), status: 'agendado', criadoPor: 'cliente', clienteId: me.id, clienteNome: me.nome, tel: me.tel, servicoId: sv.id, servicoNome: sv.nome, valor: sv.preco, duracao: sv.duracao, profId: b.profId, data: b.data, hora: b.hora });
  save(); ui.book = {}; toast('Horário agendado! ✨'); go('meus');
}
function vMeus() {
  const meus = S.agendamentos.filter(a => a.clienteId === me.id).sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));
  const futuros = meus.filter(a => a.status === 'agendado' && a.data >= today()).reverse();
  const hist = meus.filter(a => !futuros.includes(a));
  const linha = a => `<div class="item"><div class="hour">${a.hora}</div><div class="grow"><div class="t">${esc(a.servicoNome)}</div><div class="d">${fmtData(a.data)} · ${brl(a.valor)}</div></div><span class="pill ${a.status}">${a.status}</span>
    ${a.status === 'agendado' && a.data >= today() ? `<button class="btn ghost sm" onclick="cancelarCli('${a.id}')">Cancelar</button>` : ''}</div>`;
  shell('Meus horários', `<button class="btn" onclick="go('agendar')">+ Agendar</button>`, `
  <div class="card"><h3>Próximos</h3>${futuros.length ? `<div class="list">${futuros.map(linha).join('')}</div>` : '<div class="empty">Nenhum horário marcado.</div>'}</div>
  ${hist.length ? `<div class="card" style="margin-top:12px"><h3>Histórico</h3><div class="list">${hist.map(linha).join('')}</div></div>` : ''}`);
}
function cancelarCli(id) { if (confirm('Cancelar este horário?')) { byId('agendamentos', id).status = 'cancelado'; save(); vMeus(); } }
function vPerfil() {
  shell('Perfil', '', `
  <div class="card" style="max-width:480px">
    <form id="fp"><label>Nome</label><input name="nome" value="${esc(me.nome)}" required>
      <label>Telefone</label><input value="${esc(me.tel)}" disabled>
      <label>Nova senha <span class="mut">(opcional)</span></label><input type="password" name="s" minlength="4" autocomplete="new-password">
      <button class="btn block">Salvar</button></form>
    <button class="btn ghost block" onclick="logout()">Sair</button>
  </div>`);
  $('#fp').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    me.nome = f.nome.trim(); if (f.s) me.senha = await hash(f.s); save(); toast('Perfil atualizado');
  };
}

window.addEventListener('resize', () => { if (view === 'dashboard') drawChart(); });
boot();
