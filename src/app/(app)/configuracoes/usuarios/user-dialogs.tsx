"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2, MoreHorizontal, Pencil, ShieldOff, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch, type FieldError as RHFFieldError } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createMember,
  resetMemberMfa,
  resetMemberPassword,
  updateMember,
  type ActionResult,
} from "./actions";
import { createMemberSchema, resetPasswordSchema, updateMemberSchema } from "./schemas";

/** Perfil que quem está logado pode atribuir (o banco também confere). */
export type RoleOption = {
  id: string;
  name: string;
  description: string | null;
  requiresMfa: boolean;
};

export type TeamMember = {
  userId: string;
  username: string;
  fullName: string;
  email: string | null;
  roleId: string;
  roleName: string;
  /** O perfil exige MFA (Administrador sempre; os outros conforme a opção do perfil). */
  requiresMfa: boolean;
  active: boolean;
  /** Trabalha só nesta gráfica: o admin pode trocar nome, senha e MFA. */
  exclusive: boolean;
  isSelf: boolean;
};

const NOT_EXCLUSIVE_HINT = "Participa de outra gráfica: só a própria pessoa altera.";

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: RHFFieldError;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {error.message}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function invalidProps(id: string, error?: RHFFieldError) {
  return { "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-erro` : undefined };
}

function useSubmit(onDone: () => void) {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  return { pending, run };
}

function RoleSelect({
  id,
  roles,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  roles: readonly RoleOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: RHFFieldError;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full" {...invalidProps(id, error)}>
        <SelectValue placeholder="Escolha o perfil" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
            {role.requiresMfa && (
              <span className="text-xs text-muted-foreground"> · exige MFA</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CreateMemberDialog({ roles }: { roles: readonly RoleOption[] }) {
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(createMemberSchema),
    defaultValues: {
      fullName: "",
      username: "",
      email: "",
      roleId: "",
      password: "",
      confirmPassword: "",
    },
  });
  const { errors } = form.formState;
  const { pending, run } = useSubmit(() => {
    setOpen(false);
    form.reset();
  });
  const roleId = useWatch({ control: form.control, name: "roleId" });
  const selectedRole = roles.find((r) => r.id === roleId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Adicionar pessoa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar pessoa à gráfica</DialogTitle>
          <DialogDescription>
            Se a pessoa já tiver conta na plataforma (mesmo e-mail), ela só é vinculada a esta
            gráfica e continua com a senha atual.
          </DialogDescription>
        </DialogHeader>
        <form
          id="create-member"
          noValidate
          onSubmit={form.handleSubmit(() => run(() => createMember(form.getValues())))}
          className="flex flex-col gap-4"
        >
          <Field id="new-fullName" label="Nome completo" error={errors.fullName}>
            <Input
              id="new-fullName"
              autoComplete="off"
              {...invalidProps("new-fullName", errors.fullName)}
              {...form.register("fullName")}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="new-username"
              label="Usuário"
              error={errors.username}
              hint="nome.cargo, único na plataforma"
            >
              <Input
                id="new-username"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="maria.atendimento"
                {...invalidProps("new-username", errors.username)}
                {...form.register("username")}
              />
            </Field>
            <Field
              id="new-email"
              label="E-mail (opcional)"
              error={errors.email}
              hint="Permite recuperar a senha sozinha"
            >
              <Input
                id="new-email"
                type="email"
                autoComplete="off"
                {...invalidProps("new-email", errors.email)}
                {...form.register("email")}
              />
            </Field>
          </div>
          <Field
            id="new-role"
            label="Perfil nesta gráfica"
            error={errors.roleId}
            hint={selectedRole?.description ?? undefined}
          >
            <Controller
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <RoleSelect
                  id="new-role"
                  roles={roles}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  error={errors.roleId}
                />
              )}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="new-password"
              label="Senha provisória"
              error={errors.password}
              hint="A pessoa cria a própria no primeiro acesso."
            >
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                {...invalidProps("new-password", errors.password)}
                {...form.register("password")}
              />
            </Field>
            <Field id="new-confirm" label="Repita a senha" error={errors.confirmPassword}>
              <Input
                id="new-confirm"
                type="password"
                autoComplete="new-password"
                {...invalidProps("new-confirm", errors.confirmPassword)}
                {...form.register("confirmPassword")}
              />
            </Field>
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="create-member" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Abertos pelo menu de ações da pessoa (MemberActions). */
type DialogControl = { open: boolean; onOpenChange: (open: boolean) => void };

export function EditMemberDialog({
  member,
  roles,
  open,
  onOpenChange: setOpen,
}: {
  member: TeamMember;
  roles: readonly RoleOption[];
} & DialogControl) {
  const defaults = {
    userId: member.userId,
    fullName: member.fullName,
    roleId: member.roleId,
    active: member.active,
  };
  // O perfil atual sempre aparece; se quem edita não pode atribuí-lo, a troca fica bloqueada.
  const canAssignCurrent = roles.some((r) => r.id === member.roleId);
  const options = canAssignCurrent
    ? roles
    : [
        {
          id: member.roleId,
          name: member.roleName,
          description: null,
          requiresMfa: member.requiresMfa,
        },
        ...roles,
      ];
  const form = useForm({ resolver: zodResolver(updateMemberSchema), defaultValues: defaults });
  const { errors } = form.formState;
  const { pending, run } = useSubmit(() => setOpen(false));
  const prefix = `edit-${member.userId}`;
  const canEditName = member.exclusive || member.isSelf;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar pessoa</DialogTitle>
          <DialogDescription className="font-mono">
            {member.username}
            {member.email ? ` · ${member.email}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form
          id={prefix}
          noValidate
          onSubmit={form.handleSubmit((values) => run(() => updateMember(values)))}
          className="flex flex-col gap-4"
        >
          <Field
            id={`${prefix}-name`}
            label="Nome completo"
            error={errors.fullName}
            hint={canEditName ? undefined : NOT_EXCLUSIVE_HINT}
          >
            <Input
              id={`${prefix}-name`}
              disabled={!canEditName}
              {...invalidProps(`${prefix}-name`, errors.fullName)}
              {...form.register("fullName")}
            />
          </Field>
          <Field
            id={`${prefix}-role`}
            label="Perfil nesta gráfica"
            error={errors.roleId}
            hint={
              member.isSelf
                ? "Você não pode alterar o próprio perfil."
                : canAssignCurrent
                  ? undefined
                  : "Este perfil tem permissões que o seu não tem; só um administrador pode trocá-lo."
            }
          >
            <Controller
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <RoleSelect
                  id={`${prefix}-role`}
                  roles={options}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={member.isSelf || !canAssignCurrent}
                  error={errors.roleId}
                />
              )}
            />
          </Field>
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 p-3">
                <div>
                  <Label htmlFor={`${prefix}-active`}>Acesso a esta gráfica</Label>
                  <p className="text-xs text-muted-foreground">
                    {member.isSelf
                      ? "Você não pode se desativar."
                      : "Desativado, a pessoa deixa de ver esta gráfica."}
                  </p>
                </div>
                <Switch
                  id={`${prefix}-active`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={member.isSelf}
                />
              </div>
            )}
          />
        </form>
        <DialogFooter>
          <Button type="submit" form={prefix} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({
  member,
  open,
  onOpenChange: setOpen,
}: { member: TeamMember } & DialogControl) {
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { userId: member.userId, password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;
  const { pending, run } = useSubmit(() => {
    setOpen(false);
    form.reset();
  });
  const prefix = `reset-${member.userId}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            Senha provisória para <strong>{member.fullName}</strong>. No próximo login, a pessoa
            será obrigada a criar a própria senha.
          </DialogDescription>
        </DialogHeader>
        <form
          id={prefix}
          noValidate
          onSubmit={form.handleSubmit((values) => run(() => resetMemberPassword(values)))}
          className="flex flex-col gap-4"
        >
          <Field id={`${prefix}-pw`} label="Nova senha" error={errors.password}>
            <Input
              id={`${prefix}-pw`}
              type="password"
              autoComplete="new-password"
              {...invalidProps(`${prefix}-pw`, errors.password)}
              {...form.register("password")}
            />
          </Field>
          <Field id={`${prefix}-confirm`} label="Repita a senha" error={errors.confirmPassword}>
            <Input
              id={`${prefix}-confirm`}
              type="password"
              autoComplete="new-password"
              {...invalidProps(`${prefix}-confirm`, errors.confirmPassword)}
              {...form.register("confirmPassword")}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="submit" form={prefix} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Redefinir senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Só faz sentido para perfis que exigem MFA. */
export function ResetMfaDialog({
  member,
  open,
  onOpenChange: setOpen,
}: { member: TeamMember } & DialogControl) {
  const { pending, run } = useSubmit(() => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Redefinir verificação em duas etapas?</DialogTitle>
          <DialogDescription>
            Use quando <strong>{member.fullName}</strong> perder ou trocar o celular. No próximo
            login a pessoa cadastra o app autenticador de novo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => run(() => resetMemberMfa(member.userId))}
          >
            {pending && <Loader2 className="animate-spin" />}
            Redefinir MFA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Menu "⋯" com as ações sobre uma pessoa da equipe; abre os diálogos acima. */
export function MemberActions({
  member,
  roles,
}: {
  member: TeamMember;
  roles: readonly RoleOption[];
}) {
  const [dialog, setDialog] = useState<"edit" | "password" | "mfa" | null>(null);
  const close = (open: boolean) => !open && setDialog(null);
  const mfaHint = member.isSelf
    ? "Peça a outro administrador"
    : member.exclusive
      ? undefined
      : NOT_EXCLUSIVE_HINT;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Ações para ${member.fullName}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil />
            Editar nome, perfil e acesso
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!member.exclusive} onSelect={() => setDialog("password")}>
            <KeyRound />
            <span className="flex flex-col">
              Redefinir senha
              {!member.exclusive && (
                <span className="text-xs text-muted-foreground">{NOT_EXCLUSIVE_HINT}</span>
              )}
            </span>
          </DropdownMenuItem>
          {member.requiresMfa && (
            <DropdownMenuItem disabled={Boolean(mfaHint)} onSelect={() => setDialog("mfa")}>
              <ShieldOff />
              <span className="flex flex-col">
                Redefinir MFA
                {mfaHint && <span className="text-xs text-muted-foreground">{mfaHint}</span>}
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Montados só quando abertos: o formulário sempre começa com os dados atuais. */}
      {dialog === "edit" && (
        <EditMemberDialog member={member} roles={roles} open onOpenChange={close} />
      )}
      {dialog === "password" && <ResetPasswordDialog member={member} open onOpenChange={close} />}
      {dialog === "mfa" && <ResetMfaDialog member={member} open onOpenChange={close} />}
    </>
  );
}
