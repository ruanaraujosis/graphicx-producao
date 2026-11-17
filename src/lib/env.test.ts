import { afterEach, describe, expect, it, vi } from "vitest";
import { getServerAppUrl } from "./env";

describe("getServerAppUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  function stubBase() {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "chave-publica-de-teste");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://grapphicx.test");
  }

  it("usa o endereço fixo da branch nos previews da Vercel", () => {
    stubBase();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_BRANCH_URL", "graphicx-git-develop-acpark.vercel.app");
    expect(getServerAppUrl()).toBe("https://graphicx-git-develop-acpark.vercel.app");
  });

  it("usa o NEXT_PUBLIC_APP_URL em produção", () => {
    stubBase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_BRANCH_URL", "graphicx-git-main-acpark.vercel.app");
    expect(getServerAppUrl()).toBe("https://grapphicx.test");
  });

  it("usa o NEXT_PUBLIC_APP_URL fora da Vercel", () => {
    stubBase();
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_BRANCH_URL", "");
    expect(getServerAppUrl()).toBe("https://grapphicx.test");
  });
});
