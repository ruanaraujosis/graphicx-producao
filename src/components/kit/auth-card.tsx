import { cn } from "cn";

export function AuthCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-card p-6 shadow-sm", className)}>
      <h1 className="text-center font-heading text-xl font-bold tracking-tight">{title}</h1>
      {description && (
        <p className="mt-1 text-center text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function AuthCardSkeleton() {
  return <div className="h-72 animate-pulse rounded-2xl bg-muted" aria-hidden />;
}
