# GraphicX

Plataforma SaaS de gestão para gráficas: pedidos, aprovação de artes, produção (PCP), estoque, financeiro, NF-e, dashboard para TV e integração com a Shopee. Multi-empresa: cada gráfica cliente (ex.: Smart Gráfica) tem seus dados isolados.

**Stack:** Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 + shadcn/ui · Supabase · Vercel

A especificação completa está em [PROMPT.md](PROMPT.md).

## Rodando localmente

Requisitos: Node 22+ e um projeto no [Supabase](https://supabase.com) (o plano grátis serve para desenvolvimento).

1. **Instale as dependências**

   ```bash
   npm install
   ```

2. **Configure as variáveis de ambiente.** Copie `.env.example` para `.env.local` e preencha com os dados do seu projeto Supabase (_Project Settings → API Keys_):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`)
   - `SUPABASE_SECRET_KEY` (`sb_secret_...`): **somente no servidor**

3. **Crie as tabelas** aplicando as migrations no projeto:

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npm run db:push
   ```

4. **Configure o Auth no painel do Supabase:**
   - _Authentication → Sign In / Providers_: desligue **Allow new users to sign up**. As contas são criadas só pelos administradores.
   - _Authentication → URL Configuration_: em **Site URL**, coloque `http://localhost:3000`; em **Redirect URLs**, adicione `http://localhost:3000/auth/confirm` (link de "Esqueci minha senha").
   - _Authentication → Multi-Factor_: confirme que **TOTP (App Authenticator)** está habilitado.

5. **Crie a primeira gráfica e o SuperAdmin.** Preencha no `.env.local` `ORG_NAME` (ex.: `Smart Gráfica`), `ORG_SLUG` (ex.: `smart`), `ADMIN_FULL_NAME`, `ADMIN_USERNAME` (ex.: `ruan.diretor`), `ADMIN_EMAIL` (opcional, mas recomendado) e `ADMIN_PASSWORD`. Depois rode:

   ```bash
   npm run plataforma:iniciar
   ```

   Em seguida **apague o valor de `ADMIN_PASSWORD`** do `.env.local`. No primeiro login, o sistema pede para configurar o app autenticador (MFA).

6. **Suba o servidor** e acesse <http://localhost:3000>:

   ```bash
   npm run dev
   ```

### Scripts

| Script                                           | O que faz                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `npm run dev`                                    | Servidor de desenvolvimento                                                           |
| `npm run build` / `start`                        | Build e servidor de produção                                                          |
| `npm run lint` / `typecheck` / `format`          | ESLint, TypeScript e Prettier                                                         |
| `npm test`                                       | Testes unitários (Vitest)                                                             |
| `npm run test:e2e`                               | Testes de ponta a ponta (Playwright)                                                  |
| `npm run db:new <nome>`                          | Cria uma migration nova em `supabase/migrations/`                                     |
| `npm run db:push`                                | Aplica as migrations no projeto Supabase vinculado                                    |
| `npm run db:types`                               | Regenera `src/lib/supabase/database.types.ts` a partir do banco                       |
| `npm run plataforma:iniciar`                     | Cria a primeira gráfica e o SuperAdmin definidos no `.env.local`                      |
| `npm run plataforma:remover-grafica -- <codigo>` | Simula a remoção de uma gráfica; com `--confirmar`, remove (contas e auditoria ficam) |
| `npm run env:verificar`                          | Confere o `.env.local` sem mostrar valores (`-- --conexao` testa o Supabase)          |
| `npm run segredos:verificar`                     | Procura credenciais nos arquivos versionados (pre-commit e CI)                        |

## Arquitetura

```
src/
  app/
    (app)/            áreas logadas (layout com header, sidebar e navegação inferior)
    (auth)/           MFA, escolha de gráfica, recuperação de senha
    login/            tela de login (e-mail ou usuário + senha)
    manifest.ts       PWA instalável
  components/
    ui/               componentes base (shadcn/ui)
    kit/              componentes do sistema (KPI, badge de canal, cabeçalho...)
    shell/            moldura: navegação, menu do usuário, seletor de tema
  lib/
    auth/             perfis (RBAC), camada de acesso a dados (DAL), login
    supabase/         clientes do servidor, navegador, proxy e admin
    navigation.ts     menu por perfil
  proxy.ts            renova a sessão e redireciona quem não está logado
supabase/migrations/  schema versionado (nunca alterar o banco manualmente)
```

**Segurança em camadas:** o `proxy.ts` faz só a checagem otimista de login. Quem decide o acesso é a DAL (`src/lib/auth/dal.ts`), chamada em cada página e Server Action, e, no fim, o **RLS** do Postgres. A chave secreta do Supabase só é usada no servidor e só para o que o RLS não cobre (criar usuários no Auth).

### Multi-empresa (SaaS)

- **`organizations`**: cada gráfica cliente (tenant). **`organization_members`**: quem trabalha em qual gráfica e com qual perfil. Uma pessoa pode estar em várias gráficas, com perfis diferentes em cada uma.
- **Login único:** e-mail **ou** usuário (`nome.cargo`, único na plataforma) + senha. Quem tem uma gráfica entra direto; quem tem várias escolhe em _Escolha a gráfica_ e pode trocar pelo header.
- **Gráfica ativa:** fica num cookie httpOnly do aparelho e serve só para a interface. Quem garante o isolamento é o RLS, que confere em cada linha se a pessoa é membro da `organization_id` daquele dado e qual o perfil dela ali.
- **SuperAdmin** (`platform_admins`): gerencia gráficas e contas em `/plataforma`, mas não lê dados operacionais das gráficas.
- **MFA (app autenticador):** obrigatório para quem é admin de alguma gráfica ou SuperAdmin. O banco só concede as permissões de admin com sessão `aal2`.
- **Contas sem e-mail:** o Supabase Auth exige e-mail, então `joao.producao` vira internamente `joao.producao@usuarios.smart.local`. Esse e-mail não é exibido nem recebe mensagens, e essas pessoas recuperam a senha com o admin da gráfica.

**Toda tabela de negócio nova** precisa de `organization_id uuid not null references organizations` e de políticas como:

```sql
create policy "Membros leem" on public.pedidos for select to authenticated
  using ((select private.is_member(organization_id)));
create policy "Atendimento cria" on public.pedidos for insert to authenticated
  with check ((select private.has_permission(organization_id, 'pedidos.gerenciar')));
```

Na aplicação, use `requireOrg("pedidos.ver")` (`src/lib/auth/dal.ts`) e filtre as consultas pela `membership.organizationId`.

### Perfis configuráveis

Cada gráfica cria seus perfis em _Configurações → Perfis de acesso_, marcando **Ver** e **Gerenciar** por módulo (gerenciar inclui ver). O perfil **Administrador** é criado automaticamente, tem tudo e não pode ser alterado. Toda gráfica nova já vem com Atendimento, Designer, Produção, Expedição e Financeiro, que podem ser editados. Regras garantidas pelo banco:

- ninguém concede permissões que não tem, nem edita o próprio perfil (exceto o Administrador);
- perfis com Administrador, `equipe.gerenciar`, `configuracoes.gerenciar` ou `financeiro.gerenciar` exigem MFA;
- senha criada ou redefinida por um admin é **provisória**: no próximo login a pessoa cria a própria (`/criar-senha`).

**Auditoria:** a tabela `audit_log` registra quem alterou o quê e quando. Para auditar uma tabela nova:

```sql
create trigger minha_tabela_audit
  after insert or update or delete on public.minha_tabela
  for each row execute function private.audit_row_change();
```

**Tema:** claro, escuro ou automático (segue o aparelho), escolhido em _Meu perfil_ ou no menu do usuário. Os tokens de cor da marca ficam em `src/app/globals.css`.

## Fluxo de trabalho

- `main` → produção (protegida, só via Pull Request com CI verde)
- `develop` → homologação
- `feat/*`, `fix/*`, `chore/*` → saem de `develop` e voltam por Pull Request
- Commits no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português

O CI (`.github/workflows/ci.yml`) roda formatação, lint, tipos, testes unitários, build e valida as migrations num Postgres limpo. O E2E roda a cada merge em `develop`. As migrations são aplicadas automaticamente pelo workflow `migrations.yml` (`develop` → homologação, `main` → produção), usando os secrets dos ambientes `homologacao` e `producao` no GitHub.

### Configuração da Vercel

1. Importe o repositório na Vercel (_Add New → Project_).
2. Em _Environment Variables_, cadastre `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`, com valores diferentes para _Production_ (`main`) e _Preview_ (`develop` e PRs).
3. No Supabase, em _Authentication → URL Configuration_, adicione a URL da Vercel em _Site URL_ e _Redirect URLs_.

### Ambientes

| Ambiente      | Branch    | Endereço                                  | Banco                       |
| ------------- | --------- | ----------------------------------------- | --------------------------- |
| Produção      | `main`    | https://grapphicx.vercel.app              | Supabase de produção        |
| Homologação   | `develop` | https://graphicx-dev.vercel.app           | Supabase de desenvolvimento |
| Preview de PR | `feat/*`… | `graphicx-git-<branch>-acpark.vercel.app` | Supabase de desenvolvimento |

### Colocando a produção no ar (uma vez)

1. **Supabase:** crie um projeto novo só para produção (região São Paulo) e guarde a senha do banco num gerenciador de senhas. Em _Authentication → URL Configuration_: _Site URL_ `https://grapphicx.vercel.app` e _Redirect URLs_ `https://grapphicx.vercel.app/**`.
2. **GitHub → Settings → Environments → `producao`:** cadastre os secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` (o código do projeto de produção) e `SUPABASE_DB_PASSWORD`. O workflow `migrations.yml` aplica as migrations na produção a cada merge na `main`.
3. **Vercel → Settings → Environment Variables:** valores de **Production** apontando para o projeto de produção (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) e `NEXT_PUBLIC_APP_URL=https://grapphicx.vercel.app`. _Preview_ continua com o banco de desenvolvimento.
4. **Vercel → Settings → Domains:** `grapphicx.vercel.app` em _Production_ (branch `main`) e `graphicx-dev.vercel.app` em _Preview_ na branch `develop`.
5. **Release:** PR de `develop` para `main`. Com o CI verde, o merge publica a produção e aplica as migrations.
6. **SuperAdmin de produção:** crie `.env.producao.local` (ignorado pelo Git) com as variáveis do projeto de produção e as de `ORG_*`/`ADMIN_*`, confira com `npm run env:verificar -- --producao` e rode `npm run plataforma:iniciar:producao`. Depois apague `ADMIN_PASSWORD` desse arquivo.

### Um banco para todas as gráficas e backup por gráfica

A produção usa **um único projeto Supabase** para todas as gráficas: cada linha carrega `organization_id` e o RLS isola uma gráfica da outra.

- **Backup geral:** o plano gratuito do Supabase **não tem backup automático** e pausa o projeto após dias sem uso. Assinar o plano Pro quando as gráficas começarem a usar (backup diário e, opcionalmente, PITR).
- **Backup por gráfica:** a rotina diária (Vercel Cron em `vercel.json`, 03h de Brasília → `/api/plataforma/backups`, protegida pelo `CRON_SECRET`) gera um JSON compactado com todas as tabelas da gráfica no bucket privado `backups` e guarda os últimos 14 automáticos. O SuperAdmin acompanha e dispara backups em **Plataforma → Backups**, vendo só metadados (data, tamanho, registros) — nunca o conteúdo. Arquivos (fotos, artes) ficam no Storage, na pasta da gráfica; chaves das lojas (Vault) não entram no backup.

## Variáveis de ambiente e segredos

Veja [.env.example](.env.example). Segredos nunca entram no repositório: este repositório é **público**. As regras completas estão na skill [`segredos`](.claude/skills/segredos/SKILL.md). Proteções ativas:

- **Pre-commit e CI** (`npm run segredos:verificar`): barram commits com chaves, JWTs, chaves privadas, arquivos de ambiente e certificados. O hook do Git é ativado pelo `npm install` (`core.hooksPath = .githooks`).
- **Claude Code** (`.claude/settings.json`): um hook impede o assistente de ler arquivos de ambiente ou exibir variáveis secretas. Ele confere tudo com `npm run env:verificar`.
- **Vazou uma chave?** Troque no painel do provedor e apague a antiga. Remover do código não basta.

## Cadastrando uma nova loja/marketplace

A gráfica conecta a própria loja em **Configurações → Integrações → Conectar loja da Shopee** (autorização OAuth na Shopee; a GraphicX nunca vê a senha da loja). Os tokens ficam no **Supabase Vault**, nunca em tabela comum.

Para ativar a integração em um ambiente (uma vez, pela equipe da GraphicX):

1. **Shopee Open Platform:** crie o app (conta de desenvolvedor com CNPJ). Cadastre como _redirect_ `https://<domínio>/api/marketplaces/shopee/callback` e como _push URL_ `https://<domínio>/api/marketplaces/shopee/webhook` (aviso de mudança de status de pedido).
2. **Vercel → Environment Variables** (nunca no código):
   - `SHOPEE_PARTNER_ID` e `SHOPEE_PARTNER_KEY`: do app na Shopee;
   - `SHOPEE_ENV`: `sandbox` ou `producao` (opcional `SHOPEE_API_HOST` para outro host);
   - `CRON_SECRET`: texto aleatório com 32 caracteres ou mais; protege `/api/marketplaces/worker`.
3. **Supabase → Vault** (o relógio do banco chama o processador da fila a cada minuto):
   - `marketplace_worker_url`: `https://<domínio>/api/marketplaces/worker`;
   - `marketplace_worker_secret`: o mesmo valor do `CRON_SECRET`.
4. Confira com `npm run env:verificar`.

Sem essas variáveis, a tela mostra que a conexão "será liberada em breve" e nada é chamado.

Mensagem no chat: com a opção ligada na loja, cada pedido novo que precisa de arte recebe pelo chat da Shopee o link para enviar a arte (API Seller Chat; a Shopee precisa liberar o chat para o app).

Como funciona: avisos da Shopee e rotinas (renovação de token a cada 15 min, conferência de pedidos) viram tarefas em `marketplace_jobs`; o processador (`src/lib/marketplaces/worker.ts`) as executa com novas tentativas (espera exponencial, até 6). Cada chamada fica em `marketplace_logs`, visível na tela de Integrações.
