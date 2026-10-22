"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { digits } from "@/lib/documents";

export type FieldOption = { value: string; label: string };

export type FieldConfig = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "number" | "date" | "textarea" | "select" | "switch" | "cep";
  options?: readonly FieldOption[];
  placeholder?: string;
  hint?: string;
  /** Ocupa a linha inteira (padrão) ou meia linha em telas médias. */
  half?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  step?: string;
  /** Mostra o campo só quando a condição for verdadeira (ex.: razão social só para PJ). */
  showWhen?: (values: Record<string, unknown>) => boolean;
};

export type FormActionResult = { ok: true; message: string } | { ok: false; error: string };

type Values = Record<string, unknown>;

/**
 * Formulário em diálogo montado a partir de uma lista de campos.
 * O schema Zod valida aqui e de novo no servidor (a Server Action recebe os valores crus).
 */
export function EntityFormDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  schema,
  defaultValues,
  fields,
  action,
  submitLabel = "Salvar",
  onSuccess,
  wide,
}: {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  schema: z.ZodType;
  defaultValues: Values;
  fields: readonly FieldConfig[];
  action: (values: Values) => Promise<FormActionResult>;
  submitLabel?: string;
  onSuccess?: () => void;
  wide?: boolean;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const [pending, startTransition] = useTransition();
  const [cepLoading, setCepLoading] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema as never) as unknown as Resolver<Values>,
    defaultValues,
  });
  const values = useWatch({ control: form.control }) as Values;
  const { errors } = form.formState;
  const formId = `form-${title.replace(/\W+/g, "-").toLowerCase()}`;

  const submit = form.handleSubmit(() =>
    startTransition(async () => {
      const result = await action(form.getValues());
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
    }),
  );

  // Busca o endereço pelo CEP (ViaCEP) e preenche os campos; a pessoa pode corrigir depois.
  const lookupCep = async (cep: string) => {
    const clean = digits(cep);
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) {
        toast.error("CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }
      const set = (name: string, value?: string) =>
        value && form.setValue(name, value, { shouldDirty: true });
      set("street", data.logradouro);
      set("district", data.bairro);
      set("city", data.localidade);
      set("state", data.uf);
      document.getElementById(`${formId}-number`)?.focus();
    } catch {
      toast.error("Não foi possível buscar o CEP agora.");
    } finally {
      setCepLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaultValues);
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={cn("max-h-[90dvh] overflow-y-auto", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form id={formId} noValidate onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            if (field.showWhen && !field.showWhen(values)) return null;
            const id = `${formId}-${field.name}`;
            const error = errors[field.name]?.message as string | undefined;
            const aria = {
              "aria-invalid": Boolean(error),
              "aria-describedby": error ? `${id}-erro` : field.hint ? `${id}-dica` : undefined,
            };

            let control: React.ReactNode;
            switch (field.type) {
              case "textarea":
                control = (
                  <Textarea
                    id={id}
                    rows={3}
                    placeholder={field.placeholder}
                    {...aria}
                    {...form.register(field.name)}
                  />
                );
                break;
              case "select":
                control = (
                  <Controller
                    control={form.control}
                    name={field.name}
                    render={({ field: f }) => (
                      <Select value={(f.value as string) ?? ""} onValueChange={f.onChange}>
                        <SelectTrigger id={id} className="w-full" {...aria}>
                          <SelectValue placeholder={field.placeholder ?? "Selecione"} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                );
                break;
              case "switch":
                return (
                  <Controller
                    key={field.name}
                    control={form.control}
                    name={field.name}
                    render={({ field: f }) => (
                      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 p-3 sm:col-span-2">
                        <div>
                          <Label htmlFor={id}>{field.label}</Label>
                          {field.hint && (
                            <p className="text-xs text-muted-foreground">{field.hint}</p>
                          )}
                        </div>
                        <Switch id={id} checked={Boolean(f.value)} onCheckedChange={f.onChange} />
                      </div>
                    )}
                  />
                );
              case "cep":
                control = (
                  <div className="flex gap-2">
                    <Input
                      id={id}
                      inputMode="numeric"
                      placeholder="00000-000"
                      {...aria}
                      {...form.register(field.name, { onBlur: (e) => lookupCep(e.target.value) })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Buscar endereço pelo CEP"
                      onClick={() => lookupCep(String(form.getValues(field.name) ?? ""))}
                      disabled={cepLoading}
                    >
                      {cepLoading ? <Loader2 className="animate-spin" /> : <Search />}
                    </Button>
                  </div>
                );
                break;
              default:
                control = (
                  <Input
                    id={id}
                    type={field.type === "number" ? "text" : (field.type ?? "text")}
                    inputMode={field.inputMode ?? (field.type === "number" ? "decimal" : undefined)}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    {...aria}
                    {...form.register(field.name)}
                  />
                );
            }

            return (
              <div
                key={field.name}
                className={cn("flex flex-col gap-2", !field.half && "sm:col-span-2")}
              >
                <Label htmlFor={id}>{field.label}</Label>
                {control}
                {error ? (
                  <p id={`${id}-erro`} className="text-sm text-destructive">
                    {error}
                  </p>
                ) : (
                  field.hint && (
                    <p id={`${id}-dica`} className="text-xs text-muted-foreground">
                      {field.hint}
                    </p>
                  )
                )}
              </div>
            );
          })}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
