"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

const schema = z.object({
  identifier: z.string().trim().min(1, "Informe o e-mail ou usuário."),
  password: z.string().min(1, "Informe a senha."),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const searchParams = useSearchParams();
  const linkError =
    searchParams.get("erro") === "link-invalido"
      ? 'O link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".'
      : undefined;
  const [serverError, setServerError] = useState<string | undefined>(linkError);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await login({ ...values, next: searchParams.get("next") ?? undefined });
      if (result?.error) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {serverError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="identifier">E-mail ou usuário</Label>
        <Input
          id="identifier"
          placeholder="voce@grafica.com.br ou nome.cargo"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={Boolean(errors.identifier)}
          aria-describedby={errors.identifier ? "identifier-erro" : "identifier-ajuda"}
          {...register("identifier")}
        />
        {errors.identifier ? (
          <p id="identifier-erro" className="text-sm text-destructive">
            {errors.identifier.message}
          </p>
        ) : (
          <p id="identifier-ajuda" className="text-xs text-muted-foreground">
            Quem não tem e-mail entra com o usuário, ex.: joao.producao
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="password">Senha</Label>
          <Link
            href="/esqueci-senha"
            className="-my-3 inline-flex min-h-11 items-center rounded-md text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Esqueci minha senha
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="pr-12"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-erro" : undefined}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.password && (
          <p id="password-erro" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
