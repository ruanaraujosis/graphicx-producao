"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnPassword, updateOwnName } from "./actions";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

const nameSchema = z.object({
  fullName: z.string().trim().min(2, "Informe o nome completo.").max(120),
});

export function NameForm({ fullName }: { fullName: string }) {
  const [pending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(nameSchema), defaultValues: { fullName } });
  const error = form.formState.errors.fullName?.message;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateOwnName(values);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Nome completo</Label>
        <Input
          id="fullName"
          autoComplete="name"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "fullName-erro" : undefined}
          {...form.register("fullName")}
        />
        <FieldError id="fullName-erro" message={error} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Loader2 className="animate-spin" />}
        Salvar nome
      </Button>
    </form>
  );
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(72),
    confirmPassword: z.string().min(1, "Repita a nova senha."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  });

export function PasswordForm() {
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await changeOwnPassword(values);
      if (result.ok) {
        toast.success(result.message);
        form.reset();
      } else {
        toast.error(result.error);
      }
    }),
  );

  const fields = [
    { name: "currentPassword", label: "Senha atual", autoComplete: "current-password" },
    { name: "newPassword", label: "Nova senha", autoComplete: "new-password" },
    { name: "confirmPassword", label: "Repita a nova senha", autoComplete: "new-password" },
  ] as const;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {fields.map((field) => {
        const message = errors[field.name]?.message;
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
              id={field.name}
              type="password"
              autoComplete={field.autoComplete}
              aria-invalid={Boolean(message)}
              aria-describedby={message ? `${field.name}-erro` : undefined}
              {...form.register(field.name)}
            />
            <FieldError id={`${field.name}-erro`} message={message} />
          </div>
        );
      })}
      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Loader2 className="animate-spin" />}
        Trocar senha
      </Button>
    </form>
  );
}
