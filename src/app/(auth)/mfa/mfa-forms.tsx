"use client";

import { Loader2, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logout } from "@/lib/auth/actions";
import { startEnrollment, verifyCode, type EnrollmentResult } from "./actions";

function CodeForm({
  factorId,
  next,
  submitLabel,
}: {
  factorId: string;
  next: string;
  submitLabel: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await verifyCode({ factorId, code, next });
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="mfa-code">Código de 6 dígitos</Label>
        <Input
          id="mfa-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          className="text-center font-mono text-2xl tracking-[0.5em] md:h-12 md:text-2xl"
          aria-invalid={Boolean(error)}
        />
      </div>
      <Button type="submit" size="lg" disabled={pending || code.length !== 6} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
        {submitLabel}
      </Button>
    </form>
  );
}

function SignOut() {
  return (
    <Button variant="ghost" className="mt-2 w-full" onClick={() => logout()}>
      <LogOut />
      Sair
    </Button>
  );
}

export function MfaVerify({ factorId, next }: { factorId: string; next: string }) {
  return (
    <>
      <CodeForm factorId={factorId} next={next} submitLabel="Verificar" />
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Perdeu o celular? Peça ao administrador da gráfica (ou ao suporte) para redefinir sua
        verificação em duas etapas.
      </p>
      <SignOut />
    </>
  );
}

export function MfaEnroll({ next }: { next: string }) {
  const [enrollment, setEnrollment] = useState<Extract<EnrollmentResult, { ok: true }>>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const begin = () =>
    startTransition(async () => {
      setError(undefined);
      const result = await startEnrollment();
      if (result.ok) setEnrollment(result);
      else setError(result.error);
    });

  if (!enrollment) {
    return (
      <div className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <ol className="flex flex-col gap-3 text-sm">
          <li className="flex gap-3">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span>
              Instale um app autenticador no celular: <strong>Google Authenticator</strong>,{" "}
              <strong>Microsoft Authenticator</strong> ou similar.
            </span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span>Leia o QR code que vai aparecer e digite o código gerado.</span>
          </li>
        </ol>
        <Button size="lg" onClick={begin} disabled={pending} className="w-full">
          {pending && <Loader2 className="animate-spin" />}
          Configurar agora
        </Button>
        <SignOut />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto rounded-2xl bg-white p-3 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- QR code em data URI gerado pelo Supabase */}
        <img
          src={enrollment.qrCode}
          alt="QR code para o app autenticador"
          width={192}
          height={192}
        />
      </div>
      <details className="rounded-xl bg-muted p-3 text-sm">
        <summary className="cursor-pointer font-medium">Não consegue ler o QR code?</summary>
        <p className="mt-2 text-muted-foreground">Digite esta chave no app autenticador:</p>
        <code className="mt-1 block font-mono text-xs break-all select-all">
          {enrollment.secret}
        </code>
      </details>
      <CodeForm factorId={enrollment.factorId} next={next} submitLabel="Confirmar e entrar" />
    </div>
  );
}
