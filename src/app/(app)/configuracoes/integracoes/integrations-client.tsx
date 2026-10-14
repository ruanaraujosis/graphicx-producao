"use client";

import { Loader2, Pencil, RotateCcw, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/kit/confirm-button";
import { EntityFormDialog } from "@/components/kit/entity-form";
import { Button } from "@/components/ui/button";
import { disconnectShop, retryFailedJobs, saveShopSettings } from "./actions";
import { DEFAULT_CHAT_TEMPLATE, shopSettingsSchema } from "./schema";

export function ShopActions({
  shop,
  failedJobs,
}: {
  shop: {
    id: string;
    name: string | null;
    stock_ratio: number;
    price_sync_enabled: boolean;
    ship_mode: string;
    chat_message_enabled: boolean;
    chat_template: string | null;
    status: string;
  };
  failedJobs: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const connected = shop.status !== "desconectada";
  return (
    <div className="flex flex-wrap gap-2">
      {connected && (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-8"
          onClick={() => setEditing(true)}
        >
          <Pencil />
          Ajustes
        </Button>
      )}
      {failedJobs > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-8"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await retryFailedJobs(shop.id);
              if (r.ok) {
                toast.success(r.message);
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Tentar de novo ({failedJobs})
        </Button>
      )}
      {connected && (
        <ConfirmButton
          trigger={
            <Button variant="ghost" size="sm" className="min-h-11 text-destructive md:min-h-8">
              <Unplug />
              Desconectar
            </Button>
          }
          title="Desconectar esta loja?"
          description="A autorização é apagada e a GraphicX para de sincronizar pedidos, estoque e preços desta loja. Para voltar, conecte de novo."
          confirmLabel="Desconectar"
          action={() => disconnectShop(shop.id)}
        />
      )}
      <EntityFormDialog
        open={editing}
        onOpenChange={setEditing}
        title="Ajustes da loja"
        schema={shopSettingsSchema}
        defaultValues={{
          name: shop.name ?? "",
          stock_pct: String(Math.round(shop.stock_ratio * 100)),
          price_sync_enabled: shop.price_sync_enabled,
          ship_mode: shop.ship_mode,
          chat_message_enabled: shop.chat_message_enabled,
          chat_template: shop.chat_template ?? DEFAULT_CHAT_TEMPLATE,
        }}
        fields={[
          { name: "name", label: "Nome da loja (como aparece no sistema)" },
          {
            name: "stock_pct",
            label: "Estoque enviado (% da disponibilidade)",
            type: "number",
            hint: "Margem de segurança: com 90%, se dá para produzir 100, a Shopee recebe 90.",
          },
          {
            name: "ship_mode",
            label: "Entrega dos pacotes à transportadora",
            type: "select",
            options: [
              { value: "dropoff", label: "Levar até a agência" },
              { value: "pickup", label: "Coleta no endereço da loja" },
            ],
            hint: "Usado em “Organizar envio”. Se a Shopee não aceitar o modo escolhido, o outro é usado.",
          },
          {
            name: "price_sync_enabled",
            label: "Enviar os preços do sistema para a Shopee",
            type: "switch",
            hint: "Usa o preço do canal Shopee (Cadastros → Preços por canal). Confira os preços antes de ligar.",
          },
          {
            name: "chat_message_enabled",
            label: "Mensagem automática no chat após a compra",
            type: "switch",
            hint: "Envia o link da arte. Só funciona se a Shopee liberar o chat para a sua conta.",
          },
          {
            name: "chat_template",
            label: "Texto da mensagem",
            type: "textarea",
            hint: "Use {loja}, {pedido} e {link}.",
            showWhen: (v) => Boolean(v.chat_message_enabled),
          },
        ]}
        action={(values) => saveShopSettings(shop.id, values)}
      />
    </div>
  );
}
