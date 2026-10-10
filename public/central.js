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
  if (e.trial) return 'teste';
  if (e.vence && diasAte(e.vence) <= 5) return 'avencer';
  return 'ativa';
}
const STATUS_TXT = { ativa: 'Ativa', teste: 'Teste grátis', avencer: 'A vencer', vencida: 'Vencida', bloqueada: 'Bloqueada' };

function render() {
  const E = DADOS.empresas;
  const ativas = E.filter(e => e.situacao === 'ativa');
  const receita = ativas.reduce((s, e) => s + e.valor, 0);
  const cont = k => E.filter(e => status(e) === k).length;
  const q = ui.busca.toLowerCase();
  const lista = E.filter(e => (ui.filtro === 'todas' || status(e) === ui.filtro || (ui.filtro === 'teste' && e.trial)) && (!q || [e.negocio, e.slug, e.login, e.dono, e.donoTel, e.email].join(' ').toLowerCase().includes(q)));
  const pagantes = ativas.filter(e => !e.trial);
  $('#app').innerHTML = `
  <main class="main" style="max-width:1100px;margin:0 auto">
    <div class="top"><h2>🛡️ Central de Acessos</h2><div class="acts"><button class="btn ghost sino" onclick="abrirNotif()" aria-label="Notificações">🔔${DADOS.naoLidos ? `<i class="badge">${DADOS.naoLidos > 99 ? '99+' : DADOS.naoLidos}</i>` : ''}</button><button class="btn" onclick="formEmpresa()">+ Novo assinante</button><button class="btn ghost" onclick="sair()">Sair</button></div></div>
    <div class="grid kpis">
      <div class="card kpi"><div class="l">Assinantes ativos</div><div class="v pos">${ativas.length}</div><div class="s">de ${E.length} cadastrados</div></div>
      <div class="card kpi"><div class="l">Receita mensal</div><div class="v">${brl(pagantes.reduce((s, e) => s + e.valor, 0))}</div><div class="s">${pagantes.length} pagante(s)</div></div>
      <div class="card kpi"><div class="l">Em teste grátis</div><div class="v" style="color:#b48cff">${E.filter(e => e.trial && e.situacao === 'ativa').length}</div><div class="s">${E.filter(e => e.origem === 'site').length} vieram do site</div></div>
      <div class="card kpi"><div class="l">Vencem em 5 dias</div><div class="v" style="color:var(--warn)">${cont('avencer')}</div><div class="s">hora de cobrar</div></div>
      <div class="card kpi"><div class="l">Vencidos / bloqueados</div><div class="v neg">${cont('vencida') + cont('bloqueada')}</div><div class="s">sem acesso</div></div>
      <div class="card kpi"><div class="l">Agendamentos no mês</div><div class="v">${E.reduce((s, e) => s + e.agMes, 0)}</div><div class="s">${E.reduce((s, e) => s + e.agApp, 0)} feitos pelos clientes</div></div>
    </div>
    ${avisoBanco()}
    ${!DADOS.aparelhosCentral && 'PushManager' in window ? `<div class="card" style="margin-top:12px;border-color:var(--ac);display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b>🔔 Ative as notificações da Central</b><div class="mut small">Receba no celular cada teste grátis novo feito pelo site e os avisos de vencimento.</div></div><button class="btn sm" onclick="ativarPushCentral()">Ativar neste aparelho</button></div>` : ''}
    <div class="filters" style="margin-top:16px">
      <div class="tabs-f">${['todas', 'ativa', 'teste', 'avencer', 'vencida', 'bloqueada'].map(k => `<button class="${ui.filtro === k ? 'on' : ''}" onclick="ui.filtro='${k}';render()">${k === 'todas' ? 'Todas' : STATUS_TXT[k]}</button>`).join('')}</div>
      <input placeholder="Buscar nome, link, usuário, telefone…" value="${esc(ui.busca)}" style="flex:1;min-width:200px" oninput="ui.busca=this.value;clearTimeout(window._b);window._b=setTimeout(()=>{render();const i=document.querySelector('.filters input');i.focus();i.setSelectionRange(99,99)},250)">
    </div>
    <div class="card">${lista.length ? lista.map(e => {
      const n = NICHOS[e.nicho] || {}, st = status(e);
      return `<div class="emp">
        <div class="ic" style="background:${e.temLogo ? 'transparent' : `color-mix(in srgb,${n.cor} 25%,transparent)`}">${e.temLogo ? `<img src="/m/${e.slug}.logo" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:10px">` : n.icon || '✨'}</div>
        <div style="min-width:0">
          <div class="t">${esc(e.negocio)} <span class="pill ${st}">${STATUS_TXT[st]}</span>${e.ajustado ? ` <span class="pill" style="background:color-mix(in srgb,#ffc35a 22%,transparent);color:#ffc35a">✨ Plano ajustado</span>` : ''}${e.pagInformado ? ` <span class="pill" style="background:color-mix(in srgb,#25d366 22%,transparent);color:#4ee38a">💰 informou Pix ${e.pagInformado.plano}</span>` : ''}</div>
          <div class="d">${n.label || ''} · <a href="${linkEmp(e.slug)}" target="_blank" rel="noopener">/${esc(e.slug)}</a> · usuário <b>${esc(e.login)}</b>${e.dono ? ' · ' + esc(e.dono) : ''}${e.donoTel ? ' · ' + esc(e.donoTel) : ''}${e.email && e.email !== e.login ? ' · ' + esc(e.email) : ''}${e.cnpj ? ' · CNPJ ' + esc(e.cnpj) : ''}${e.origem === 'site' ? ' · <span style="color:#b48cff">via site</span>' : ''}<br>
            ${e.vence ? `vence ${fmtData(e.vence)}${e.situacao === 'ativa' ? ` (${diasAte(e.vence)} dias)` : ''}` : 'sem vencimento'} · ${brl(e.valor)}/mês · ${e.clientes} clientes · ${e.funcionarios ? e.funcionarios + ' funcionário(s) · ' : ''}${e.agMes} agend. no mês · ${e.aparelhosPush ? `🔔 ${e.aparelhosPush} aparelho(s)` : '🔕 sem notificação'}${e.obs ? ' · ' + esc(e.obs) : ''}</div>
        </div>
        <div class="acts">
          <button class="btn ok sm" onclick="renovar('${e.slug}')">${e.trial ? 'Ativar plano' : 'Renovar'}</button>
          <button class="btn ghost sm" onclick="ajustarValor('${e.slug}')" title="Ajustar valor da mensalidade">💲 Valor</button>
          <button class="btn ghost sm" onclick="formEmpresa('${e.slug}')">Editar</button>
          <button class="btn ghost sm" onclick="mais('${e.slug}')">⋯</button>
        </div>
      </div>`;
    }).join('') : `<div class="empty">${E.length ? 'Nada encontrado com esse filtro.' : 'Nenhum assinante ainda. Clique em <b>+ Novo assinante</b> para criar o primeiro acesso.'}</div>`}</div>
  </main>`;
}

function avisoBanco() {
  const b = DADOS.banco; if (!b) return '';
  if (b.tipo !== 'postgres') return `<div class="card" style="margin-top:12px;border-color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,var(--card))">
    <b style="color:var(--bad)">⚠️ Banco de dados NÃO conectado.</b><br><span class="small">O servidor está salvando em arquivo temporário: <b>tudo o que você criar some quando o Render reiniciar</b>. No Render → Environment, confira se a variável <code>DATABASE_URL</code> existe (com esse nome exato) e tem a connection string do Neon. Depois faça um novo deploy.</span></div>`;
  if (b.pendentes) return `<div class="card" style="margin-top:12px;border-color:var(--warn)"><b style="color:var(--warn)">⏳ ${b.pendentes} alteração(ões) aguardando gravação no banco.</b> <span class="mut small">O banco não respondeu (${esc(b.ultimoErro || 'sem detalhes')}). O servidor tenta de novo sozinho; nada foi perdido. <a href="#" onclick="carregar();return false" style="color:var(--ac)">Atualizar</a></span></div>`;
  return `<div class="mut small" style="margin-top:10px">🟢 Banco de dados conectado (PostgreSQL)${b.ultimaGravacao ? ' · última gravação ' + new Date(b.ultimaGravacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</div>`;
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
      <div><label>Usuário (login)</label><input name="login" required autocapitalize="none" value="${esc(e?.login || '')}" pattern="[a-z0-9._@+\\-]{3,80}" title="minúsculas, números, ponto, hífen" id="fLogin"></div>
      ${e ? '<div></div>' : `<div><label>Senha</label><div class="pwd"><input name="senha" required minlength="4" id="fSenha" value="${gerarSenha()}"><button type="button" class="btn ghost sm" onclick="$('#fSenha').value=gerarSenha()">🎲</button></div></div>`}
    </div>
    <div class="row">
      <div><label>Vencimento <span class="mut">(vazio = sem vencimento)</span></label><input type="date" name="vence" id="fVence" value="${venc}">
        <div class="tabs-f" style="margin-top:6px"><button type="button" onclick="$('#fVence').value=addDias(DADOS.hoje,3);$('#fTrial').checked=true">Teste 3 dias</button><button type="button" onclick="$('#fVence').value=addDias(DADOS.hoje,30);$('#fTrial').checked=false">30 dias</button><button type="button" onclick="$('#fVence').value=addDias(DADOS.hoje,365);$('#fTrial').checked=false">1 ano</button></div></div>
      <div><label>Valor mensal (R$) <span class="mut">(diferente de 39,90 = plano ajustado)</span></label><input name="valor" inputmode="decimal" value="${e ? String(Number(e.valor).toFixed(2)).replace('.', ',') : '39,90'}" placeholder="Ex.: 39,90"></div>
    </div>
    <label>E-mail <span class="mut">(opcional)</span></label><input name="email" type="email" value="${esc(e?.email || '')}">
    <label>Observação</label><input name="obs" value="${esc(e?.obs || '')}" placeholder="Ex.: pago via Pix, plano anual…">
    <label style="margin-top:12px"><input type="checkbox" name="trial" id="fTrial" ${e?.trial ? 'checked' : ''} style="width:auto;margin-right:6px">É um teste grátis (o assinante vê os dias restantes e o botão "Assinar")</label>
    ${foot(e ? 'Salvar' : 'Criar acesso')}
  </form>`, async f => {
    const dados = { negocio: f.negocio, nicho: f.nicho, dono: f.dono, donoTel: f.donoTel, login: f.login.trim().toLowerCase(), vence: f.vence, valor: num(f.valor), obs: f.obs, email: f.email, trial: !!f.trial };
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
    ${e.ajustado ? `<p class="small" style="margin:4px 0 8px;color:#ffc35a">✨ Plano ajustado: <b>${brl(e.valor)}/mês</b></p>` : ''}
    <select name="dias">${[[30, e.ajustado ? `30 dias (plano ajustado · ${brl(e.valor)})` : '30 dias (mensal · R$ 39,90)'], [90, `90 dias (trimestral${e.ajustado ? ' · ' + brl(e.valor * 3) : ''})`], [180, `180 dias (semestral${e.ajustado ? ' · ' + brl(e.valor * 6) : ''})`], [365, e.ajustado ? `365 dias (anual · ${brl(e.valor * 12)})` : '365 dias (anual · R$ 399,90)']].map(([d, t]) => `<option value="${d}" ${e.pagInformado?.plano === 'anual' ? (d === 365 ? 'selected' : '') : (d === 30 ? 'selected' : '')}>${t}</option>`).join('')}</select>
    ${e.pagInformado ? `<p class="small" style="margin-top:8px;color:#4ee38a">💰 Informou pagamento do plano ${e.pagInformado.plano} em ${new Date(e.pagInformado.em).toLocaleString('pt-BR')}. Confira o comprovante no WhatsApp antes de liberar.</p>` : ''}
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
      <div class="item"><div class="grow"><div class="t">Valor da mensalidade</div><div class="d">${e.ajustado ? `✨ Plano ajustado: ${brl(e.valor)}/mês` : `Padrão: ${brl(e.valor)}/mês`}</div></div><button class="btn ghost sm" onclick="ajustarValor('${slug}')">💲 Ajustar</button></div>
      <div class="item"><div class="grow"><div class="t">Redefinir senha</div><div class="d">Gera nova senha e desconecta o dono dos aparelhos</div></div><button class="btn ghost sm" onclick="novaSenha('${slug}')">Redefinir</button></div>
      ${e.vence && tel ? `<div class="item"><div class="grow"><div class="t">Cobrar no WhatsApp</div><div class="d">Mensagem pronta com vencimento e valor</div></div><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(cobranca)}">💬 Cobrar</a></div>` : ''}
      <div class="item"><div class="grow"><div class="t">${e.bloqueado ? 'Desbloquear acesso' : 'Bloquear acesso'}</div><div class="d">${e.bloqueado ? 'Libera o painel e a agenda dos clientes' : 'Suspende o painel e a agenda online (dados ficam guardados)'}</div></div><button class="btn ${e.bloqueado ? 'ok' : 'bad'} sm" onclick="bloquear('${slug}',${!e.bloqueado})">${e.bloqueado ? 'Desbloquear' : 'Bloquear'}</button></div>
      <div class="item"><div class="grow"><div class="t">Baixar backup</div><div class="d">Todos os dados deste assinante (.json)</div></div><button class="btn ghost sm" onclick="backup('${slug}')">Baixar</button></div>
      <div class="item"><div class="grow"><div class="t" style="color:var(--bad)">Excluir assinante</div><div class="d">Apaga tudo de forma permanente</div></div><button class="btn bad sm" onclick="excluir('${slug}')">Excluir</button></div>
    </div>`);
}
// Valor especial (desconto) para um assinante: vira "Plano ajustado" no app dele.
const VALOR_PADRAO = 39.9;
function ajustarValor(slug) {
  const e = DADOS.empresas.find(x => x.slug === slug);
  openModal('💲 Valor da mensalidade', `<form>
    <p class="mut">${esc(e.negocio)} · hoje: <b>${brl(e.valor)}/mês</b>${e.ajustado ? ' (plano ajustado)' : ' (padrão)'}</p>
    <label>Novo valor mensal (R$)</label>
    <input name="valor" id="fValor" inputmode="decimal" required value="${String(e.valor.toFixed(2)).replace('.', ',')}" placeholder="Ex.: 39,90">
    <div class="tabs-f" style="margin-top:8px">${[19.9, 24.9, 29.9, 34.9].map(v => `<button type="button" onclick="$('#fValor').value='${v.toFixed(2).replace('.', ',')}';prevAjuste()">${brl(v)}</button>`).join('')}<button type="button" onclick="$('#fValor').value='39,90';prevAjuste()">Padrão</button></div>
    <p class="small" id="fPrev" style="margin-top:10px"></p>
    <p class="mut small" style="margin-top:6px">Na hora em que salvar, o assinante vê o novo valor em <b>Ajustes → Assinatura</b> e na tela de pagamento (com o Pix já no valor certo) e recebe uma notificação. Vale também para as próximas renovações.</p>
    <div class="err" id="mErr"></div>
    ${foot('Salvar valor')}</form>`, async f => {
    const v = num(f.valor);
    if (!(v > 0) || v > 9999) { $('#mErr').textContent = 'Informe um valor maior que zero.'; return false; }
    await api('PUT', '/api/central/empresas/' + slug, { valor: v });
    toast(Math.abs(v - VALOR_PADRAO) > 0.004 ? `✨ Plano ajustado: ${brl(v)}/mês` : 'Valor padrão restaurado'); carregar();
  });
  window.prevAjuste = () => {
    const v = num($('#fValor').value), el = $('#fPrev'); if (!el) return;
    if (!(v > 0)) { el.textContent = ''; return; }
    const d = Math.round((1 - v / VALOR_PADRAO) * 100);
    el.innerHTML = Math.abs(v - VALOR_PADRAO) < 0.005 ? 'Plano mensal padrão.' : `✨ Vai aparecer como <b>Plano ajustado</b>: ${brl(v)}/mês${d > 0 ? ` (${d}% de desconto)` : ''}.`;
  };
  $('#fValor').addEventListener('input', prevAjuste); prevAjuste();
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

/* ---------- notificações da Central ---------- */
const ICON_EV = { teste: '🎉', vence: '⏳', venceu: '⛔', pago: '💰' };
function quando(iso) {
  const d = new Date(iso), min = Math.round((Date.now() - d) / 60000);
  if (min < 1) return 'agora'; if (min < 60) return `há ${min} min`; if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function statusPushCentral() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return /iPhone|iPad/.test(navigator.userAgent) ? '⚠️ No iPhone, adicione esta página à Tela de Início e abra por lá para receber notificações.' : '⚠️ Este navegador não suporta notificações. Use o Chrome.';
  if (Notification.permission === 'denied') return '🚫 Bloqueadas neste navegador. Toque no cadeado ao lado do endereço → Notificações → Permitir.';
  if (Notification.permission === 'granted') return `✅ Ativadas neste aparelho · ${DADOS.aparelhosCentral || 0} aparelho(s) recebendo.`;
  return '🔕 Ainda não ativadas neste aparelho.';
}
async function abrirNotif() {
  const ev = DADOS.eventos || [];
  openModal('🔔 Notificações', `
    <p class="small">${statusPushCentral()}</p>
    <div class="acts" style="margin-top:8px">${'PushManager' in window ? `<button class="btn sm" onclick="ativarPushCentral()">${window.Notification?.permission === 'granted' ? 'Reativar neste aparelho' : 'Ativar neste aparelho'}</button><button class="btn ghost sm" onclick="testarPushCentral()">Enviar teste</button>` : ''}</div>
    <p class="mut small" style="margin-top:8px">Você é avisado quando alguém cria um teste grátis pelo site, quando alguém informa que pagou o Pix, quando um assinante vence amanhã e quando vence.</p>
    <div class="list" style="margin-top:12px">${ev.length ? ev.map(x => `<div class="item"><div style="font-size:1.3rem">${ICON_EV[x.tipo] || '•'}</div><div class="grow"><div class="t" style="font-weight:${x.em > (DADOS.lidosAte || '') ? 800 : 600}">${esc(x.titulo.replace(/^\S+\s/, ''))}</div><div class="d">${esc(x.texto)}<br>${quando(x.em)}${x.slug && DADOS.empresas.some(e => e.slug === x.slug) ? ` · <a href="#" style="color:var(--ac)" onclick="closeModal();ui.busca='${esc(x.slug)}';ui.filtro='todas';render();return false">ver assinante</a>` : ''}</div></div></div>`).join('') : '<div class="empty">Nenhuma notificação ainda.</div>'}</div>`);
  if (DADOS.naoLidos) { try { await api('POST', '/api/central/eventos/lidos'); DADOS.naoLidos = 0; render(); } catch { } }
}
function b64ToU8(b64) { const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); }
async function ativarPushCentral() {
  try {
    if (Notification.permission === 'denied') return alert('As notificações estão bloqueadas neste navegador. Toque no cadeado ao lado do endereço → Notificações → Permitir.');
    if (await Notification.requestPermission() !== 'granted') return toast('Permissão não concedida');
    const reg = await navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
    let sub = await reg.pushManager.getSubscription();
    const chave = b64ToU8(DADOS.vapidPublic);
    if (sub && sub.options?.applicationServerKey && new Uint8Array(sub.options.applicationServerKey).join() !== chave.join()) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
    const ua = navigator.userAgent, aparelho = (/Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : 'Outro') + ' · Central';
    const r = await api('POST', '/api/central/push/subscribe', { sub: sub.toJSON(), aparelho });
    DADOS.aparelhosCentral = r.aparelhos; toast('🔔 Notificações ativadas'); closeModal(); render(); testarPushCentral();
  } catch (e) { alert('Não foi possível ativar: ' + e.message); }
}
async function testarPushCentral() {
  try { const r = await api('POST', '/api/central/push/teste'); const ok = r.resultados.filter(x => x.ok).length; toast(ok ? `Teste enviado para ${ok} aparelho(s)` : 'Nenhum aparelho ativado ainda'); }
  catch (e) { toast(e.message); }
}
setInterval(() => { if (TOKEN && $('#modal').classList.contains('hidden') && !document.hidden) carregar(); }, 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });

TOKEN ? carregar() : renderLogin();
