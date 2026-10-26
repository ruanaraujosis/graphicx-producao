import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-mb-2 inline-flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {label}
    </Link>
  );
}

export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="h-14 w-64 animate-pulse rounded-xl bg-muted" />
      <div className="h-11 w-full max-w-sm animate-pulse rounded-xl bg-muted" />
      <div className="h-80 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
