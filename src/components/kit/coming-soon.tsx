import { Construction } from "lucide-react";
import { IconChip } from "./stat-card";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
      <IconChip icon={Construction} tone="teal" className="size-14 rounded-2xl" />
      <div>
        <h2 className="font-heading text-lg font-semibold">{title} chega em breve</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Este módulo está em desenvolvimento e será liberado em uma próxima atualização.
        </p>
      </div>
    </div>
  );
}
