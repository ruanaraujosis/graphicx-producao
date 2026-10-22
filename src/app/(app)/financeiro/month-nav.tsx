import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

const linkClass =
  "inline-flex size-11 items-center justify-center rounded-xl border bg-card outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:size-9";

/** Navegação entre meses (?mes=AAAA-MM). */
export function MonthNav({
  basePath,
  label,
  prev,
  next,
  isCurrent,
}: {
  basePath: string;
  label: string;
  prev: string;
  next: string;
  isCurrent: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Link href={`${basePath}?mes=${prev}`} className={linkClass} aria-label="Mês anterior">
        <ChevronLeft className="size-4" aria-hidden />
      </Link>
      <span className="min-w-36 text-center font-semibold">{label}</span>
      <Link href={`${basePath}?mes=${next}`} className={linkClass} aria-label="Próximo mês">
        <ChevronRight className="size-4" aria-hidden />
      </Link>
      {!isCurrent && (
        <Link href={basePath} className="text-sm text-primary hover:underline">
          Mês atual
        </Link>
      )}
    </div>
  );
}
