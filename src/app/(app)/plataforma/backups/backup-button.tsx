"use client";

import { DatabaseBackup, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runOrganizationBackup } from "./actions";

export function BackupNowButton({ organizationId }: { organizationId: string }) {
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
          const r = await runOrganizationBackup(organizationId);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
      {pending ? "Fazendo backup…" : "Fazer backup agora"}
    </Button>
  );
}
