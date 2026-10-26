// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { artPath, isArtPathOf, safeFileName } from "./files";
import { strokeTextPath } from "./stroke-font";

vi.mock("server-only", () => ({}));
const { watermarkImage, watermarkPdf, watermarkSvg, PROOF_MAX_SIDE } = await import("./watermark");

describe("fonte de traços", () => {
  it("desenha as letras conhecidas e ignora as outras", () => {
    const { d, width } = strokeTextPath("PROVA #1001", 60);
    expect(d.startsWith("M0 60L0 0")).toBe(true);
    expect(width).toBeGreaterThan(0);
    expect(strokeTextPath("çç", 60).d).toBe("");
  });
});

describe("marca d'água", () => {
  it("o SVG cobre a imagem com o texto repetido", () => {
    const svg = watermarkSvg(800, 600, "PROVA #1001");
    expect(svg).toContain('width="800"');
    expect(svg.match(/<use /g)?.length).toBeGreaterThan(10);
  });

  it("imagem: reduz, achata e devolve JPEG com a marca", async () => {
    const input = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 4,
        background: { r: 30, g: 60, b: 200, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const out = await watermarkImage(input, "PROVA #1001");
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(PROOF_MAX_SIDE);
    // A marca muda os pixels: a imagem não pode ser uma cor só.
    const stats = await sharp(out).stats();
    expect(stats.channels[0].max - stats.channels[0].min).toBeGreaterThan(40);
  });

  it("PDF: mantém as páginas e acrescenta a marca", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    doc.addPage([595, 842]);
    const input = Buffer.from(await doc.save());
    const out = await watermarkPdf(input, "PROVA · Pedido #1001 · Gráfica Ação 🎉");
    const back = await PDFDocument.load(out);
    expect(back.getPageCount()).toBe(2);
    expect(out.length).toBeGreaterThan(input.length);
  });

  it("PDF inválido dá erro em português", async () => {
    await expect(watermarkPdf(Buffer.from("não é pdf"), "PROVA")).rejects.toThrow(
      "Não foi possível abrir o PDF",
    );
  });
});

describe("arquivos de arte", () => {
  it("nome seguro sem acentos e espaços", () => {
    expect(safeFileName("Logo Ação FINAL (2).PDF")).toBe("logo-acao-final-2.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName(String.raw`C:\fotos\logo.png`)).toBe("logo.png");
    expect(safeFileName("???")).toBe("arquivo");
  });

  it("caminho fica na pasta do pedido", () => {
    const p = artPath("org", "ped", "cliente", "arte.png");
    expect(isArtPathOf(p, "org", "ped", "cliente")).toBe(true);
    expect(isArtPathOf(p, "org", "outro", "cliente")).toBe(false);
    expect(isArtPathOf("org/ped/cliente/../final/x", "org", "ped", "cliente")).toBe(false);
    expect(isArtPathOf("org/ped/cliente/sub/x", "org", "ped", "cliente")).toBe(false);
  });
});
