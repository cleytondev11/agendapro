# AgendaPro Beleza — agendamento online

Barbearia · Lash (extensão de cílios) · Manicure & Pedicure · Salão / Cabeleireira

O **cliente agenda pelo celular dele, de casa**, e o horário aparece **na hora** no painel do dono, com som, aviso na tela e notificação no celular (mesmo com o app fechado).

```
Cliente (celular dele)  ──►  SERVIDOR (este projeto)  ◄──  Dono (painel)
   cria conta, agenda          guarda tudo num só lugar       vê agenda, financeiro,
   vê / cancela horários       avisa o dono (push)            estoque, compras, vendas
```

## Rodar no seu PC (teste)
Precisa do **Node.js 18 ou mais novo**. Nenhum pacote para instalar.
```
node server.js
```
Abra `http://localhost:3000`. No primeiro acesso você escolhe o nicho e cria o login do administrador.
Os dados ficam em `data/db.json`.

## Publicar na internet (para os clientes acessarem)
O app precisa estar em um endereço **https://** para instalar no celular e mandar notificações.

### Opção A — Render + Neon (gratuito para começar)
1. Suba esta pasta para um repositório no **GitHub**.
2. Em **neon.tech**, crie um banco PostgreSQL e copie a *connection string* (`postgresql://...`).
3. Em **render.com** → *New → Web Service* → escolha o repositório.
   - Build command: `npm install`
   - Start command: `node server.js`
   - Environment → adicione `DATABASE_URL` = a connection string do Neon
   - (opcional) `PUSH_EMAIL` = seu e-mail
4. O Render dá um endereço tipo `https://sua-barbearia.onrender.com`. Pronto.

> No plano gratuito do Render o servidor "dorme" depois de um tempo sem uso, e a primeira abertura pode demorar cerca de 1 minuto. Para uso profissional, use um plano pago (sem esse atraso). Confira os preços atuais nos sites.

### Opção B — VPS / servidor próprio
`node server.js` (use `pm2` ou um serviço do sistema para manter ligado) atrás de um HTTPS (Nginx + Let's Encrypt, ou Cloudflare).
Sem `DATABASE_URL`, os dados ficam em `data/db.json`. Defina `DATA_DIR` para mudar a pasta e faça backup dela.

| Variável | Para quê |
|---|---|
| `PORT` | porta (padrão 3000; Render define sozinho) |
| `DATABASE_URL` | usar PostgreSQL em vez do arquivo |
| `DATA_DIR` | pasta do `db.json` quando não usar PostgreSQL |
| `PUSH_EMAIL` | e-mail de contato nas notificações push |

## Depois de publicar
1. Entre como administrador → **Ajustes**.
2. **Ativar notificações neste aparelho** (no iPhone: antes adicione o app à Tela de Início, iOS 16.4+).
3. Copie o **link de agendamento** ou toque em **Enviar no WhatsApp** e mande para seus clientes / coloque no Instagram.
4. Cliente abre o link → **Criar conta** (nome, telefone, senha) → escolhe serviço, profissional, dia e horário → confirma.

## Funções
- **Cliente:** cadastro com telefone e senha, agendamento só em horários realmente livres (o servidor confere e bloqueia horário duplicado), meus horários, cancelar, perfil. Limite de 5 horários futuros por cliente.
- **Dono:** dashboard, agenda (com marca 📱 nos agendamentos feitos pelo app e destaque para os novos), concluir atendimento lançando no financeiro, vendas, compras, estoque, financeiro com CSV, clientes (bloquear acesso), serviços, profissionais, horários e dias de funcionamento, backup.
- O painel atualiza sozinho a cada 15 segundos e sempre que você volta para o app.

## Segurança
- Senhas guardadas com *scrypt* (não dá para ler a senha nem no banco).
- O cliente só enxerga os próprios horários; financeiro, estoque e lista de clientes só para o administrador.
- Bloqueio de 15 minutos após 10 tentativas de login erradas.

## Arquivos
- `server.js` — servidor e API
- `webpush.js` — notificações push (sem bibliotecas externas)
- `public/` — o app (PWA): `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.json`, ícones
