import {
  Boxes,
  ChevronRight,
  Contact,
  CreditCard,
  Package,
  Percent,
  Tags,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { IconChip, type Tone } from "@/components/kit/stat-card";
import { requireOrg } from "@/lib/auth/dal";
import { can, type Permission } from "@/lib/auth/permissions";

export const metadata = { title: "Cadastros" };

const SECTIONS: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
  permission: Permission | Permission[];
}[] = [
  {
    href: "/cadastros/produtos",
    title: "Produtos",
    description: "Variações, preços por canal, ficha técnica e fotos.",
    icon: Package,
    tone: "primary",
    permission: "cadastros.ver",
  },
  {
    href: "/cadastros/clientes",
    title: "Clientes",
    description: "Pessoas e empresas, com origem por canal e endereço.",
    icon: Contact,
    tone: "teal",
    permission: ["cadastros.ver", "pedidos.ver"],
  },
  {
    href: "/cadastros/insumos",
    title: "Insumos",
    description: "Matérias-primas, unidades, custo médio e estoque mínimo.",
    icon: Boxes,
    tone: "success",
    permission: ["cadastros.ver", "estoque.ver"],
  },
  {
    href: "/cadastros/fornecedores",
    title: "Fornecedores",
    description: "Quem vende os insumos, com contatos.",
    icon: Truck,
    tone: "info",
    permission: ["cadastros.ver", "estoque.ver", "financeiro.ver"],
  },
  {
    href: "/cadastros/categorias",
    title: "Categorias",
    description: "Agrupam os produtos.",
    icon: Tags,
    tone: "warning",
    permission: "cadastros.ver",
  },
  {
    href: "/cadastros/precos",
    title: "Preços por canal",
    description: "Ajuste % sobre o preço base em cada canal.",
    icon: Percent,
    tone: "primary",
    permission: "cadastros.ver",
  },
  {
    href: "/cadastros/pagamentos",
    title: "Formas de pagamento",
    description: "Taxas e prazos de recebimento.",
    icon: CreditCard,
    tone: "teal",
    permission: ["cadastros.ver", "financeiro.ver"],
  },
];

export default function CadastrosPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Cadastros" description="Tudo o que a gráfica vende, compra e usa." />
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted" />}>
        <Sections />
      </Suspense>
    </div>
  );
}

async function Sections() {
  const { membership } = await requireOrg([
    "cadastros.ver",
    "pedidos.ver",
    "estoque.ver",
    "financeiro.ver",
  ]);
  const visible = SECTIONS.filter((s) => can(membership.permissions, s.permission));
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {visible.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className="flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <IconChip icon={s.icon} tone={s.tone} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{s.title}</p>
            <p className="text-sm text-muted-foreground">{s.description}</p>
          </div>
          <ChevronRight className="size-5 self-center text-muted-foreground" aria-hidden />
        </Link>
      ))}
    </div>
  );
}
