import { cn } from "cn";
import { fillText, type LabelData, type LabelElement } from "@/lib/labels/template";

/**
 * Desenha uma etiqueta em milímetros (impressão e editor). Sempre preto no
 * branco: é papel, não segue o tema da tela.
 */
export function LabelView({
  width,
  height,
  elements,
  backgroundUrl,
  imageUrls,
  data,
  qrSvg,
  className,
  selectedId,
  onElementPointerDown,
}: {
  width: number;
  height: number;
  elements: readonly LabelElement[];
  backgroundUrl?: string | null;
  /** storage path → URL assinada. */
  imageUrls?: Record<string, string>;
  /** Dados do pedido; sem dados, mostra os campos entre chaves. */
  data?: Partial<LabelData>;
  qrSvg?: string;
  className?: string;
  selectedId?: string | null;
  onElementPointerDown?: (e: React.PointerEvent, el: LabelElement) => void;
}) {
  const mm = (v: number) => `${v}mm`;
  return (
    <div
      className={cn("relative overflow-hidden bg-white text-black", className)}
      style={{ width: mm(width), height: mm(height) }}
    >
      {backgroundUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage
        <img
          src={backgroundUrl}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-fill"
        />
      )}
      {elements.map((el) => {
        const style: React.CSSProperties = {
          left: mm(el.x),
          top: mm(el.y),
          width: mm(el.w),
          height: mm(el.h),
        };
        const editable = Boolean(onElementPointerDown);
        const common = cn(
          "absolute",
          editable &&
            "cursor-move outline-offset-0 hover:outline hover:outline-1 hover:outline-primary/60",
          selectedId === el.id && "outline outline-2 outline-primary",
        );
        const down = editable
          ? (e: React.PointerEvent) => onElementPointerDown?.(e, el)
          : undefined;

        switch (el.type) {
          case "text":
            return (
              <div
                key={el.id}
                onPointerDown={down}
                className={cn(
                  common,
                  "overflow-hidden whitespace-pre-line",
                  el.border && "border border-black px-[1mm]",
                )}
                style={{
                  ...style,
                  fontSize: `${el.size}pt`,
                  lineHeight: 1.2,
                  fontWeight: el.bold ? 700 : 400,
                  textAlign: el.align,
                }}
              >
                {data ? fillText(el.text, data) : el.text}
              </div>
            );
          case "qr":
            return qrSvg ? (
              <div
                key={el.id}
                onPointerDown={down}
                className={cn(common, "[&>svg]:size-full")}
                style={style}
                // SVG gerado no servidor pela biblioteca de QR Code (sem conteúdo do usuário).
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div
                key={el.id}
                onPointerDown={down}
                className={cn(
                  common,
                  "grid place-items-center border border-dashed border-black text-[7pt]",
                )}
                style={style}
              >
                QR Code
              </div>
            );
          case "image": {
            const url = el.path ? imageUrls?.[el.path] : undefined;
            return url ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage
              <img
                key={el.id}
                onPointerDown={down}
                src={url}
                alt=""
                draggable={false}
                className={cn(common, el.fit === "cover" ? "object-cover" : "object-contain")}
                style={style}
              />
            ) : editable ? (
              <div
                key={el.id}
                onPointerDown={down}
                className={cn(
                  common,
                  "grid place-items-center border border-dashed border-black text-[7pt]",
                )}
                style={style}
              >
                Imagem
              </div>
            ) : null;
          }
          case "box":
            return (
              <div
                key={el.id}
                onPointerDown={down}
                className={cn(common, "border border-black")}
                style={{ ...style, borderRadius: mm(el.radius) }}
              />
            );
          case "line":
            return (
              <div
                key={el.id}
                onPointerDown={down}
                className={cn(common, "bg-black")}
                style={style}
              />
            );
        }
      })}
    </div>
  );
}
