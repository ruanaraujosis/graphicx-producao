"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, type FieldError as RHFFieldError } from "react-hook-form";
import { toast } from "sonner";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { EntityFormDialog } from "@/components/kit/entity-form";
import { createOrganization, setOrganizationActive, updateOrganization } from "./actions";
import { createOrganizationSchema, editOrganizationSchema } from "./schemas";

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: RHFFieldError;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {error.message}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

const invalid = (id: string, error?: RHFFieldError) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": error ? `${id}-erro` : undefined,
});

function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function CreateOrganizationDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: "",
      slug: "",
      document: "",
      adminFullName: "",
      adminUsername: "",
      adminEmail: "",
      adminPassword: "",
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const result = await createOrganization(form.getValues());
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        form.reset();
      } else {
        toast.error(result.error);
      }
    }),
  );

  const nameField = form.register("name");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Nova gráfica
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova gráfica</DialogTitle>
          <DialogDescription>
            Cria a empresa e o primeiro administrador dela. Ele cadastra o restante da equipe.
          </DialogDescription>
        </DialogHeader>
        <form id="create-org" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field id="org-name" label="Nome da gráfica" error={errors.name}>
            <Input
              id="org-name"
              {...invalid("org-name", errors.name)}
              {...nameField}
              onChange={(event) => {
                nameField.onChange(event);
                if (!form.getFieldState("slug").isDirty) {
                  form.setValue("slug", slugify(event.target.value));
                }
              }}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="org-slug" label="Código" error={errors.slug} hint="Ex.: grafica-centro">
              <Input
                id="org-slug"
                autoCapitalize="none"
                spellCheck={false}
                {...invalid("org-slug", errors.slug)}
                {...form.register("slug")}
              />
            </Field>
            <Field id="org-cnpj" label="CNPJ (opcional)" error={errors.document}>
              <Input
                id="org-cnpj"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                {...invalid("org-cnpj", errors.document)}
                {...form.register("document")}
              />
            </Field>
          </div>

          <Separator />
          <p className="text-sm font-medium">Administrador da gráfica</p>

          <Field id="adm-name" label="Nome completo" error={errors.adminFullName}>
            <Input
              id="adm-name"
              {...invalid("adm-name", errors.adminFullName)}
              {...form.register("adminFullName")}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="adm-username" label="Usuário" error={errors.adminUsername} hint="nome.cargo">
              <Input
                id="adm-username"
                autoCapitalize="none"
                spellCheck={false}
                {...invalid("adm-username", errors.adminUsername)}
                {...form.register("adminUsername")}
              />
            </Field>
            <Field
              id="adm-email"
              label="E-mail"
              error={errors.adminEmail}
              hint="Se já tiver conta, só é vinculado"
            >
              <Input
                id="adm-email"
                type="email"
                {...invalid("adm-email", errors.adminEmail)}
                {...form.register("adminEmail")}
              />
            </Field>
          </div>
          <Field
            id="adm-password"
            label="Senha provisória"
            error={errors.adminPassword}
            hint="No 1º acesso o admin cria a própria senha e configura o MFA. Se o e-mail já tiver conta, este campo é ignorado."
          >
            <Input
              id="adm-password"
              type="password"
              autoComplete="new-password"
              {...invalid("adm-password", errors.adminPassword)}
              {...form.register("adminPassword")}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="submit" form="create-org" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Criar gráfica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationActiveSwitch({
  id,
  name,
  active,
}: {
  id: string;
  name: string;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={active}
      disabled={pending}
      aria-label={`${active ? "Desativar" : "Reativar"} ${name}`}
      onCheckedChange={(next) =>
        startTransition(async () => {
          const result = await setOrganizationActive(id, next);
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        })
      }
    />
  );
}

/** Edição dos dados da gráfica pela plataforma, inclusive o código. */
export function EditOrganizationDialog({
  organization,
}: {
  organization: {
    id: string;
    name: string;
    slug: string;
    legal_name: string | null;
    document: string | null;
  };
}) {
  return (
    <EntityFormDialog
      title={`Editar ${organization.name}`}
      description="O código identifica a gráfica na plataforma. Só você (SuperAdmin) pode mudá-lo."
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Editar ${organization.name}`}>
          <Pencil />
        </Button>
      }
      schema={editOrganizationSchema}
      defaultValues={{
        name: organization.name,
        slug: organization.slug,
        legal_name: organization.legal_name ?? "",
        document: organization.document ?? "",
      }}
      fields={[
        { name: "name", label: "Nome da gráfica" },
        { name: "slug", label: "Código", half: true, hint: "Letras minúsculas, números e hífen." },
        { name: "document", label: "CNPJ", half: true, inputMode: "numeric" },
        { name: "legal_name", label: "Razão social" },
      ]}
      action={(values) => updateOrganization(organization.id, values)}
      submitLabel="Salvar"
    />
  );
}
