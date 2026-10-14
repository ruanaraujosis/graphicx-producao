/**
 * Conferência da publicação de um anúncio novo: mesma regra na tela (lista do
 * que falta) e no servidor (antes de chamar a Shopee).
 */

export type PublicationVariant = {
  variant_id: string;
  sku: string;
  name: string;
  price: number;
  stock: number | null;
  weight_g: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
};

export type PublicationPayload = {
  publication: {
    id: string;
    organization_id: string;
    shop_id: string;
    product_id: string;
    title: string;
    description: string;
    category_id: number | null;
    attributes: {
      attribute_id: number;
      values: { value_id: number; original_value_name?: string; value_unit?: string }[];
    }[];
    logistics: number[];
    item_status: "NORMAL" | "UNLIST";
    external_item_id: string | null;
  };
  product: { name: string; production_days: number; active: boolean };
  images: string[];
  variants: PublicationVariant[];
};

export const MAX_VARIANTS = 50;

export function publicationProblems(p: {
  title: string;
  description: string;
  category_id: number | null;
  logistics: unknown[];
  images: number;
  productActive: boolean;
  variants: Pick<PublicationVariant, "sku" | "price" | "stock" | "weight_g">[];
}) {
  const problems: string[] = [];
  const title = p.title.trim().length;
  if (title < 10 || title > 120) problems.push("O título precisa ter de 10 a 120 caracteres.");
  if (p.description.trim().length < 20)
    problems.push("A descrição precisa ter pelo menos 20 caracteres.");
  if (!p.category_id) problems.push("Escolha a categoria da Shopee.");
  if (!p.logistics.length) problems.push("Escolha pelo menos uma forma de envio.");
  if (!p.images) problems.push("Cadastre pelo menos uma foto do produto.");
  if (!p.productActive) problems.push("O produto está inativo.");
  if (!p.variants.length) problems.push("O produto não tem variações ativas.");
  if (p.variants.length > MAX_VARIANTS)
    problems.push(`A Shopee aceita até ${MAX_VARIANTS} variações por anúncio.`);
  for (const v of p.variants) {
    if (!v.weight_g) problems.push(`Informe o peso da variação ${v.sku}.`);
    if (!(v.price > 0)) problems.push(`A variação ${v.sku} está sem preço.`);
    if (v.stock === null)
      problems.push(
        `A variação ${v.sku} é sob encomenda e não tem ficha técnica: cadastre os insumos para calcular o estoque.`,
      );
  }
  return problems;
}
