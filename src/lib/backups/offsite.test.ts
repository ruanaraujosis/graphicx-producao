// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { offsiteFromEnv, removeOffsite, uploadOffsite } from "./offsite";

const ENV = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "chave-de-teste",
  R2_SECRET_ACCESS_KEY: "segredo-de-teste",
  R2_BUCKET: "graphicx-backups",
};

afterEach(() => vi.unstubAllGlobals());

describe("cópia externa (R2)", () => {
  it("sem nenhuma variável, fica desligada", () => {
    expect(offsiteFromEnv({})).toBeNull();
  });

  it("configuração incompleta ou malformada vira erro claro", () => {
    expect(() => offsiteFromEnv({ ...ENV, R2_ACCOUNT_ID: "conta" })).toThrow("R2_ACCOUNT_ID");
    expect(() => offsiteFromEnv({ ...ENV, R2_BUCKET: "Bucket_Errado" })).toThrow("R2_BUCKET");
    expect(() => offsiteFromEnv({ ...ENV, R2_SECRET_ACCESS_KEY: "" })).toThrow("R2_SECRET");
  });

  it("grava no bucket da conta com assinatura S3 (SigV4)", async () => {
    const fetchMock = vi.fn<(req: Request) => Promise<Response>>(
      async () => new Response(null, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const config = offsiteFromEnv(ENV)!;
    await uploadOffsite(config, "org-1/2026-11-02-automatico.json.gz.enc", Buffer.from("x"));

    const req = fetchMock.mock.calls[0][0];
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(
      "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/graphicx-backups/org-1/2026-11-02-automatico.json.gz.enc",
    );
    expect(req.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=chave-de-teste\//,
    );
  });

  it("resposta de erro do R2 vira exceção; remoção ignora falhas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    const config = offsiteFromEnv(ENV)!;
    await expect(uploadOffsite(config, "a/b", Buffer.from("x"))).rejects.toThrow("403");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("rede"))),
    );
    await expect(removeOffsite(config, ["a/b", "a/c"])).resolves.toBeUndefined();
  });
});
