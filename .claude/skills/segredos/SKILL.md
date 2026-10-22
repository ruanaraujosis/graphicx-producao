---
name: segredos
description: Regras obrigatórias para lidar com credenciais e chaves secretas no Smart Produção (repositório PÚBLICO). Use SEMPRE antes de mexer em .env, variáveis de ambiente, chaves do Supabase, tokens de marketplace (Shopee/Magalu/TikTok), NF-e, senhas, certificados A1, GitHub Secrets ou Vercel; ao conferir se uma chave está configurada; ao depurar erro de autenticação/conexão; e quando uma credencial vazar.
---

# Segredos e credenciais — Smart Produção

O repositório `ruanaraujosis/smart-producao` é **público**. Um segredo exibido no chat, num log ou num commit deve ser tratado como **comprometido** e trocado.

## Regra de ouro

**Nunca leia, imprima, copie ou repita o valor de uma credencial.** Isso vale para o chat, comandos, logs, commits, PRs, issues, prints e mensagens de erro. Confira **se existe** e **se funciona**, nunca **o que é**.

## O que é segredo neste projeto

| Variável / item                                                                                   | Segredo?                                               | Onde vive                                                             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `SUPABASE_SECRET_KEY` (`sb_secret_...`)                                                           | **Sim, total** (ignora o RLS)                          | `.env.local`, Vercel (servidor), GitHub Secrets                       |
| Senha do banco Postgres                                                                           | **Sim**                                                | Gerenciador de senhas da pessoa; GitHub Secret `SUPABASE_DB_PASSWORD` |
| `SUPABASE_ACCESS_TOKEN` (CLI)                                                                     | **Sim**                                                | Keyring do computador; GitHub Secret                                  |
| `SHOPEE_PARTNER_KEY`, tokens OAuth das lojas                                                      | **Sim**                                                | Vercel; tokens das lojas criptografados no banco                      |
| `NFE_API_TOKEN`, certificado A1                                                                   | **Sim**                                                | Vercel; o certificado fica no provedor de NF-e                        |
| `TV_DEVICE_TOKEN_SECRET`, `ART_LINK_SIGNING_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY`, `CRON_SECRET` | **Sim**                                                | Vercel / `.env.local`                                                 |
| `ADMIN_PASSWORD`                                                                                  | **Sim**: apagar depois de `npm run plataforma:iniciar` | `.env.local` (temporário)                                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                                            | Não (vai para o navegador; o RLS protege)              | Pode aparecer mascarada                                               |
| `NEXT_PUBLIC_SUPABASE_URL`, project ref                                                           | Não                                                    | Pode aparecer                                                         |

## Proteções automáticas (já ativas)

1. **Hook `.claude/hooks/proteger-segredos.mjs`** (PreToolUse): bloqueia qualquer acesso do Claude a `.env*` (exceto `.env.example`), expansão de variáveis de segredo (`$SUPABASE_SECRET_KEY`, `$env:..._TOKEN`, `process.env.X_SECRET` em linha de comando) e dumps de ambiente (`printenv`, `env`, `Get-ChildItem env:`). **Não tente contornar o bloqueio** (montar o nome do arquivo em partes, usar outra ferramenta, codificar em base64 etc.). Se ele bloqueou, use o caminho seguro abaixo.
2. **`permissions.deny`** em `.claude/settings.json`: as ferramentas Read/Edit não abrem `.env*` nem certificados.
3. **Pre-commit** (`.githooks/pre-commit`, ativado por `npm install`) e **CI**: `npm run segredos:verificar` barra commits com chaves, JWTs, chaves privadas, `.env` e certificados.

## Como fazer cada coisa com segurança

- **Conferir se as variáveis estão preenchidas e no formato certo:** `npm run env:verificar`.
- **Conferir se as chaves funcionam no Supabase** (sem mostrar nada): `npm run env:verificar -- --conexao`.
- **Preencher ou trocar um valor:** quem edita o `.env.local` é **a pessoa**, no editor dela. Diga o nome exato da variável e onde achar o valor no painel. Nunca peça que ela cole a chave no chat. Se ela colar mesmo assim, avise que a chave ficou exposta e oriente a troca.
- **Rodar algo que precisa das variáveis:** use os scripts do `package.json` (`npm run dev`, `npm run plataforma:iniciar`), que carregam o `.env.local` sem exibir nada. Não escreva `--env-file=...` em comandos avulsos.
- **Depurar erro de autenticação:** use o status HTTP, o código de erro e `env:verificar --conexao`. Nunca imprima headers, tokens ou o objeto `process.env`.
- **Código novo:** segredos só em código de servidor (`import "server-only"`), lidos de `process.env` e nunca com prefixo `NEXT_PUBLIC_`. Não registre (`console.log`) objetos de configuração, headers ou respostas de autenticação. Erros devolvidos ao usuário não incluem detalhes de credenciais.
- **Novas variáveis:** adicionar ao `.env.example` **sem valor**, com um comentário dizendo onde obter, e às regras de `scripts/verificar-env.mjs`.
- **CI/CD:** segredos só em GitHub Secrets (por ambiente) e nas Environment Variables da Vercel. Workflows nunca dão `echo` em segredos.

## Se uma credencial vazar (inclusive por erro do Claude)

1. **Avise a pessoa imediatamente e com clareza**: o que vazou, onde (chat, commit, log) e que precisa ser trocado. Não minimize.
2. **Troque a credencial** (a antiga deixa de valer):
   - **Supabase secret key:** _Project Settings → API Keys → Secret keys → Create new secret key_, atualizar `.env.local`/Vercel/GitHub, **apagar a antiga**.
   - **Senha do banco:** _Project Settings → Database → Reset database password_, atualizar GitHub Secrets.
   - **Access token da CLI:** _Account → Access Tokens → Revoke_, depois `npx supabase login`.
   - **Shopee / NF-e / outros:** gerar uma nova no painel do provedor e revogar a anterior.
   - **Senha de pessoa:** redefinir em _Configurações → Usuários_ (ou "Esqueci minha senha").
3. **Se foi para o Git:** remover do código **não basta**, porque o histórico é público. Troque a credencial primeiro; limpar o histórico é secundário.
4. Rode `npm run env:verificar -- --conexao` para confirmar que a chave nova funciona.
5. Registre o ocorrido na memória do projeto, para não repetir.
