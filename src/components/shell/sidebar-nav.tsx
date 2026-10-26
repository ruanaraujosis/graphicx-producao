"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { isActivePath, navItemsFor, type NavContext } from "@/lib/navigation";

export function SidebarNav(context: NavContext) {
  const pathname = usePathname();
  const items = navItemsFor(context);

  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon, comingSoon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
              "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className={cn("size-5", active && "text-primary")} aria-hidden />
            <span className="flex-1">{label}</span>
            {comingSoon && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                em breve
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarNavSkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
