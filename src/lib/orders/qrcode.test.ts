// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://grapphicx.test" }),
}));

describe("QR Code do pedido", () => {
  it("abre a página do pedido no GraphicX", async () => {
    const { orderUrl, orderQrSvg } = await import("./qrcode");
    const url = orderUrl("6a1c2c7e-0000-4000-8000-000000000001");
    expect(url).toMatch(/\/pedidos\/6a1c2c7e-0000-4000-8000-000000000001$/);
    const svg = await orderQrSvg("6a1c2c7e-0000-4000-8000-000000000001");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<path");
  });
});
