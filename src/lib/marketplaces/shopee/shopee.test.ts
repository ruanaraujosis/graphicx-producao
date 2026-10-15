// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { authorizationUrl, exchangeCode } from "./auth";
import { ShopeeError, shopeeRequest } from "./client";
import type { ShopeeConfig } from "./config";
import { signRequest, verifyPushSignature } from "./sign";

const config: ShopeeConfig = {
  partnerId: 1000001,
  partnerKey: "chave-de-teste-nao-real",
  host: "https://shopee.test",
  sandbox: true,
};

const hmac = (s: string) => createHmac("sha256", config.partnerKey).update(s).digest("hex");

/** Shopee simulada: responde por caminho e guarda as chamadas. */
function fakeShopee(routes: Record<string, unknown>) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const body = routes[url.pathname];
    return new Response(JSON.stringify(body ?? { error: "not_found", message: "rota" }), {
      status: body ? 200 : 404,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("assinatura da Shopee", () => {
  it("chamada pública: partner_id + caminho + timestamp", () => {
    expect(
      signRequest({
        partnerKey: config.partnerKey,
        partnerId: 1000001,
        path: "/api/v2/shop/auth_partner",
        timestamp: 1700000000,
      }),
    ).toBe(hmac("1000001/api/v2/shop/auth_partner1700000000"));
  });

  it("chamada da loja: inclui access_token e shop_id", () => {
    expect(
      signRequest({
        partnerKey: config.partnerKey,
        partnerId: 1000001,
        path: "/api/v2/order/get_order_list",
        timestamp: 1700000000,
        accessToken: "tok",
        shopId: 555,
      }),
    ).toBe(hmac("1000001/api/v2/order/get_order_list1700000000tok555"));
  });

  it("aviso (push): confere url|corpo e recusa assinatura errada", () => {
    const url = "https://app.test/api/marketplaces/shopee/webhook";
    const rawBody = '{"code":3,"shop_id":555}';
    const good = hmac(`${url}|${rawBody}`);
    expect(
      verifyPushSignature({ partnerKey: config.partnerKey, url, rawBody, authorization: good }),
    ).toBe(true);
    expect(
      verifyPushSignature({
        partnerKey: config.partnerKey,
        url,
        rawBody: rawBody + " ",
        authorization: good,
      }),
    ).toBe(false);
    expect(
      verifyPushSignature({ partnerKey: config.partnerKey, url, rawBody, authorization: null }),
    ).toBe(false);
  });
});

describe("autorização da loja", () => {
  it("monta o link de autorização com assinatura e retorno", () => {
    const url = new URL(
      authorizationUrl(config, "https://app.test/volta?state=abc", 1700000000000),
    );
    expect(url.pathname).toBe("/api/v2/shop/auth_partner");
    expect(url.searchParams.get("redirect")).toBe("https://app.test/volta?state=abc");
    expect(url.searchParams.get("sign")).toBe(hmac("1000001/api/v2/shop/auth_partner1700000000"));
  });

  it("troca o código pelos tokens e calcula as validades", async () => {
    const { fetchImpl, calls } = fakeShopee({
      "/api/v2/auth/token/get": {
        access_token: "a",
        refresh_token: "r",
        expire_in: 14400,
        request_id: "x",
      },
    });
    const logs: unknown[] = [];
    const tokens = await exchangeCode(config, "codigo", 555, {
      fetchImpl,
      now: () => 1700000000000,
      onLog: (l) => logs.push(l),
    });
    expect(tokens.accessToken).toBe("a");
    expect(tokens.accessExpiresAt.toISOString()).toBe(
      new Date(1700000000000 + 14400_000).toISOString(),
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      code: "codigo",
      shop_id: 555,
      partner_id: 1000001,
    });
    expect(logs).toHaveLength(1);
  });
});

describe("erros da Shopee", () => {
  it("vira ShopeeError com código e registra a falha", async () => {
    const { fetchImpl } = fakeShopee({
      "/api/v2/order/get_order_list": {
        error: "invalid_access_token",
        message: "Token expirado",
        request_id: "rq1",
      },
    });
    const logs: { ok: boolean; error: string | null }[] = [];
    const call = shopeeRequest({
      config,
      path: "/api/v2/order/get_order_list",
      shop: { shopId: 555, accessToken: "velho" },
      fetchImpl,
      onLog: (l) => logs.push(l),
    });
    await expect(call).rejects.toBeInstanceOf(ShopeeError);
    await call.catch((e: ShopeeError) => {
      expect(e.isAuth).toBe(true);
      expect(e.requestId).toBe("rq1");
    });
    expect(logs[0]).toMatchObject({ ok: false });
  });
});
