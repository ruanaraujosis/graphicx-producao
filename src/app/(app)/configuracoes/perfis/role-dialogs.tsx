"use client";

import { Loader2, Pencil, Plus, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ACTION_LABELS,
  PERMISSION_MODULES,
  expandPermissions,
  hasSensitivePermission,
  type Permission,
} from "@/lib/auth/permissions";
import { deleteRole, saveRole } from "./actions";

export type RoleView = {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  requireMfa: boolean;
};

/** Matriz módulo × (Ver, Gerenciar). "Gerenciar" marca "Ver"; desmarcar "Ver" desmarca "Gerenciar". */
function PermissionMatrix({
  value,
  onChange,
  grantable,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  /** Permissões que quem está editando pode conceder. */
  grantable: readonly Permission[];
}) {
  const toggle = (perm: Permission, checked: boolean) => {
    const [module, action] = perm.split(".");
    let next = value.filter((p) => p !== perm);
    if (checked) {
      next.push(perm);
    } else if (action === "ver") {
      next = next.filter((p) => p !== `${module}.gerenciar`);
    }
    onChange(expandPermissions(next));
  };

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-2 text-sm font-medium">O que este perfil pode acessar</legend>
      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Módulo</span>
          <span className="w-20 text-center">{ACTION_LABELS.ver}</span>
          <span className="w-20 text-center">{ACTION_LABELS.gerenciar}</span>
        </div>
        <ul className="divide-y">
          {PERMISSION_MODULES.map((module) => (
            <li
              key={module.key}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{module.label}</p>
                <p className="text-xs text-muted-foreground">{module.description}</p>
              </div>
              {(["ver", "gerenciar"] as const).map((action) => {
                const perm = `${module.key}.${action}` as Permission;
                const available = (module.actions as readonly string[]).includes(action);
                const id = `perm-${module.key}-${action}`;
                return (
                  <div key={action} className="flex w-20 justify-center">
                    {available ? (
                      <label
                        htmlFor={id}
                        className="flex size-11 cursor-pointer items-center justify-center rounded-lg hover:bg-muted"
                      >
                        <Checkbox
                          id={id}
                          checked={value.includes(perm)}
                          disabled={!grantable.includes(perm)}
                          onCheckedChange={(checked) => toggle(perm, checked === true)}
                          aria-label={`${ACTION_LABELS[action]} ${module.label}`}
                        />
                      </label>
                    ) : (
                      <span className="text-xs text-muted-foreground" aria-hidden>
                        —
                      </span>
                    )}
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        “Gerenciar” inclui “Ver”. Caixas desabilitadas são permissões que o seu perfil não tem.
      </p>
    </fieldset>
  );
}

export function RoleDialog({
  role,
  grantable,
}: {
  /** Sem `role` = criar um perfil novo. */
  role?: RoleView;
  grantable: readonly Permission[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<Permission[]>(role?.permissions ?? []);
  const [requireMfa, setRequireMfa] = useState(role?.requireMfa ?? false);
  // Enquanto a pessoa não mexer na chave, ela acompanha as permissões sensíveis.
  const [mfaTouched, setMfaTouched] = useState(Boolean(role));
  const [pending, startTransition] = useTransition();
  const sensitive = hasSensitivePermission(permissions);
  const prefix = role ? `role-${role.id}` : "role-new";

  const reset = () => {
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPermissions(role?.permissions ?? []);
    setRequireMfa(role?.requireMfa ?? false);
    setMfaTouched(Boolean(role));
  };

  const changePermissions = (next: Permission[]) => {
    setPermissions(next);
    if (!mfaTouched) setRequireMfa(hasSensitivePermission(next));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveRole({ id: role?.id, name, description, permissions, requireMfa });
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        if (!role) reset();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>
        {role ? (
          <Button variant="outline" size="sm" aria-label={`Editar perfil ${role.name}`}>
            <Pencil />
            Editar
          </Button>
        ) : (
          <Button>
            <Plus />
            Novo perfil
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? `Editar perfil ${role.name}` : "Novo perfil de acesso"}</DialogTitle>
          <DialogDescription>
            As mudanças valem na hora para todas as pessoas com este perfil.
          </DialogDescription>
        </DialogHeader>
        <form id={prefix} noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${prefix}-name`}>Nome do perfil</Label>
            <Input
              id={`${prefix}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Vendedor balcão"
              maxLength={60}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${prefix}-desc`}>Descrição (opcional)</Label>
            <Textarea
              id={`${prefix}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para que serve este perfil"
              maxLength={200}
              rows={2}
            />
          </div>
          <PermissionMatrix
            value={permissions}
            onChange={changePermissions}
            grantable={grantable}
          />
          <label
            htmlFor={`${prefix}-mfa`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2"
          >
            <span className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="flex flex-col">
                <span className="text-sm font-medium">Exigir verificação em duas etapas (MFA)</span>
                <span className="text-xs text-muted-foreground">
                  Quem usar este perfil confirma o login com o app autenticador.
                </span>
              </span>
            </span>
            <Switch
              id={`${prefix}-mfa`}
              checked={requireMfa}
              onCheckedChange={(checked) => {
                setRequireMfa(checked);
                setMfaTouched(true);
              }}
            />
          </label>
          {sensitive && !requireMfa && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Recomendado ligar: este perfil gerencia equipe, configurações ou financeiro.
            </p>
          )}
        </form>
        <DialogFooter>
          <Button type="submit" form={prefix} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {role ? "Salvar perfil" : "Criar perfil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRoleDialog({ role, members }: { role: RoleView; members: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Excluir perfil ${role.name}`}>
          <Trash2 />
          Excluir
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir o perfil {role.name}?</DialogTitle>
          <DialogDescription>
            {members > 0
              ? `${members} ${members === 1 ? "pessoa usa" : "pessoas usam"} este perfil. Troque o perfil delas em Equipe antes de excluir.`
              : "Nenhuma pessoa usa este perfil. A exclusão não pode ser desfeita."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending || members > 0}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteRole(role.id);
                if (result.ok) {
                  toast.success(result.message);
                  setOpen(false);
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Excluir perfil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
