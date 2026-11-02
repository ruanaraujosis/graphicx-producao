/**
 * Dados de quem opera o GraphicX, usados na Política de Privacidade e nos Termos de Uso.
 * Campos `null` aparecem destacados como "a definir" nas páginas públicas.
 * Ao mudar o conteúdo dos textos, avance `version` e `updatedAt`.
 */
export const LEGAL = {
  version: "1.0",
  /** Data da última alteração (AAAA-MM-DD). */
  updatedAt: "2026-11-02",
  /** Razão social de quem opera o GraphicX. */
  operatorName: null as string | null,
  /** CNPJ (ou CPF, se pessoa física), já formatado. */
  operatorDocument: null as string | null,
  /** E-mail para privacidade, pedidos de titulares e contato com o encarregado. */
  privacyEmail: null as string | null,
  /** Comarca do foro (cidade/UF). */
  forumCity: null as string | null,
  /** Dias para excluir os dados de uma gráfica depois do encerramento do contrato. */
  deletionDays: 90,
  /** Cópias automáticas de backup mantidas por gráfica. */
  backupCopies: 14,
};
