/* AgendaPro — Assinatura por Pix (usado no site e no app).
   O Pix é gerado na hora pelo Asaas (servidor) e a liberação é automática quando o pagamento cai. */
(function () {
  const WHATS = '5561992522517';
  const PLANOS = {
    mensal: { nome: 'Mensal', valor: 39.90, periodo: '/mês', dias: 30 },
    anual: { nome: 'Anual', valor: 399.90, periodo: '/ano', dias: 365 }
  };
  // 🔥 Promoção de lançamento: quem assinar até 16/10 paga 19,99/mês por 6 meses (depois volta para 39,90)
  const PROMO = { fim: Date.parse('2026-10-17T00:00:00-03:00'), ateTxt: '16/10', valor: 19.99 };
  const promoAberta = () => Date.now() < PROMO.fim;
  const cheio = PLANOS.mensal.valor * 12;                      // 478,80
  const economia = cheio - PLANOS.anual.valor;                 // 78,90
  const desconto = Math.round(economia / cheio * 100);         // 16%
  const brl = v => 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const css = `
  .apx-bg{position:fixed;inset:0;z-index:9999;background:rgba(6,4,10,.72);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 14px;font-family:'Manrope',system-ui,sans-serif;color:#f4f0f7;animation:apxIn .25s ease}
  @keyframes apxIn{from{opacity:0}}
  .apx{width:100%;max-width:480px;background:#1b1722;border:1px solid #322b3d;border-radius:22px;padding:22px;box-shadow:0 40px 100px -30px #000;animation:apxUp .35s cubic-bezier(.2,.9,.3,1.2)}
  @keyframes apxUp{from{transform:translateY(24px);opacity:0}}
  .apx *{box-sizing:border-box}
  .apx-h{display:flex;justify-content:space-between;align-items:center;gap:10px}
  .apx-h h3{margin:0;font-family:'Fraunces',Georgia,serif;font-size:1.45rem}
  .apx-x{background:none;border:0;color:#a89fb5;font-size:1.3rem;cursor:pointer;padding:4px 8px}
  .apx-sub{color:#a89fb5;font-size:.9rem;margin:4px 0 14px}
  .apx-pl{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .apx-p{position:relative;text-align:left;border:1.5px solid #322b3d;background:#120f17;color:inherit;border-radius:16px;padding:14px 12px 12px;cursor:pointer;font:inherit;transition:border-color .2s,background .2s}
  .apx-p b{display:block;font-size:.9rem}
  .apx-p .v{font-family:'Fraunces',Georgia,serif;font-size:1.35rem;font-weight:700;margin-top:4px;white-space:nowrap}
  .apx-p .v small{font-family:inherit;font-size:.75rem;color:#a89fb5;font-weight:600}
  .apx-p .s{font-size:.75rem;color:#a89fb5;margin-top:2px;line-height:1.35}
  .apx-p .s del{opacity:.8}
  .apx-p[aria-pressed="true"]{border-color:#3fbf8a;background:color-mix(in srgb,#3fbf8a 12%,#120f17)}
  .apx-tag{position:absolute;top:-10px;right:10px;background:linear-gradient(90deg,#f0b54a,#ee8a6c);color:#2b1406;font-size:.68rem;font-weight:800;border-radius:99px;padding:3px 8px;letter-spacing:.02em}
  .apx-qr{display:grid;justify-items:center;gap:6px;margin:18px 0 6px;text-align:center}
  .apx-qr .q{width:min(230px,70vw);aspect-ratio:1;background:#fff;border-radius:14px;padding:8px}
  .apx-qr .q svg{width:100%;height:100%;display:block}
  .apx-qr .val{font-family:'Fraunces',Georgia,serif;font-size:1.6rem;font-weight:700}
  .apx-qr .rec{font-size:.8rem;color:#a89fb5}
  .apx-lbl{font-size:.75rem;font-weight:700;color:#a89fb5;text-transform:uppercase;letter-spacing:.06em;margin:14px 0 6px}
  .apx-cc{display:flex;gap:8px}
  .apx-cc input{flex:1;min-width:0;font:500 .82rem 'JetBrains Mono',ui-monospace,monospace;color:#f4f0f7;background:#120f17;border:1px solid #322b3d;border-radius:11px;padding:11px}
  .apx-btn{display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:13px;padding:14px 16px;font:800 .98rem 'Manrope',system-ui,sans-serif;cursor:pointer;text-decoration:none;width:100%;transition:transform .15s}
  .apx-btn:active{transform:scale(.98)}
  .apx-cp{width:auto;padding:0 14px;background:#241f2d;color:#f4f0f7;border:1px solid #322b3d;font-size:.85rem;border-radius:11px}
  .apx-ok{background:#25d366;color:#06301a;margin-top:18px}
  .apx-gh{background:transparent;color:#a89fb5;border:1px solid #322b3d;margin-top:8px;font-weight:700;font-size:.88rem}
  .apx-steps{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:8px;font-size:.88rem;color:#cfc7da}
  .apx-steps li{display:flex;gap:10px}
  .apx-steps i{flex:none;width:22px;height:22px;border-radius:50%;background:#241f2d;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:.75rem;color:#f4f0f7}
  .apx-done{text-align:center;display:grid;gap:10px;justify-items:center;padding:10px 0}
  .apx-done .c{width:62px;height:62px;border-radius:50%;background:#25d366;display:grid;place-items:center;font-size:30px;color:#06301a}
  .apx-done p{margin:0;color:#cfc7da;font-size:.92rem}
  .apx-f label{display:block;font-size:.78rem;font-weight:700;color:#cfc7da;margin:12px 0 5px}
  .apx-f input,.apx-f select{width:100%;font:500 16px 'Manrope',system-ui,sans-serif;color:#f4f0f7;background:#120f17;border:1px solid #322b3d;border-radius:11px;padding:12px}
  .apx-f input:focus,.apx-f select:focus{outline:2px solid #3fbf8a;border-color:transparent}
  .apx-g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .apx-err{color:#ff8f8f;font-size:.86rem;margin-top:10px;min-height:1em}
  .apx-alt{display:block;text-align:center;margin-top:10px;font-size:.85rem;color:#a89fb5;background:none;border:0;cursor:pointer;text-decoration:underline;width:100%;font-family:inherit}
  .apx-passos{display:flex;gap:6px;margin:2px 0 14px;font-size:.75rem;font-weight:700;color:#a89fb5}
  .apx-passos span{flex:1;padding:7px 8px;border-radius:9px;background:#120f17;border:1px solid #322b3d;text-align:center}
  .apx-passos span.on{color:#06301a;background:#3fbf8a;border-color:#3fbf8a}
  .apx-okbox{background:color-mix(in srgb,#3fbf8a 14%,#120f17);border:1px solid color-mix(in srgb,#3fbf8a 45%,#322b3d);border-radius:13px;padding:12px 14px;font-size:.88rem;margin:4px 0 6px;line-height:1.45}
  .apx-okbox a{color:#7ff0b8;font-weight:700}
  .apx-promo{background:linear-gradient(100deg,#ff5a36,#ff2d75);color:#fff;border-radius:14px;padding:11px 14px;margin:0 0 14px;font-size:.88rem;line-height:1.4;font-weight:600}
  .apx-promo b{font-weight:800}
  .apx-p.pr{border-color:#ff6a3d}.apx-p.pr[aria-pressed="true"]{border-color:#ff6a3d;background:color-mix(in srgb,#ff6a3d 14%,#120f17)}
  .apx-p.pr .apx-tag{background:linear-gradient(90deg,#ff5a36,#ff2d75);color:#fff}
  .apx-load{width:100%;aspect-ratio:1;display:grid;place-items:center;color:#5a4f66;font-size:.85rem;font-weight:700}
  .apx-spin{width:38px;height:38px;border-radius:50%;border:4px solid #e9e3ef;border-top-color:#3fbf8a;animation:apxSp .8s linear infinite;margin:0 auto 10px}
  @keyframes apxSp{to{transform:rotate(360deg)}}
  .apx-wait{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:14px;font-size:.9rem;font-weight:700;color:#cfc7da;background:#120f17;border:1px solid #322b3d;border-radius:12px;padding:11px}
  .apx-wait i{width:10px;height:10px;border-radius:50%;background:#f0b54a;animation:apxPu 1.2s ease-in-out infinite}
  @keyframes apxPu{50%{opacity:.25;transform:scale(.7)}}
  .apx-box{background:#120f17;border:1px solid #322b3d;border-radius:14px;padding:14px;margin-top:16px}
  .apx-box p{margin:0 0 8px;font-size:.88rem;color:#cfc7da;line-height:1.45}
  .apx-sec{font-size:.76rem;color:#8f86a0;margin-top:8px;text-align:center}
  @media (max-width:420px){.apx{padding:18px}.apx-p .v{font-size:1.15rem}.apx-g2{grid-template-columns:1fr}}
  `;
  let estilo = false, ctx = {}, plano = 'mensal', cob = null, pollT = null, seq = 0;
  function qrSvgDe(txt) {
    try { const q = qrcode(0, 'M'); q.addData(txt); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { return ''; }
  }
  const planoAtual = () => plano === 'promo' ? { nome: 'Promoção (6 meses)', valor: PROMO.valor, periodo: '/mês', dias: 30 }
    : plano === 'ajustado' && ctx.ajustado ? { nome: ctx.ajustado.promo ? 'Promoção (6 meses)' : 'Plano ajustado', valor: Number(ctx.ajustado.valor), periodo: '/mês', dias: 30 } : PLANOS[plano];
  const fmtData = s => String(s || '').split('-').reverse().join('/');

  function copiar(txt, btn) {
    const ok = () => { const t = btn.textContent; btn.textContent = 'Copiado!'; setTimeout(() => btn.textContent = t, 1600); };
    const alt = () => { const i = btn.previousElementSibling; if (i && i.select) { i.focus(); i.select(); } try { document.execCommand('copy'); ok(); } catch { btn.textContent = 'Selecione e copie'; } };
    try { navigator.clipboard.writeText(txt).then(ok, alt); } catch { alt(); }
  }
  function fechar() { clearInterval(pollT); seq++; const el = document.getElementById('apx'); if (el) el.remove(); document.removeEventListener('keydown', esc_); }
  function esc_(e) { if (e.key === 'Escape') fechar(); }

  const RAMOS = [['barbearia', 'Barbearia'], ['lash', 'Lash / Extensão de cílios'], ['manicure', 'Manicure & Pedicure'], ['cabeleireira', 'Salão / Cabeleireira'], ['bronzeamento', 'Bronzeamento'], ['depilacao', 'Depilação'], ['maquiadora', 'Maquiadora']];
  const cardAnual = () => `<button type="button" class="apx-p" data-p="anual" aria-pressed="${plano === 'anual'}"><span class="apx-tag">−${desconto}%${promoAberta() ? '' : ' PROMOÇÃO'}</span><b>Anual</b><div class="v">${brl(PLANOS.anual.valor)}<small>/ano</small></div><div class="s"><del>${brl(cheio)}</del> · sai por ${brl(PLANOS.anual.valor / 12)}/mês<br>Economize ${brl(economia)}</div></button>`;
  const faixaPromo = () => `<div class="apx-promo">🔥 <b>Promoção de lançamento:</b> assinando até <b>${PROMO.ateTxt}</b> você paga <b>${brl(PROMO.valor)}/mês durante 6 meses</b>. Depois volta ao valor normal de ${brl(PLANOS.mensal.valor)}.</div>`;
  const cardsPlanos = () => promoAberta() ? `${faixaPromo()}<div class="apx-pl">
        <button type="button" class="apx-p pr" data-p="promo" aria-pressed="${plano === 'promo'}"><span class="apx-tag">🔥 SÓ ATÉ ${PROMO.ateTxt}</span><b>Mensal promocional</b><div class="v">${brl(PROMO.valor)}<small>/mês</small></div><div class="s"><del>${brl(PLANOS.mensal.valor)}</del> por 6 meses<br>depois ${brl(PLANOS.mensal.valor)}/mês</div></button>
        ${cardAnual()}
      </div>` : `<div class="apx-pl">
        <button type="button" class="apx-p" data-p="mensal" aria-pressed="${plano === 'mensal'}"><b>Mensal</b><div class="v">${brl(PLANOS.mensal.valor)}<small>/mês</small></div><div class="s">Renova a cada 30 dias</div></button>
        ${cardAnual()}
      </div>`;
  const cardsDoCtx = () => ctx.ajustado ? (ctx.ajustado.promo
      ? `<div class="apx-pl" style="grid-template-columns:1fr"><button class="apx-p pr" data-p="ajustado" aria-pressed="true"><span class="apx-tag">🔥 PROMOÇÃO</span><b>Mensal promocional</b><div class="v">${brl(Number(ctx.ajustado.valor))}<small>/mês</small></div><div class="s">${ctx.ajustado.promo.fim ? `Seu valor promocional vale até ${fmtData(ctx.ajustado.promo.fim)}` : `<del>${brl(PLANOS.mensal.valor)}</del> por 6 meses para quem assinar até ${PROMO.ateTxt}`} · depois ${brl(PLANOS.mensal.valor)}/mês</div></button></div>`
      : `<div class="apx-pl" style="grid-template-columns:1fr"><button class="apx-p" data-p="ajustado" aria-pressed="true"><span class="apx-tag">✨ VALOR ESPECIAL</span><b>Plano ajustado</b><div class="v">${brl(Number(ctx.ajustado.valor))}<small>/mês</small></div><div class="s">Valor combinado com você · renova a cada 30 dias</div></button></div>`)
    : cardsPlanos();
  const passos = n => ctx.cadastro ? `<div class="apx-passos"><span class="${n === 1 ? 'on' : ''}">1 · Seus dados</span><span class="${n === 2 ? 'on' : ''}">2 · Pagamento</span><span class="${n === 3 ? 'on' : ''}">3 · Liberado</span></div>` : '';
  const mascaraDoc = inp => inp.addEventListener('input', () => {
    const v = inp.value.replace(/\D/g, '').slice(0, 14);
    inp.value = v.length <= 11 ? v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
      : v.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  });
  // Passo 1 (site): cadastro antes do pagamento
  function renderCadastro(erro) {
    const el = document.getElementById('apx'), d = ctx.dados || {};
    el.innerHTML = `<div class="apx" role="dialog" aria-modal="true" aria-label="Assinar o AgendaPro">
      <div class="apx-h"><h3>Assinar o AgendaPro</h3><button class="apx-x" data-a="fechar" aria-label="Fechar">✕</button></div>
      ${passos(1)}
      <p class="apx-sub" style="margin-top:0">Escolha o plano e preencha seus dados. A conta é criada na hora e, assim que o Pix cair, o acesso é liberado automaticamente.</p>
      ${cardsPlanos()}
      <form class="apx-f" id="apxForm" novalidate>
        <label for="apxNome">Nome completo</label><input id="apxNome" name="nome" required autocomplete="name" value="${esc(d.nome || '')}" placeholder="Seu nome e sobrenome">
        <label for="apxLoja">Nome do seu negócio</label><input id="apxLoja" name="loja" required value="${esc(d.loja || '')}" placeholder="Ex.: Studio Maria Lash">
        <label for="apxRamo">Seu ramo</label><select id="apxRamo" name="nicho">${RAMOS.map(([k, l]) => `<option value="${k}" ${d.nicho === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="apx-g2">
          <div><label for="apxWa">WhatsApp</label><input id="apxWa" name="whatsapp" required inputmode="tel" autocomplete="tel" value="${esc(d.whatsapp || '')}" placeholder="(61) 99999-9999"></div>
          <div><label for="apxEmail">E-mail (será seu login)</label><input id="apxEmail" name="email" type="email" required autocomplete="email" value="${esc(d.email || '')}" placeholder="voce@email.com"></div>
        </div>
        <label for="apxDoc">CPF ou CNPJ <span style="font-weight:500;color:#8f86a0">(para emitir o Pix)</span></label><input id="apxDoc" name="doc" required inputmode="numeric" value="${esc(d.doc || '')}" placeholder="000.000.000-00">
        <label for="apxSenha">Crie uma senha</label><input id="apxSenha" name="senha" type="password" required minlength="6" autocomplete="new-password" placeholder="Mínimo 6 caracteres">
        <div class="apx-err" id="apxErr">${erro ? esc(erro) : ''}</div>
        <button class="apx-btn apx-ok" style="margin-top:8px" type="submit">Continuar para o pagamento →</button>
        ${erro ? `<button type="button" class="apx-alt" data-a="ajuda">Precisa de ajuda? Falar no WhatsApp</button>` : ''}
      </form>
    </div>`;
    const tel = el.querySelector('#apxWa');
    tel.addEventListener('input', () => { const v = tel.value.replace(/\D/g, '').slice(0, 11); tel.value = v.length > 10 ? `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}` : v.length > 6 ? `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}` : v.length > 2 ? `(${v.slice(0, 2)}) ${v.slice(2)}` : v; });
    mascaraDoc(el.querySelector('#apxDoc'));
    el.querySelector('#apxForm').addEventListener('submit', enviarCadastro);
    setTimeout(() => el.querySelector('#apxNome')?.focus(), 60);
  }
  async function enviarCadastro(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('button[type=submit]');
    ctx.dados = { ...f, senha: '' };
    const err = msg => { document.getElementById('apxErr').textContent = msg; };
    if (f.nome.trim().split(/\s+/).length < 2) return err('Informe seu nome completo.');
    if (f.loja.trim().length < 2) return err('Informe o nome do seu negócio.');
    if (f.whatsapp.replace(/\D/g, '').length < 10) return err('Informe o WhatsApp com DDD.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) return err('Informe um e-mail válido.');
    if (![11, 14].includes(f.doc.replace(/\D/g, '').length)) return err('Informe seu CPF (11 números) ou CNPJ (14 números).');
    if ((f.senha || '').length < 6) return err('A senha precisa ter pelo menos 6 caracteres.');
    btn.disabled = true; btn.textContent = 'Criando sua conta…';
    try {
      const r = await fetch('/api/teste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, assinar: plano }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Não foi possível criar a conta agora.');
      try { localStorage.setItem('agendapro_token_' + j.slug, j.token); } catch { }
      Object.assign(ctx, { slug: j.slug, token: j.token, login: j.login, negocio: f.loja.trim(), nome: f.nome.trim(), whats: f.whatsapp, existente: !!j.existente, cadastrado: true });
      render(); document.getElementById('apx').scrollTop = 0;
    } catch (ex) { renderCadastro(ex.message); }
  }

  /* ---- Pix gerado pelo Asaas ---- */
  const apiPix = (path, opt = {}) => fetch(`/api/t/${encodeURIComponent(ctx.slug)}/assinatura/pix${path}`, { ...opt, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ctx.token } });
  async function gerarPix(doc) {
    const my = ++seq; clearInterval(pollT);
    cob = { carregando: true }; pintarPix();
    try {
      const r = await apiPix('', { method: 'POST', body: JSON.stringify({ plano, doc: doc || undefined }) });
      const j = await r.json().catch(() => ({}));
      if (my !== seq) return;
      if (!r.ok) throw Object.assign(new Error(j.erro || 'Não foi possível gerar o Pix agora.'), { status: r.status });
      cob = j.precisaDoc ? { precisaDoc: true } : { ...j, svg: qrSvgDe(j.payload) };
      if (cob.id) acompanhar(cob.id);
    } catch (e) {
      if (my !== seq) return;
      cob = { erro: e.message, docErrado: /CPF|CNPJ/i.test(e.message), indisponivel: e.status === 503 };
    }
    pintarPix();
  }
  function acompanhar(id) {
    clearInterval(pollT);
    pollT = setInterval(async () => {
      if (!document.getElementById('apx') || !cob || cob.id !== id) return clearInterval(pollT);
      try {
        const r = await apiPix('/' + encodeURIComponent(id)); const j = await r.json();
        if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(j.status)) { clearInterval(pollT); pago(j); }
        else if (['OVERDUE', 'DELETED', 'REFUNDED'].includes(j.status)) { clearInterval(pollT); gerarPix(); }
      } catch { }
    }, 5000);
  }
  function pintarPix() {
    const box = document.getElementById('apxPix'); if (!box) return;
    const p = planoAtual();
    if (!ctx.slug || !ctx.token) {
      box.innerHTML = `<div class="apx-box"><p>Para gerar o Pix precisamos da sua conta. ${ctx.cadastro ? 'Volte e preencha seus dados.' : 'Entre no seu painel e toque em <b>Assinar</b>.'}</p>
        ${ctx.cadastro ? '<button class="apx-btn apx-ok" style="margin-top:6px" data-a="voltar">← Voltar para os dados</button>' : ''}<button class="apx-btn apx-gh" data-a="ajuda">💬 Falar no WhatsApp</button></div>`;
      return;
    }
    if (!cob || cob.carregando) { box.innerHTML = `<div class="apx-qr"><div class="q"><div class="apx-load"><div><div class="apx-spin"></div>Gerando seu Pix…</div></div></div><div class="val">${brl(p.valor)}</div></div>`; return; }
    if (cob.precisaDoc || cob.docErrado) {
      box.innerHTML = `<form class="apx-box apx-f" id="apxDocF" novalidate><p><b>Só falta seu CPF ou CNPJ</b> para emitir a cobrança Pix de <b>${brl(p.valor)}</b>.</p>
        <input id="apxDoc2" name="doc" inputmode="numeric" placeholder="000.000.000-00" autocomplete="off">
        <div class="apx-err">${cob.docErrado ? esc(cob.erro) : ''}</div>
        <button class="apx-btn apx-ok" style="margin-top:6px" type="submit">Gerar Pix</button>
        <div class="apx-sec">🔒 Usado só para emitir a cobrança. Não aparece para ninguém.</div></form>`;
      const inp = box.querySelector('#apxDoc2'); mascaraDoc(inp);
      box.querySelector('#apxDocF').addEventListener('submit', ev => { ev.preventDefault(); const d = inp.value.replace(/\D/g, ''); if (![11, 14].includes(d.length)) { box.querySelector('.apx-err').textContent = 'Informe 11 números (CPF) ou 14 (CNPJ).'; return; } gerarPix(d); });
      setTimeout(() => inp.focus(), 50);
      return;
    }
    if (cob.erro) {
      box.innerHTML = `<div class="apx-box"><p>⚠️ ${esc(cob.erro)}</p>${cob.indisponivel ? '' : '<button class="apx-btn apx-ok" style="margin-top:6px" data-a="gerar">Tentar de novo</button>'}<button class="apx-btn apx-gh" data-a="ajuda">💬 Falar no WhatsApp</button></div>`;
      return;
    }
    box.innerHTML = `<div class="apx-qr"><div class="q">${cob.svg}</div><div class="val">${brl(cob.valor)}</div><div class="rec">${esc(cob.nomePlano || p.nome)} · ${cob.dias === 365 ? '1 ano' : '30 dias'} de acesso</div></div>
      <div class="apx-lbl">Pix copia e cola</div>
      <div class="apx-cc"><input readonly value="${esc(cob.payload)}" aria-label="Código Pix copia e cola"><button class="apx-btn apx-cp" data-a="cc">Copiar</button></div>
      <div class="apx-wait" role="status"><i></i>Aguardando o pagamento… a liberação é automática</div>
      <ul class="apx-steps">
        <li><i>1</i><span>Abra o app do seu banco → <b>Pix</b> → <b>Ler QR Code</b> ou <b>Pix copia e cola</b>.</span></li>
        <li><i>2</i><span>Confira o valor de <b>${brl(cob.valor)}</b> e confirme.</span></li>
        <li><i>3</i><span>Pronto! Em poucos segundos o acesso é liberado sozinho. <b>Não precisa mandar comprovante.</b></span></li>
      </ul>
      <div class="apx-sec">🔒 Pagamento processado com segurança pelo Asaas${cob.url ? ` · <a href="${esc(cob.url)}" target="_blank" rel="noopener" style="color:#a89fb5">ver fatura</a>` : ''}</div>`;
  }

  function render() {
    const el = document.getElementById('apx');
    el.innerHTML = `<div class="apx" role="dialog" aria-modal="true" aria-label="Assinar o AgendaPro">
      <div class="apx-h"><h3>Assinar o AgendaPro</h3><button class="apx-x" data-a="fechar" aria-label="Fechar">✕</button></div>
      ${passos(2)}
      ${ctx.cadastrado ? `<div class="apx-okbox">✅ ${ctx.existente ? 'Encontramos a sua conta' : 'Conta criada'}! Usuário: <b>${esc(ctx.login)}</b><br>${ctx.existente ? '' : 'Você já pode usar por 3 dias. '}<a href="/${esc(ctx.slug)}" target="_blank" rel="noopener">Abrir meu painel ↗</a></div>` : ''}
      <p class="apx-sub">${ctx.negocio ? esc(ctx.negocio) + ' · ' : ''}Pague com Pix: a liberação é automática.</p>
      ${cardsDoCtx()}
      <div id="apxPix"></div>
      <button class="apx-btn apx-gh" style="margin-top:16px" data-a="fechar">Pagar depois</button>
      <button class="apx-alt" data-a="ajuda">Problema com o pagamento? Falar no WhatsApp</button>
    </div>`;
    if (ctx.slug && ctx.token) gerarPix(); else pintarPix();
  }
  function pago(j) {
    seq++; const p = planoAtual();
    try { ctx.onPago && ctx.onPago(j); } catch { }
    document.getElementById('apx').scrollTop = 0;
    document.querySelector('#apx .apx').innerHTML = `${passos(3)}<div class="apx-done">
      <div class="c">✓</div><h3 style="margin:0;font-family:'Fraunces',Georgia,serif;font-size:1.4rem">Pagamento confirmado!</h3>
      <p>Obrigado! Seu AgendaPro está liberado${j.vence ? ` até <b>${fmtData(j.vence)}</b>` : ''}.</p>
      <p style="font-size:.85rem;color:#a89fb5">${esc(p.nome)} · ${brl(cob?.valor || p.valor)}</p>
      ${ctx.cadastro && ctx.slug ? `<a class="apx-btn apx-ok" href="/${esc(ctx.slug)}">Entrar no meu painel</a>` : `<button class="apx-btn apx-ok" data-a="recarregar">Continuar</button>`}
    </div>`;
  }
  function ajuda() {
    const p = planoAtual();
    const msg = `Olá! Preciso de ajuda com o pagamento do AgendaPro.\n\n📦 Plano: ${p.nome} — ${brl(cob?.valor || p.valor)}${p.periodo}` +
      (ctx.nome ? `\n🙋 Nome: ${ctx.nome}` : '') + (ctx.negocio ? `\n🏪 Negócio: ${ctx.negocio}` : '') + (ctx.whats ? `\n📱 WhatsApp: ${ctx.whats}` : '') + (ctx.slug ? `\n🔗 Link: ${location.origin}/${ctx.slug}` : '') +
      (ctx.login ? `\n👤 Usuário: ${ctx.login}` : '');
    const a = document.createElement('a'); a.href = `https://wa.me/${WHATS}?text=${encodeURIComponent(msg)}`; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  }
  function abrir(opts = {}) {
    ctx = opts; cob = null; plano = opts.ajustado ? 'ajustado' : opts.plano === 'anual' ? 'anual' : promoAberta() ? 'promo' : 'mensal';
    if (!estilo) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); estilo = true; }
    fechar();
    const bg = document.createElement('div'); bg.id = 'apx'; bg.className = 'apx-bg';
    bg.addEventListener('click', e => {
      if (e.target === bg) return fechar();
      const pl = e.target.closest('[data-p]');
      if (pl) {
        if (pl.dataset.p === plano && !document.getElementById('apxForm')) return;
        plano = pl.dataset.p;
        if (document.getElementById('apxForm')) { ctx.dados = Object.fromEntries(new FormData(document.getElementById('apxForm'))); delete ctx.dados.senha; return renderCadastro(); }
        return render();
      }
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'fechar') fechar();
      else if (a.dataset.a === 'cc') copiar(cob?.payload || '', a);
      else if (a.dataset.a === 'gerar') gerarPix();
      else if (a.dataset.a === 'ajuda') ajuda();
      else if (a.dataset.a === 'voltar') renderCadastro();
      else if (a.dataset.a === 'recarregar') { fechar(); location.reload(); }
    });
    document.body.appendChild(bg); document.addEventListener('keydown', esc_);
    if (ctx.cadastro && !ctx.slug) renderCadastro(); else render();
  }
  window.AgendaProAssinar = { abrir, PROMO, promoAberta, PLANOS, desconto, economia, cheio, brl };
})();
