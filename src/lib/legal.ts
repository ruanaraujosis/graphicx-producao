/**
 * Dados de quem opera o GraphicX, usados na Política de Privacidade e nos Termos de Uso.
 * Campos `null` aparecem destacados como "a definir" nas páginas públicas.
 * Ao mudar o conteúdo dos textos, avance `version` e `updatedAt`.
 */
export const LEGAL = {
  version: "1.0",
  /** Data da última alteração (AAAA-MM-DD). */
  updatedAt: "2026-11-02",
  /** Nome de quem opera o GraphicX (razão social, quando houver CNPJ). */
  operatorName: null as string | null,
  /** CNPJ formatado. Sem CNPJ (pessoa física), fica `null` e o trecho some dos textos. */
  operatorDocument: null as string | null,
  /** E-mail para privacidade, pedidos de titulares e contato com o encarregado. */
  privacyEmail: "ruan.araujosi27@gmail.com" as string | null,
  /** Comarca do foro (cidade/UF). */
  forumCity: "Luziânia/GO" as string | null,
  /** Dias para excluir os dados de uma gráfica depois do encerramento do contrato. */
  deletionDays: 90,
  /** Cópias automáticas de backup mantidas por gráfica. */
  backupCopies: 14,
};
