/** Documentos e contatos brasileiros: validação e formatação. */

export function digits(value: string) {
  return value.replace(/\D/g, "");
}

function allSame(value: string) {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(raw: string) {
  const cpf = digits(raw);
  if (cpf.length !== 11 || allSame(cpf)) return false;
  const check = (len: number) => {
    const sum = cpf
      .slice(0, len)
      .split("")
      .reduce((acc, n, i) => acc + Number(n) * (len + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

export function isValidCnpj(raw: string) {
  const cnpj = digits(raw);
  if (cnpj.length !== 14 || allSame(cnpj)) return false;
  const digit = (base: string) => {
    const weights =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, n, i) => acc + Number(n) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = digit(cnpj.slice(0, 12));
  const second = digit(cnpj.slice(0, 12) + first);
  return cnpj.endsWith(`${first}${second}`);
}

export function formatDocument(value: string | null | undefined) {
  if (!value) return "";
  const d = digits(value);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return value;
}

export function formatPhone(value: string | null | undefined) {
  if (!value) return "";
  const d = digits(value).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return value;
}

export function formatCep(value: string | null | undefined) {
  if (!value) return "";
  const d = digits(value);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : value;
}

export const UF_LIST = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;
