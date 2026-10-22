import { describe, expect, it } from "vitest";
import {
  businessDaysInMonth,
  businessDaysInWeekWithinMonth,
  goalsFromMonthly,
  progressPct,
} from "./goals";

describe("metas pelos dias úteis", () => {
  it("conta os dias úteis do mês", () => {
    expect(businessDaysInMonth("2026-10-11")).toBe(22); // outubro/2026: 22 dias úteis
    expect(businessDaysInMonth("2026-02-01")).toBe(20);
  });

  it("semana conta só os dias úteis dentro do mês", () => {
    expect(businessDaysInWeekWithinMonth("2026-10-14")).toBe(5); // 12 a 16/10
    expect(businessDaysInWeekWithinMonth("2026-10-01")).toBe(2); // qui 1 e sex 2
    expect(businessDaysInWeekWithinMonth("2026-10-30")).toBe(5); // 26 a 30/10
  });

  it("divide a meta mensal", () => {
    expect(goalsFromMonthly(22000, "2026-10-14")).toEqual({ month: 22000, week: 5000, day: 1000 });
    expect(goalsFromMonthly(null, "2026-10-14")).toEqual({ month: 0, week: 0, day: 0 });
  });

  it("percentual atingido", () => {
    expect(progressPct(500, 1000)).toBe(50);
    expect(progressPct(10, 0)).toBe(0);
    expect(progressPct(50000, 10)).toBe(999);
  });
});

describe("período dos relatórios", () => {
  it("usa o mês pedido ou o atual", async () => {
    const { parseMonth, lastMonths } = await import("./period");
    expect(parseMonth("2026-02", "2026-10-11")).toMatchObject({
      month: "2026-02",
      from: "2026-02-01",
      to: "2026-02-28",
      label: "Fevereiro de 2026",
      prev: "2026-01",
      next: "2026-03",
      isCurrent: false,
    });
    expect(parseMonth("lixo", "2026-10-11")).toMatchObject({ month: "2026-10", isCurrent: true });
    expect(parseMonth("2026-12", "2026-10-11").next).toBe("2027-01");
    expect(lastMonths("2026-10", 6)).toEqual({ from: "2026-05-01", to: "2026-10-31" });
  });
});
