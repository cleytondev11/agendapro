/* AgendaPro — Tour guiado e "Primeiros passos".
   Destaca o elemento na tela, explica e espera a pessoa tocar quando é uma ação real
   (ex.: abrir "+ Nova venda"). O progresso fica salvo na conta (config.tour). */
(function () {
  const $q = s => document.querySelector(s);
  const visivel = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  /* ---------- localizar elementos ---------- */
  function porTexto(txt, escopo = document, sel = 'button, a, label.btn') {
    return [...escopo.querySelectorAll(sel)].find(e => visivel(e) && e.textContent.replace(/\s+/g, ' ').includes(txt));
  }
  // Item do menu: barra lateral (computador), barra de baixo (celular) ou "Mais".
  function menu(v) {
    const cands = [...document.querySelectorAll(`.side .nav a[onclick="go('${v}')"], .bnav a[onclick="go('${v}')"]`)];
    return cands.find(visivel) || [...document.querySelectorAll('.bnav a')].find(a => visivel(a) && /Mais/.test(a.textContent));
  }
  const campo = n => $q(`#modal-body [name="${n}"]`);
  const doModal = s => () => $q('#modal:not(.hidden) ' + s);

  /* ---------- camada do tour ---------- */
  let passos = [], idx = 0, aoFim = null, ouvinte = null, reposT = null, alvoAtual = null;
  function ui() {
    let el = $q('#tour');
    if (!el) {
      el = document.createElement('div'); el.id = 'tour';
      el.innerHTML = `<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-live="polite"></div>`;
      document.body.appendChild(el);
      addEventListener('resize', reposicionar); addEventListener('scroll', reposicionar, true);
    }
    return el;
  }
  function fechar(concluiu) {
    const el = $q('#tour'); if (el) el.remove();
    removeEventListener('resize', reposicionar); removeEventListener('scroll', reposicionar, true);
    soltar(); clearInterval(reposT);
    const cb = aoFim; aoFim = null; passos = [];
    if (cb) cb(!!concluiu);
  }
  function soltar() { if (ouvinte) { ouvinte.el.removeEventListener('click', ouvinte.fn, true); ouvinte = null; } }

  async function esperar(fn, ms = 3500) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const e = fn(); if (visivel(e)) return e; await new Promise(r => setTimeout(r, 120)); }
    return null;
  }

  function reposicionar() {
    const el = $q('#tour'); if (!el) return;
    const hole = el.querySelector('.tour-hole'), card = el.querySelector('.tour-card');
    const W = innerWidth, H = innerHeight;
    if (alvoAtual && visivel(alvoAtual)) {
      const r = alvoAtual.getBoundingClientRect(), p = 6;
      Object.assign(hole.style, { display: 'block', left: r.left - p + 'px', top: r.top - p + 'px', width: r.width + p * 2 + 'px', height: r.height + p * 2 + 'px' });
      const cw = Math.min(340, W - 24); card.style.width = cw + 'px';
      const ch = card.offsetHeight;
      let top = r.bottom + 14; if (top + ch > H - 10) top = r.top - ch - 14; if (top < 10) top = Math.max(10, H - ch - 10);
      let left = r.left + r.width / 2 - cw / 2; left = Math.max(12, Math.min(left, W - cw - 12));
      Object.assign(card.style, { left: left + 'px', top: top + 'px', transform: 'none' });
      el.classList.remove('centro');
    } else {
      hole.style.display = 'none'; card.style.width = Math.min(380, W - 24) + 'px';
      Object.assign(card.style, { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' });
      el.classList.add('centro');
    }
  }

  async function mostrar(i) {
    soltar(); idx = i;
    const p = passos[i]; if (!p) return fechar(true);
    if (p.antes) await p.antes();
    let alvo = null;
    if (p.el) {
      alvo = await esperar(p.el, p.espera || 3500);
      if (!alvo && p.pularSeNaoAchar) return mostrar(i + 1);
    }
    alvoAtual = alvo;
    if (alvo) alvo.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const el = ui(), card = el.querySelector('.tour-card');
    const total = passos.length, acao = p.toque && alvo;
    card.innerHTML = `
      <div class="tour-top"><span class="tour-n">${i + 1} de ${total}</span><button class="tour-x" data-t="sair" aria-label="Fechar tour">✕</button></div>
      ${p.titulo ? `<h4>${p.titulo}</h4>` : ''}<p>${p.texto}</p>
      ${acao ? `<div class="tour-dica">👆 ${p.toque === true ? 'Toque no item destacado para continuar' : p.toque}</div>` : ''}
      <div class="tour-bar"><i style="width:${Math.round((i + 1) / total * 100)}%"></i></div>
      <div class="tour-acts">
        ${i > 0 && !p.semVoltar ? '<button class="btn ghost sm" data-t="voltar">Voltar</button>' : '<span></span>'}
        ${acao ? '<button class="btn ghost sm" data-t="prox">Pular passo</button>' : `<button class="btn sm" data-t="prox">${p.botao || (i === total - 1 ? 'Concluir ✓' : 'Próximo')}</button>`}
      </div>`;
    card.onclick = e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      if (b.dataset.t === 'sair') fechar(false);
      else if (b.dataset.t === 'voltar') mostrar(Math.max(0, i - 1));
      else mostrar(i + 1);
    };
    if (acao) {
      const fn = () => { soltar(); setTimeout(() => mostrar(i + 1), p.depois || 350); };
      alvo.addEventListener('click', fn, true); ouvinte = { el: alvo, fn };
    }
    requestAnimationFrame(reposicionar); setTimeout(reposicionar, 400);
    clearInterval(reposT); reposT = setInterval(reposicionar, 600);
  }

  function rodar(lista, fim) { fechar(false); passos = lista; aoFim = fim; mostrar(0); }

  /* ---------- progresso salvo na conta ---------- */
  const T = () => (S.config.tour = S.config.tour || { feitos: {} });
  function marcar(chave) {
    if (me?.role !== 'admin') return;
    const t = T(); if (t.feitos[chave]) return;
    t.feitos[chave] = true; save();
  }
  const pular = chave => { const t = T(); t.pulados = t.pulados || {}; t.pulados[chave] = true; save(); go(view, true); };

  /* ---------- roteiros ---------- */
  const irPara = v => async () => { if (view !== v) { go(v); await new Promise(r => setTimeout(r, 250)); } };
  const fecharModal = async () => { if (!$q('#modal').classList.contains('hidden')) closeModal(); };

  const ROTEIROS = {
    boasVindas: () => [
      { titulo: `Bem-vindo(a), ${esc(me.nome.split(' ')[0])}! 👋`, texto: `Este é o painel da <b>${esc(S.config.negocio)}</b>. Em 1 minuto eu te mostro onde fica cada coisa. Depois, uma lista de primeiros passos te guia na configuração.`, botao: 'Começar tour', antes: irPara('dashboard') },
      { el: () => menu('dashboard'), titulo: 'Menu', texto: 'Por aqui você navega pelo app: <b>Dashboard</b>, <b>Agenda</b>, <b>Vendas</b>, <b>Financeiro</b> e, em <b>Mais</b>, estoque, clientes, equipe e ajustes.' },
      { el: () => $q('.grid.kpis'), titulo: 'Seu negócio num relance', texto: 'Faturamento de hoje, entradas, saídas e lucro do mês. Tudo é calculado sozinho conforme você usa.' },
      { el: () => porTexto('+ Agendamento', $q('.top')), titulo: 'Marcar um horário', texto: 'Use este botão para agendar quem ligou ou chegou no balcão. Quem agenda pelo seu link aparece aqui automaticamente, com a marca 📱.' },
      { el: () => menu('agenda'), titulo: 'Agenda', texto: 'Os atendimentos de cada dia. Ao terminar, toque em <b>Concluir</b>: o valor entra no caixa com a forma de pagamento.' },
      { el: () => menu('vendas'), titulo: 'Vendas', texto: 'Venda produtos (pomada, esmalte, shampoo…). O estoque baixa e o dinheiro entra no financeiro sozinhos.' },
      { el: () => menu('financeiro'), titulo: 'Financeiro', texto: 'Entradas e saídas do mês, despesas como aluguel e luz, e relatório em planilha para o contador.' },
      { el: () => $q('#passos'), titulo: 'Primeiros passos', texto: 'Siga esta lista para deixar tudo pronto. Toque em <b>Me mostra</b> em qualquer item e eu te guio na tela, passo a passo.', pularSeNaoAchar: true, botao: 'Vamos lá!' }
    ],
    empresa: () => [
      { antes: irPara('config'), el: () => porTexto('Dados da empresa', $q('.empresa-card')), titulo: 'Dados da empresa', texto: 'Aqui ficam o nome, a logo, o CNPJ e o endereço. Os clientes veem a logo e o endereço na hora de agendar.', toque: 'Toque em "Dados da empresa"' },
      { el: doModal('.logo-up'), titulo: 'Sua logomarca', texto: 'Toque em <b>Enviar logo</b> e escolha a imagem do celular. PNG sem fundo fica mais bonito.' },
      { el: () => campo('negocio'), titulo: 'Nome da empresa', texto: 'É o nome que aparece para os clientes no link de agendamento.' },
      { el: () => campo('cnpj'), titulo: 'CNPJ e CPF', texto: 'Opcional. O app confere se os números estão certos. CPF e CNPJ nunca aparecem para os clientes.' },
      { el: () => campo('cep'), titulo: 'Endereço', texto: 'Digite o CEP que a rua, o bairro e a cidade são preenchidos sozinhos. Depois é só colocar o número.' },
      { el: doModal('.modal-foot .btn:last-child'), titulo: 'Salvar', texto: 'Quando terminar, toque em <b>Salvar</b>.', toque: 'Toque em "Salvar" quando terminar', espera: 60000 }
    ],
    horarios: () => [
      { antes: async () => { await fecharModal(); await irPara('config')(); }, el: () => $q('#fc'), titulo: 'Horário de atendimento', texto: 'Defina que horas abre e fecha, o intervalo entre horários e os dias que você atende. Os clientes só conseguem marcar dentro disso.' },
      { el: () => $q('#fc .btn.block'), titulo: 'Salvar', texto: 'Ajuste e toque em <b>Salvar ajustes</b>.', toque: 'Toque em "Salvar ajustes"' }
    ],
    servicos: () => [
      { antes: irPara('servicos'), el: () => $q('.main .card'), titulo: 'Seus serviços', texto: 'Já deixamos os serviços mais comuns do seu ramo. Toque em ✏️ para mudar preço e duração, ou desative o que você não faz.' },
      { el: () => porTexto('+ Serviço', $q('.top')), titulo: 'Novo serviço', texto: 'Use <b>+ Serviço</b> para incluir outro. A duração é importante: é ela que evita horários encavalados.', botao: 'Entendi' }
    ],
    equipe: () => [
      { antes: irPara('equipe'), el: () => porTexto('+ Funcionário', $q('.top')), titulo: 'Criar usuário para funcionário', texto: 'Cada funcionário pode ter o próprio acesso: ele vê só a agenda dele e é avisado dos clientes dele.', toque: 'Toque em "+ Funcionário"' },
      { el: () => campo('nome'), titulo: 'Nome', texto: 'Digite o nome do funcionário. Os clientes poderão escolher com quem querem ser atendidos.' },
      { el: doModal('#boxAcc'), titulo: 'Usuário e senha', texto: 'O usuário é sugerido a partir do nome. Crie uma senha. Ele vai entrar em <b>/entrar</b> com esses dados.' },
      { el: doModal('.modal-foot .btn:last-child'), titulo: 'Salvar', texto: 'Toque em <b>Salvar</b>. Em seguida aparece a mensagem pronta para mandar o acesso no WhatsApp dele.', toque: 'Toque em "Salvar"', espera: 60000 }
    ],
    venda: () => [
      { antes: async () => { await fecharModal(); await irPara('vendas')(); }, el: () => porTexto('+ Nova venda', $q('.top')), titulo: 'Fazer uma venda', texto: 'Vamos registrar a venda de um produto.', toque: 'Toque em "+ Nova venda"' },
      { el: () => campo('quem'), titulo: 'Cliente', texto: 'Opcional: digite o nome do cliente. Aparecem sugestões de quem já está cadastrado.' },
      { el: doModal('#lines'), titulo: 'Produto e quantidade', texto: 'Escolha o produto, a quantidade e confira o preço. Use <b>+ item</b> para vender mais de um produto.' },
      { el: () => campo('pag'), titulo: 'Forma de pagamento', texto: 'Pix, dinheiro, débito ou crédito. Isso aparece separado no financeiro.' },
      { el: doModal('.modal-foot .btn:last-child'), titulo: 'Registrar', texto: 'Toque em <b>Registrar venda</b>: o estoque baixa e o valor entra no caixa.', toque: 'Toque em "Registrar venda"', espera: 60000 }
    ],
    agendar: () => [
      { antes: async () => { await fecharModal(); await irPara('agenda')(); }, el: () => porTexto('+ Agendamento', $q('.top')), titulo: 'Marcar um horário', texto: 'Para clientes que ligam ou chegam no balcão.', toque: 'Toque em "+ Agendamento"' },
      { el: () => campo('clienteId'), titulo: 'Cliente', texto: 'Escolha um cliente cadastrado ou deixe "avulso" e digite nome e telefone.' },
      { el: () => campo('servicoId'), titulo: 'Serviço', texto: 'O valor e a duração vêm do serviço escolhido.' },
      { el: () => campo('hora'), titulo: 'Data e horário', texto: 'Só aparecem os horários livres daquele dia e profissional.' },
      { el: doModal('.modal-foot .btn:last-child'), titulo: 'Agendar', texto: 'Toque em <b>Agendar</b>. Depois, na Agenda, use <b>Concluir</b> quando o atendimento terminar.', toque: 'Toque em "Agendar"', espera: 60000 }
    ],
    notificacoes: () => [
      { antes: async () => { await fecharModal(); await irPara('config')(); }, el: () => porTexto('neste aparelho', $q('.main')), titulo: 'Avisos no celular', texto: 'Ative para receber uma notificação a cada cliente que agendar ou cancelar, mesmo com o app fechado. Faça isso em cada aparelho que você usa.', toque: 'Toque em "Ativar neste aparelho"', depois: 900 },
      { titulo: 'Pronto!', texto: 'Se o navegador perguntar, toque em <b>Permitir</b>. Um aviso de teste chega em seguida.' }
    ],
    link: () => [
      { antes: async () => { await fecharModal(); await irPara('config')(); }, el: () => $q('.share'), titulo: 'Seu link de agendamento', texto: 'Este é o endereço que seus clientes usam para marcar horário sozinhos. Copie e coloque na bio do Instagram.' },
      { el: () => porTexto('Enviar no WhatsApp', $q('.main')), titulo: 'Mandar para os clientes', texto: 'Toque aqui para enviar o link pelo WhatsApp para seus clientes ou grupos.', toque: 'Toque em "Enviar no WhatsApp"' }
    ],
    funcionario: () => [
      { titulo: `Olá, ${esc(me.nome.split(' ')[0])}! 👋`, texto: `Este é o seu acesso na <b>${esc(S.config.negocio)}</b>. Aqui você vê e cuida da sua agenda.`, botao: 'Mostrar como funciona', antes: irPara('agenda') },
      { el: () => menu('agenda'), titulo: 'Minha agenda', texto: 'Seus atendimentos do dia. Ao terminar, toque em <b>Concluir</b> e informe a forma de pagamento.' },
      { el: () => porTexto('+ Agendamento', $q('.top')), titulo: 'Marcar horário', texto: 'Para marcar um cliente na sua agenda.' },
      { el: () => menu('resumo'), titulo: 'Meu mês', texto: 'Quantos atendimentos você fez e quanto faturou. Lá também você <b>ativa as notificações</b> para saber de cada cliente novo.' },
      { el: () => menu('perfil'), titulo: 'Perfil', texto: 'Troque a sua senha quando quiser.', botao: 'Concluir ✓' }
    ]
  };

  // Ao terminar um roteiro de tarefa, ele já conta como feito (alguns também se confirmam pelos dados).
  function iniciar(nome) {
    const r = ROTEIROS[nome]; if (!r) return;
    rodar(r(), concluiu => {
      if (nome === 'boasVindas' || nome === 'funcionario') return;
      if (concluiu && ['horarios', 'servicos', 'notificacoes', 'link'].includes(nome)) marcar(nome);
      if (view === 'dashboard') go('dashboard', true);
    });
  }

  /* ---------- lista "Primeiros passos" no Dashboard ---------- */
  const ITENS = [
    ['empresa', '🏢', 'Dados da empresa e logo', 'Nome, logo, CNPJ e endereço.', () => { const e = S.config.empresa || {}; return !!(e.logo || e.cnpj || e.rua); }],
    ['horarios', '🕘', 'Horário de atendimento', 'Que horas abre, fecha e os dias.', () => false],
    ['servicos', '✂️', 'Conferir serviços e preços', 'Ajuste para os seus valores.', () => false],
    ['equipe', '🧑‍💼', 'Criar usuário de funcionário', 'Cada um com a própria agenda.', () => S.users.some(u => u.role === 'func')],
    ['agendar', '📅', 'Marcar o primeiro horário', 'Como agendar pelo balcão.', () => S.agendamentos.length > 0],
    ['venda', '🛍️', 'Fazer uma venda', 'Produto, pagamento e estoque.', () => S.vendas.length > 0],
    ['notificacoes', '🔔', 'Ativar notificações', 'Aviso a cada cliente que agendar.', () => window.Notification?.permission === 'granted'],
    ['link', '🔗', 'Enviar o link aos clientes', 'Para eles agendarem sozinhos.', () => false]
  ];
  const feito = ([k, , , , auto]) => { const t = S.config.tour || {}; return !!(t.feitos?.[k] || t.pulados?.[k] || auto()); };

  function blocoPassos() {
    if (me?.role !== 'admin') return '';
    const t = S.config.tour || {};
    if (t.ocultarPassos) return '';
    const total = ITENS.length, ok = ITENS.filter(feito).length;
    if (ok === total && t.concluidoEm) return '';
    if (ok === total && !t.concluidoEm) { T().concluidoEm = new Date().toISOString(); save(); }
    return `<div class="card passos" id="passos">
      <div class="passos-h"><div><h3 style="margin:0">🚀 Primeiros passos</h3><div class="mut small">${ok === total ? 'Tudo pronto! Seu app está configurado. 🎉' : `${ok} de ${total} concluídos · toque em <b>Me mostra</b> e eu te guio`}</div></div>
        <button class="icon-btn" title="Esconder" onclick="Tour.ocultar()">✕</button></div>
      <div class="passos-bar"><i style="width:${Math.round(ok / total * 100)}%"></i></div>
      <div class="passos-l">${ITENS.map(it => {
        const [k, ic, tit, desc] = it, f = feito(it);
        return `<div class="passo ${f ? 'ok' : ''}"><span class="pi">${f ? '✓' : ic}</span><div class="grow"><b>${tit}</b><span>${desc}</span></div>
          ${f ? '' : `<button class="btn sm" onclick="Tour.iniciar('${k}')">Me mostra</button><button class="icon-btn" title="Marcar como feito" onclick="Tour.pular('${k}')">☑︎</button>`}</div>`;
      }).join('')}</div></div>`;
  }

  /* ---------- quando a pessoa entra ---------- */
  function aoEntrar() {
    if (me?.role === 'admin') {
      const t = T();
      if (!t.inicio) { t.inicio = new Date().toISOString(); save(); setTimeout(() => iniciar('boasVindas'), 700); }
    } else if (me?.role === 'func') {
      const k = 'agendapro_tour_func_' + me.id;
      let visto = false; try { visto = localStorage.getItem(k); } catch { }
      if (!visto) { try { localStorage.setItem(k, '1'); } catch { } setTimeout(() => iniciar('funcionario'), 700); }
    }
  }

  window.Tour = {
    iniciar, aoEntrar, blocoPassos, marcar, pular, fechar,
    ocultar() { T().ocultarPassos = true; save(); go(view, true); toast('Você pode reabrir em Ajustes → Tutorial'); },
    mostrarPassos() { const t = T(); t.ocultarPassos = false; delete t.concluidoEm; save(); go('dashboard'); }
  };
})();
