# Changelog

Todas as mudanças relevantes deste projeto. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [versionamento semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

- **Backup por gráfica** (Plataforma → Backups): rotina diária automática (Vercel Cron) que copia todos os dados de cada gráfica, separados, para um armazenamento privado; guarda os últimos 14 automáticos; o SuperAdmin acompanha data, tamanho e registros e pode fazer um backup na hora, sem ver o conteúdo.

## [0.6.0] - 2026-10-23

### Fase 7 — Marketing Shopee

#### Adicionado

- **Marketing** (menu novo, permissão própria `marketing`): impulsionamento automático dos anúncios da Shopee a cada 4 horas, com lista de prioridade em rodízio (5 por vez, pula pausados e sem estoque).
- **Avaliações da Shopee** trazidas a cada hora: 4 e 5 estrelas respondidas sozinhas; 1 a 3 estrelas ficam com resposta sugerida para revisar, editar, enviar ou ignorar.
- **Modelos de resposta** por faixa de estrelas (tom amigável), com {comprador}, {produto} e {loja}, editáveis pela gráfica; assinatura por loja.
- Verificador de ambiente confere as variáveis da Shopee e o `CRON_SECRET`.
- **Venda rápida** (Pedidos → Venda rápida): balcão em uma tela, com leitor de código (SKU + Enter), quantidade, desconto, pagamento e cliente opcional; o pedido nasce entregue, o estoque é baixado na hora e, com "pagamento recebido agora", a conta já fica recebida.
- **Início vira o dashboard:** vendas de hoje e do mês, meta, pedidos em andamento, prazos de hoje, atrasados, artes aguardando, estoque crítico, avaliações para revisar, produção por etapa, próximos prazos e últimas vendas (cada bloco conforme a permissão).

#### Segurança

- Next.js 16.4.3 e zod 4.6.7 (vulnerabilidades conhecidas); `npm audit` sem pendências.

## [0.5.0] - 2026-10-15

### Fase 5 — Shopee

#### Adicionado

- **Integrações:** Configurações → Integrações com o botão "Conectar loja da Shopee" (autorização OAuth; tokens no Supabase Vault com renovação automática), situação de cada loja, fila de sincronização com novas tentativas e últimas chamadas.
- **Pedidos da Shopee** entram sozinhos ao serem pagos (aviso da Shopee + conferência a cada 15 min), sem duplicar, com itens ligados pelo anúncio ou pelo SKU, prazo de postagem, cancelamento e envio vindos da Shopee e a **taxa real** do repasse na conta a receber.

- **Anúncios e estoque:** importação dos anúncios com vínculo pelo SKU, envio de estoque com margem de segurança por loja, preço do canal Shopee (ligado por loja) e prazo de postagem (pré-encomenda acima de 3 dias).
- **Publicar na Shopee** a partir do cadastro: categoria, atributos, formas de envio, fotos e variações, com conferência do que falta antes de publicar.
- **Expedição:** organizar o envio da Shopee em lote (agência ou coleta), etiquetas de envio da Shopee em um PDF só e rastreio do pedido.
- **QR Code de identificação** em cada pedido (e em lote na Expedição): etiqueta 10×15 cm ou folha A4 com número, cliente, prazo e itens; o QR abre o pedido no GraphicX. Também dá para **copiar o QR Code** (imagem), copiar o link ou baixar.
- **Etiqueta de envio em cada pedido:** Shopee usa a etiqueta oficial (organiza o envio na hora, se preciso); balcão e WhatsApp usam a etiqueta do GraphicX com destinatário, remetente (endereço da gráfica, novo em Dados da gráfica) e QR.
- **Reproduzir na TV** (ícone de transmitir no topo, como o do YouTube): escolhe uma TV conectada e manda a tela que está aberta (produção, prazos, artes, faturamento ou estoque), com "Parar" para voltar a girar; inclui "Vincular com código de TV". Qualquer pessoa da gráfica pode reproduzir; vincular é de quem gerencia as configurações.
- **TV: conectar com código (como no YouTube):** a TV abre `/tv` e mostra um código e um QR; quem está logado digita o código (ou lê o QR) em Configurações → Dispositivos de TV e a TV entra no painel sozinha, lembrando o aparelho. Botão **Transmitir** (Chromecast/Google Cast pelo Chrome), **Ligar** de novo uma TV desligada e **Excluir**. TV desligada ou excluída sai do painel na hora.
- **Modelos de etiqueta:** botão Excluir também dentro do editor.
- **Mensagem automática no chat da Shopee** após a compra, com o link para o cliente enviar a arte (ligada por loja em Ajustes, texto editável com {loja}, {pedido} e {link}); se a Shopee não liberar o chat para a conta, a tela de Integrações avisa. O pedido mostra quando o link foi enviado.
- **Modelos de etiqueta** (Configurações → Modelos de etiqueta): a gráfica usa o modelo do GraphicX, cria o seu do zero ou sobe a arte da própria etiqueta e posiciona por cima textos com campos do pedido, QR Code, logo, caixas e linhas; tamanho livre, um modelo padrão por tipo e escolha do modelo na hora de imprimir. Pedidos lançados à mão no canal Shopee usam a etiqueta da gráfica.
- **Cadastrar cliente ao criar o pedido**, já com nome, WhatsApp e canal digitados; o cliente fica selecionado no pedido.

#### Removido

- **Magalu e TikTok Shop** saem do produto: a GraphicX integra somente a Shopee. Canais retirados do banco, das telas e dos preços por canal.

## [0.4.0] - 2026-10-11

### Fase 4 — Dashboard TV + Financeiro básico

#### Adicionado

- **Financeiro:** visão geral com faturamento de hoje, da semana e do mês contra a **meta mensal** (dia e semana pelos dias úteis), contas em aberto e vencidas e saldo do mês.
- **Contas a receber** automáticas a partir dos pedidos confirmados (total, taxa e prazo da forma de pagamento), acompanhando total, cancelamento e reabertura; contas avulsas; baixa com data.
- **Contas a pagar** com categorias editáveis, fornecedor e recorrência mensal (a próxima parcela nasce ao pagar).
- **Fluxo de caixa** (realizado e previsto), **DRE simplificado** dos últimos 6 meses e **margem por produto** (vendas − insumos − taxas).
- Custo dos insumos guardado em cada baixa (custo médio do momento).
- Exportação em **CSV e Excel** de todos os relatórios.
- **Painel de TV** (`/tv/<link>`): tela cheia e escura, rotação automática entre produção, prazos, artes, faturamento × meta, vendas por canal e estoque crítico; atualiza a cada 30 s. Cada TV tem link próprio só de leitura, revogável, com valores em R$ desligados por padrão.

## [0.3.0] - 2026-10-08

### Fase 3 — Pedidos + PCP + Aprovação de Artes

#### Adicionado

- **Pedidos** de todos os canais numa lista só, com filtros por etapa, canal e busca, e indicadores (em andamento, atrasados, postam hoje, em aprovação).
- **Novo pedido / orçamento**: itens com o preço do canal, prazo sugerido em dias úteis, frete, desconto e forma de pagamento; orçamento vira pedido com um clique.
- **Data limite de postagem** destacada (vermelho quando atrasa ou vence hoje).
- **Linha do tempo** do pedido com mudanças de status, arte e comentários da equipe.
- **Estoque nos pedidos**: insumos reservados ao confirmar, baixados ao entrar em impressão (pronta-entrega: no envio) e devolvidos ao cancelar.
- **Aprovação de artes**: link seguro para o cliente (sem login) enviar arquivos e aprovar ou pedir alteração marcando pontos na prova; provas versionadas (v1, v2…) com **marca d'água** aplicada no servidor; arquivo final em alta separado; comprovante de aceite com data, IP e versão.
- **Fila de artes** do designer e **quadro de produção (Kanban) em tempo real**, com arrastar e soltar no computador e botão de avançar no celular.
- Permissão por etapa: artes, produção e expedição só movem o pedido nas suas etapas.
- Testes do banco (pgTAP) no CI para as regras de pedidos, estoque e aprovação.

## [0.2.0] - 2026-10-08

### Fase 2 — Cadastros + Estoque

#### Adicionado

- **Cadastros**: clientes (CPF/CNPJ validados, endereço pelo CEP, canal de origem), fornecedores, categorias, insumos e formas de pagamento (taxa e prazo).
- **Produtos** com variações (SKU, tamanho, espessura, cor, acabamento, peso e medidas), fotos em armazenamento privado e dados fiscais (NCM, CEST, CFOP).
- Produção **sob encomenda** ou **pronta-entrega**, por produto.
- **Preço por canal**: preço base + ajuste % por canal (balcão, Shopee, Magalu, TikTok Shop, WhatsApp), com valor manual opcional por variação.
- **Ficha técnica** por variação (insumo, quantidade e % de perda), com custo e margem calculados e cópia entre variações.
- **Estoque**: entradas, saídas, ajustes, perdas, reservas e liberações, com histórico que não pode ser apagado; **custo médio ponderado** atualizado a cada entrada.
- **Disponibilidade** por variação (peças prontas + quanto dá para produzir pela ficha técnica) e **baixa pela ficha técnica**.
- **Sugestão de compra** para insumos abaixo do mínimo, agrupada por fornecedor.
- Acesso aos cadastros por permissão (quem vê pedidos, estoque ou financeiro enxerga o que precisa).

## [0.1.0] - 2026-10-08

### Fase 1 — Fundação

#### Adicionado

- Projeto Next.js 16 (App Router, Cache Components) com TypeScript estrito, Tailwind CSS 4 e shadcn/ui.
- Marca da plataforma **graphicX**: logo, ícones do PWA e design system (laranja, azul-marinho, verde-azulado, azul-céu, roxo e verde-limão), fonte Poppins e tema **claro, escuro e automático**, com contraste AA conferido.
- **Multi-empresa (SaaS)**: gráficas (tenants), vínculo pessoa↔gráfica com perfil por gráfica, isolamento por RLS.
- **Perfis de acesso configuráveis** por gráfica (Ver/Gerenciar por módulo), com perfil Administrador fixo, perfis iniciais editáveis, proteção contra escalada de privilégio e MFA para perfis sensíveis.
- **Senha provisória**: quem recebe a senha de um admin cria a própria no primeiro acesso.
- Andamento do projeto visível só para o SuperAdmin, na Plataforma.
- Login único por **e-mail ou usuário** `nome.cargo`, seletor de gráfica para quem trabalha em mais de uma e troca pelo header.
- **MFA obrigatório** (app autenticador) para admins e SuperAdmin, exigido também pelo banco (`aal2`).
- Painel da **plataforma** (SuperAdmin): cadastro de gráficas e do primeiro admin, ativar/desativar.
- Recuperação de senha por e-mail (`/esqueci-senha`).
- Perfis de acesso (admin, atendimento, designer, produção, expedição, financeiro) com RLS no Postgres.
- Tabela de auditoria com trigger genérico (quem alterou o quê e quando).
- Layout responsivo: sidebar no desktop, navegação inferior no celular e menu filtrado por perfil.
- Gestão da equipe da gráfica (admin): adicionar pessoa nova ou existente, perfil, desativar, redefinir senha e MFA.
- Página _Meu perfil_: nome, troca de senha e tema.
- PWA instalável (manifest e ícones gerados).
- Script `npm run plataforma:iniciar` para a primeira gráfica e o SuperAdmin.
- CI no GitHub Actions (formatação, lint, tipos, Vitest, build, validação de migrations, Playwright), Dependabot e template de PR.
