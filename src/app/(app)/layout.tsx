import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { BottomNav } from "@/components/shell/bottom-nav";
import { SidebarNav, SidebarNavSkeleton } from "@/components/shell/sidebar-nav";
import { CastToTv } from "@/components/shell/cast-to-tv";
import { UserMenu } from "@/components/shell/user-menu";
import { getShellContext } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

/**
 * Layout das áreas logadas. A moldura (header, sidebar) é estática e entra no
 * shell pré-renderizado; o que depende do usuário carrega dentro de <Suspense>.
 * Cada página exige o que precisa (gráfica ativa, perfil, SuperAdmin).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b-[3px] border-brand-teal bg-brand-header text-brand-header-foreground shadow-sm">
        <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/inicio"
              className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Logo />
            </Link>
            <Suspense fallback={null}>
              <OrganizationBadge />
            </Suspense>
          </div>
          <Suspense fallback={<div className="size-9 rounded-full bg-muted" aria-hidden />}>
            <HeaderUser />
          </Suspense>
        </div>
      </header>

      <div className="flex w-full flex-1">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto border-r bg-sidebar p-4 md:block">
          <Suspense fallback={<SidebarNavSkeleton />}>
            <Sidebar />
          </Suspense>
        </aside>
        <main id="conteudo" className="min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-10">
          {children}
        </main>
      </div>

      <Suspense fallback={null}>
        <MobileNav />
      </Suspense>
    </div>
  );
}

async function OrganizationBadge() {
  const { session, membership } = await getShellContext();
  if (!membership) return null;
  const label = <span className="truncate">{membership.name}</span>;
  const className =
    "hidden max-w-56 items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-secondary-foreground text-sm font-medium sm:flex";
  return session.memberships.length > 1 ? (
    <Link
      href="/selecionar-empresa"
      className={`${className} outline-none hover:bg-secondary/70 focus-visible:ring-3 focus-visible:ring-ring/50`}
      title="Trocar de gráfica"
    >
      {label}
    </Link>
  ) : (
    <span className={className}>{label}</span>
  );
}

async function HeaderUser() {
  const { session, membership } = await getShellContext();
  return (
    <div className="flex items-center gap-1">
      {membership && (
        <CastToTv canConnect={can(membership.permissions, "configuracoes.gerenciar")} />
      )}
      <UserMenu
        fullName={session.fullName}
        username={session.username}
        subtitle={membership ? membership.roleName : session.isPlatformAdmin ? "SuperAdmin" : ""}
        organizationName={membership?.name}
        canSwitchOrganization={session.memberships.length > 1}
        isPlatformAdmin={session.isPlatformAdmin}
      />
    </div>
  );
}

async function Sidebar() {
  const { session, membership } = await getShellContext();
  return (
    <SidebarNav permissions={membership?.permissions} isPlatformAdmin={session.isPlatformAdmin} />
  );
}

async function MobileNav() {
  const { session, membership } = await getShellContext();
  return (
    <BottomNav permissions={membership?.permissions} isPlatformAdmin={session.isPlatformAdmin} />
  );
}
