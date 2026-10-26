import { useId } from "react";
import { cn } from "cn";
import { MARK } from "./mark";

/**
 * Símbolo da GraphicX: "GX" em blocos, em gradiente do roxo ao azul-marinho.
 * A geometria fica em ./mark (a mesma dos ícones).
 */
export function LogoMark({
  className,
  title = "GraphicX",
}: {
  className?: string;
  title?: string;
}) {
  const id = useId();
  const [gx1, gx2] = MARK.gRange;
  const [xx1, xx2] = MARK.xRange;
  return (
    <svg
      viewBox={MARK.viewBox}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      className={cn("h-9 w-auto shrink-0", className)}
    >
      <defs>
        <linearGradient
          id={`${id}-g`}
          gradientUnits="userSpaceOnUse"
          x1={gx1}
          y1="0"
          x2={gx2}
          y2="0"
        >
          <stop offset="0" style={{ stopColor: `var(--logo-from, ${MARK.gradient.from})` }} />
          <stop offset="1" style={{ stopColor: `var(--logo-to, ${MARK.gradient.to})` }} />
        </linearGradient>
        <linearGradient
          id={`${id}-x`}
          gradientUnits="userSpaceOnUse"
          x1={xx1}
          y1="0"
          x2={xx2}
          y2="0"
        >
          <stop offset="0" style={{ stopColor: `var(--logo-from, ${MARK.gradient.from})` }} />
          <stop offset="1" style={{ stopColor: `var(--logo-to, ${MARK.gradient.to})` }} />
        </linearGradient>
      </defs>
      <path
        d={MARK.g}
        fill="none"
        stroke={`url(#${id}-g)`}
        strokeWidth={MARK.gStroke}
        strokeMiterlimit={2}
      />
      {MARK.x.map((d) => (
        <path key={d} d={d} fill={`url(#${id}-x)`} />
      ))}
    </svg>
  );
}

export function Logo({
  className,
  compact = false,
  inverse = false,
}: {
  className?: string;
  compact?: boolean;
  /** Sobre fundo escuro fixo (ex.: painel do login). */
  inverse?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-2.5",
        // Painel escuro fixo (login): gradiente claro, como no tema escuro.
        inverse && "[--logo-from:#a78bfa] [--logo-to:#5b7cf0]",
        className,
      )}
    >
      <LogoMark />
      {!compact && (
        <span className="flex flex-col leading-none">
          {/* G roxo e X azul-marinho (as mesmas cores do símbolo); o meio na cor do texto. */}
          <span
            className={cn(
              "font-heading text-xl font-bold tracking-tight",
              inverse ? "text-white" : "text-foreground",
            )}
          >
            <span style={{ color: "var(--logo-from)" }}>G</span>raphic
            <span style={{ color: "var(--logo-to)" }}>X</span>
          </span>
          <span
            className={cn(
              "text-[0.65rem] font-medium tracking-wide",
              inverse ? "text-white/80" : "text-brand-teal",
            )}
          >
            Gestão para gráficas
          </span>
        </span>
      )}
    </span>
  );
}
