"use client";

import Link from "next/link";
import { useEffect } from "react";

/** TV desligada: esquece o painel salvo neste aparelho e oferece conectar de novo. */
export function ForgetTv() {
  useEffect(() => {
    try {
      localStorage.removeItem("gx_tv_url");
    } catch {
      // Sem armazenamento: nada a esquecer.
    }
  }, []);
  return (
    <Link
      href="/tv?novo=1"
      className="mt-4 inline-flex min-h-14 items-center rounded-full bg-primary px-8 text-xl font-semibold text-primary-foreground"
    >
      Conectar com código
    </Link>
  );
}
