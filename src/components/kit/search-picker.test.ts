import { describe, expect, it } from "vitest";
import { matchOptions } from "./search-picker";

const OPTIONS = [
  { value: "1", label: "Insumo · Papel Couché 300g (folha)", hint: "PAP-300" },
  { value: "2", label: "Pronto · Caneca — CAN-01", hint: "Branca" },
  { value: "3", label: "Pronto · Caneca — CAN-02", hint: "Mágica preta" },
];

describe("busca de itens", () => {
  it("sem texto, mostra tudo", () => {
    expect(matchOptions(OPTIONS, " ")).toHaveLength(3);
  });

  it("acha por nome, SKU e variação, sem diferenciar acentos e maiúsculas", () => {
    expect(matchOptions(OPTIONS, "couche").map((o) => o.value)).toEqual(["1"]);
    expect(matchOptions(OPTIONS, "pap-300").map((o) => o.value)).toEqual(["1"]);
    expect(matchOptions(OPTIONS, "caneca magica").map((o) => o.value)).toEqual(["3"]);
    expect(matchOptions(OPTIONS, "can-01").map((o) => o.value)).toEqual(["2"]);
  });

  it("sem resultado devolve lista vazia", () => {
    expect(matchOptions(OPTIONS, "xyz")).toEqual([]);
  });
});
