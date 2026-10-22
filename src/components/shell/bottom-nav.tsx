"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isActivePath, navItemsFor, splitBottomNav, type NavContext } from "@/lib/navigation";

const itemClass =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[0.7rem] font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Navegação inferior do celular. Itens que não cabem ficam no "Mais". */
export function BottomNav(context: NavContext) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { primary, overflow } = splitBottomNav(navItemsFor(context));
  const overflowActive = overflow.some((item) => isActivePath(pathname, item.href));

  return (
    <nav
      aria-label="Menu principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden"
    >
      <div className="flex gap-1 px-2 py-1.5">
        {primary.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(itemClass, active ? "text-primary" : "text-muted-foreground")}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                  active && "bg-accent",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              {label}
            </Link>
          );
        })}
        {overflow.length > 0 && (
          <Sheet open={open} onOpenChange={setOpen}>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(itemClass, overflowActive ? "text-primary" : "text-muted-foreground")}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full",
                  overflowActive && "bg-accent",
                )}
              >
                <Ellipsis className="size-5" aria-hidden />
              </span>
              Mais
            </button>
            <SheetContent side="bottom" className="rounded-t-3xl pb-8">
              <SheetHeader>
                <SheetTitle>Mais opções</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2 px-4">
                {overflow.map(({ href, label, icon: Icon }) => {
                  const active = isActivePath(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border text-xs font-medium",
                        active ? "border-primary/30 bg-accent text-accent-foreground" : "bg-card",
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}
