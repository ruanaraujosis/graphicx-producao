import type { NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth/dal";
import { CHANNEL_LABELS } from "@/lib/catalog/pricing";
import { type ExportColumn, toCsv, toXlsx } from "@/lib/export/table";
import { lastMonths, parseMonth } from "@/lib/finance/period";
import { ilikeTerm } from "@/lib/list-params";
import { todayIso } from "@/lib/orders/deadline";
import { createClient } from "@/lib/supabase/server";
import { PAYABLE_STATUS, RECEIVABLE_STATUS } from "../schema";

const MAX_ROWS = 5000;

/** Exporta os relatórios do financeiro em CSV ou Excel, com os filtros da tela. */
export async function GET(request: NextRequest) {
  const { membership } = await requireOrg(["financeiro.ver", "relatorios.ver"]);
  const org = membership.organizationId;
  const params = request.nextUrl.searchParams;
  const report = params.get("relatorio");
  const format = params.get("formato") === "xlsx" ? "xlsx" : "csv";
  const today = todayIso();
  const period = parseMonth(params.get("mes"), today);
  const view = params.get("ver") ?? "abertas";
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const supabase = await createClient();

  let name: string;
  let body: { columns: ExportColumn<never>[]; rows: unknown[] };

  if (report === "receber") {
    let query = supabase
      .from("receivables")
      .select(
        "description, customer_name, channel, gross, fee, net, due_date, received_at, status, orders(number)",
      )
      .eq("organization_id", org)
      .order("due_date")
      .limit(MAX_ROWS);
    if (view === "abertas") query = query.eq("status", "aberto");
    if (view === "vencidas") query = query.eq("status", "aberto").lt("due_date", today);
    if (view === "recebidas") query = query.eq("status", "recebido");
    if (view === "canceladas") query = query.eq("status", "cancelado");
    if (q)
      query = query.or(`description.ilike.${ilikeTerm(q)},customer_name.ilike.${ilikeTerm(q)}`);
    const { data } = await query;
    type Row = NonNullable<typeof data>[number];
    name = `contas-a-receber-${view}`;
    body = {
      rows: data ?? [],
      columns: [
        { header: "Descrição", value: (r: Row) => r.description },
        { header: "Pedido", value: (r: Row) => (r.orders ? `#${r.orders.number}` : "") },
        { header: "Cliente", value: (r: Row) => r.customer_name },
        { header: "Canal", value: (r: Row) => (r.channel ? CHANNEL_LABELS[r.channel] : "") },
        { header: "Vencimento", value: (r: Row) => r.due_date, type: "date" },
        { header: "Bruto", value: (r: Row) => r.gross, type: "money" },
        { header: "Taxa", value: (r: Row) => r.fee, type: "money" },
        { header: "Líquido", value: (r: Row) => r.net, type: "money" },
        {
          header: "Situação",
          value: (r: Row) =>
            RECEIVABLE_STATUS[r.status as keyof typeof RECEIVABLE_STATUS]?.label ?? r.status,
        },
        { header: "Recebido em", value: (r: Row) => r.received_at, type: "date" },
      ] as ExportColumn<never>[],
    };
  } else if (report === "pagar") {
    let query = supabase
      .from("payables")
      .select(
        "description, amount, due_date, paid_at, status, recurrence, suppliers(name), expense_categories(name)",
      )
      .eq("organization_id", org)
      .order("due_date")
      .limit(MAX_ROWS);
    if (view === "abertas") query = query.eq("status", "aberto");
    if (view === "vencidas") query = query.eq("status", "aberto").lt("due_date", today);
    if (view === "pagas") query = query.eq("status", "pago");
    if (view === "canceladas") query = query.eq("status", "cancelado");
    if (q) query = query.ilike("description", ilikeTerm(q));
    const { data } = await query;
    type Row = NonNullable<typeof data>[number];
    name = `contas-a-pagar-${view}`;
    body = {
      rows: data ?? [],
      columns: [
        { header: "Descrição", value: (r: Row) => r.description },
        { header: "Categoria", value: (r: Row) => r.expense_categories?.name },
        { header: "Fornecedor", value: (r: Row) => r.suppliers?.name },
        { header: "Vencimento", value: (r: Row) => r.due_date, type: "date" },
        { header: "Valor", value: (r: Row) => r.amount, type: "money" },
        {
          header: "Situação",
          value: (r: Row) =>
            PAYABLE_STATUS[r.status as keyof typeof PAYABLE_STATUS]?.label ?? r.status,
        },
        { header: "Pago em", value: (r: Row) => r.paid_at, type: "date" },
        { header: "Recorrência", value: (r: Row) => (r.recurrence === "mensal" ? "Mensal" : "") },
      ] as ExportColumn<never>[],
    };
  } else if (report === "caixa") {
    const { data } = await supabase.rpc("finance_cash_flow", {
      p_org: org,
      p_from: period.from,
      p_to: period.to,
    });
    type Row = NonNullable<typeof data>[number];
    name = `fluxo-de-caixa-${period.month}`;
    body = {
      rows: (data ?? []).filter((d) => d.received || d.paid || d.to_receive || d.to_pay),
      columns: [
        { header: "Dia", value: (r: Row) => r.day, type: "date" },
        { header: "Recebido (líquido)", value: (r: Row) => r.received, type: "money" },
        { header: "Pago", value: (r: Row) => r.paid, type: "money" },
        { header: "A receber", value: (r: Row) => r.to_receive, type: "money" },
        { header: "A pagar", value: (r: Row) => r.to_pay, type: "money" },
      ] as ExportColumn<never>[],
    };
  } else if (report === "dre") {
    const range = lastMonths(period.month, 12);
    const { data } = await supabase.rpc("finance_dre", {
      p_org: org,
      p_from: range.from,
      p_to: range.to,
    });
    type Row = NonNullable<typeof data>[number];
    name = `dre-ate-${period.month}`;
    body = {
      rows: data ?? [],
      columns: [
        { header: "Mês", value: (r: Row) => r.month.slice(0, 7) },
        { header: "Receita bruta", value: (r: Row) => r.gross_revenue, type: "money" },
        { header: "Taxas", value: (r: Row) => r.fees, type: "money" },
        { header: "Custo dos insumos", value: (r: Row) => r.material_cost, type: "money" },
        { header: "Despesas", value: (r: Row) => r.expenses, type: "money" },
        { header: "Resultado", value: (r: Row) => r.result, type: "money" },
      ] as ExportColumn<never>[],
    };
  } else if (report === "margem") {
    const { data } = await supabase.rpc("finance_product_margin", {
      p_org: org,
      p_from: period.from,
      p_to: period.to,
    });
    type Row = NonNullable<typeof data>[number];
    name = `margem-por-produto-${period.month}`;
    body = {
      rows: data ?? [],
      columns: [
        { header: "Produto", value: (r: Row) => r.product_name },
        { header: "Variação", value: (r: Row) => r.variant_name },
        { header: "SKU", value: (r: Row) => r.sku },
        { header: "Quantidade", value: (r: Row) => r.quantity, type: "number" },
        { header: "Vendas", value: (r: Row) => r.revenue, type: "money" },
        { header: "Insumos", value: (r: Row) => r.material_cost, type: "money" },
        { header: "Taxas", value: (r: Row) => r.fees, type: "money" },
        { header: "Margem", value: (r: Row) => r.margin, type: "money" },
      ] as ExportColumn<never>[],
    };
  } else {
    return new Response("Relatório inválido.", { status: 400 });
  }

  const fileName = `${name}.${format}`;
  const headers = {
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store",
  };
  if (format === "xlsx") {
    const buffer = await toXlsx(body.columns, body.rows as never[]);
    return new Response(new Uint8Array(buffer), {
      headers: {
        ...headers,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  }
  return new Response(toCsv(body.columns, body.rows as never[]), {
    headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
  });
}
