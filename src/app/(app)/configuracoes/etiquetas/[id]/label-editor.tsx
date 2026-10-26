"use client";

import {
  ArrowDownToLine,
  ArrowUpToLine,
  Image as ImageIcon,
  Loader2,
  Minus,
  QrCode,
  Save,
  Square,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { PX_PER_MM } from "@/components/labels/label-thumb";
import { LabelView } from "@/components/labels/label-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  createElement,
  type ElementType,
  LABEL_FIELDS,
  type LabelElement,
  type LabelTemplateInput,
  SAMPLE_DATA,
  SIZE_PRESETS,
} from "@/lib/labels/template";
import { saveTemplate } from "../actions";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const round = (v: number) => Math.round(v * 2) / 2;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const ADD: { type: ElementType; label: string; icon: typeof Type }[] = [
  { type: "text", label: "Texto", icon: Type },
  { type: "qr", label: "QR Code", icon: QrCode },
  { type: "image", label: "Imagem / logo", icon: ImageIcon },
  { type: "box", label: "Caixa", icon: Square },
  { type: "line", label: "Linha", icon: Minus },
];

const TYPE_LABELS: Record<ElementType, string> = {
  text: "Texto",
  qr: "QR Code",
  image: "Imagem",
  box: "Caixa",
  line: "Linha",
};

function NumberField({
  label,
  value,
  onChange,
  step = 0.5,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 md:min-h-9"
      />
    </label>
  );
}

export function LabelEditor({
  id,
  organizationId,
  initial,
  initialUrls,
  qrSvg,
}: {
  id: string;
  organizationId: string;
  initial: LabelTemplateInput;
  initialUrls: Record<string, string>;
  qrSvg: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [width, setWidth] = useState(initial.width_mm);
  const [height, setHeight] = useState(initial.height_mm);
  const [elements, setElements] = useState<LabelElement[]>(initial.elements);
  const [background, setBackground] = useState(initial.background_path);
  const [urls, setUrls] = useState(initialUrls);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sample, setSample] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<"background" | string>("background");

  // Cabe a etiqueta na área do editor (até 2× o tamanho real).
  const scale = Math.min(2, 440 / (width * PX_PER_MM), 620 / (height * PX_PER_MM));
  const pxPerMm = PX_PER_MM * scale;
  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const update = (elId: string, patch: Partial<LabelElement>) =>
    setElements((list) =>
      list.map((e) => (e.id === elId ? ({ ...e, ...patch } as LabelElement) : e)),
    );

  /** Arrasta (move) ou redimensiona com o ponteiro, em passos de 0,5 mm. */
  function drag(e: React.PointerEvent, el: LabelElement, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    const start = { x: e.clientX, y: e.clientY, el };
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / pxPerMm;
      const dy = (ev.clientY - start.y) / pxPerMm;
      if (mode === "move") {
        update(el.id, {
          x: round(clamp(start.el.x + dx, 0, width - Math.min(start.el.w, width))),
          y: round(clamp(start.el.y + dy, 0, height - Math.min(start.el.h, height))),
        });
      } else {
        update(el.id, {
          w: round(clamp(start.el.w + dx, 1, width - start.el.x)),
          h: round(clamp(start.el.h + dy, el.type === "line" ? 0.2 : 1, height - start.el.y)),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!selected) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const step = e.shiftKey ? 5 : 0.5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      update(selected.id, {
        x: round(clamp(selected.x + dx, 0, width - 1)),
        y: round(clamp(selected.y + dy, 0, height - 0.2)),
      });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(selected.id);
    }
  }

  function add(type: ElementType) {
    const el = createElement(type, width, height);
    setElements((list) => [...list, el]);
    setSelectedId(el.id);
  }

  function remove(elId: string) {
    setElements((list) => list.filter((e) => e.id !== elId));
    setSelectedId(null);
  }

  function reorder(elId: string, toFront: boolean) {
    setElements((list) => {
      const el = list.find((e) => e.id === elId);
      if (!el) return list;
      const rest = list.filter((e) => e.id !== elId);
      return toFront ? [...rest, el] : [el, ...rest];
    });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error("Use JPG, PNG ou WebP.");
    if (file.size > MAX_BYTES) return toast.error("Máximo de 5 MB.");
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.type.split("/")[1].replace("jpeg", "jpg");
      // Pasta = gráfica: o Storage só aceita de quem pode gerenciar etiquetas dessa gráfica.
      const path = `${organizationId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("etiquetas")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) return toast.error("Não foi possível enviar a imagem.");
      const { data } = await supabase.storage.from("etiquetas").createSignedUrl(path, 60 * 60);
      if (data?.signedUrl) setUrls((u) => ({ ...u, [path]: data.signedUrl }));
      if (uploadTarget.current === "background") setBackground(path);
      else update(uploadTarget.current, { path } as Partial<LabelElement>);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function pickFile(target: "background" | string) {
    uploadTarget.current = target;
    fileInput.current?.click();
  }

  const save = () =>
    start(async () => {
      const r = await saveTemplate(id, {
        name,
        width_mm: width,
        height_mm: height,
        elements,
        background_path: background,
      });
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <input
        ref={fileInput}
        type="file"
        accept={TYPES.join(",")}
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />

      {/* Área de desenho */}
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {ADD.map((a) => (
            <Button
              key={a.type}
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 md:min-h-8"
              onClick={() => add(a.type)}
            >
              <a.icon />
              {a.label}
            </Button>
          ))}
          <label className="ml-auto flex min-h-11 items-center gap-2 text-sm md:min-h-0">
            <Switch checked={sample} onCheckedChange={setSample} />
            Dados de exemplo
          </label>
        </div>
        <div
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={() => setSelectedId(null)}
          className="flex min-h-80 items-start justify-center overflow-auto rounded-xl bg-muted p-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <div
            className="relative shrink-0 shadow-md"
            style={{ width: width * pxPerMm, height: height * pxPerMm }}
          >
            <div
              className="absolute top-0 left-0"
              style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
            >
              <LabelView
                width={width}
                height={height}
                elements={elements}
                backgroundUrl={background ? urls[background] : null}
                imageUrls={urls}
                data={sample ? SAMPLE_DATA : undefined}
                qrSvg={qrSvg}
                selectedId={selectedId}
                onElementPointerDown={(e, el) => drag(e, el, "move")}
              />
            </div>
            {selected && (
              <div
                role="presentation"
                aria-hidden
                onPointerDown={(e) => drag(e, selected, "resize")}
                className="absolute size-4 cursor-nwse-resize rounded-sm border-2 border-background bg-primary"
                style={{
                  left: (selected.x + selected.w) * pxPerMm - 8,
                  top: (selected.y + selected.h) * pxPerMm - 8,
                }}
              />
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Clique num elemento para editar. Arraste para mover e use o quadradinho no canto para
          mudar o tamanho. Setas movem 0,5 mm (com Shift, 5 mm); Delete apaga.
        </p>
      </section>

      {/* Propriedades */}
      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="font-heading text-sm font-semibold">Modelo</h2>
          <div className="flex flex-col gap-1">
            <Label htmlFor="tpl-name">Nome</Label>
            <Input
              id="tpl-name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 md:min-h-9"
            />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Tamanho
            <select
              className="min-h-11 rounded-lg border bg-background px-3 text-sm md:min-h-9"
              value={SIZE_PRESETS.find((p) => p.w === width && p.h === height)?.label ?? ""}
              onChange={(e) => {
                const p = SIZE_PRESETS.find((x) => x.label === e.target.value);
                if (p) {
                  setWidth(p.w);
                  setHeight(p.h);
                }
              }}
            >
              <option value="">Personalizado</option>
              {SIZE_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Largura (mm)"
              value={width}
              min={20}
              onChange={(v) => setWidth(clamp(v, 20, 210))}
            />
            <NumberField
              label="Altura (mm)"
              value={height}
              min={15}
              onChange={(v) => setHeight(clamp(v, 15, 297))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm">Arte de fundo (o modelo da sua gráfica)</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 md:min-h-8"
                disabled={uploading}
                onClick={() => pickFile("background")}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                {background ? "Trocar arte" : "Enviar arte"}
              </Button>
              {background && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 md:min-h-8"
                  onClick={() => setBackground(null)}
                >
                  <X />
                  Remover
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              A arte ocupa a etiqueta inteira; posicione os campos por cima.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-heading text-sm font-semibold">{TYPE_LABELS[selected.type]}</h2>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-8"
                    aria-label="Trazer para a frente"
                    onClick={() => reorder(selected.id, true)}
                  >
                    <ArrowUpToLine />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-8"
                    aria-label="Enviar para trás"
                    onClick={() => reorder(selected.id, false)}
                  >
                    <ArrowDownToLine />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 text-destructive md:size-8"
                    aria-label="Excluir elemento"
                    onClick={() => remove(selected.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="X (mm)"
                  value={selected.x}
                  onChange={(v) => update(selected.id, { x: clamp(v, 0, width) })}
                />
                <NumberField
                  label="Y (mm)"
                  value={selected.y}
                  onChange={(v) => update(selected.id, { y: clamp(v, 0, height) })}
                />
                <NumberField
                  label="Largura"
                  value={selected.w}
                  min={1}
                  onChange={(v) => update(selected.id, { w: clamp(v, 1, width) })}
                />
                <NumberField
                  label="Altura"
                  value={selected.h}
                  min={0.2}
                  step={0.1}
                  onChange={(v) => update(selected.id, { h: clamp(v, 0.2, height) })}
                />
              </div>

              {selected.type === "text" && (
                <>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="el-text">Texto</Label>
                    <Textarea
                      id="el-text"
                      rows={3}
                      value={selected.text}
                      maxLength={1000}
                      onChange={(e) => update(selected.id, { text: e.target.value })}
                    />
                  </div>
                  <label className="flex flex-col gap-1 text-sm">
                    Inserir campo do pedido
                    <select
                      className="min-h-11 rounded-lg border bg-background px-3 text-sm md:min-h-9"
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const sep = selected.text && !selected.text.endsWith(" ") ? " " : "";
                        update(selected.id, { text: `${selected.text}${sep}{${e.target.value}}` });
                      }}
                    >
                      <option value="">Escolha um campo…</option>
                      {LABEL_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField
                      label="Tamanho (pt)"
                      value={selected.size}
                      step={1}
                      min={5}
                      onChange={(v) => update(selected.id, { size: clamp(v, 5, 72) })}
                    />
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Alinhamento
                      <select
                        className="min-h-11 rounded-lg border bg-background px-3 text-sm text-foreground md:min-h-9"
                        value={selected.align}
                        onChange={(e) =>
                          update(selected.id, {
                            align: e.target.value as "left" | "center" | "right",
                          })
                        }
                      >
                        <option value="left">Esquerda</option>
                        <option value="center">Centro</option>
                        <option value="right">Direita</option>
                      </select>
                    </label>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                    <Switch
                      checked={selected.bold}
                      onCheckedChange={(v) => update(selected.id, { bold: v })}
                    />
                    Negrito
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                    <Switch
                      checked={selected.border}
                      onCheckedChange={(v) => update(selected.id, { border: v })}
                    />
                    Contorno
                  </label>
                </>
              )}

              {selected.type === "image" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 md:min-h-9"
                    disabled={uploading}
                    onClick={() => pickFile(selected.id)}
                  >
                    {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                    {selected.path ? "Trocar imagem" : "Enviar imagem"}
                  </Button>
                  <label className="flex flex-col gap-1 text-sm">
                    Encaixe
                    <select
                      className="min-h-11 rounded-lg border bg-background px-3 text-sm md:min-h-9"
                      value={selected.fit}
                      onChange={(e) =>
                        update(selected.id, { fit: e.target.value as "contain" | "cover" })
                      }
                    >
                      <option value="contain">Inteira</option>
                      <option value="cover">Preencher (corta as bordas)</option>
                    </select>
                  </label>
                </>
              )}

              {selected.type === "box" && (
                <NumberField
                  label="Arredondamento (mm)"
                  value={selected.radius}
                  onChange={(v) => update(selected.id, { radius: clamp(v, 0, 10) })}
                />
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecione um elemento na etiqueta para editar, ou adicione um novo.
            </p>
          )}
        </section>

        <Button className="min-h-11" disabled={pending} onClick={save}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar modelo
        </Button>
      </aside>
    </div>
  );
}
