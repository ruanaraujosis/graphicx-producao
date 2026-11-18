/**
 * Dados de demonstração (produtos, variações, insumos, fichas técnicas e estoque inicial) para
 * uma gráfica de teste. Pode rodar de novo: IDs fixos por gráfica, nada duplica.
 *
 *   npm run demo:dados -- <slug-da-grafica> [--marcar-demo]           (banco de testes)
 *   npm run demo:dados:producao -- <slug-da-grafica> [--marcar-demo]  (produção)
 *
 * Só funciona em gráfica marcada como demonstração (organizations.is_demo). Na primeira vez,
 * use --marcar-demo para marcar a gráfica informada. Os SKUs começam com DEMO-.
 * Com --listar, mostra só o código e o nome das gráficas.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const slug = process.argv.slice(2).find((a) => !a.startsWith("--"));
const markDemo = process.argv.includes("--marcar-demo");

if (!url || !secretKey) {
  console.error("✖ Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no arquivo de ambiente.");
  process.exit(1);
}
if (!slug && !process.argv.includes("--listar")) {
  console.error("Uso: npm run demo:dados -- <slug-da-grafica> [--marcar-demo]");
  process.exit(1);
}

const db = createClient<Database>(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** UUID estável a partir da gráfica e de uma chave: rodar de novo atualiza o mesmo registro. */
function stableId(org: string, key: string) {
  const h = createHash("sha256").update(`graphicx-demo:${org}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

type Unit = "un" | "folha" | "m2" | "ml";
const MATERIALS: {
  key: string;
  name: string;
  unit: Unit;
  cost: number;
  stock: number;
  min: number;
}[] = [
  {
    key: "couche300",
    name: "Papel couché 300 g (A3)",
    unit: "folha",
    cost: 1.2,
    stock: 500,
    min: 100,
  },
  {
    key: "sulfite",
    name: "Papel sulfite 75 g (A4)",
    unit: "folha",
    cost: 0.05,
    stock: 2000,
    min: 500,
  },
  {
    key: "sublimatico",
    name: "Papel sublimático (A4)",
    unit: "folha",
    cost: 0.6,
    stock: 300,
    min: 50,
  },
  { key: "vinil", name: "Vinil adesivo branco", unit: "m2", cost: 18, stock: 40, min: 10 },
  { key: "lona", name: "Lona 440 g", unit: "m2", cost: 22, stock: 60, min: 15 },
  { key: "tintauv", name: "Tinta UV", unit: "ml", cost: 0.9, stock: 2000, min: 300 },
  {
    key: "caneca",
    name: "Caneca branca 325 ml (para sublimação)",
    unit: "un",
    cost: 7.5,
    stock: 120,
    min: 24,
  },
  {
    key: "acrilico",
    name: "Chaveiro acrílico 5x5 cm (sem impressão)",
    unit: "un",
    cost: 1.1,
    stock: 400,
    min: 100,
  },
  { key: "argola", name: "Argola de chaveiro", unit: "un", cost: 0.25, stock: 500, min: 100 },
  { key: "kraft", name: "Embalagem kraft individual", unit: "un", cost: 0.8, stock: 300, min: 50 },
];

type Variant = {
  key: string;
  sku: string;
  name: string;
  price: number;
  bom: [string, number][];
  stock?: number;
  min?: number;
};
const PRODUCTS: {
  key: string;
  name: string;
  category: string;
  fulfillment: "sob_encomenda" | "pronta_entrega";
  days: number;
  variants: Variant[];
}[] = [
  {
    key: "cartao",
    name: "Cartão de visita",
    category: "Impressos",
    fulfillment: "sob_encomenda",
    days: 2,
    variants: [
      {
        key: "cv100",
        sku: "DEMO-CV-100-4X0",
        name: "100 un · couché 300 g · frente",
        price: 59.9,
        bom: [
          ["couche300", 5],
          ["tintauv", 4],
        ],
      },
      {
        key: "cv500",
        sku: "DEMO-CV-500-4X4",
        name: "500 un · couché 300 g · frente e verso",
        price: 149.9,
        bom: [
          ["couche300", 25],
          ["tintauv", 30],
        ],
      },
    ],
  },
  {
    key: "caneca",
    name: "Caneca personalizada",
    category: "Brindes",
    fulfillment: "sob_encomenda",
    days: 1,
    variants: [
      {
        key: "can325",
        sku: "DEMO-CAN-BR-325",
        name: "Branca 325 ml",
        price: 39.9,
        bom: [
          ["caneca", 1],
          ["sublimatico", 1],
          ["kraft", 1],
        ],
      },
    ],
  },
  {
    key: "chaveiro",
    name: "Chaveiro acrílico",
    category: "Brindes",
    fulfillment: "sob_encomenda",
    days: 2,
    variants: [
      {
        key: "chav5",
        sku: "DEMO-CHAV-5X5",
        name: "5x5 cm · impressão UV",
        price: 12.9,
        bom: [
          ["acrilico", 1],
          ["argola", 1],
          ["tintauv", 2],
        ],
      },
    ],
  },
  {
    key: "banner",
    name: "Banner em lona",
    category: "Comunicação visual",
    fulfillment: "sob_encomenda",
    days: 3,
    variants: [
      {
        key: "ban6090",
        sku: "DEMO-BAN-60X90",
        name: "60x90 cm · com bastão",
        price: 79.9,
        bom: [
          ["lona", 0.54],
          ["tintauv", 25],
        ],
      },
      {
        key: "ban90120",
        sku: "DEMO-BAN-90X120",
        name: "90x120 cm · com bastão",
        price: 129.9,
        bom: [
          ["lona", 1.08],
          ["tintauv", 50],
        ],
      },
    ],
  },
  {
    key: "adesivo",
    name: "Adesivo redondo (cartela)",
    category: "Impressos",
    fulfillment: "pronta_entrega",
    days: 0,
    variants: [
      {
        key: "ades5",
        sku: "DEMO-ADES-5CM-10",
        name: "5 cm · cartela com 10",
        price: 9.9,
        bom: [
          ["vinil", 0.03],
          ["tintauv", 1],
        ],
        stock: 50,
        min: 10,
      },
    ],
  },
];

function fail(step: string, error: { message: string } | null) {
  if (error) {
    console.error(`✖ ${step}: ${error.message}`);
    process.exit(1);
  }
}

/** Estoque inicial uma vez só por item (procura a referência antes de lançar). */
async function initialStock(
  org: string,
  item: { material_id?: string; variant_id?: string },
  quantity: number,
  unitCost: number | null,
) {
  const column = item.material_id ? "material_id" : "variant_id";
  const id = (item.material_id ?? item.variant_id)!;
  const { count } = await db
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq(column, id)
    .eq("reference", "estoque-inicial");
  if (count) return false;
  const { error } = await db.from("stock_movements").insert({
    organization_id: org,
    material_id: item.material_id ?? null,
    variant_id: item.variant_id ?? null,
    type: "entrada",
    quantity,
    unit_cost: unitCost,
    reason: "Estoque inicial (demonstração)",
    reference: "estoque-inicial",
  });
  fail("estoque inicial", error);
  return true;
}

async function main() {
  if (slug === "--listar" || process.argv.includes("--listar")) {
    const { data } = await db.from("organizations").select("slug, name, is_demo").order("name");
    for (const o of data ?? []) console.log(`✔ ${o.slug} · ${o.name}${o.is_demo ? " (demo)" : ""}`);
    return;
  }
  const { data: org, error } = await db
    .from("organizations")
    .select("id, name, is_demo")
    .eq("slug", slug!)
    .maybeSingle();
  fail("gráfica", error);
  if (!org) {
    console.error(`✖ Gráfica "${slug}" não encontrada.`);
    process.exit(1);
  }
  if (!org.is_demo) {
    if (!markDemo) {
      console.error(
        `✖ ${org.name} não está marcada como demonstração. Para marcar, rode de novo com --marcar-demo.`,
      );
      process.exit(1);
    }
    fail(
      "marcar demonstração",
      (await db.from("organizations").update({ is_demo: true }).eq("id", org.id)).error,
    );
    console.log(`✔ ${org.name} marcada como gráfica de demonstração.`);
  }

  const categories = new Map<string, string>();
  for (const name of [...new Set(PRODUCTS.map((p) => p.category))]) {
    const id = stableId(org.id, `categoria:${name}`);
    fail(
      "categoria",
      (await db.from("product_categories").upsert({ id, organization_id: org.id, name })).error,
    );
    categories.set(name, id);
  }

  const materialIds = new Map<string, string>();
  let entradas = 0;
  for (const m of MATERIALS) {
    const id = stableId(org.id, `insumo:${m.key}`);
    materialIds.set(m.key, id);
    fail(
      `insumo ${m.name}`,
      (
        await db.from("materials").upsert({
          id,
          organization_id: org.id,
          name: m.name,
          sku: `DEMO-${m.key.toUpperCase()}`,
          unit: m.unit,
          min_stock: m.min,
        })
      ).error,
    );
    if (await initialStock(org.id, { material_id: id }, m.stock, m.cost)) entradas++;
  }

  let variantes = 0;
  for (const p of PRODUCTS) {
    const productId = stableId(org.id, `produto:${p.key}`);
    fail(
      `produto ${p.name}`,
      (
        await db.from("products").upsert({
          id: productId,
          organization_id: org.id,
          name: p.name,
          category_id: categories.get(p.category)!,
          fulfillment: p.fulfillment,
          production_days: p.days,
          description: "Produto de demonstração (dados fictícios).",
        })
      ).error,
    );
    for (const v of p.variants) {
      const variantId = stableId(org.id, `variacao:${v.key}`);
      fail(
        `variação ${v.sku}`,
        (
          await db.from("product_variants").upsert({
            id: variantId,
            organization_id: org.id,
            product_id: productId,
            sku: v.sku,
            name: v.name,
            base_price: v.price,
            min_stock: v.min ?? 0,
          })
        ).error,
      );
      fail(
        `ficha técnica ${v.sku}`,
        (
          await db.from("bom_items").upsert(
            v.bom.map(([material, quantity]) => ({
              organization_id: org.id,
              variant_id: variantId,
              material_id: materialIds.get(material)!,
              quantity,
              waste_pct: 0,
            })),
            { onConflict: "variant_id,material_id" },
          )
        ).error,
      );
      if (v.stock && (await initialStock(org.id, { variant_id: variantId }, v.stock, null)))
        entradas++;
      variantes++;
    }
  }

  console.log(
    `✔ ${org.name}: ${MATERIALS.length} insumos, ${PRODUCTS.length} produtos, ${variantes} variações com ficha técnica. ${entradas} estoque(s) inicial(is) lançado(s) agora.`,
  );
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
