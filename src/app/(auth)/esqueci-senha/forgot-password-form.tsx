"use client";

import { ArrowLeft, Loader2, MailCheck, Send } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await requestPasswordReset(email);
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  };

  const back = (
    <Button variant="ghost" asChild className="w-full">
      <Link href="/login">
        <ArrowLeft />
        Voltar para o login
      </Link>
    </Button>
  );

  if (sent) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <MailCheck className="mx-auto size-10 text-success" aria-hidden />
        <p className="text-sm">
          Se <strong>{email}</strong> estiver cadastrado, você vai receber um e-mail com o link em
          alguns minutos. Confira também a caixa de spam.
        </p>
        {back}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-email">E-mail cadastrado</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Entra só com usuário (sem e-mail)? Peça ao admin da sua gráfica para redefinir a senha.
        </p>
      </div>
      <Button type="submit" size="lg" disabled={pending || !email} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : <Send />}
        Enviar link
      </Button>
      {back}
    </form>
  );
}
