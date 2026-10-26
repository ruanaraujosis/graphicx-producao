// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { chatMessage, isChatNotAllowed, MAX_CHAT_TEXT, sendChatText } from "./chat";
import { ShopeeError } from "./client";
import type { ShopeeConfig } from "./config";

const config: ShopeeConfig = {
  partnerId: 1000001,
  partnerKey: "chave-de-teste-nao-real",
  host: "https://shopee.test",
  sandbox: true,
};

describe("chat da Shopee", () => {
  it("monta a mensagem com loja, pedido e link", () => {
    expect(
      chatMessage("Oi! {loja} recebeu o pedido {pedido}. Arte: {link} — {loja}", {
        loja: "Smart",
        pedido: "2410ABC",
        link: "https://grapphicx.vercel.app/a/abc",
      }),
    ).toBe("Oi! Smart recebeu o pedido 2410ABC. Arte: https://grapphicx.vercel.app/a/abc — Smart");
    expect(chatMessage("x".repeat(2000), { loja: "", pedido: "", link: "" })).toHaveLength(
      MAX_CHAT_TEXT,
    );
  });

  it("reconhece chat não liberado (não adianta tentar de novo)", () => {
    expect(isChatNotAllowed(new ShopeeError("no permission", "error_permission", 403, null))).toBe(
      true,
    );
    expect(isChatNotAllowed(new ShopeeError("timeout", "network", null, null))).toBe(false);
    expect(isChatNotAllowed(new Error("x"))).toBe(false);
  });

  it("envia texto ao comprador", async () => {
    let body: unknown = null;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ response: {} }));
    }) as unknown as typeof fetch;
    await sendChatText(config, { shopId: 1, accessToken: "a" }, "998877", "Olá", { fetchImpl });
    expect(body).toEqual({ to_id: 998877, message_type: "text", content: { text: "Olá" } });
  });
});
