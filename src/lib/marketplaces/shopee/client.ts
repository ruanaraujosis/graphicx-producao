import type { ShopeeConfig } from "./config";
import { signRequest } from "./sign";

/** Erro devolvido pela Shopee (ou falha de rede), com o código para decidir retentativa. */
export class ShopeeError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "ShopeeError";
  }

  /** Token vencido/inválido: renovar e tentar de novo. */
  get isAuth() {
    return /invalid_access_token|invalid_acceess_token|error_auth|invalid_token/i.test(this.code);
  }
}

export type CallLog = {
  endpoint: string;
  ok: boolean;
  statusCode: number | null;
  durationMs: number;
  requestId: string | null;
  error: string | null;
};

export type ShopCredentials = { shopId: number; accessToken: string };

type Envelope = { error?: string; message?: string; request_id?: string; response?: unknown };

/**
 * Chamada assinada à API v2 da Shopee. `shop` = chamada em nome de uma loja.
 * Cada chamada é reportada em `onLog` (só metadados, sem dados de comprador).
 */
export async function shopeeRequest<T = Envelope>(input: {
  config: ShopeeConfig;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Envio de arquivo (multipart); o fetch define o Content-Type. */
  form?: FormData;
  shop?: ShopCredentials;
  onLog?: (log: CallLog) => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<T> {
  const { config, path, shop } = input;
  const timestamp = Math.floor((input.now?.() ?? Date.now()) / 1000);
  const sign = signRequest({
    partnerKey: config.partnerKey,
    partnerId: config.partnerId,
    path,
    timestamp,
    accessToken: shop?.accessToken,
    shopId: shop?.shopId,
  });
  const url = new URL(config.host + path);
  url.searchParams.set("partner_id", String(config.partnerId));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  if (shop) {
    url.searchParams.set("access_token", shop.accessToken);
    url.searchParams.set("shop_id", String(shop.shopId));
  }
  for (const [k, v] of Object.entries(input.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const started = Date.now();
  let status: number | null = null;
  let json: Envelope | null = null;
  try {
    const res = await (input.fetchImpl ?? fetch)(url, {
      method: input.method ?? "GET",
      headers: input.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: input.form ?? (input.body === undefined ? undefined : JSON.stringify(input.body)),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    status = res.status;
    json = (await res.json().catch(() => null)) as Envelope | null;
    if (!res.ok || !json || json.error) {
      throw new ShopeeError(
        json?.message || json?.error || `Resposta ${res.status} da Shopee.`,
        json?.error || `http_${res.status}`,
        status,
        json?.request_id ?? null,
      );
    }
    input.onLog?.({
      endpoint: path,
      ok: true,
      statusCode: status,
      durationMs: Date.now() - started,
      requestId: json.request_id ?? null,
      error: null,
    });
    return json as T;
  } catch (e) {
    const err =
      e instanceof ShopeeError
        ? e
        : new ShopeeError(
            e instanceof Error ? e.message : "Falha de rede.",
            "network",
            status,
            null,
          );
    input.onLog?.({
      endpoint: path,
      ok: false,
      statusCode: status,
      durationMs: Date.now() - started,
      requestId: err.requestId,
      error: `${err.code}: ${err.message}`.slice(0, 1000),
    });
    throw err;
  }
}
