# AgendaPro Beleza — agendamento online (multiempresa)

Barbearia · Lash (extensão de cílios) · Manicure & Pedicure · Salão / Cabeleireira

Você vende acessos. Cada assinante ganha **um link próprio** (ex.: `seusite.com/barbearia-do-joao`), com dados totalmente separados.
Os clientes dele agendam por esse link, de casa, e o horário aparece na hora no painel do assinante.

| Endereço | Quem usa |
|---|---|
| `/central` | **Só você.** Cria, renova, bloqueia e exclui assinantes |
| `/` | Assinante entra com usuário e senha e cai no painel dele |
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
- **Cliente:** cadastro com telefone e senha, agendamento só em horários realmente livres (o servidor confere e bloqueia horário duplicado), meus horários, cancelar, perfil. Limite de 5 horários futuros por cliente.
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
