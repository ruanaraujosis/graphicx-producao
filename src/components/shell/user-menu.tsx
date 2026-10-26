"use client";

import { ArrowLeftRight, Building2, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/lib/auth/actions";
import { initials } from "@/lib/format";

export function UserMenu({
  fullName,
  username,
  subtitle,
  organizationName,
  canSwitchOrganization,
  isPlatformAdmin,
}: {
  fullName: string;
  username: string;
  /** Perfil na gráfica ativa, ou "SuperAdmin" fora de uma gráfica. */
  subtitle: string;
  organizationName?: string;
  canSwitchOrganization: boolean;
  isPlatformAdmin: boolean;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-h-11 items-center gap-2.5 rounded-xl px-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:px-2"
        aria-label={`Menu de ${fullName}`}
      >
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
            {initials(fullName)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden flex-col text-left leading-tight md:flex">
          <span className="text-sm font-semibold">{fullName}</span>
          <span className="text-xs text-brand-header-muted">{subtitle}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">{fullName}</span>
          <span className="text-xs font-normal text-muted-foreground">{username}</span>
          {organizationName && (
            <span className="mt-1 text-xs font-medium text-primary">{organizationName}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/perfil">
              <UserRound />
              Meu perfil
            </Link>
          </DropdownMenuItem>
          {canSwitchOrganization && (
            <DropdownMenuItem asChild>
              <Link href="/selecionar-empresa">
                <ArrowLeftRight />
                Trocar de gráfica
              </Link>
            </DropdownMenuItem>
          )}
          {isPlatformAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/plataforma">
                <Building2 />
                Plataforma
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Moon />
              Tema
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light">
                  <Sun /> Claro
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon /> Escuro
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor /> Automático
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => logout()}>
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
