"use client";

import { Copy, Download, Link2, Printer, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** QR Code de identificação do pedido: copiar, baixar ou imprimir. */
export function OrderQrDialog({
  orderId,
  label,
  png,
  url,
}: {
  orderId: string;
  /** Ex.: "#1042". */
  label: string;
  /** PNG em data URL, gerado no servidor. */
  png: string;
  url: string;
}) {
  const fileName = `qrcode-pedido-${label.replace("#", "")}.png`;

  async function copyImage() {
    try {
      // O Safari exige a promessa dentro do ClipboardItem.
      const blob = fetch(png).then((r) => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("QR Code copiado. Cole (Ctrl+V) onde quiser.");
    } catch {
      toast.error("Este navegador não deixou copiar a imagem. Use “Baixar imagem”.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link do pedido copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <QrCode />
          QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>QR Code do pedido {label}</DialogTitle>
          <DialogDescription>
            Ao ler o código, a equipe abre este pedido no GraphicX (precisa estar logada).
          </DialogDescription>
        </DialogHeader>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada no servidor */}
        <img
          src={png}
          alt={`QR Code do pedido ${label}`}
          className="mx-auto size-56 rounded-xl border bg-white p-2"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button className="min-h-11" onClick={copyImage}>
            <Copy />
            Copiar QR Code
          </Button>
          <Button variant="outline" className="min-h-11" onClick={copyLink}>
            <Link2 />
            Copiar link
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <a href={png} download={fileName}>
              <Download />
              Baixar imagem
            </a>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <a href={`/imprimir/pedidos?ids=${orderId}`} target="_blank" rel="noreferrer">
              <Printer />
              Imprimir etiqueta
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
