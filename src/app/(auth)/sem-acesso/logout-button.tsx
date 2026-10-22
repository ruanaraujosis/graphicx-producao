"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth/actions";

export function LogoutButton() {
  return (
    <Button variant="outline" className="w-full" onClick={() => logout()}>
      <LogOut />
      Sair e entrar com outra conta
    </Button>
  );
}
