# AgendaPro Beleza — PWA

App de gestão para **barbearia, lash (extensão de cílios), manicure/pedicure e salão/cabeleireira**.

## Como usar
1. Hospede a pasta inteira em qualquer servidor com **HTTPS** (GitHub Pages, Netlify, Vercel ou seu próprio servidor). O PWA só instala e funciona offline em HTTPS ou `localhost`.
2. Abra o endereço. No **primeiro acesso** você escolhe o nicho, o nome do estabelecimento e cria o login do administrador.
3. No celular: menu do navegador → **"Adicionar à tela inicial" / "Instalar app"**.

Para testar no PC: dentro da pasta rode `npx serve` ou `python -m http.server 8080` e abra `http://localhost:8080`.

## O que tem
- **Login e senha** (senhas guardadas com hash SHA-256). Dois perfis:
  - **Administrador**: tudo abaixo.
  - **Cliente**: se cadastra sozinho (nome, telefone, senha), agenda escolhendo serviço → profissional → dia → horário livre, vê e cancela os próprios horários.
- **Dashboard**: faturamento do dia, entradas/saídas/lucro do mês, ticket médio, clientes novos, gráfico de 14 dias, próximos atendimentos, ranking de serviços, alerta de estoque baixo.
- **Agenda**: por dia e por profissional, sem choque de horários (respeita a duração do serviço), editar, cancelar, concluir (lança a entrada no financeiro com forma de pagamento) e botão de confirmação por WhatsApp.
- **Vendas** de produtos (baixa no estoque + entrada no financeiro).
- **Compras** de fornecedores (entrada no estoque, atualiza custo + saída no financeiro).
- **Estoque**: custo, preço de venda, mínimo, ajuste manual (uso em atendimento/perda), produtos de uso interno.
- **Financeiro**: entradas e saídas por mês, por forma de pagamento e por categoria, lançamentos manuais (aluguel, luz, comissões…) e exportação CSV (abre no Excel).
- **Clientes**: histórico de visitas e quanto cada um gastou.
- **Serviços**: preço e duração; já vem com a lista padrão do nicho escolhido.
- **Ajustes**: horário de funcionamento, dias de atendimento, intervalo da agenda, profissionais, troca de senha, backup/restauração e troca de nicho.

## Importante: onde ficam os dados
Nesta versão os dados ficam **no aparelho onde o app é usado** (localStorage). Ou seja, o cliente agendando no celular dele **não aparece** no celular do dono até existir um servidor.
Para clientes agendarem de seus próprios celulares, é preciso um back-end (Node.js + banco, ou Firebase/Supabase). Todo o acesso aos dados passa pelas funções `load()` e `save()` em `app.js`, então é só trocá-las por chamadas à API.

## Arquivos
- `index.html` — página do app
- `app.js` — toda a lógica
- `style.css` — visual (a cor muda conforme o nicho)
- `manifest.json`, `sw.js`, `icons/` — partes do PWA (instalação e offline)
