import { LabelView } from "./label-view";
import { SAMPLE_DATA, type LabelElement } from "@/lib/labels/template";

/** Pixels por milímetro em 96 dpi (o que o navegador usa para "mm"). */
export const PX_PER_MM = 96 / 25.4;

/** Miniatura da etiqueta com dados de exemplo, encaixada numa largura em px. */
export function LabelThumb({
  width,
  height,
  elements,
  backgroundUrl,
  imageUrls,
  qrSvg,
  maxWidth = 150,
  maxHeight = 200,
}: {
  width: number;
  height: number;
  elements: readonly LabelElement[];
  backgroundUrl?: string | null;
  imageUrls?: Record<string, string>;
  qrSvg?: string;
  maxWidth?: number;
  maxHeight?: number;
}) {
  const scale = Math.min(maxWidth / (width * PX_PER_MM), maxHeight / (height * PX_PER_MM));
  return (
    <div
      className="overflow-hidden rounded-md border shadow-sm"
      style={{ width: width * PX_PER_MM * scale, height: height * PX_PER_MM * scale }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <LabelView
          width={width}
          height={height}
          elements={elements}
          backgroundUrl={backgroundUrl}
          imageUrls={imageUrls}
          data={SAMPLE_DATA}
          qrSvg={qrSvg}
        />
      </div>
    </div>
  );
}
