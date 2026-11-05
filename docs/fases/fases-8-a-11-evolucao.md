# Fases 8 a 11: evolução do GraphicX

Prompt de trabalho para as próximas fases. Ele foi adaptado do pedido do usuário de 2026-11-04 ao
que o repositório já tem. Use junto com `AGENTS.md` (regras do projeto) e `PROMPT.md` (especificação
original). Onde este documento diverge do código, confira o código antes de decidir.

## Referências escolhidas pelo usuário

Consulte antes da fase correspondente. Elas orientam, não são para copiar: cada ideia abaixo já foi
filtrada para o que o GraphicX tem ou faz sentido ter.

| Referência                                                                                  | Usada em      | O que aproveitar                                                                              |
| ------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| [Relatório de vendas (Cobre Fácil)](https://www.cobrefacil.com.br/blog/relatorio-de-vendas) | 10.2          | Visões por período, colaborador, canal, produto, cliente e horário; comparação entre períodos |
| [Pedidos de venda (Olist)](https://ajuda.olist.com/pedidos/pedidos-de-venda-configuracoes)  | 9.1, 9.3, 9.4 | Desconto do vendedor e do gerente, configurações do pedido, opções de impressão               |
| [GraphicX em produção](https://grapphicx.vercel.app/)                                       | 11            | Identidade visual e narrativa do pipeline                                                     |
| [Sybios (modelo de landing)](https://www.sybiosme.com/en)                                   | 11            | Seções numeradas, hero com duas CTAs, linha do tempo, FAQ agrupado                            |

## Papel e forma de trabalho

Você é um engenheiro de software sênior no GraphicX (SaaS para gráficas: Next.js 16 com Cache
Components, Supabase com RLS, Vercel). Antes de alterar código em cada etapa:

1. Leia `AGENTS.md`, a seção do `README.md` que importa para a etapa e os arquivos citados abaixo.
   Resuma a arquitetura dos módulos afetados e apresente o **modelo de dados** (tabelas, colunas,
   políticas RLS, permissões novas) e o plano de telas antes de codar, como pede o `PROMPT.md`.
2. Trabalhe em etapas pequenas, uma branch `feat|fix|chore/*` por etapa, saindo de `develop`, com PR,
   CI verde (lint, tipos, testes, build, migrations com pgTAP e E2E) e squash.
3. Banco só muda por migration em `supabase/migrations/`. Toda tabela nova tem `organization_id`,
   RLS com `private.is_member`/`private.has_permission` e, se for crítica, o trigger
   `private.audit_row_change()`. Inclua default ou backfill seguro para colunas novas e um teste pgTAP.
   Migrations do Postgres não têm "down" automático: quando uma mudança for difícil de desfazer
   (ex.: valor novo em enum), diga isso no PR e prefira a forma reversível.
4. Autorização sempre no servidor: `requireOrg("modulo.acao")` em página, Server Action e Route
   Handler; RLS como barreira final. Esconder botão não é autorização. Nunca teste nome de perfil.
5. Módulo ou permissão nova entra em `src/lib/auth/permissions.ts` **e** em
   `private.valid_permissions()` (há teste que compara). Ações irreversíveis ganham permissão
   própria, como `lgpd.gerenciar`.
6. Interface 100% em português do Brasil, temas claro e escuro, celular (alvos de 44px, tabelas
   viram cards), tokens da paleta (nunca hex solto), contraste AA. O teste
   `e2e/acessibilidade.spec.ts` (axe-core) deve continuar verde; inclua nele as páginas públicas
   novas.
7. Antes do PR: `npm run format && npm run lint && npm run typecheck && npm test && npm run build`.
   No fim de cada etapa, informe os comandos e resultados reais, os arquivos alterados, as decisões,
   as migrations, o que foi validado no navegador e o que depende de terceiros.
8. Segredos: siga a skill `segredos`. Nunca registre senha (nem em log, nem em auditoria).
9. Pergunte ao usuário só quando faltar informação para evitar perda de dados ou uma decisão
   irreversível. As decisões marcadas com **Decidir com o usuário** abaixo são desse tipo.

Ordem: Fase 8 (dados e estoque) → Fase 9 (pedidos e vendas) → Fase 10 (arquivos, relatórios e
integrações) → Fase 11 (landing page).

---

## Fase 8: Provas, produtos e estoque

### 8.1 Provas e marca d'água

O que existe hoje:

- A marca d'água é gravada no envio da prova em `src/app/(app)/pedidos/[id]/art-actions.ts`
  (`watermarkPdf`/`watermarkImage`, em `src/lib/art/watermark.ts`), com o texto "PROVA · Pedido
  #1001 · gráfica" no PDF e "PROVA #1001" na imagem.
- O cliente marca pontos na prova pelo link público (`src/app/a/[token]/client-art.tsx`). Os pontos
  ficam em `art_reviews.pins` (jsonb, até 30).
- Na tela do pedido (`src/app/(app)/pedidos/[id]/page.tsx`), a equipe só vê **quantos** pontos foram
  marcados, não onde estão. Esse é o defeito a corrigir.

O que fazer:

- Mostrar os pontos sobre a prova para quem tem `artes.ver`, com a mesma lógica de coordenadas do
  link do cliente (posição relativa à imagem, sem depender do tamanho da tela), número de cada
  ponto e o comentário ligado a ele. Funciona no celular. A arte original não é alterada; os
  pontos são uma camada por cima.
- Se houver prévia/exportação da revisão (imprimir ou baixar), os pontos aparecem nela também.
- Investigar e corrigir, se houver: pontos de uma versão aparecendo em outra, coordenadas em PDF
  com várias páginas, URL assinada expirando antes de a imagem carregar.
- Trocar o texto da marca d'água para "Pedido #1001" (número do pedido via `orderNumber`), nos dois
  formatos. Provas antigas já têm o texto gravado no arquivo e continuam como estão; o texto novo
  vale para as próximas. Atualizar o teste em `src/lib/art/art.test.ts`.

### 8.2 Produtos: preço, estoque inicial e mínimo

- Conferir o cadastro e a edição de produto/variação (`src/app/(app)/cadastros/produtos/`): o preço
  base precisa ser editável, com validação `decimal()` (vírgula pt-BR) e persistência.
- Estoque inicial ao criar a variação: grava um movimento `entrada` com motivo "Estoque inicial",
  numa função do banco, na mesma transação da criação. Reenviar o formulário não pode duplicar o
  movimento (chave de idempotência ou checagem de "já existe estoque inicial para esta variação").
- Estoque mínimo editável (verificar se a coluna já existe e reaproveitá-la).

### 8.3 Ajuste de inventário: a contagem define o saldo final

O que existe hoje: o tipo `ajuste` em `stock_movements` soma a quantidade ao saldo (o trigger faz
`v_on_hand_delta := new.quantity`), e a tela diz "positivo soma, negativo subtrai". O usuário quer
digitar a quantidade contada.

O que fazer:

- Nova função `inventory_count(variant|material, contado, motivo)` que trava a linha do saldo,
  calcula a diferença no servidor e grava um movimento `ajuste` com `quantidade = contado − atual`.
  Como `stock_movements` é só de inclusão, as colunas novas (`previous_balance`, `final_balance`,
  `reason`) entram com default nulo para os movimentos antigos.
- A tela pede a **quantidade contada** e mostra antes de confirmar: saldo atual → saldo final
  (diferença).
- Registra usuário (`created_by`), data e motivo. Teste pgTAP: contagem igual ao saldo não muda nada;
  duas contagens seguidas dão o mesmo saldo final; outra gráfica não ajusta.

### 8.4 Busca no lugar de listas longas

- Já existe `src/components/kit/search-picker.tsx` (combobox ARIA). Reaproveitar nele, ou numa
  evolução dele, todos os `<select>` longos de produto, variação e insumo: cadastro de ficha
  técnica, movimentações de estoque, compras e itens de pedido. Ver os usos com
  `grep -rn "<select\|<Select" src/app`.
- Buscar por nome, SKU e variação; teclado (setas, Enter, Esc); estado "nenhum resultado"; uso no
  celular; busca no servidor quando a lista for grande (limite e `ilike`).

### 8.5 Fichas técnicas e dados de demonstração

- A ficha técnica já existe (`bom_items`: variação → insumo, com quantidade) e a decisão da Fase 3
  é "reserva na confirmação, baixa na impressão". Conferir unidades (unidade do insumo × unidade da
  ficha) e só estender a baixa automática onde o fluxo de produção for transacional. Não duplicar
  consumo.
- Dados de demonstração idempotentes: produtos, variações, insumos e fichas técnicas para uma
  gráfica de demonstração. Usar `supabase/seed.sql` (roda só no banco local com `db reset`) e um
  script `npm run demo:dados -- <slug>` que só aceita uma gráfica marcada como demonstração, com IDs
  fixos ou `on conflict do nothing`. Nunca rodar em produção por padrão.

---

## Fase 9: Pedidos de venda

### 9.1 Venda rápida vira Pedido de venda

O que existe hoje: `/pedidos/venda-rapida` e a função `public.quick_sale` (migration
20261026000000).

O que fazer:

- Cliente (busca ou cadastro na hora), itens e variações, quantidades, preços, desconto,
  observações e forma de pagamento. Totais **recalculados no servidor**; o preço vem de
  `public.variant_price` e o desconto acima do permitido é recusado na função.
- Desconto em dois níveis, como no Olist: **desconto máximo do vendedor** (percentual,
  configurável pela gráfica) e, acima dele, **autorização do gerente** até um segundo limite. A
  autorização usa a mesma confirmação de identidade no servidor da 9.4 (quem tem a permissão de
  aprovar desconto confirma a própria senha), e o pedido guarda quem autorizou e o percentual.
  **Decidir com o usuário:** os dois percentuais padrão (o Olist usa 15% como exemplo para o
  vendedor) e qual permissão aprova desconto.
- Configurações do pedido de venda, por gráfica (inspiradas no Olist, só as que fazem sentido aqui):
  - vendedor obrigatório (já existe `created_by`; permitir escolher outro vendedor da equipe, que
    é quem entra no ranking e na comissão);
  - forma de pagamento obrigatória;
  - aviso de cliente com contas em atraso no a receber, e mostrar as pendências dele no pedido;
  - observação padrão impressa em todos os pedidos;
  - marcador automático "1ª compra" para cliente sem pedidos anteriores;
  - alerta de endereço incompleto quando o pedido tiver entrega.
- A numeração continua sequencial por gráfica (já existe em `order_counters`).
- Fora de escopo agora: impostos (IPI, ICMS ST) e envio de marcadores para nota fiscal, porque a
  NF-e está adiada; depósitos múltiplos de estoque.

### 9.2 Status "Vendido"

- **Decidir com o usuário:** criar o status `vendido` no enum `order_status` (valor novo em enum do
  Postgres não pode ser removido depois) ou reaproveitar `entregue` com o rótulo "Vendido" para a
  venda rápida. Em qualquer caso, a venda rápida termina direto nesse status, sem passar pelo PCP,
  e o restante (Kanban, TV, financeiro, ranking, Shopee) precisa ser revisado para o status novo.

### 9.3 Documento para conferência e assinatura

- Página de impressão em `src/app/imprimir/` (já existem `pedidos` e `envio`, com
  `print-toolbar.tsx`): dados da gráfica, cliente, itens, totais, condições, campos de assinatura e
  data. Imprimir ou salvar em PDF pelo navegador. Não é nota fiscal: o documento diz isso.
- Opções de impressão do Olist que valem aqui: número do pedido em código de barras ou QR Code (o
  QR do pedido já existe em `/imprimir/pedidos`), cabeçalho da gráfica com nome fantasia e endereço,
  imagem dos produtos, descrição complementar do item, ordem dos itens (inclusão, SKU ou descrição)
  e a observação padrão.

### 9.4 Cancelamento e devolução com validação administrativa

- Permissão própria (ex.: `pedidos.cancelar`), não nome de perfil.
- Confirmação de identidade no servidor: reaproveitar o padrão de `src/app/(app)/perfil/actions.ts`
  (`createStatelessClient` confere a senha de **quem está logado**, sem trocar a sessão) e/ou exigir
  sessão `aal2` recente. Não criar senha compartilhada, não comparar senha no cliente, não guardar
  nem registrar senha. Se for preciso um administrador autorizar no aparelho de outra pessoa,
  documentar essa necessidade e propor o fluxo antes de implementar.
- Cancelamento: motivo obrigatório, ator e data; libera reserva de estoque e cancela o a receber
  (já feito por `orders_sync_receivable`; conferir).
- Devolução (total ou parcial): tabela nova de devoluções (itens, quantidades, motivo), entrada de
  estoque e estorno no financeiro. Uma função no banco, com idempotência (a mesma devolução não é
  aplicada duas vezes) e teste pgTAP.
- O histórico do pedido (`order_events`) não pode ter ocorrências apagadas, como a opção "bloquear
  exclusão de ocorrências" do Olist: cancelamento, devolução e autorização de desconto entram lá.

---

## Fase 10: Arquivos, relatórios e integrações

### 10.1 Arquivos da gráfica

- Item "Arquivos" no menu, com módulo de permissão `arquivos` (`ver`/`gerenciar`).
- Bucket privado novo no Supabase Storage (caminho `<organization_id>/...`), com políticas de
  storage por pasta da gráfica, como os buckets de arte e etiquetas. Download por URL assinada de
  curta duração.
- Tabela de metadados: nome, tipo, tamanho, pasta ou etiquetas, vínculo opcional com cliente,
  pedido ou produto, quem enviou e quando. Busca por nome, vínculo e tipo. Exclusão só com
  `arquivos.gerenciar`.
- Validar tipo (lista de formatos de arte: PDF, AI, PSD, CDR, SVG, PNG, JPG, TIFF, ZIP) e tamanho
  máximo (respeitar o limite do plano do Supabase e avisar o consumo de espaço). Nome do arquivo
  sanitizado no servidor.
- O backup por gráfica guarda só os metadados, como já faz com as artes.

### 10.2 Relatório de pedidos e vendas

- Tela em Relatórios (`relatorios.ver`), com filtros por período, status, cliente, canal e
  colaborador.
- Métricas, cada uma com a definição visível na tela:
  - quantidade de pedidos;
  - receita bruta (total dos pedidos confirmados);
  - receita líquida (bruta menos taxas registradas: `channel_fee` e taxa da forma de pagamento);
  - ticket médio;
  - cancelamentos e devoluções;
  - evolução por dia, semana ou mês, com **comparação com o período anterior** (e o mesmo período do
    ano passado, quando houver dado), para enxergar sazonalidade.
- Visões inspiradas no artigo da Cobre Fácil, todas com dados que o sistema já tem:
  - **por colaborador e por equipe** (desempenho individual e do time);
  - **por canal** (balcão, WhatsApp, Shopee);
  - **produtos e variações mais vendidos** (quantidade e receita);
  - **histórico de compras do cliente** (frequência, última compra, total);
  - **horários e dias de pico** (mapa de calor por dia da semana e hora);
  - **conversão de orçamentos** (orçamentos que viraram pedido / orçamentos criados no período),
    porque o status `orcamento` já existe;
  - um resumo em cards no topo, no padrão de `StatCard` do Início.
- Fora de escopo: funil de leads e relatório de campanhas de marketing (o sistema não guarda
  leads nem campanhas; entram no CRM do roadmap).
- Mesmas regras do ranking do Início: Shopee fora de "vendas por colaborador"; orçamento e
  cancelado fora da receita.
- Sem margem nem lucro onde não houver custo confiável (a tela de margem do financeiro já existe e
  mostra só o que tem custo).
- Estados vazios, detalhamento por pedido e exportação CSV pelo padrão de
  `src/app/(app)/financeiro/exportar/route.ts`.

### 10.3 Base para API, webhooks e e-commerce

- Contratos versionados em `/api/v1/...`, autenticação por chave de API por gráfica (guardar só o
  hash; mostrar a chave uma vez), escopos ligados às permissões, limite de requisições.
- Webhooks de saída: assinatura HMAC, idempotência por evento, nova tentativa com espera crescente,
  log sem segredos. Reaproveitar a fila e os logs que já existem em `src/lib/marketplaces/`
  (`marketplace_jobs`, `marketplace_logs`) ou generalizá-los.
- Não implementar conectores externos novos sem escopo e credenciais.

### 10.4 Recomendação de roadmap (documento, não código)

Escrever em `docs/fases/` uma proposta priorizada, com esforço e dependências, para: PDV (caixa e
leitor de código, partindo da venda rápida), CRM (histórico do cliente, follow-up), propostas e
orçamentos (o status `orcamento` já existe), comissões e ranking (já entregues na v1.1.0: evoluir),
performance de vendas e custos de e-commerce (taxas da Shopee já em `channel_fee`). Faturamento sem
emissão fiscal: a NF-e (Fase 6) continua adiada e nada deve sugerir que o sistema emite nota.

---

## Fase 11: Landing page

- Hoje `/` redireciona para `/inicio`. A landing passa a ser a página pública em `/` (entrar em
  `PUBLIC_PATHS` do `src/lib/supabase/proxy.ts`); quem já está logado vai direto para `/inicio`.
- Em português, coerente com a marca GraphicX (tokens da paleta, logo, temas claro e escuro),
  responsiva e acessível (incluir em `e2e/acessibilidade.spec.ts`).
- Seções:
  1. Hero com mockup do painel, com dados fictícios identificados como exemplo.
  2. Narrativa: pedido multicanal → aprovação de arte → produção → consumo de estoque → expedição.
  3. Cards dos módulos.
  4. Integrações e roadmap.
  5. CTA final.
- Cada recurso com selo **Disponível**, **Em desenvolvimento** ou **Planejado**. Situação atual:
  - Shopee: código pronto, aguardando a aprovação do app pela Shopee.
  - NF-e: adiada, entra como planejado.
  - Marketing: sem IA.
  - Não prometer o que não existe.
- Animações: o projeto não usa Framer Motion hoje. Se adicionar, usar o pacote `motion` em versão
  fixa e só nesta página. Animar apenas transform e opacity: reveal do dashboard, scrollytelling
  com `position: sticky` e cartões empilhados.
  - Respeitar `prefers-reduced-motion`: sem animação, conteúdo completo.
  - No celular, versão simples, sem sticky longo.
  - Rolagem nativa; nada de Lenis.
- Estrutura inspirada no modelo escolhido pelo usuário (https://www.sybiosme.com/en), adaptada ao
  GraphicX:
  - Menu com as seções **numeradas** (01 O sistema, 02 Como funciona, 03 Módulos, 04 Integrações,
    05 Perguntas, 06 Contato) e link "Pular para o conteúdo".
  - Hero com uma frase curta e direta, um subtítulo e **duas CTAs**: a principal (ex.: "Falar com a
    gente", por e-mail ou WhatsApp, sem formulário de pagamento) e a secundária ("Ver como
    funciona", rolando até a narrativa). Ao lado, o mockup do painel.
  - "Nossa abordagem" em 4 pontos numerados (ex.: multicanal, aprovação de arte, produção em tempo
    real, segurança e LGPD).
  - "Como funciona" como **linha do tempo** com marcadores (pedido → arte → produção → estoque →
    expedição): é aqui que entra o scrollytelling sticky.
  - Vitrine de telas reais do sistema (com dados fictícios), cada imagem com `alt` descritivo.
  - Títulos curtos e pontuados, no estilo "Escolha. Seu plano." do modelo, e contadores "01/05" na
    narrativa.
  - **Perguntas frequentes** agrupadas por tema (como funciona, dados e segurança, integrações,
    suporte), em `<details>` acessível.
  - CTA final e rodapé com links legais.
  - Do modelo **não** entram: tabela de preços, checkout e cupom (o GraphicX ainda não cobra pelo
    sistema; **Decidir com o usuário** se haverá planos públicos), seletor de moeda e de idioma.
- Marca e pipeline: https://grapphicx.vercel.app/ (logo, painel azul-marinho com onda e textos do
  login). A landing reaproveita essa identidade.
- O arquivo de planejamento de animações mencionado pelo usuário não está no repositório; pedir a
  ele antes desta fase.
- Termos e privacidade no rodapé (`LegalLinks`). Sem scripts de rastreamento: a política de
  privacidade diz que não usamos.

---

## Critérios de aceite

- A marca d'água mostra "Pedido #<número>"; a equipe autorizada vê os pontos marcados pelo cliente
  sobre a prova, no computador e no celular.
- O produto aceita preço, estoque inicial (sem duplicar) e mínimo. O ajuste de inventário define o
  saldo final e registra saldo anterior, saldo final, usuário, data e motivo.
- A busca funciona no cadastro de ficha técnica, nas movimentações e nos itens de pedido.
- Os dados de demonstração são idempotentes e não tocam a produção.
- Os arquivos ficam privados, por gráfica e por permissão.
- O pedido de venda gera documento para assinatura; a venda finalizada fica "Vendido".
  Cancelamento e devolução são protegidos no servidor, auditados e não se aplicam duas vezes.
- O relatório usa dados reais e explica cada métrica.
- A landing é acessível, responsiva, respeita movimento reduzido e não promete funções
  indisponíveis.
