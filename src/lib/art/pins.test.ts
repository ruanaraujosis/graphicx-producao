import { describe, expect, it } from "vitest";
import { notesByPin, parsePins } from "./pins";

describe("pontos da prova", () => {
  it("lê os pontos válidos, em ordem, limitando a posição à imagem", () => {
    expect(
      parsePins([{ x: 0.5, y: 0.2, n: 2 }, { x: -1, y: 1.4, n: 1 }, { x: "a", y: 0, n: 3 }, null]),
    ).toEqual([
      { x: 0, y: 1, n: 1 },
      { x: 0.5, y: 0.2, n: 2 },
    ]);
    expect(parsePins(null)).toEqual([]);
    expect(parsePins("[]")).toEqual([]);
  });

  it("separa o comentário de cada ponto e a observação geral", () => {
    const { notes, general } = notesByPin("Mudar a fonte\n1. logo maior\n2. trocar cor\ndo fundo");
    expect(general).toBe("Mudar a fonte");
    expect(notes.get(1)).toBe("logo maior");
    expect(notes.get(2)).toBe("trocar cor do fundo");
    expect(notesByPin(null).notes.size).toBe(0);
  });
});
