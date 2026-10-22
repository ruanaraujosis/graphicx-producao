import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import sharp from "sharp";
import { strokeTextPath } from "./stroke-font";

/** Lado maior da prova em imagem: o cliente vê bem, mas não leva o arquivo em alta. */
export const PROOF_MAX_SIDE = 1800;

/** Camada SVG com o texto repetido na diagonal, em branco com contorno escuro. */
export function watermarkSvg(width: number, height: number, label: string) {
  const size = Math.max(18, Math.round(Math.min(width, height) / 14));
  const { d, width: textWidth } = strokeTextPath(label, size);
  const stroke = Math.max(1.5, size / 9);
  const diag = Math.ceil(Math.hypot(width, height));
  const stepX = textWidth + size * 3;
  const stepY = size * 4;
  const uses: string[] = [];
  for (let y = -diag; y < diag; y += stepY) {
    const offset = (Math.round(y / stepY) % 2) * (stepX / 2);
    for (let x = -diag + offset; x < diag; x += stepX) {
      uses.push(`<use href="#t" x="${Math.round(x)}" y="${Math.round(y)}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs><path id="t" d="${d}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></defs>
<g transform="translate(${width / 2} ${height / 2}) rotate(-30)">
<g stroke="#000" stroke-opacity="0.22" stroke-width="${stroke * 2.2}">${uses.join("")}</g>
<g stroke="#fff" stroke-opacity="0.55" stroke-width="${stroke}">${uses.join("")}</g>
</g>
</svg>`;
}

/** Reduz a imagem, achata em fundo branco e aplica a marca d'água. Sai em JPEG. */
export async function watermarkImage(input: Buffer, label: string) {
  const base = await sharp(input, { limitInputPixels: 120_000_000 })
    .rotate()
    .resize({
      width: PROOF_MAX_SIDE,
      height: PROOF_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .toBuffer({ resolveWithObject: true });

  const overlay = watermarkSvg(base.info.width, base.info.height, label);
  return sharp(base.data)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** As fontes padrão do PDF só têm o alfabeto latino (WinAnsi). */
function pdfSafe(text: string) {
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, "");
}

/** Escreve o texto na diagonal, repetido, em todas as páginas. */
export async function watermarkPdf(input: Buffer, label: string) {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(input, { updateMetadata: false });
  } catch {
    throw new Error("Não foi possível abrir o PDF (protegido por senha ou corrompido).");
  }
  if (pdf.getPageCount() > 50) throw new Error("A prova em PDF pode ter no máximo 50 páginas.");

  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = pdfSafe(label);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(14, Math.min(width, height) / 16);
    const textWidth = font.widthOfTextAtSize(text, size);
    for (let y = -height; y < height * 2; y += size * 4) {
      for (let x = -width; x < width * 2; x += textWidth + size * 2) {
        page.drawText(text, {
          x,
          y,
          size,
          font,
          color: rgb(0.45, 0.45, 0.45),
          opacity: 0.22,
          rotate: degrees(30),
        });
      }
    }
  }
  return Buffer.from(await pdf.save());
}
