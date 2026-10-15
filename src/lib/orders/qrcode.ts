import "server-only";
import QRCode from "qrcode";
import { getPublicEnv } from "@/lib/env";

/**
 * Endereço que o QR Code do pedido abre: a página do pedido no GraphicX.
 * Só abre para quem está logado na gráfica (não expõe dado do cliente).
 */
export function orderUrl(orderId: string) {
  return new URL(`/pedidos/${orderId}`, getPublicEnv().NEXT_PUBLIC_APP_URL).toString();
}

/** QR Code do pedido em SVG (escala sem perder nitidez na impressão). */
export function orderQrSvg(orderId: string) {
  return QRCode.toString(orderUrl(orderId), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/** QR Code do pedido em PNG (data URL), para copiar ou baixar como imagem. */
export function orderQrPng(orderId: string) {
  return QRCode.toDataURL(orderUrl(orderId), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
