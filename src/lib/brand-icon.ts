import { MARK } from "@/components/brand/mark";

/** SVG do símbolo da GraphicX (GX) num quadrado branco: favicon e ícones do PWA. */
export function brandIconSvg({ padded }: { padded: boolean }) {
  // Ícone "maskable": o Android recorta as bordas, então o GX fica menor.
  const usable = padded ? 40 : 54;
  const scale = usable / MARK.width;
  const [vx, vy] = MARK.viewBox.split(" ").map(Number);
  const tx = (64 - MARK.width * scale) / 2 - vx * scale;
  const ty = (64 - MARK.height * scale) / 2 - vy * scale;
  const grad = (id: string, [x1, x2]: readonly number[]) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="0" x2="${x2}" y2="0"><stop offset="0" stop-color="${MARK.gradient.from}"/><stop offset="1" stop-color="${MARK.gradient.to}"/></linearGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${grad("g", MARK.gRange)}${grad("x", MARK.xRange)}</defs>
  <rect width="64" height="64" rx="${padded ? 0 : 14}" fill="${MARK.background}"/>
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">
    <path d="${MARK.g}" fill="none" stroke="url(#g)" stroke-width="${MARK.gStroke}" stroke-miterlimit="2"/>
    ${MARK.x.map((d) => `<path d="${d}" fill="url(#x)"/>`).join("")}
  </g>
</svg>`;
}

export function brandIconDataUri(padded: boolean) {
  return `data:image/svg+xml;base64,${Buffer.from(brandIconSvg({ padded })).toString("base64")}`;
}
