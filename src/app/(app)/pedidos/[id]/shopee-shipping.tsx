"use client";

import { Loader2, MapPin, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TrackingEvent } from "@/lib/marketplaces/shopee/logistics";
import { arrangeShipments, loadTracking } from "../../expedicao/actions";

/** Envio do pedido da Shopee: organizar e rastreio (a etiqueta fica no topo do pedido). */
export function ShopeeShipping({
  orderId,
  canArrange,
  canManage,
  canTrack,
}: {
  orderId: string;
  canArrange: boolean;
  canManage: boolean;
  canTrack: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState<{
    status: string | null;
    events: TrackingEvent[];
  } | null>(null);

  const track = async () => {
    setLoading(true);
    const r = await loadTracking(orderId);
    setLoading(false);
    if (r.ok) setTracking({ status: r.status, events: r.events });
    else toast.error(r.error);
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canArrange && canManage && (
          <Button
            size="sm"
            className="min-h-11 md:min-h-8"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await arrangeShipments([orderId]);
                if (r.ok) {
                  toast.success(r.message);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
            Organizar envio
          </Button>
        )}
        {canTrack && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 md:min-h-8"
            disabled={loading}
            onClick={track}
          >
            {loading ? <Loader2 className="animate-spin" /> : <MapPin />}
            Ver rastreio
          </Button>
        )}
      </div>
      {tracking && (
        <ol className="flex flex-col gap-2 border-l-2 pl-3 text-sm">
          {tracking.events.length === 0 && (
            <li className="text-muted-foreground">Ainda sem movimentação da transportadora.</li>
          )}
          {tracking.events.map((e, i) => (
            <li key={i}>
              <p>{e.description}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(e.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
