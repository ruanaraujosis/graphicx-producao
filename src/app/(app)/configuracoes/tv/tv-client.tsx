"use client";

import {
  Cast,
  Copy,
  ExternalLink,
  Loader2,
  MonitorSmartphone,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Timer,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/kit/confirm-button";
import { EntityFormDialog } from "@/components/kit/entity-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  connectTvByCode,
  deleteTvDevice,
  revokeTvDevice,
  saveTvDevice,
  saveTvRotation,
  turnOnTvDevice,
} from "./actions";
import { tvDeviceSchema, tvRotationSchema } from "./schema";

const subscribeNothing = () => () => {};

/** Endereço do link da TV a partir do navegador (vale em qualquer domínio). */
function useTvUrl(token: string) {
  const origin = useSyncExternalStore(
    subscribeNothing,
    () => window.location.origin,
    () => "",
  );
  return origin ? `${origin}/tv/${token}` : "";
}

const deviceFields = [
  { name: "name", label: "Nome da TV", placeholder: "Ex.: TV da produção" },
  {
    name: "show_financials",
    label: "Mostrar valores em R$",
    type: "switch" as const,
    hint: "Faturamento, meta e vendas em R$. Contagens aparecem sempre.",
  },
];

export function NewTvButton() {
  return (
    <EntityFormDialog
      title="Nova TV"
      description="Gera um link só de leitura para abrir no navegador da TV, sem login."
      trigger={
        <Button variant="outline">
          <Plus />
          Nova TV por link
        </Button>
      }
      schema={tvDeviceSchema}
      defaultValues={{ name: "", show_financials: false }}
      fields={deviceFields}
      action={(values) => saveTvDevice(values)}
      submitLabel="Criar"
    />
  );
}

/**
 * Conectar com o código que a TV mostra em /tv (como no YouTube). Abre sozinho
 * quando a pessoa chega pelo QR Code da TV (?codigo=).
 */
export function ConnectTvDialog({
  devices,
  initialCode,
}: {
  devices: { id: string; name: string; revoked: boolean }[];
  initialCode: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initialCode));
  const [code, setCode] = useState(initialCode ?? "");
  const [deviceId, setDeviceId] = useState<string>("nova");
  const [name, setName] = useState("TV da produção");
  const [money, setMoney] = useState(false);
  const [pending, start] = useTransition();
  const host = useSyncExternalStore(
    subscribeNothing,
    () => window.location.host,
    () => "",
  );

  const submit = () =>
    start(async () => {
      const r = await connectTvByCode({
        code,
        device_id: deviceId === "nova" ? null : deviceId,
        name,
        show_financials: money,
      });
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
        setCode("");
        router.replace("/configuracoes/tv");
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <MonitorSmartphone />
        Conectar TV
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar TV com código</DialogTitle>
            <DialogDescription>
              No navegador da TV, abra <strong>{host}/tv</strong>. Ela mostra um código: digite aqui
              e o painel abre sozinho.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="tv-code">Código da TV</Label>
              <Input
                id="tv-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC 234"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={8}
                className="min-h-12 text-center font-mono text-2xl tracking-[0.3em]"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tv-device">Qual TV é esta?</Label>
              <select
                id="tv-device"
                className="min-h-11 rounded-lg border bg-background px-3 text-sm"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                <option value="nova">Uma TV nova</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.revoked ? " (desligada — liga de novo)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {deviceId === "nova" && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="tv-name">Nome da TV</Label>
                  <Input
                    id="tv-name"
                    value={name}
                    maxLength={60}
                    onChange={(e) => setName(e.target.value)}
                    className="min-h-11"
                  />
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <Switch checked={money} onCheckedChange={setMoney} />
                  Mostrar valores em R$
                </label>
              </>
            )}
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <MonitorSmartphone />}
              Conectar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type PresentationCtor = new (urls: string[]) => { start: () => Promise<unknown> };

/**
 * Transmitir para a TV (Chromecast / TV com Google Cast), como o botão do
 * YouTube: abre o seletor de aparelhos do navegador com o painel desta TV.
 */
function CastButton({ url }: { url: string }) {
  const cast = async () => {
    const Request = (window as unknown as { PresentationRequest?: PresentationCtor })
      .PresentationRequest;
    if (!Request) {
      toast.info(
        "Este navegador não transmite direto. No Chrome do computador, use o menu ⋮ → Transmitir… e escolha a TV, ou conecte a TV com código.",
        { duration: 9000 },
      );
      return;
    }
    try {
      await new Request([url]).start();
      toast.success("Transmitindo o painel para a TV.");
    } catch (e) {
      // Fechar o seletor sem escolher não é erro.
      if (e instanceof DOMException && e.name === "NotAllowedError") return;
      toast.error(
        "Nenhuma TV encontrada na mesma rede. Confira se a TV com Chromecast está ligada, ou conecte com código.",
        { duration: 9000 },
      );
    }
  };
  return (
    <Button variant="outline" size="sm" className="min-h-11 md:min-h-8" onClick={cast}>
      <Cast />
      Transmitir
    </Button>
  );
}

function SimpleAction({
  label,
  icon: Icon,
  action,
}: {
  label: string;
  icon: typeof Power;
  action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11 md:min-h-8"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await action();
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Icon />}
      {label}
    </Button>
  );
}

export function TvDeviceActions({
  device,
}: {
  device: { id: string; name: string; token: string; show_financials: boolean; revoked: boolean };
}) {
  const url = useTvUrl(device.token);
  const [editing, setEditing] = useState(false);
  const remove = (
    <ConfirmButton
      trigger={
        <Button variant="ghost" size="sm" className="min-h-11 text-destructive md:min-h-8">
          <Trash2 />
          Excluir
        </Button>
      }
      title={`Excluir ${device.name}?`}
      description="A TV some da lista e o link dela para de funcionar para sempre."
      confirmLabel="Excluir"
      action={() => deleteTvDevice(device.id)}
    />
  );

  if (device.revoked) {
    return (
      <div className="flex flex-wrap gap-2">
        <SimpleAction label="Ligar" icon={Power} action={() => turnOnTvDevice(device.id)} />
        {remove}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <CastButton url={url} />
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 md:min-h-8"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          toast.success("Link copiado. Abra no navegador da TV.");
        }}
      >
        <Copy />
        Copiar link
      </Button>
      <Button variant="outline" size="sm" asChild className="min-h-11 md:min-h-8">
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLink />
          Abrir
        </a>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11 md:min-h-8"
        onClick={() => setEditing(true)}
      >
        <Pencil />
        Editar
      </Button>
      <ConfirmButton
        trigger={
          <Button variant="ghost" size="sm" className="min-h-11 md:min-h-8">
            <PowerOff />
            Desligar
          </Button>
        }
        title={`Desligar ${device.name}?`}
        description="O painel sai da TV na hora. Para voltar, use Ligar."
        confirmLabel="Desligar"
        action={() => revokeTvDevice(device.id)}
      />
      {remove}
      <EntityFormDialog
        open={editing}
        onOpenChange={setEditing}
        title={`Editar ${device.name}`}
        schema={tvDeviceSchema}
        defaultValues={{ name: device.name, show_financials: device.show_financials }}
        fields={deviceFields}
        action={(values) => saveTvDevice(values, device.id)}
      />
    </div>
  );
}

export function RotationDialog({ seconds }: { seconds: number }) {
  return (
    <EntityFormDialog
      title="Tempo de cada tela"
      description="A TV gira entre as telas sozinha. Escolha quantos segundos cada uma fica visível."
      trigger={
        <Button variant="outline">
          <Timer />
          {seconds} s por tela
        </Button>
      }
      schema={tvRotationSchema}
      defaultValues={{ tv_rotation_seconds: String(seconds) }}
      fields={[{ name: "tv_rotation_seconds", label: "Segundos (5 a 120)", type: "number" }]}
      action={(values) => saveTvRotation(values)}
    />
  );
}
