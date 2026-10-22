import { Building2, ChevronRight, PlugZap, ShieldCheck, Tag, Tv, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { IconChip, type Tone } from "@/components/kit/stat-card";
import { requireOrg } from "@/lib/auth/dal";
import { can, type Permission } from "@/lib/auth/permissions";

export const metadata = { title: "Configurações" };

const SECTIONS: {
  href?: string;
  title: string;
  description: string;
  icon: typeof Users;
  tone: Tone;
  permission: Permission;
  comingSoon?: boolean;
}[] = [
  {
    href: "/configuracoes/empresa",
    title: "Dados da gráfica",
    description: "Nome, razão social, CNPJ e endereço (remetente das etiquetas).",
    icon: Building2,
    tone: "teal",
    permission: "configuracoes.ver",
  },
  {
    href: "/configuracoes/usuarios",
    title: "Equipe",
    description: "Adicione pessoas, escolha o perfil de cada uma e redefina senhas.",
    icon: Users,
    tone: "primary",
    permission: "equipe.ver",
  },
  {
    href: "/configuracoes/perfis",
    title: "Perfis de acesso",
    description: "Crie perfis e escolha o que cada um pode ver e gerenciar.",
    icon: ShieldCheck,
    tone: "info",
    permission: "equipe.ver",
  },
  {
    href: "/configuracoes/etiquetas",
    title: "Modelos de etiqueta",
    description:
      "Etiquetas de envio e de identificação: use o modelo do GraphicX, crie o seu ou suba a sua arte.",
    icon: Tag,
    tone: "primary",
    permission: "configuracoes.ver",
  },
  {
    href: "/configuracoes/integracoes",
    title: "Integrações",
    description: "Conecte as lojas da Shopee e acompanhe as sincronizações.",
    icon: PlugZap,
    tone: "teal",
    permission: "configuracoes.ver",
  },
  {
    href: "/configuracoes/tv",
    title: "Dispositivos de TV",
    description: "Painel da produção em tela cheia, com link só de leitura para cada TV.",
    icon: Tv,
    tone: "warning",
    permission: "configuracoes.gerenciar",
  },
];

export default function ConfiguracoesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configurações" description="Administração do sistema." />
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted" />}>
        <SectionsGrid />
      </Suspense>
    </div>
  );
}

async function SectionsGrid() {
  const { membership } = await requireOrg(["equipe.ver", "configuracoes.ver"]);
  const visible = SECTIONS.filter((section) => can(membership.permissions, section.permission));
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {visible.map((section) => {
        const content = (
          <>
            <IconChip icon={section.icon} tone={section.tone} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{section.title}</p>
              <p className="text-sm text-muted-foreground">{section.description}</p>
              {section.comingSoon && (
                <p className="mt-2 text-xs font-medium text-muted-foreground">Em breve</p>
              )}
            </div>
            {section.href && (
              <ChevronRight className="size-5 self-center text-muted-foreground" aria-hidden />
            )}
          </>
        );
        const className = "bg-card flex items-start gap-4 rounded-2xl border p-5 shadow-sm";
        return section.href ? (
          <Link
            key={section.title}
            href={section.href}
            className={`${className} transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50`}
          >
            {content}
          </Link>
        ) : (
          <div key={section.title} className={`${className} opacity-75`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
