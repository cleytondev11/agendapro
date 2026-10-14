/* AgendaPro — Loja online (catálogo público): o cliente escolhe, pede e paga pelo celular. */
(function () {
  const SLUG = decodeURIComponent(location.pathname.split('/').filter(Boolean)[0] || '');
  const API = `/api/t/${encodeURIComponent(SLUG)}`;
  const K_SACOLA = 'loja_sacola_' + SLUG, K_PED = 'loja_pedidos_' + SLUG, K_CLI = 'loja_cliente';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  const WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-1-1.1-1.3-1.7-.1-.2 0-.4.1-.5l.4-.5.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.3.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';

  let L = null, sacola = ler(K_SACOLA, {}), cat = '', busca = '', form = ler(K_CLI, {}), pollT = null;
  const prod = id => L.produtos.find(p => p.id === id);
  const icone = () => (window.NICHOS?.[L.nicho] || {}).icon || '🛍️';
  const itensSacola = () => Object.entries(sacola).map(([id, q]) => ({ p: prod(id), q })).filter(x => x.p && x.q > 0);
  const subtotal = () => itensSacola().reduce((t, x) => t + x.p.preco * x.q, 0);
  const qtdTotal = () => itensSacola().reduce((t, x) => t + x.q, 0);
  function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
  function salvarSacola() { for (const k of Object.keys(sacola)) if (!prod(k) || sacola[k] <= 0) delete sacola[k]; gravar(K_SACOLA, sacola); }
  function mudar(id, d) {
    const p = prod(id); if (!p) return;
    const n = Math.max(0, Math.min(p.disp, (sacola[id] || 0) + d));
    if (d > 0 && n === (sacola[id] || 0)) toast(`Só temos ${p.disp} un. de ${p.nome}`);
    sacola[id] = n; salvarSacola(); pintarGrade(); pintarBarra();
    if ($('#sheet')?.dataset.t === 'sacola') abrirSacola();
  }

  async function iniciar() {
    try {
      const r = await fetch(API + '/loja'); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Loja não encontrada.');
      L = await r.json();
    } catch (e) { $('#app').innerHTML = `<div class="fechada"><div class="e">🔎</div><h2>Loja não encontrada</h2><p>${esc(e.message)}</p></div>`; return; }
    const cor = (window.NICHOS?.[L.nicho] || {}).cor; if (cor) document.documentElement.style.setProperty('--ac', cor);
    salvarSacola();
    pintar();
    const ult = ler(K_PED, [])[0]; if (ult && location.hash === '#pedido') abrirPedido(ult.id, ult.t);
  }
  function pintar() {
    const wa = L.whats ? `<a class="wa" target="_blank" rel="noopener" href="https://wa.me/${L.whats}?text=${encodeURIComponent('Olá! Vi a loja online e tenho uma dúvida.')}">${WA_SVG}<span>WhatsApp</span></a>` : '';
    const cats = [...new Set(L.produtos.map(p => p.cat).filter(Boolean))];
    $('#app').innerHTML = `
      <header class="hero"><div class="wrap"><div class="logo">${L.logo ? `<img src="${esc(L.logo)}" alt="">` : icone()}</div>
        <div><h1>${esc(L.negocio)}</h1><p>Loja online${L.cidade ? ' · ' + esc(L.cidade) : ''}</p></div>${wa}</div>
        ${L.msg ? `<p class="msg">${esc(L.msg)}</p>` : ''}</header>
      ${L.ativo ? `<div class="tools"><label class="busca"><span>🔎</span><input id="q" placeholder="Buscar produto…" value="${esc(busca)}" autocomplete="off"></label>
        ${cats.length ? `<div class="cats"><button data-c="" aria-pressed="${!cat}">Todos</button>${cats.map(c => `<button data-c="${esc(c)}" aria-pressed="${cat === c}">${esc(c)}</button>`).join('')}</div>` : ''}</div>
        <main class="wrap"><div class="grid" id="grade"></div></main>`
      : `<div class="fechada"><div class="e">🌙</div><h2>Loja fechada no momento</h2><p>Os pedidos online estão pausados. ${L.whats ? 'Fale com a gente pelo WhatsApp.' : ''}</p>${L.whats ? `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${L.whats}">${WA_SVG} Chamar no WhatsApp</a>` : ''}</div>`}
      ${ler(K_PED, []).length ? `<button class="meus" id="meus">📦 Acompanhar meus pedidos</button>` : ''}
      <footer>Loja feita com <a href="/" target="_blank" rel="noopener">AgendaPro Beleza</a></footer>
      <div class="bar hide" id="bar"><button id="verSacola"><span class="n" id="bn">0</span><span>Ver sacola</span><span class="t" id="bt"></span></button></div>`;
    if (!L.ativo) return;
    $('#q').addEventListener('input', e => { busca = e.target.value; pintarGrade(); });
    document.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { cat = b.dataset.c; document.querySelectorAll('[data-c]').forEach(x => x.setAttribute('aria-pressed', x === b)); pintarGrade(); }));
    $('#verSacola').addEventListener('click', abrirSacola);
    $('#meus')?.addEventListener('click', meusPedidos);
    $('#grade').addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) mudar(b.dataset.add, +b.dataset.d); });
    pintarGrade(); pintarBarra();
  }
  function pintarGrade() {
    const g = $('#grade'); if (!g) return;
    const q = busca.trim().toLowerCase();
    const lista = L.produtos.filter(p => (!cat || p.cat === cat) && (!q || (p.nome + ' ' + p.desc).toLowerCase().includes(q)));
    g.innerHTML = lista.length ? lista.map(p => {
      const n = sacola[p.id] || 0, esg = p.disp <= 0;
      return `<article class="prod"><div class="ft">${p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.nome)}" loading="lazy">` : icone()}${esg ? '<span class="tag off">Esgotado</span>' : p.disp <= 3 ? `<span class="tag">Últimas ${p.disp}</span>` : ''}</div>
        <div class="bd"><h3>${esc(p.nome)}</h3>${p.desc ? `<div class="ds">${esc(p.desc)}</div>` : ''}<div class="pr">${brl(p.preco)}</div>
        ${n ? `<div class="step"><button data-add="${p.id}" data-d="-1" aria-label="Menos">−</button><b>${n}</b><button data-add="${p.id}" data-d="1" aria-label="Mais">+</button></div>`
          : `<button class="add" data-add="${p.id}" data-d="1" ${esg ? 'disabled' : ''}>${esg ? 'Esgotado' : 'Adicionar'}</button>`}</div></article>`;
    }).join('') : `<div class="vazio" style="grid-column:1/-1"><div class="e">${L.produtos.length ? '🔎' : '🛍️'}</div><p>${L.produtos.length ? 'Nenhum produto encontrado.' : 'Ainda não há produtos na loja.'}</p></div>`;
  }
  function pintarBarra() {
    const bar = $('#bar'); if (!bar) return;
    const n = qtdTotal(); bar.classList.toggle('hide', !n);
    $('#bn').textContent = n; $('#bt').textContent = brl(subtotal());
  }

  /* ---- folhas ---- */
  function folha(tipo, html) {
    let bg = $('#sheet');
    if (!bg) {
      bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet';
      bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-fechar]')) fecharFolha(); });
      document.body.appendChild(bg);
    }
    bg.dataset.t = tipo;
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    return bg;
  }
  function fecharFolha() { clearInterval(pollT); $('#sheet')?.remove(); if (location.hash) history.replaceState(null, '', location.pathname); }

  function abrirSacola(erro) {
    const it = itensSacola();
    if (!it.length) { fecharFolha(); return; }
    const entrega = form.entrega === 'entrega' && L.entrega ? 'entrega' : (L.retirada ? 'retirada' : (L.entrega ? 'entrega' : 'retirada'));
    const pag = L.pix && (form.pagamento !== 'entrega' || !L.pagarNaEntrega) ? 'pix' : 'entrega';
    const taxa = entrega === 'entrega' ? L.taxa : 0;
    const bg = folha('sacola', `
      <div class="sh-h"><h2>Sua sacola</h2><button class="x" data-fechar aria-label="Fechar">✕</button></div>
      <div class="box">${it.map(({ p, q }) => `<div class="it"><div class="th">${p.foto ? `<img src="${esc(p.foto)}" alt="">` : icone()}</div><div class="nm">${esc(p.nome)}<small>${brl(p.preco)} · ${brl(p.preco * q)}</small></div>
        <div class="step"><button data-add="${p.id}" data-d="-1" aria-label="Menos">−</button><b>${q}</b><button data-add="${p.id}" data-d="1" aria-label="Mais">+</button></div></div>`).join('')}</div>
      <form id="fPed" novalidate>
      <div class="box"><h4>Como você quer receber?</h4>
        ${L.retirada ? `<button type="button" class="opt" data-ent="retirada" aria-pressed="${entrega === 'retirada'}"><i class="r"></i><div><b>🏪 Retirar na loja</b><span>${L.endereco ? esc(L.endereco) : 'Combine o horário pelo WhatsApp'}</span></div></button>` : ''}
        ${L.entrega ? `<button type="button" class="opt" data-ent="entrega" aria-pressed="${entrega === 'entrega'}"><i class="r"></i><div><b>🛵 Entrega</b><span>${L.taxa ? 'Taxa de ' + brl(L.taxa) : 'Entrega grátis'}</span></div></button>` : ''}
        ${entrega === 'entrega' ? `<label class="l" for="end">Endereço de entrega</label><textarea class="in" id="end" name="endereco" rows="2" placeholder="Rua, número, bairro, referência">${esc(form.endereco || '')}</textarea>` : ''}
      </div>
      <div class="box"><h4>Pagamento</h4>
        ${L.pix ? `<button type="button" class="opt" data-pag="pix" aria-pressed="${pag === 'pix'}"><i class="r"></i><div><b>⚡ Pix agora</b><span>Você paga pelo celular com QR Code ou copia e cola.</span></div></button>` : ''}
        ${L.pagarNaEntrega || !L.pix ? `<button type="button" class="opt" data-pag="entrega" aria-pressed="${pag === 'entrega'}"><i class="r"></i><div><b>💵 Pagar na ${entrega === 'entrega' ? 'entrega' : 'retirada'}</b><span>Dinheiro, cartão ou Pix na hora.</span></div></button>` : ''}
      </div>
      <div class="box"><h4>Seus dados</h4>
        <label class="l" for="nome" style="margin-top:0">Nome</label><input class="in" id="nome" name="nome" autocomplete="name" value="${esc(form.nome || '')}" placeholder="Seu nome">
        <label class="l" for="tel">WhatsApp</label><input class="in" id="tel" name="tel" inputmode="tel" autocomplete="tel" value="${esc(form.tel || '')}" placeholder="(61) 99999-9999">
        <label class="l" for="obs">Observação <span style="color:var(--mut);font-weight:500">(opcional)</span></label><input class="in" id="obs" name="obs" value="${esc(form.obs || '')}" placeholder="Ex.: cor, tamanho, horário">
      </div>
      <div class="box"><div class="tot"><span>Produtos</span><span>${brl(subtotal())}</span></div>${entrega === 'entrega' ? `<div class="tot"><span>Entrega</span><span>${taxa ? brl(taxa) : 'Grátis'}</span></div>` : ''}<div class="tot g"><span>Total</span><span>${brl(subtotal() + taxa)}</span></div></div>
      <div class="err" id="err">${erro ? esc(erro) : ''}</div>
      <button class="btn pri" type="submit" id="btPed">${pag === 'pix' ? 'Fazer pedido e pagar com Pix' : 'Fazer pedido'} · ${brl(subtotal() + taxa)}</button>
      </form>`);
    const guardar = () => { const f = $('#fPed'); if (!f) return; const d = Object.fromEntries(new FormData(f)); Object.assign(form, { nome: d.nome, tel: d.tel, obs: d.obs, ...(d.endereco !== undefined ? { endereco: d.endereco } : {}) }); gravar(K_CLI, { nome: form.nome, tel: form.tel, endereco: form.endereco, entrega: form.entrega, pagamento: form.pagamento }); };
    bg.querySelector('.sheet').addEventListener('click', e => {
      const a = e.target.closest('[data-add]'); if (a) { guardar(); return mudar(a.dataset.add, +a.dataset.d); }
      const en = e.target.closest('[data-ent]'); if (en) { guardar(); form.entrega = en.dataset.ent; return abrirSacola(); }
      const pg = e.target.closest('[data-pag]'); if (pg) { guardar(); form.pagamento = pg.dataset.pag; return abrirSacola(); }
    });
    const tel = $('#tel'); tel.addEventListener('input', () => { const v = tel.value.replace(/\D/g, '').slice(0, 11); tel.value = v.length > 10 ? `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}` : v.length > 6 ? `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}` : v.length > 2 ? `(${v.slice(0, 2)}) ${v.slice(2)}` : v; });
    $('#fPed').addEventListener('submit', async e => {
      e.preventDefault(); guardar();
      const err = m => { $('#err').textContent = m; };
      if ((form.nome || '').trim().length < 2) return err('Informe seu nome.');
      if ((form.tel || '').replace(/\D/g, '').length < 10) return err('Informe seu WhatsApp com DDD.');
      if (entrega === 'entrega' && (form.endereco || '').trim().length < 6) return err('Informe o endereço de entrega.');
      const bt = $('#btPed'); bt.disabled = true; bt.textContent = 'Enviando pedido…';
      try {
        const r = await fetch(API + '/loja/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens: it.map(x => ({ id: x.p.id, qtd: x.q })), nome: form.nome, tel: form.tel, obs: form.obs, endereco: form.endereco, entrega, pagamento: pag }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || 'Não foi possível enviar o pedido.');
        gravar(K_PED, [{ id: j.id, t: j.token, n: j.numero, em: j.criado }, ...ler(K_PED, [])].slice(0, 10));
        sacola = {}; salvarSacola(); pintarGrade(); pintarBarra();
        form.obs = '';
        if (!$('#meus')) pintar();
        mostrarPedido(j, j.token, true);
      } catch (ex) { bt.disabled = false; bt.textContent = 'Tentar de novo'; err(ex.message); if (/Só temos/.test(ex.message)) iniciarSilencioso(); }
    });
  }
  async function iniciarSilencioso() { try { const r = await fetch(API + '/loja'); if (r.ok) { L = await r.json(); pintarGrade(); } } catch { } }

  const ETAPAS = [['novo', 'Recebido'], ['confirmado', 'Confirmado'], ['pronto', 'Pronto'], ['concluido', 'Entregue']];
  function msgWhats(d) {
    return `Olá! Fiz o pedido *#${d.numero}* na loja online 🛍️\n\n` + d.itens.map(i => `• ${i.qtd}× ${i.nome} — ${brl(i.qtd * i.un)}`).join('\n') +
      `\n\n${d.taxa ? `Entrega: ${brl(d.taxa)}\n` : ''}*Total: ${brl(d.total)}*\n${d.entrega === 'entrega' ? '🛵 Entrega' : '🏪 Retirada na loja'} · ${d.pagamento === 'pix' ? (d.pago ? 'Pix pago' : 'Pix') : 'pagar na ' + d.entrega}\n👤 ${d.nome}`;
  }
  function mostrarPedido(d, token, novo) {
    const idx = ETAPAS.findIndex(e => e[0] === d.status), canc = d.status === 'cancelado';
    const wa = d.whats ? `https://wa.me/${d.whats}?text=${encodeURIComponent(msgWhats(d))}` : '';
    let qr = ''; try { if (d.pix) { const q = qrcode(0, 'M'); q.addData(d.pix.codigo); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } } catch { }
    folha('pedido', `
      <div class="sh-h"><h2>Pedido #${d.numero}</h2><button class="x" data-fechar aria-label="Fechar">✕</button></div>
      ${novo ? `<div class="ok"><div class="c">✓</div><h2>Pedido recebido!</h2><p>${d.pagamento === 'pix' && d.pix ? 'Agora é só pagar o Pix abaixo.' : 'A loja já foi avisada e vai separar seus produtos.'}</p></div>` : ''}
      <div class="box">${canc ? '<span class="pill bad">Pedido cancelado</span>' : `<div class="trk">${ETAPAS.map((e, i) => `<div class="${i <= idx ? 'on' : ''}"><i></i>${e[1]}</div>`).join('')}</div>`}</div>
      ${d.pix && !canc ? `<div class="box" style="text-align:center"><h4>Pague com Pix · ${brl(d.total)}</h4><div class="qr">${qr}</div>
        <div class="cc"><input readonly value="${esc(d.pix.codigo)}" aria-label="Pix copia e cola"><button id="cp">Copiar</button></div>
        <p style="font-size:.78rem;color:var(--mut);margin-top:8px">Recebedor: ${esc(d.pix.nome)}</p>
        <button class="btn gh" id="paguei" ${d.pagoInformado ? 'disabled' : ''}>${d.pagoInformado ? '✅ Pagamento informado — aguardando a loja confirmar' : '✅ Já paguei'}</button></div>`
      : d.pago ? `<div class="box"><span class="pill ok">Pagamento confirmado</span></div>` : ''}
      <div class="box"><h4>Resumo</h4>${d.itens.map(i => `<div class="tot" style="color:var(--tx)"><span>${i.qtd}× ${esc(i.nome)}</span><span>${brl(i.qtd * i.un)}</span></div>`).join('')}
        ${d.taxa ? `<div class="tot"><span>Entrega</span><span>${brl(d.taxa)}</span></div>` : ''}<div class="tot g"><span>Total</span><span>${brl(d.total)}</span></div>
        <p style="font-size:.82rem;color:var(--mut);margin-top:8px">${d.entrega === 'entrega' ? '🛵 Entrega' : '🏪 Retirada na loja'} · ${d.pagamento === 'pix' ? '⚡ Pix' : '💵 Pagar na ' + d.entrega}</p></div>
      ${wa ? `<a class="btn wa" target="_blank" rel="noopener" href="${wa}">${WA_SVG} Enviar pedido no WhatsApp</a>` : ''}
      <button class="btn gh" data-fechar>Continuar comprando</button>`);
    $('#cp')?.addEventListener('click', e => { const b = e.currentTarget; const ok = () => { b.textContent = 'Copiado!'; setTimeout(() => b.textContent = 'Copiar', 1500); }; try { navigator.clipboard.writeText(d.pix.codigo).then(ok, () => { b.previousElementSibling.select(); document.execCommand('copy'); ok(); }); } catch { b.previousElementSibling.select(); } });
    $('#paguei')?.addEventListener('click', async () => {
      try { const r = await fetch(`${API}/loja/pedido/${d.id}/paguei`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }) }); const j = await r.json(); if (r.ok) mostrarPedido(j, token); } catch { toast('Sem conexão. Tente de novo.'); }
    });
    clearInterval(pollT);
    if (!['concluido', 'cancelado'].includes(d.status)) pollT = setInterval(async () => {
      if ($('#sheet')?.dataset.t !== 'pedido') return clearInterval(pollT);
      try { const r = await fetch(`${API}/loja/pedido/${d.id}?t=${encodeURIComponent(token)}`); if (!r.ok) return; const j = await r.json();
        if (j.status !== d.status || j.pago !== d.pago || j.pagoInformado !== d.pagoInformado) mostrarPedido(j, token); } catch { }
    }, 10000);
  }
  async function abrirPedido(id, t) {
    try { const r = await fetch(`${API}/loja/pedido/${id}?t=${encodeURIComponent(t)}`); if (!r.ok) throw 0; mostrarPedido(await r.json(), t); } catch { toast('Pedido não encontrado.'); }
  }
  async function meusPedidos() {
    const lst = ler(K_PED, []);
    folha('meus', `<div class="sh-h"><h2>Meus pedidos</h2><button class="x" data-fechar aria-label="Fechar">✕</button></div><div class="box" id="mp"><p style="color:var(--mut)">Carregando…</p></div>`);
    const linhas = await Promise.all(lst.map(async x => { try { const r = await fetch(`${API}/loja/pedido/${x.id}?t=${encodeURIComponent(x.t)}`); return r.ok ? { ...(await r.json()), t: x.t } : null; } catch { return null; } }));
    const st = { novo: ['Recebido', 'wait'], confirmado: ['Confirmado', 'ok'], pronto: ['Pronto', 'ok'], concluido: ['Entregue', 'ok'], cancelado: ['Cancelado', 'bad'] };
    const ok = linhas.filter(Boolean);
    $('#mp').innerHTML = ok.length ? ok.map(d => `<button class="opt" data-ped="${d.id}" data-t="${d.t}"><div style="flex:1"><b>Pedido #${d.numero} · ${brl(d.total)}</b><span>${new Date(d.criado).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${d.itens.reduce((t, i) => t + i.qtd, 0)} item(ns)</span></div><span class="pill ${st[d.status][1]}">${st[d.status][0]}</span></button>`).join('') : '<p style="color:var(--mut)">Nenhum pedido encontrado.</p>';
    $('#mp').addEventListener('click', e => { const b = e.target.closest('[data-ped]'); if (b) abrirPedido(b.dataset.ped, b.dataset.t); });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharFolha(); });
  iniciar();
})();
