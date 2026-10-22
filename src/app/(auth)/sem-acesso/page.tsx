import { AuthCard } from "@/components/kit/auth-card";
import { LogoutButton } from "./logout-button";

export const metadata = { title: "Sem acesso" };

export default function SemAcessoPage() {
  return (
    <AuthCard
      title="Sua conta não tem gráfica ativa"
      description="Você ainda não foi adicionado a nenhuma gráfica, ou seu acesso foi desativado. Fale com o administrador da sua gráfica."
    >
      <LogoutButton />
    </AuthCard>
  );
}
