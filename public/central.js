/* Central de Acessos — onde o dono do AgendaPro cria e gerencia os assinantes. */
const TOK = 'agendapro_central';
let TOKEN = localStorage.getItem(TOK) || '';
let DADOS = { empresas: [], hoje: '', suporte: '' };
const ui = { filtro: 'todas', busca: '' };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = s => s ? s.split('-').reverse().join('/') : '';
const num = v => parseFloat(String(v).replace(',', '.')) || 0;
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDias = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
const diasAte = s => Math.round((new Date(s + 'T12:00') - new Date(DADOS.hoje + 'T12:00')) / 864e5);
const linkEmp = slug => location.origin + '/' + slug;
const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const zap = tel => { const d = String(tel || '').replace(/\D/g, ''); return d ? (d.length <= 11 ? '55' + d : d) : ''; };

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
async function api(method, url, body) {
  let r;
  try { r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Sem conexão com o servidor.'); }
  let j = null; try { j = await r.json(); } catch { }
  if (r.status === 401 && TOKEN && !url.endsWith('/login')) { TOKEN = ''; localStorage.removeItem(TOK); renderLogin(); throw new Error('Sessão expirada.'); }
  if (!r.ok) throw new Error(j?.erro || 'Erro no servidor.');
  return j;
}

/* ---------- modal ---------- */
function openModal(title, html, onSubmit) {
  $('#modal-title').textContent = title; $('#modal-body').innerHTML = html; $('#modal').classList.remove('hidden');
  const f = $('#modal-body form');
  if (f && onSubmit) f.onsubmit = async e => {
    e.preventDefault();
    const btn = f.querySelector('.modal-foot .btn:last-child'); if (btn) btn.disabled = true;
    try { if ((await onSubmit(Object.fromEntries(new FormData(f)), f)) !== false) closeModal(); }
    catch (err) { const m = $('#mErr'); m ? m.textContent = err.message : toast(err.message); }
    if (btn) btn.disabled = false;
  };
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-body').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
const foot = (txt = 'Salvar') => `<div class="err" id="mErr"></div><div class="modal-foot"><button type="button" class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn">${txt}</button></div>`;
const nichoOpts = sel => Object.entries(NICHOS).map(([k, n]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${n.icon} ${n.label}</option>`).join('');

/* ---------- login ---------- */
function renderLogin() {
  $('#app').innerHTML = `
  <div class="auth"><div class="auth-card">
    <div class="brand"><div class="logo">🛡️</div><div><h1>Central</h1><div class="mut small">Gestão de assinantes AgendaPro</div></div></div>
    <form id="f" style="margin-top:18px">
      <label>Usuário</label><input name="login" required autocomplete="username" autocapitalize="none">
      <label>Senha</label><input name="senha" type="password" required autocomplete="current-password">
      <div class="err" id="err"></div>
      <button class="btn block">Entrar</button>
    </form>
  </div></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('POST', '/api/central/login', Object.fromEntries(new FormData(e.target))); TOKEN = r.token; localStorage.setItem(TOK, TOKEN); carregar(); }
    catch (err) { $('#err').textContent = err.message; }
  };
}
async function sair() { try { await api('POST', '/api/central/logout'); } catch { } TOKEN = ''; localStorage.removeItem(TOK); renderLogin(); }

/* ---------- painel ---------- */
async function carregar() {
  try { DADOS = await api('GET', '/api/central/empresas'); render(); }
  catch (e) { if (TOKEN) $('#app').innerHTML = `<div class="empty">${esc(e.message)} <button class="btn sm" onclick="carregar()">Tentar de novo</button></div>`; }
}
function status(e) {
  if (e.situacao !== 'ativa') return e.situacao;
  if (e.vence && diasAte(e.vence) <= 5) return 'avencer';
  return 'ativa';
}
const STATUS_TXT = { ativa: 'Ativa', avencer: 'A vencer', vencida: 'Vencida', bloqueada: 'Bloqueada' };

function render() {
  const E = DADOS.empresas;
  const ativas = E.filter(e => e.situacao === 'ativa');
  const receita = ativas.reduce((s, e) => s + e.valor, 0);
  const cont = k => E.filter(e => status(e) === k).length;
  const q = ui.busca.toLowerCase();
  const lista = E.filter(e => (ui.filtro === 'todas' || status(e) === ui.filtro) && (!q || [e.negocio, e.slug, e.login, e.dono, e.donoTel].join(' ').toLowerCase().includes(q)));
  $('#app').innerHTML = `
  <main class="main" style="max-width:1100px;margin:0 auto">
    <div class="top"><h2>🛡️ Central de Acessos</h2><div class="acts"><button class="btn" onclick="formEmpresa()">+ Novo assinante</button><button class="btn ghost" onclick="sair()">Sair</button></div></div>
    <div class="grid kpis">
      <div class="card kpi"><div class="l">Assinantes ativos</div><div class="v pos">${ativas.length}</div><div class="s">de ${E.length} cadastrados</div></div>
      <div class="card kpi"><div class="l">Receita mensal</div><div class="v">${brl(receita)}</div><div class="s">soma dos ativos</div></div>
      <div class="card kpi"><div class="l">Vencem em 5 dias</div><div class="v" style="color:var(--warn)">${cont('avencer')}</div><div class="s">hora de cobrar</div></div>
      <div class="card kpi"><div class="l">Vencidos / bloqueados</div><div class="v neg">${cont('vencida') + cont('bloqueada')}</div><div class="s">sem acesso</div></div>
      <div class="card kpi"><div class="l">Agendamentos no mês</div><div class="v">${E.reduce((s, e) => s + e.agMes, 0)}</div><div class="s">${E.reduce((s, e) => s + e.agApp, 0)} feitos pelos clientes</div></div>
    </div>
    ${!DADOS.suporte ? `<div class="card" style="margin-top:12px;border-color:var(--warn)"><b>Dica:</b> <span class="mut">adicione a variável <code>SUPORTE_WHATSAPP</code> no Render (ex.: 5561999999999) para os assinantes vencidos verem um botão “Falar com o suporte”.</span></div>` : ''}
    <div class="filters" style="margin-top:16px">
      <div class="tabs-f">${['todas', 'ativa', 'avencer', 'vencida', 'bloqueada'].map(k => `<button class="${ui.filtro === k ? 'on' : ''}" onclick="ui.filtro='${k}';render()">${k === 'todas' ? 'Todas' : STATUS_TXT[k]}</button>`).join('')}</div>
      <input placeholder="Buscar nome, link, usuário, telefone…" value="${esc(ui.busca)}" style="flex:1;min-width:200px" oninput="ui.busca=this.value;clearTimeout(window._b);window._b=setTimeout(()=>{render();const i=document.querySelector('.filters input');i.focus();i.setSelectionRange(99,99)},250)">
    </div>
    <div class="card">${lista.length ? lista.map(e => {
      const n = NICHOS[e.nicho] || {}, st = status(e);
      return `<div class="emp">
        <div class="ic" style="background:color-mix(in srgb,${n.cor} 25%,transparent)">${n.icon || '✨'}</div>
        <div style="min-width:0">
          <div class="t">${esc(e.negocio)} <span class="pill ${st}">${STATUS_TXT[st]}</span></div>
          <div class="d">${n.label || ''} · <a href="${linkEmp(e.slug)}" target="_blank" rel="noopener">/${esc(e.slug)}</a> · usuário <b>${esc(e.login)}</b>${e.dono ? ' · ' + esc(e.dono) : ''}${e.donoTel ? ' · ' + esc(e.donoTel) : ''}<br>
            ${e.vence ? `vence ${fmtData(e.vence)}${e.situacao === 'ativa' ? ` (${diasAte(e.vence)} dias)` : ''}` : 'sem vencimento'} · ${brl(e.valor)}/mês · ${e.clientes} clientes · ${e.agMes} agend. no mês${e.obs ? ' · ' + esc(e.obs) : ''}</div>
        </div>
        <div class="acts">
          <button class="btn ok sm" onclick="renovar('${e.slug}')">Renovar</button>
          <button class="btn ghost sm" onclick="formEmpresa('${e.slug}')">Editar</button>
          <button class="btn ghost sm" onclick="mais('${e.slug}')">⋯</button>
        </div>
      </div>`;
    }).join('') : `<div class="empty">${E.length ? 'Nada encontrado com esse filtro.' : 'Nenhum assinante ainda. Clique em <b>+ Novo assinante</b> para criar o primeiro acesso.'}</div>`}</div>
  </main>`;
}

/* ---------- criar / editar ---------- */
function gerarSenha() { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; return [...crypto.getRandomValues(new Uint8Array(8))].map(b => c[b % c.length]).join(''); }

function formEmpresa(slug) {
  const e = slug ? DADOS.empresas.find(x => x.slug === slug) : null;
  const venc = e ? e.vence : addDias(DADOS.hoje, 30);
  openModal(e ? 'Editar assinante' : 'Novo assinante', `
  <form autocomplete="off">
    <label>Nome do negócio</label><input name="negocio" required value="${esc(e?.negocio || '')}" placeholder="Ex.: Barbearia do João" id="fNeg">
    <label>Nicho</label><select name="nicho" id="fNicho">${nichoOpts(e?.nicho || 'barbearia')}</select>
    ${e ? `<label id="lRec" class="hidden"><input type="checkbox" name="recarregar" style="width:auto;margin-right:6px">Trocar também a lista de serviços pela padrão do novo nicho</label>` : ''}
    <label>Link de agendamento</label>
    ${e ? `<input value="${esc(linkEmp(e.slug))}" disabled>` : `<div class="slugbox"><span>${esc(location.host)}/</span><input name="slug" id="fSlug" required pattern="[a-z0-9-]{2,40}" placeholder="barbearia-do-joao"></div>`}
    <div class="row">
      <div><label>Nome do dono</label><input name="dono" value="${esc(e?.dono || '')}"></div>
      <div><label>WhatsApp do dono</label><input name="donoTel" inputmode="tel" value="${esc(e?.donoTel || '')}" placeholder="(61) 99999-9999"></div>
    </div>
    <div class="row">
      <div><label>Usuário (login)</label><input name="login" required autocapitalize="none" value="${esc(e?.login || '')}" pattern="[a-z0-9._@\\-]{3,60}" title="minúsculas, números, ponto, hífen" id="fLogin"></div>
      ${e ? '<div></div>' : `<div><label>Senha</label><div class="pwd"><input name="senha" required minlength="4" id="fSenha" value="${gerarSenha()}"><button type="button" class="btn ghost sm" onclick="$('#fSenha').value=gerarSenha()">🎲</button></div></div>`}
    </div>
    <div class="row">
      <div><label>Vencimento <span class="mut">(vazio = sem vencimento)</span></label><input type="date" name="vence" value="${venc}"></div>
      <div><label>Valor mensal (R$)</label><input name="valor" inputmode="decimal" value="${e ? e.valor : ''}" placeholder="Ex.: 49,90"></div>
    </div>
    <label>Observação</label><input name="obs" value="${esc(e?.obs || '')}" placeholder="Ex.: pago via Pix, plano anual…">
    ${foot(e ? 'Salvar' : 'Criar acesso')}
  </form>`, async f => {
    const dados = { negocio: f.negocio, nicho: f.nicho, dono: f.dono, donoTel: f.donoTel, login: f.login.trim().toLowerCase(), vence: f.vence, valor: num(f.valor), obs: f.obs };
    if (e) {
      await api('PUT', '/api/central/empresas/' + e.slug, { ...dados, recarregarServicos: !!f.recarregar });
      toast('Assinante atualizado'); carregar();
    } else {
      const r = await api('POST', '/api/central/empresas', { ...dados, slug: f.slug, senha: f.senha });
      await carregar();
      boasVindas(r.empresa, f.senha);
      return false;
    }
  });
  if (!e) {
    let editouSlug = false, editouLogin = false;
    $('#fSlug').oninput = () => { editouSlug = true; $('#fSlug').value = slugify($('#fSlug').value).replace(/-$/, ''); };
    $('#fLogin').oninput = () => { editouLogin = true; };
    $('#fNeg').oninput = () => {
      const s = slugify($('#fNeg').value);
      if (!editouSlug) $('#fSlug').value = s;
      if (!editouLogin) $('#fLogin').value = s.replace(/-/g, '').slice(0, 20);
    };
  } else {
    $('#fNicho').onchange = () => $('#lRec').classList.toggle('hidden', $('#fNicho').value === e.nicho);
  }
}

function mensagem(e, senha) {
  return `Olá${e.dono ? ' ' + e.dono.split(' ')[0] : ''}! 🎉 Seu acesso ao *AgendaPro* está pronto.

🏪 ${e.negocio}
🔗 Seu painel e link de agendamento:
${linkEmp(e.slug)}

👤 Usuário: ${e.login}
🔑 Senha: ${senha}
${e.vence ? `📅 Válido até: ${fmtData(e.vence)}\n` : ''}
Envie esse mesmo link para seus clientes agendarem pelo celular. No painel, vá em *Ajustes* → *Ativar notificações* para ser avisado de cada novo agendamento.`;
}
function boasVindas(e, senha) {
  const msg = mensagem(e, senha), tel = zap(e.donoTel);
  openModal('✅ Acesso criado', `
    <p class="mut small">Envie esta mensagem para o comprador. <b>Anote a senha</b>: por segurança ela não fica visível depois.</p>
    <div class="msg" id="msgTxt">${esc(msg)}</div>
    <div class="modal-foot">
      <button class="btn ghost" onclick="copiarTexto($('#msgTxt').textContent)">Copiar</button>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(msg)}">💬 Enviar no WhatsApp</a>
    </div>`);
}
function copiarTexto(t) {
  (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast('Copiado'), () => {
    const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); toast('Copiado');
  });
}

/* ---------- ações ---------- */
function renovar(slug) {
  const e = DADOS.empresas.find(x => x.slug === slug);
  openModal('Renovar assinatura', `
  <form>
    <p class="mut">${esc(e.negocio)} · ${e.vence ? 'vence ' + fmtData(e.vence) : 'sem vencimento'}</p>
    <label>Adicionar</label>
    <select name="dias"><option value="30">30 dias (mensal)</option><option value="90">90 dias (trimestral)</option><option value="180">180 dias (semestral)</option><option value="365">365 dias (anual)</option></select>
    <p class="mut small" style="margin-top:8px">Se ainda estiver em dia, os dias são somados ao vencimento atual. Se estiver vencido ou bloqueado, conta a partir de hoje e o acesso é liberado.</p>
    ${foot('Renovar')}
  </form>`, async f => {
    const r = await api('POST', `/api/central/empresas/${slug}/renovar`, { dias: f.dias });
    toast('Renovado até ' + fmtData(r.empresa.vence)); carregar();
  });
}

function mais(slug) {
  const e = DADOS.empresas.find(x => x.slug === slug), tel = zap(e.donoTel);
  const cobranca = `Olá${e.dono ? ' ' + e.dono.split(' ')[0] : ''}! Sua assinatura do AgendaPro (${e.negocio}) ${e.situacao === 'vencida' ? 'venceu em' : 'vence em'} ${fmtData(e.vence)}. Valor: ${brl(e.valor)}. Me avise quando fizer o pagamento para eu renovar. 😉`;
  openModal(e.negocio, `
    <div class="list">
      <div class="item"><div class="grow"><div class="t">Abrir painel do assinante</div><div class="d">${esc(linkEmp(slug))}</div></div><a class="btn ghost sm" target="_blank" rel="noopener" href="${linkEmp(slug)}">Abrir</a></div>
      <div class="item"><div class="grow"><div class="t">Redefinir senha</div><div class="d">Gera nova senha e desconecta o dono dos aparelhos</div></div><button class="btn ghost sm" onclick="novaSenha('${slug}')">Redefinir</button></div>
      ${e.vence && tel ? `<div class="item"><div class="grow"><div class="t">Cobrar no WhatsApp</div><div class="d">Mensagem pronta com vencimento e valor</div></div><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(cobranca)}">💬 Cobrar</a></div>` : ''}
      <div class="item"><div class="grow"><div class="t">${e.bloqueado ? 'Desbloquear acesso' : 'Bloquear acesso'}</div><div class="d">${e.bloqueado ? 'Libera o painel e a agenda dos clientes' : 'Suspende o painel e a agenda online (dados ficam guardados)'}</div></div><button class="btn ${e.bloqueado ? 'ok' : 'bad'} sm" onclick="bloquear('${slug}',${!e.bloqueado})">${e.bloqueado ? 'Desbloquear' : 'Bloquear'}</button></div>
      <div class="item"><div class="grow"><div class="t">Baixar backup</div><div class="d">Todos os dados deste assinante (.json)</div></div><button class="btn ghost sm" onclick="backup('${slug}')">Baixar</button></div>
      <div class="item"><div class="grow"><div class="t" style="color:var(--bad)">Excluir assinante</div><div class="d">Apaga tudo de forma permanente</div></div><button class="btn bad sm" onclick="excluir('${slug}')">Excluir</button></div>
    </div>`);
}
function novaSenha(slug) {
  const e = DADOS.empresas.find(x => x.slug === slug);
  openModal('Redefinir senha', `<form><p class="mut">${esc(e.negocio)} · usuário <b>${esc(e.login)}</b></p>
    <label>Nova senha</label><div class="pwd"><input name="senha" id="fSenha" required minlength="4" value="${gerarSenha()}"><button type="button" class="btn ghost sm" onclick="$('#fSenha').value=gerarSenha()">🎲</button></div>
    ${foot('Redefinir')}</form>`, async f => {
    await api('POST', `/api/central/empresas/${slug}/senha`, { senha: f.senha });
    const msg = `Olá! Sua senha do AgendaPro foi redefinida.\n\n🔗 ${linkEmp(slug)}\n👤 Usuário: ${e.login}\n🔑 Nova senha: ${f.senha}`;
    openModal('Senha redefinida', `<div class="msg" id="msgTxt">${esc(msg)}</div><div class="modal-foot"><button class="btn ghost" onclick="copiarTexto($('#msgTxt').textContent)">Copiar</button>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/${zap(e.donoTel)}?text=${encodeURIComponent(msg)}">💬 Enviar no WhatsApp</a></div>`);
    return false;
  });
}
async function bloquear(slug, valor) {
  if (valor && !confirm('Bloquear o acesso deste assinante?')) return;
  try { await api('PUT', '/api/central/empresas/' + slug, { bloqueado: valor }); closeModal(); toast(valor ? 'Acesso bloqueado' : 'Acesso liberado'); carregar(); }
  catch (e) { toast(e.message); }
}
async function backup(slug) {
  try {
    const d = await api('GET', `/api/central/empresas/${slug}/backup`);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' }));
    a.download = `backup-${slug}-${DADOS.hoje}.json`; a.click();
  } catch (e) { toast(e.message); }
}
async function excluir(slug) {
  const conf = prompt(`Isso apaga TODOS os dados de /${slug} (agenda, clientes, financeiro). Para confirmar, digite: ${slug}`);
  if (conf === null) return;
  try { await api('DELETE', '/api/central/empresas/' + slug, { confirm: conf.trim() }); closeModal(); toast('Assinante excluído'); carregar(); }
  catch (e) { alert(e.message); }
}

TOKEN ? carregar() : renderLogin();
