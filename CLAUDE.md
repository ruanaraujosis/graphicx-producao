# Smart Produção 2.0 — GRAPHICX / Smart Gráfica

Sistema de gestão da gráfica (comunicação visual / acrílico): pedidos, aprovação de artes, PCP,
estoque com ficha técnica, financeiro, NF-e, dashboard de TV e marketplaces (Shopee primeiro;
Magalu e TikTok Shop depois). Substitui o sistema atual (referência só de visual e fluxos).

**Estado atual: só especificação, sem código ainda.** A especificação completa está em `PROMPT.md`.
Não leia o arquivo inteiro: abra só a seção da tarefa (use Grep pelo título `##`/`###`):

| Tarefa | Seção do `PROMPT.md` |
|---|---|
| Cores/tokens, tema escuro | `Identidade visual` |
| Layout, mobile, PWA | `Requisitos de interface` |
| Perfis e RLS | `Perfis e permissões` |
| Cada módulo | `### 1. Cadastros` … `### 9. Dashboard para TV` |
| Shopee / adapters | `Integrações com Marketplaces` |
| Git, CI, branches | `Versionamento e repositório` |
| Ordem de entrega | `Entregas por fases` |

## Stack (obrigatória)

Next.js App Router + React + TypeScript strict · Tailwind + shadcn/ui · Supabase (Postgres, Auth,
RLS, Realtime, Storage, Edge Functions) · Vercel (deploy, Cron) · Zod · React Hook Form · TanStack Query.
Fuso `America/Sao_Paulo`, moeda BRL, interface 100% pt-BR.

## Regras que não se negociam

- **Repositório público**: nunca versionar senhas, tokens, chaves, dados de clientes, dumps ou artes.
  Segredos só em `.env.local` (ignorado), variáveis da Vercel/Supabase ou GitHub Secrets.
  Variável nova → adicionar em `.env.example` sem valor.
- Credenciais do sistema antigo nunca vão para código, `.env` versionado ou docs.
- `SUPABASE_SERVICE_ROLE_KEY` só no servidor; nunca em código de cliente nem em `NEXT_PUBLIC_*`.
- RLS em **todas** as tabelas. Banco só muda por migration em `supabase/migrations/`.
- Rotas públicas (link de arte, webhooks) com token assinado, validação de assinatura e rate limit.
- Integrações via interface `MarketplaceAdapter` — o núcleo não conhece API de canal específico.
- Regras fiscais configuráveis (preparadas para IBS/CBS), nunca fixas no código.
- Decisões de negócio (provedor de NF-e, regime tributário, preço por canal, metas): **pergunte**.
- Antes de codar uma fase: apresentar modelo de dados (tabelas, relações, RLS) + plano de telas para aprovação.

## Git

- `main` = produção (só via PR com CI verde), `develop` = homologação, trabalho em `feat/*`, `fix/*`, `chore/*`.
- Conventional Commits em português, pequenos (`feat:`, `fix:`, `chore:`, `docs:`…).

## Comandos

Ainda não há `package.json`. Ao criar a fundação, registre aqui os comandos de dev, lint,
typecheck, testes (Vitest/Playwright) e migrations — uma linha cada.

## Economia de contexto

- Mantenha este arquivo curto; detalhe novo vai para `docs/` com uma linha de referência aqui.
- Prefira Grep/leitura parcial a abrir arquivos grandes inteiros.
