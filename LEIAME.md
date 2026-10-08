# AgendaPro Beleza — agendamento online (multiempresa)

Barbearia · Lash (extensão de cílios) · Manicure & Pedicure · Salão / Cabeleireira

Você vende acessos. Cada assinante ganha **um link próprio** (ex.: `seusite.com/barbearia-do-joao`), com dados totalmente separados.
Os clientes dele agendam por esse link, de casa, e o horário aparece na hora no painel do assinante.

| Endereço | Quem usa |
|---|---|
| `/` | **Site de vendas** (botões de WhatsApp para (61) 99252-2517) |
| `/central` | **Só você.** Cria, renova, bloqueia e exclui assinantes |
| `/entrar` | Dono **e funcionários** entram com usuário e senha |
| `/nome-do-negocio` | Link do assinante: painel dele e agendamento dos clientes dele |

## Central de Acessos (/central)
Login definido por variáveis de ambiente no Render:

| Variável | Exemplo |
|---|---|
| `CENTRAL_USUARIO` | `cleyton` (se não definir, é `admin`) |
| `CENTRAL_SENHA` | uma senha forte só sua — **obrigatória** |
| `SUPORTE_WHATSAPP` | `5561999999999` (aparece para assinantes vencidos/bloqueados) |

Na Central você:
- **+ Novo assinante:** nome do negócio, **nicho**, link, dono, WhatsApp, **usuário**, **senha** (botão 🎲 gera uma), vencimento e valor mensal. Ao criar, aparece a **mensagem de boas-vindas** pronta para enviar no WhatsApp.
- **Renovar:** +30/90/180/365 dias (soma ao vencimento atual; se estava vencido/bloqueado, libera na hora).
- **Editar:** nome, nicho, usuário, vencimento, valor, observação.
- **⋯** : redefinir senha, cobrar no WhatsApp, bloquear/desbloquear, baixar backup, excluir.
- Vencido ou bloqueado: o painel do assinante e a agenda online ficam suspensos (os dados continuam guardados). Faltando 5 dias, o assinante vê um aviso para renovar.

## Teste grátis de 3 dias (pelo site)
- No site, a pessoa preenche nome completo, nome da loja, ramo, WhatsApp, e-mail e cria uma senha.
- A conta é criada na hora (aparece na Central com a marca **Teste grátis** e "via site") e ela já entra no painel. O login é o e-mail.
- O painel mostra "faltam X dias" e o botão **Assinar agora** (abre o seu WhatsApp).
- Ao fim dos 3 dias o acesso é bloqueado (dono, funcionários e agenda online). Os dados ficam guardados.
- Para liberar: Central → **Ativar plano** (+30/90/180/365 dias). O mesmo bloqueio vale para qualquer assinante com vencimento.
- O mesmo e-mail ou WhatsApp não consegue criar outro teste.

## Pagamento por Pix
- **Assinar agora** (site, banner do teste, tela de acesso pausado e Ajustes → Assinatura) abre a tela de Pix com QR Code, código copia e cola e a chave.
- Planos: **Mensal R$ 49,90** e **Anual R$ 399,90** (promoção: de R$ 598,80, economia de R$ 198,90 / 33%).
- **Já paguei** abre o WhatsApp (61) 99252-2517 com a mensagem pronta para anexar o comprovante e avisa a Central (💰 "informou Pix").
- Conferiu o comprovante? Central → **Ativar plano / Renovar** (o período já vem marcado: 30 ou 365 dias).
- Os códigos Pix ficam em `public/assinar.js` (gerados a partir da sua chave, com o valor de cada plano).

## Sinal no Pix ao agendar (ex.: 30%)
- App do dono → **Ajustes → 💠 Pix e sinal**: tipo e chave Pix, nome de quem recebe, cidade e o **% padrão do sinal** (vem 30%).
- Em **Serviços**, cada serviço pode ter o próprio % (vazio = padrão, 0 = sem sinal).
- O cliente vê o valor do sinal e a regra de cancelamento antes de confirmar. Depois de agendar, aparece o **QR Code Pix**, o **copia e cola** (já com o valor) e a sua chave. O botão **Já paguei** abre o seu WhatsApp para ele mandar o comprovante e avisa você.
- Na Agenda e no Dashboard (**⚡ Precisa da sua atenção**): **✓ Sinal recebido** lança a entrada no financeiro. Ao concluir o atendimento, o app já sugere cobrar só o restante.
- Regra de cancelamento (mostrada ao cliente): cancelou **até o dia anterior** → o sinal é devolvido (você recebe o aviso "Devolver sinal" e marca **Já devolvi**, que lança a saída). Cancelou **no dia** → o sinal **não** é devolvido; para remarcar, ele faz um novo agendamento e paga o sinal de novo.
- Você recebe notificação quando o cliente agenda, informa o Pix e cancela (dizendo se precisa devolver).

## Sons
- Com o app aberto: campainha de 3 notas quando chega agendamento ou aviso, som descendente para cancelamento e um "plim" de caixa ao **concluir atendimento** (e ao confirmar o sinal).
- Com o app fechado: a notificação toca o som e vibra conforme o som de notificação do celular.
- Ajustes → **🔊 Sons** (funcionário: Perfil): ligar/desligar neste aparelho e ouvir cada som.

## Avisos para o cliente
- Em **Meus horários** o cliente toca em **Ativar avisos** e passa a receber notificação no celular quando você **cancela**, **muda o horário**, **confirma o sinal** ou **devolve o sinal**.
- Quando você cancela, aparece também o botão **💬 Avisar no WhatsApp** com a mensagem pronta (e dizendo se o sinal será devolvido).
- Ao abrir o app, o cliente vê o aviso "Horário cancelado" com o botão **Remarcar**, mesmo sem ter ativado as notificações.

## Cliente esqueceu a senha
- Na tela de entrar, o cliente toca em **Esqueci minha senha** e informa o telefone.
- Você recebe a notificação 🔑 e o pedido aparece no Dashboard e em Clientes. Toque em **Enviar nova**: o app cria uma senha nova e abre o WhatsApp do cliente com a mensagem pronta. A senha antiga deixa de valer.

## Tutorial (primeiro acesso)
- No **primeiro acesso do dono** abre um tour guiado que destaca cada parte do app (menu, painel, agendar, agenda, vendas, financeiro).
- No Dashboard fica a lista **🚀 Primeiros passos**: dados da empresa, horário, serviços, criar usuário de funcionário, marcar horário, fazer uma venda, ativar notificações e enviar o link. Cada item tem **Me mostra**, que leva até a tela certa e guia toque a toque.
- Os itens são marcados sozinhos quando a pessoa faz a tarefa. O progresso fica salvo na conta (vale em qualquer aparelho).
- Funcionários também ganham um tour curto no primeiro acesso.
- Rever depois: **Ajustes → 🎓 Tutorial** (dono) ou **Perfil → Ver tutorial** (funcionário).

## Dados da empresa e logomarca
- App do dono → **Ajustes → 🏢 Dados da empresa**: logomarca, nome, razão social, CNPJ (aceita o novo CNPJ com letras), CPF, telefone, e-mail, Instagram e endereço (o CEP preenche rua, bairro e cidade sozinho).
- A logo aparece no menu do app, na tela de login e agendamento dos clientes, na Central e vira o ícone do app quando o cliente instala.
- Os clientes veem endereço, botão **Como chegar**, WhatsApp e Instagram (dá para esconder). CPF e CNPJ nunca aparecem para clientes; funcionários não veem o CPF.

## Funcionários (Equipe)
- No app do dono: **Mais → Equipe → + Funcionário** (nome, telefone, usuário e senha).
- O funcionário entra em `/entrar`, vê **só a própria agenda**, conclui atendimentos e recebe notificação **só dos clientes dele**. Financeiro, estoque, vendas e clientes ficam só com o dono.

## Notificações da Central
- Sino 🔔 na Central: lista de avisos (novo teste grátis, vence amanhã, venceu) e botão para ativar notificação no celular.

## Rodar no seu PC (teste)
Precisa do **Node.js 18 ou mais novo**. Nenhum pacote para instalar.
```
node server.js
```
Defina a senha da Central antes de iniciar (variável `CENTRAL_SENHA`) e abra `http://localhost:3000/central`.
Os dados ficam na pasta `data/`.

## Publicar na internet (para os clientes acessarem)
O app precisa estar em um endereço **https://** para instalar no celular e mandar notificações.

### Opção A — Render + Neon (gratuito para começar)
1. Suba esta pasta para um repositório no **GitHub**.
2. Em **neon.tech**, crie um banco PostgreSQL e copie a *connection string* (`postgresql://...`).
3. Em **render.com** → *New → Web Service* → escolha o repositório.
   - Build command: `npm install`
   - Start command: `node server.js`
   - Environment → `DATABASE_URL` (connection string do Neon), `CENTRAL_SENHA`, `CENTRAL_USUARIO` e `SUPORTE_WHATSAPP`
   - (opcional) `PUSH_EMAIL` = seu e-mail
4. O Render dá um endereço tipo `https://sua-barbearia.onrender.com`. Pronto.

> No plano gratuito do Render o servidor "dorme" depois de um tempo sem uso, e a primeira abertura pode demorar cerca de 1 minuto. Para uso profissional, use um plano pago (sem esse atraso). Confira os preços atuais nos sites.

### Opção B — VPS / servidor próprio
`node server.js` (use `pm2` ou um serviço do sistema para manter ligado) atrás de um HTTPS (Nginx + Let's Encrypt, ou Cloudflare).
Sem `DATABASE_URL`, os dados ficam na pasta `data/`. Defina `DATA_DIR` para mudar a pasta e faça backup dela.

| Variável | Para quê |
|---|---|
| `PORT` | porta (padrão 3000; Render define sozinho) |
| `DATABASE_URL` | usar PostgreSQL em vez do arquivo |
| `DATA_DIR` | pasta dos dados quando não usar PostgreSQL |
| `CENTRAL_USUARIO` / `CENTRAL_SENHA` | login da Central |
| `SUPORTE_WHATSAPP` | seu WhatsApp de suporte (55 + DDD + número) |
| `PUSH_EMAIL` | e-mail de contato nas notificações push |

## Vendeu um acesso? Passo a passo
1. Entre em `/central` → **+ Novo assinante**.
2. Preencha nome do negócio, escolha o **nicho**, usuário, senha e vencimento → **Criar acesso**.
3. Toque em **Enviar no WhatsApp** — o comprador recebe link, usuário e senha.
4. O assinante entra, vai em **Ajustes → Ativar notificações** e manda o link dele para os clientes.

> Se você já tinha configurado uma empresa na versão anterior, ela é migrada automaticamente e aparece na Central (sem vencimento).

## Funções
- **Cliente:** cadastro com telefone e senha, esqueci minha senha, sinal no Pix, agendamento só em horários realmente livres (o servidor confere e bloqueia horário duplicado), meus horários, cancelar, perfil. Limite de 5 horários futuros por cliente.
- **Dono:** dashboard, agenda (com marca 📱 nos agendamentos feitos pelo app e destaque para os novos), concluir atendimento lançando no financeiro, vendas, compras, estoque, financeiro com CSV, clientes (bloquear acesso), serviços, profissionais, horários e dias de funcionamento, backup.
- O painel atualiza sozinho a cada 15 segundos e sempre que você volta para o app.

## Segurança
- Senhas guardadas com *scrypt* (não dá para ler a senha nem no banco).
- O cliente só enxerga os próprios horários; financeiro, estoque e lista de clientes só para o administrador.
- Bloqueio de 15 minutos após 10 tentativas de login erradas.

## Arquivos
- `server.js` — servidor e API (multiempresa)
- `webpush.js` — notificações push (sem bibliotecas externas)
- `public/` — o app (PWA): `index.html`, `app.js`, `style.css`, `sw.js`, ícones
- `public/central.html` + `central.js` — a Central de Acessos
- `public/nichos.js` — serviços e produtos padrão de cada nicho
- `public/tutorial.mp4` + `tutorial.jpg` — vídeo tutorial (aparece no site, seção **Vídeo**)
- `public/site.html` — site de vendas. Para mostrar o preço, edite `preco: ''` no fim do arquivo (hoje: `preco: '49,90'`)
