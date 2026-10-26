# Prompt — Smart Produção 2.0 (Sistema de Gestão para Gráfica)

## Contexto

Você vai desenvolver o novo sistema de gestão da **Smart Gráfica** (comunicação visual / acrílico), substituindo o sistema atual **Smart Produção** (https://smart-producao.acrilico.chatgpt.site/), que foi gerado sem planejamento técnico e não escala. O novo sistema deve ser completo, profissional e preparado para crescer.

Use o sistema atual **apenas como referência** de identidade visual e dos fluxos que a equipe já conhece. As credenciais de acesso ao sistema atual serão passadas à parte pelo responsável — **nunca** as grave em código, `.env` versionado ou documentação.

## Stack obrigatória

- **Next.js** (App Router, Server Components, Server Actions, Route Handlers) + **React** + **TypeScript** (strict)
- **Tailwind CSS** (+ shadcn/ui para componentes base)
- **Supabase**: Postgres, Auth, Row Level Security, Realtime, Storage, Edge Functions, `pg_cron`/filas
- **Vercel**: deploy, Cron Jobs, Route Handlers para webhooks
- Validação com **Zod**, formulários com **React Hook Form**, dados no cliente com **TanStack Query**
- Datas/fuso: `America/Sao_Paulo`; moeda BRL; interface 100% em português do Brasil

## Identidade visual (manter a mesma paleta)

Extraída do sistema atual:

| Token | Cor | Uso |
|---|---|---|
| `--background` | `#f8f7fa` | Fundo da aplicação |
| `--foreground` | `#251a2b` | Texto principal |
| `--card` | `#ffffff` | Cards, modais |
| `--primary` | `#8b1c80` | Botões e ações principais |
| `--primary-foreground` | `#ffffff` | Texto sobre primário |
| `--secondary` | `#f5eaf4` | Fundos secundários |
| `--secondary-foreground` | `#64205d` | Texto secundário |
| `--muted` | `#f3f0f4` | Áreas neutras |
| `--muted-foreground` | `#6e6270` | Texto de apoio |
| `--accent` | `#f9e6f4` | Destaques, hover |
| `--accent-foreground` | `#71246a` | Texto em destaque |
| `--destructive` | `#b62639` | Erros, cancelamentos |
| `--border` | `#e9e2ea` | Bordas |
| `--input` | `#ded2df` | Bordas de inputs |
| `--ring` | `#b6379b` | Foco |
| Header | `#391036` | Barra superior (roxo escuro) |
| Logo | `#ed47a7` | Rosa do ícone "S" |
| `--radius` | `0.8rem` | Arredondamento padrão |

Configure esses tokens como variáveis CSS no Tailwind. Crie também uma variante **escura** (usada no modo TV) derivada da mesma paleta.

## Requisitos de interface

- **Responsivo de verdade**: mobile (operadores e expedição no celular), tablet (chão de fábrica) e desktop (escritório/financeiro).
- Mobile-first, navegação inferior no celular e sidebar no desktop.
- Alvos de toque ≥ 44px, tabelas viram cards no mobile.
- PWA instalável (ícone na tela inicial do tablet/celular).
- Acessibilidade: contraste AA, navegação por teclado, labels em todos os campos.

## Perfis e permissões (RBAC via Supabase Auth + RLS)

- **Diretor/Admin**: acesso total, financeiro, configurações, integrações.
- **Atendimento/Comercial**: pedidos, clientes, orçamentos, artes.
- **Designer**: fila de artes, upload de provas, histórico de versões.
- **Produção**: painel PCP, apontamento de etapas.
- **Expedição**: separação, etiquetas, despacho, rastreio.
- **Financeiro**: contas a receber/pagar, NF-e, relatórios.

Login por usuário/senha (o sistema atual usa formato `nome.cargo`). Registre auditoria (quem alterou o quê e quando) nas tabelas críticas.

## Módulos

### 1. Cadastros
- **Clientes** (PF/PJ, CPF/CNPJ validados, endereço com busca por CEP, origem: balcão/Shopee/WhatsApp).
- **Produtos acabados** com variações (tamanho, espessura, cor, acabamento), SKU, preço por canal, descrição, fotos, NCM/CFOP/CEST, dimensões e peso para frete, **prazo de produção (dias)**.
- **Matérias-primas/insumos** (chapa de acrílico, papel sulfite 75g, vinil, tinta, etc.) com unidade de medida e custo.
- **Ficha técnica (BOM)**: cada produto acabado consome quantidades de insumos. Ex.: 10 modelos de bloco de notas consomem o mesmo papel sulfite 75g.
- Fornecedores, categorias, formas de pagamento.

### 2. Estoque
- Estoque de **produtos acabados** e de **matérias-primas**.
- Toda venda (qualquer canal, inclusive balcão) dá **baixa proporcional nos insumos** conforme a ficha técnica.
- **Disponibilidade calculada**: quantos itens podem ser produzidos com os insumos atuais → é esse número que vai para os marketplaces.
- Movimentações (entrada, saída, ajuste, perda, reserva) com histórico.
- Alerta de estoque mínimo e sugestão de compra.
- Sincronização **em tempo real** com todos os canais para evitar vender sem disponibilidade.

### 3. Pedidos
- Pedidos de todos os canais em uma única lista, com filtro por canal, status, prazo e cliente.
- Pedido manual de balcão/orçamento → pedido.
- **Data limite de postagem** visível e destacada (vermelho quando em risco).
- Linha do tempo do pedido (eventos, mudanças de status, mensagens, versões de arte).

### 4. Aprovação de Artes (fluxo principal da gráfica)
É a atividade mais frequente — deve ser o fluxo mais rápido e polido do sistema.
- Ao criar/importar um pedido, gerar um **link público seguro** (token assinado, sem login) para o cliente **enviar a arte** ou referências.
- Designer sobe a **prova** (imagem/PDF) com marca d'água; cada envio é uma **versão** (v1, v2, v3…).
- Cliente abre o link no celular, visualiza a prova, **aprova** ou **pede alteração** com comentários (opcionalmente marcando pontos na imagem).
- Aprovação registra data, hora, IP e versão aprovada (prova de aceite).
- Notificações ao cliente (e-mail/WhatsApp — deixar interface pronta para provedor) e à equipe.
- Arquivos no **Supabase Storage** (bucket privado, URLs assinadas); arquivo final em alta resolução separado da prova.
- Aprovação move o pedido automaticamente para a produção.

### 5. PCP — Planejamento e Controle de Produção
- Quadro **Kanban** com status:
  `Novo → Aguardando Arte → Arte em Criação → Aguardando Aprovação → Aprovado → Em Impressão → Acabamento → Expedição → Enviado → Entregue` (+ `Cancelado`).
- Arrastar e soltar no desktop/tablet; botões de avanço rápido no mobile.
- Ordenação por **data limite de envio**; alertas de pedidos que vão estourar o prazo de postagem da Shopee.
- Atualização em tempo real (Supabase Realtime) entre todos os dispositivos.

### 6. Expedição e Logística
- Fila de pedidos prontos para envio.
- **Impressão de etiquetas em lote** (centenas de uma vez), compatível com **impressora térmica** (10x15 cm / ZPL ou PDF) e A4.
- Atualização de status de despacho e **código de rastreio** enviado de volta ao marketplace.
- Acompanhamento do rastreio até a entrega.

### 7. Financeiro
- Contas a receber (por pedido, por canal, com repasse/taxas do marketplace) e contas a pagar.
- Fluxo de caixa, DRE simplificado, margem por produto (preço − custo dos insumos − taxas do canal − frete).
- Relatórios por período, canal e produto; exportação CSV/XLSX.

### 8. Notas Fiscais (NF-e)
- **Emissão automática** segundos após a aprovação do pagamento no marketplace, usando os dados do comprador importados.
- Integrar via **provedor de NF-e por API** (ex.: Focus NFe, NFE.io, PlugNotas — definir com o cliente), com certificado A1 armazenado com segurança no provedor.
- Envio do XML/DANFE ao marketplace e ao cliente.
- Cálculo tributário configurável por produto/regime, já preparado para a **Reforma Tributária** (campos de **IBS/CBS** conforme notas técnicas vigentes), sem regras fiscais fixas no código.
- Cancelamento e carta de correção.

### 9. Dashboard para TV
- Rota dedicada `/tv` em **tela cheia**, tema escuro com a paleta da marca, fontes grandes legíveis a distância.
- Login por **token de dispositivo** (somente leitura), sem precisar de usuário.
- Atualização em tempo real e **rotação automática** entre telas:
  - Pedidos do dia por status (contagem no Kanban)
  - Pedidos com prazo de postagem vencendo hoje/atrasados
  - Artes aguardando aprovação do cliente
  - Faturamento do dia/semana/mês e meta
  - Vendas por canal (Shopee, balcão, WhatsApp)
  - Estoque crítico de insumos
- Valores financeiros podem ser ocultados por configuração.

## Integrações com Marketplaces

### Arquitetura (escalabilidade é requisito)
- Criar uma camada de **adapters**: uma interface comum `MarketplaceAdapter` (produtos, estoque, preços, pedidos, logística, NF-e, mensagens, avaliações) e uma implementação por canal.
- **Somente Shopee** (Shopee Open Platform API v2). Magalu e TikTok Shop foram descartados pelo cliente em 2026-10-11.
- Suporte a **várias lojas** por marketplace.
- Tokens OAuth por loja armazenados criptografados, com renovação automática.
- Webhooks/push recebidos em Route Handlers com validação de assinatura; processamento em **fila** com retentativa, idempotência e log de cada chamada.
- Job de reconciliação periódico (Vercel Cron/`pg_cron`) para corrigir divergências caso um webhook se perca.
- Tela de **saúde das integrações**: última sincronização, erros, fila pendente.

### Shopee — funcionalidades
- **Produtos**: cadastro, alteração de preço e descrição, variações, publicação a partir do cadastro interno.
- **Estoque**: sincronização em tempo real com base na disponibilidade calculada pelos insumos.
- **Pré-encomenda / Dias de Postagem**: enviar o `days_to_ship` conforme o prazo de produção do produto e avisar produção e expedição sobre a data limite de envio para evitar cancelamento por atraso.
- **Pedidos**: importação automática assim que o pedido é aprovado/pago, com dados do comprador.
- **NF-e**: emissão automática e envio da nota para a Shopee.
- **Etiquetas**: geração do documento de envio e impressão em lote.
- **Logística**: atualização de despacho e rastreio.
- **Mensagem automática no chat** após a compra, com o link de upload da arte (sujeito à liberação da API de chat para a conta).
- **Marketing** (fase posterior):
  - **Impulsionamento automático**: reimpulsionar até 5 produtos a cada 4 horas, com lista de prioridade configurável.
  - **Resposta a avaliações com IA**: sugerir/responder automaticamente com tom configurável e revisão humana opcional para avaliações negativas.

## Requisitos não funcionais

- Segurança: RLS em todas as tabelas, segredos só em variáveis de ambiente da Vercel/Supabase, chave `service_role` nunca no cliente, rate limit nas rotas públicas (link de arte, webhooks).
- LGPD: dados de compradores com acesso restrito e política de retenção.
- Performance: paginação no servidor, índices nas consultas de pedidos/estoque, imagens otimizadas.
- Observabilidade: logs estruturados, tabela de erros de integração, alertas.
- Qualidade: migrations versionadas do Supabase, seed de dados de exemplo, testes (Vitest para regras de estoque/BOM/fiscal, Playwright para fluxos principais), ESLint + Prettier.
- Ambientes separados: desenvolvimento, homologação (Shopee sandbox) e produção.

## Versionamento e repositório (Git + GitHub)

- O projeto usa **Git desde o primeiro commit** e fica no repositório **público** `smart-producao` no GitHub, que é a fonte única do código e é conectado à Vercel para hospedagem.
- Por ser **público**, qualquer pessoa pode ler o código: nunca versionar senhas, tokens, chaves, dados de clientes, dumps do banco ou arquivos de arte de clientes. A segurança vem das políticas RLS e das variáveis de ambiente, não de esconder o código.
- **`.gitignore`** cobrindo `node_modules/`, `.next/`, `.vercel/`, `.env*` (exceto `.env.example`), `supabase/.temp/`, arquivos de sistema e logs. **Nenhum segredo vai para o repositório**: credenciais, tokens de marketplace, chaves do Supabase e certificado A1 ficam só nas variáveis de ambiente da Vercel/Supabase e nos **GitHub Secrets**.
- `.env.example` versionado com todas as variáveis necessárias (sem valores reais).
- **Branches**:
  - `main` → produção (protegida: sem push direto, merge só via Pull Request com CI verde).
  - `develop` → homologação.
  - `feat/*`, `fix/*`, `chore/*` → trabalho do dia a dia, sempre saindo de `develop`.
- **Commits** no padrão **Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`…), em português, pequenos e com um propósito por commit.
- **Pull Requests** com template (o que mudou, como testar, prints para mudanças de tela, migrations incluídas).
- **GitHub Actions (CI)** em todo PR: instalar dependências, lint, checagem de tipos, testes unitários, build do Next.js e validação das migrations do Supabase. Testes E2E (Playwright) no merge para `develop`.
- **Vercel conectada ao GitHub**: deploy de preview automático para cada PR, homologação a partir de `develop` e produção a partir de `main`.
- **Migrations do Supabase versionadas** em `supabase/migrations/`, aplicadas automaticamente por pipeline (nunca alterar o banco de produção manualmente).
- **Releases e tags** com versionamento semântico (`v1.0.0`) e `CHANGELOG.md` a cada fase entregue.
- **Dependabot** para atualização de dependências e alertas de segurança; **secret scanning** ativado.
- **GitHub Issues + Projects** para o backlog, organizados por fase (milestones) e por módulo (labels).

## Migração

- Mapear os dados do sistema atual (pedidos, clientes, produtos, usuários) e criar script de importação.
- Manter nomes de status e termos que a equipe já usa, para reduzir a curva de aprendizado.

## Entregas por fases

1. **Fundação**: repositório Git/GitHub com CI e Vercel conectados, projeto Next.js + Supabase, design system com a paleta, auth e perfis, layout responsivo.
2. **Cadastros + Estoque**: produtos, variações, insumos, ficha técnica, movimentações.
3. **Pedidos + PCP + Aprovação de Artes**: Kanban em tempo real, link público de arte com versões.
4. **Dashboard TV + Financeiro básico**.
5. **Integração Shopee**: produtos, estoque, pedidos, etiquetas, logística.
6. **NF-e automática** + reforma tributária.
7. **Marketing Shopee** (boost automático, respostas com IA).

## Como trabalhar

- Antes de codar cada fase, apresente o **modelo de dados** (tabelas, relações, políticas RLS) e o plano de telas para aprovação.
- Todo trabalho acontece em branch própria e entra por Pull Request; nada vai para `main` sem CI verde.
- Entregue cada fase funcionando de ponta a ponta, com deploy de preview na Vercel e uma release/tag no GitHub.
- Documente no `README` como rodar localmente, variáveis de ambiente necessárias e como cadastrar uma nova loja/marketplace.
- Quando uma decisão depender do negócio (provedor de NF-e, regime tributário, regras de preço por canal, metas do dashboard), **pergunte** em vez de supor.
