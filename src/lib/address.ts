import { formatCep } from "@/lib/documents";

export type Address = {
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
};

/** Endereço em uma linha: "Rua X, 10 – Sala 2 – Centro – Cidade/UF – CEP 01234-567". */
export function formatAddress(a: Partial<Address>) {
  const street = [a.street, a.number].filter(Boolean).join(", ");
  const city = [a.city, a.state].filter(Boolean).join("/");
  return [street, a.complement, a.district, city, a.cep ? `CEP ${formatCep(a.cep)}` : null]
    .filter(Boolean)
    .join(" – ");
}

/** Endereço completo o bastante para postar (rua, número, cidade, UF e CEP). */
export function isShippable(a: Partial<Address>) {
  return Boolean(a.street && a.number && a.city && a.state && a.cep);
}
