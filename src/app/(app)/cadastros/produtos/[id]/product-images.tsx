"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { deleteProductImage, registerProductImage } from "../actions";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ProductImages({
  organizationId,
  productId,
  images,
  canManage,
}: {
  organizationId: string;
  productId: string;
  images: readonly { id: string; url: string | null }[];
  canManage: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        if (!TYPES.includes(file.type)) {
          toast.error(`${file.name}: use JPG, PNG ou WebP.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: máximo de 5 MB.`);
          continue;
        }
        const ext = file.type.split("/")[1].replace("jpeg", "jpg");
        // Pasta = gráfica/produto: o Storage só aceita se a pessoa puder gerenciar cadastros dessa gráfica.
        const path = `${organizationId}/${productId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("produtos").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) {
          toast.error(`${file.name}: não foi possível enviar.`);
          continue;
        }
        const result = await registerProductImage(productId, path);
        if (!result.ok) toast.error(result.error);
      }
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {images.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma foto ainda.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <li
              key={image.id}
              className="group relative overflow-hidden rounded-xl border bg-muted"
            >
              {image.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do Storage
                <img
                  src={image.url}
                  alt="Foto do produto"
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="aspect-square" />
              )}
              {canManage && (
                <Button
                  variant="destructive"
                  size="icon"
                  aria-label="Remover foto"
                  disabled={pending}
                  className="absolute top-2 right-2 bg-card/90"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteProductImage(image.id);
                      if (result.ok) toast.success(result.message);
                      else toast.error(result.error);
                    })
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <>
          <input
            ref={input}
            type="file"
            accept={TYPES.join(",")}
            multiple
            className="sr-only"
            id={`fotos-${productId}`}
            onChange={(e) => upload(e.target.files)}
          />
          <Button
            variant="outline"
            className="self-start"
            disabled={uploading}
            onClick={() => input.current?.click()}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {uploading ? "Enviando…" : "Adicionar fotos"}
          </Button>
          <p className="text-xs text-muted-foreground">JPG, PNG ou WebP, até 5 MB cada.</p>
        </>
      )}
    </div>
  );
}
