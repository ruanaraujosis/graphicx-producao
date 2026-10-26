// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

/** Banco simulado: tabelas em memória com filtro por organization_id e paginação. */
function fakeDb(data: Record<string, Record<string, unknown>[]>) {
  return {
    rpc: async () => ({
      data: Object.keys(data).filter((t) => t !== "organizations" && t !== "profiles"),
    }),
    from(table: string) {
      const filters: [string, unknown][] = [];
      let range: [number, number] | null = null;
      let inFilter: [string, unknown[]] | null = null;
      const rows = () =>
        (data[table] ?? []).filter(
          (r) =>
            filters.every(([k, v]) => r[k] === v) &&
            (!inFilter || inFilter[1].includes(r[inFilter[0]])),
        );
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        in: (k: string, v: unknown[]) => ((inFilter = [k, v]), q),
        range: (a: number, b: number) => {
          range = [a, b];
          return Promise.resolve({ data: rows().slice(range[0], range[1] + 1), error: null });
        },
        single: () =>
          Promise.resolve({ data: rows()[0] ?? null, error: rows()[0] ? null : { message: "x" } }),
        then: (res: (v: unknown) => void) => res({ data: rows(), error: null }),
      };
      return q;
    },
  };
}

describe("backup por gráfica", () => {
  it("leva só as linhas da gráfica, todas as páginas, e pula filas técnicas", async () => {
    const { buildBackup } = await import("./organization-backup");
    const orders = Array.from({ length: 1500 }, (_, i) => ({
      id: `o${i}`,
      organization_id: i % 3 === 0 ? "B" : "A",
    }));
    const db = fakeDb({
      organizations: [{ id: "A", name: "Gráfica A" }],
      orders,
      customers: [
        { id: "c1", organization_id: "A" },
        { id: "c2", organization_id: "B" },
      ],
      marketplace_jobs: [{ id: 1, organization_id: "A" }],
      organization_members: [{ user_id: "u1", organization_id: "A" }],
      profiles: [{ id: "u1", username: "ana", full_name: "Ana" }],
    });
    const file = await buildBackup(db as never, "A");
    expect(file.organization).toEqual({ id: "A", name: "Gráfica A" });
    expect(file.tables.orders).toHaveLength(1000);
    expect(file.tables.orders.every((r) => r.organization_id === "A")).toBe(true);
    expect(file.tables.customers).toEqual([{ id: "c1", organization_id: "A" }]);
    expect(file.tables.marketplace_jobs).toBeUndefined();
    expect(file.members).toEqual([{ user_id: "u1", username: "ana", full_name: "Ana" }]);
  });
});
