"use client";

import { AlertTriangle, CheckCircle2, Loader2, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { SearchPicker } from "@/components/kit/search-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { publicationProblems } from "@/lib/marketplaces/publication";
import type { Attribute, LogisticsChannel } from "@/lib/marketplaces/shopee/publish";
import { loadAttributes, savePublication, searchCategories } from "./actions";
import type { PublicationInput } from "./schema";

type AttrState = Record<number, { ids: number[]; text: string; unit: string }>;
const EMPTY_ATTR = { ids: [], text: "", unit: "" };

function toState(saved: PublicationInput["attributes"]): AttrState {
  const state: AttrState = {};
  for (const a of saved) {
    const custom = a.values.find((v) => v.value_id === 0);
    state[a.attribute_id] = {
      ids: a.values.filter((v) => v.value_id !== 0).map((v) => v.value_id),
      text: custom?.original_value_name ?? "",
      unit: custom?.value_unit ?? "",
    };
  }
  return state;
}

function toPayload(attrs: Attribute[], state: AttrState): PublicationInput["attributes"] {
  return attrs
    .map((a) => {
      const s = state[a.attribute_id];
      if (!s) return { attribute_id: a.attribute_id, values: [] };
      if (a.kind === "text") {
        const text = s.text.trim();
        if (!text) return { attribute_id: a.attribute_id, values: [] };
        const known = a.values.find((v) => v.name.toLowerCase() === text.toLowerCase());
        return {
          attribute_id: a.attribute_id,
          values: [
            known
              ? { value_id: known.value_id }
              : {
                  value_id: 0,
                  original_value_name: text,
                  ...(s.unit ? { value_unit: s.unit } : {}),
                },
          ],
        };
      }
      return { attribute_id: a.attribute_id, values: s.ids.map((value_id) => ({ value_id })) };
    })
    .filter((a) => a.values.length);
}

export function PublishForm({
  productId,
  shopId,
  initial,
  logistics,
  logisticsError,
  check,
}: {
  productId: string;
  shopId: string;
  initial: PublicationInput;
  logistics: LogisticsChannel[];
  logisticsError: string | null;
  /** Dados do cadastro para a lista do que falta. */
  check: {
    images: number;
    productActive: boolean;
    variants: { sku: string; price: number; stock: number | null; weight_g: number | null }[];
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState<{ id: number; path: string } | null>(
    initial.category_id ? { id: initial.category_id, path: initial.category_path ?? "" } : null,
  );
  const [categoryText, setCategoryText] = useState(initial.category_path ?? "");
  const [attrs, setAttrs] = useState<Attribute[]>([]);
  const [attrState, setAttrState] = useState<AttrState>(() => toState(initial.attributes));
  const [attrLoading, setAttrLoading] = useState(false);
  const [attrError, setAttrError] = useState<string | null>(null);
  const [channels, setChannels] = useState<number[]>(initial.logistics);
  const [itemStatus, setItemStatus] = useState(initial.item_status);
  const [pending, start] = useTransition();

  const categoryId = category?.id ?? null;
  useEffect(() => {
    if (!categoryId) return;
    let alive = true;
    // Carrega os atributos pedidos pela categoria (consulta na Shopee).
    const load = async () => {
      setAttrLoading(true);
      setAttrError(null);
      const r = await loadAttributes(shopId, categoryId);
      if (!alive) return;
      setAttrLoading(false);
      if (r.ok) setAttrs(r.attributes);
      else {
        setAttrs([]);
        setAttrError(r.error);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [shopId, categoryId]);

  const payloadAttrs = toPayload(attrs, attrState);
  const missingAttrs = attrs.filter(
    (a) => a.mandatory && !payloadAttrs.some((p) => p.attribute_id === a.attribute_id),
  );
  const problems = [
    ...publicationProblems({
      title,
      description,
      category_id: categoryId,
      logistics: channels,
      images: check.images,
      productActive: check.productActive,
      variants: check.variants,
    }),
    ...missingAttrs.map((a) => `Preencha o atributo obrigatório “${a.name}”.`),
    ...(attrLoading ? ["Carregando os atributos da categoria…"] : []),
  ];

  const setAttr = (id: number, patch: Partial<AttrState[number]>) =>
    setAttrState((s) => ({ ...s, [id]: { ...(s[id] ?? EMPTY_ATTR), ...patch } }));

  const submit = (publish: boolean) =>
    start(async () => {
      const r = await savePublication(
        productId,
        shopId,
        {
          title,
          description,
          category_id: categoryId,
          category_path: category?.path ?? null,
          attributes: payloadAttrs,
          logistics: channels,
          item_status: itemStatus,
        },
        publish,
      );
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
        if (publish) router.push(`/cadastros/produtos/${productId}`);
      } else toast.error(r.error);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pub-title">Título do anúncio</Label>
          <Input
            id="pub-title"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{title.trim().length}/120</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pub-desc">Descrição</Label>
          <Textarea
            id="pub-desc"
            rows={8}
            value={description}
            maxLength={5000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pub-cat">Categoria na Shopee</Label>
          <SearchPicker
            id="pub-cat"
            value={categoryText}
            onTextChange={(t) => {
              setCategoryText(t);
              if (category && t !== category.path) setCategory(null);
            }}
            onPick={(o) => {
              setCategory({ id: Number(o.value), path: o.label });
              setCategoryText(o.label);
              setAttrState({});
            }}
            search={searchCategories}
            minChars={2}
            placeholder="Ex.: canecas, adesivos, convites"
            ariaLabel="Buscar categoria da Shopee"
            emptyText="Nenhuma categoria encontrada."
          />
        </div>

        {categoryId && (
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-sm font-medium">Atributos da categoria</legend>
            {attrLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Carregando atributos…
              </p>
            )}
            {attrError && <p className="text-sm text-destructive">{attrError}</p>}
            {!attrLoading && !attrError && attrs.length === 0 && (
              <p className="text-sm text-muted-foreground">Esta categoria não pede atributos.</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {attrs.map((a) => {
                const s = attrState[a.attribute_id];
                const label = `${a.name}${a.mandatory ? " *" : ""}`;
                if (a.kind === "select") {
                  return (
                    <div key={a.attribute_id} className="flex flex-col gap-2">
                      <Label>{label}</Label>
                      <Select
                        value={s?.ids[0] ? String(s.ids[0]) : undefined}
                        onValueChange={(v) => setAttr(a.attribute_id, { ids: [Number(v)] })}
                      >
                        <SelectTrigger className="min-h-11 w-full md:min-h-9" aria-label={a.name}>
                          <SelectValue placeholder="Escolha" />
                        </SelectTrigger>
                        <SelectContent>
                          {a.values.map((v) => (
                            <SelectItem key={v.value_id} value={String(v.value_id)}>
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                if (a.kind === "multi") {
                  return (
                    <fieldset key={a.attribute_id} className="flex flex-col gap-2 sm:col-span-2">
                      <legend className="text-sm font-medium">{label}</legend>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {a.values.map((v) => {
                          const checked = s?.ids.includes(v.value_id) ?? false;
                          return (
                            <label
                              key={v.value_id}
                              className="flex min-h-11 items-center gap-2 text-sm md:min-h-0"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) =>
                                  setAttr(a.attribute_id, {
                                    ids: c
                                      ? [...(s?.ids ?? []), v.value_id]
                                      : (s?.ids ?? []).filter((x) => x !== v.value_id),
                                  })
                                }
                              />
                              {v.name}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                }
                return (
                  <div key={a.attribute_id} className="flex flex-col gap-2">
                    <Label htmlFor={`attr-${a.attribute_id}`}>{label}</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`attr-${a.attribute_id}`}
                        list={a.values.length ? `attr-list-${a.attribute_id}` : undefined}
                        value={s?.text ?? ""}
                        maxLength={200}
                        onChange={(e) => setAttr(a.attribute_id, { text: e.target.value })}
                      />
                      {a.units.length > 0 && (
                        <Select
                          value={s?.unit || undefined}
                          onValueChange={(v) => setAttr(a.attribute_id, { unit: v })}
                        >
                          <SelectTrigger className="min-h-11 w-24 md:min-h-9" aria-label="Unidade">
                            <SelectValue placeholder="un." />
                          </SelectTrigger>
                          <SelectContent>
                            {a.units.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {a.values.length > 0 && (
                      <datalist id={`attr-list-${a.attribute_id}`}>
                        {a.values.map((v) => (
                          <option key={v.value_id} value={v.name} />
                        ))}
                      </datalist>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Formas de envio</legend>
          {logisticsError && <p className="text-sm text-destructive">{logisticsError}</p>}
          {!logisticsError && logistics.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma forma de envio habilitada na loja. Habilite no Seller Centre da Shopee.
            </p>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {logistics.map((c) => (
              <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                <Checkbox
                  checked={channels.includes(c.id)}
                  onCheckedChange={(v) =>
                    setChannels((list) => (v ? [...list, c.id] : list.filter((x) => x !== c.id)))
                  }
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Ao publicar</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {(
              [
                ["NORMAL", "Deixar ativo (à venda)"],
                ["UNLIST", "Deixar pausado para revisar na Shopee"],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                <input
                  type="radio"
                  name="item_status"
                  className="size-4 accent-primary"
                  checked={itemStatus === value}
                  onChange={() => setItemStatus(value)}
                />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-base font-semibold">Antes de publicar</h2>
          {problems.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden />
              Tudo pronto para publicar.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {problems.map((p) => (
                <li key={p} className="flex gap-2 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          className="min-h-11"
          disabled={pending || problems.length > 0}
          onClick={() => submit(true)}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          Publicar na Shopee
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={() => submit(false)}
        >
          <Save />
          Salvar rascunho
        </Button>
      </aside>
    </div>
  );
}
