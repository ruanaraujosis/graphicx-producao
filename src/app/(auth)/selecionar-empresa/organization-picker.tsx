"use client";

import { Building2, ChevronRight, Loader2, LogOut } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { logout, selectOrganization } from "@/lib/auth/actions";
import { initials } from "@/lib/format";

type Option = { id: string; name: string; roleLabel: string };

export function OrganizationPicker({
  organizations,
  showPlatform,
}: {
  organizations: Option[];
  showPlatform: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string>();

  const choose = (id: string) => {
    setChosen(id);
    startTransition(async () => {
      const result = await selectOrganization(id);
      if (result?.error) toast.error(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {organizations.map((org) => (
          <li key={org.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(org.id)}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors outline-none hover:border-primary/40 hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            >
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent font-semibold text-accent-foreground"
              >
                {initials(org.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{org.name}</span>
                <span className="block text-xs text-muted-foreground">{org.roleLabel}</span>
              </span>
              {pending && chosen === org.id ? (
                <Loader2 className="size-5 animate-spin text-primary" aria-label="Entrando" />
              ) : (
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>

      {showPlatform && (
        <Button variant="outline" asChild>
          <Link href="/plataforma">
            <Building2 />
            Painel da plataforma
          </Link>
        </Button>
      )}
      <Button variant="ghost" onClick={() => logout()}>
        <LogOut />
        Sair
      </Button>
    </div>
  );
}
