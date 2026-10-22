"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

/** Campo de busca que atualiza ?q= (e volta para a página 1) com uma pequena espera. */
export function ListSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (value.trim() === current) return;
    const timer = setTimeout(() => {
      // Mantém os outros filtros; a busca nova volta para a página 1.
      const params = new URLSearchParams(searchParams);
      params.delete("pagina");
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");
      startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname));
    }, 300);
    return () => clearTimeout(timer);
  }, [value, pathname, router, searchParams]);

  return (
    <div className="relative w-full sm:max-w-sm">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pr-10 pl-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Limpar busca"
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
