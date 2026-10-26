"use client";

import { Loader2, Search } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";

export type PickerOption = { value: string; label: string; hint?: string };

/**
 * Campo de busca com lista de sugestões (teclado: ↑ ↓ Enter Esc).
 * `search` pode filtrar uma lista local ou buscar no servidor.
 * O texto digitado continua valendo mesmo sem escolher uma sugestão.
 */
export function SearchPicker({
  id,
  value,
  onTextChange,
  onPick,
  search,
  placeholder,
  ariaLabel,
  minChars = 0,
  emptyText = "Nada encontrado.",
  className,
}: {
  id?: string;
  value: string;
  onTextChange: (text: string) => void;
  onPick: (option: PickerOption) => void;
  search: (q: string) => PickerOption[] | Promise<PickerOption[]>;
  placeholder?: string;
  ariaLabel?: string;
  minChars?: number;
  emptyText?: string;
  className?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const runSearch = useEffectEvent((q: string) => search(q));

  useEffect(() => {
    if (!open) return;
    const current = ++request.current;
    const timer = setTimeout(async () => {
      if (value.trim().length < minChars) {
        setOptions([]);
        return;
      }
      setLoading(true);
      const result = await runSearch(value);
      if (current === request.current) {
        setOptions(result.slice(0, 30));
        setActive(0);
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [value, open, minChars]);

  function pick(option: PickerOption) {
    onPick(option);
    setOpen(false);
  }

  const showList = open && (options.length > 0 || (!loading && value.trim().length >= minChars));

  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className="pr-9 pl-9"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && options[active]) {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {loading && (
        <Loader2
          className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li>
          ) : (
            options.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={i === active}
                className={cn(
                  "flex min-h-11 cursor-pointer flex-col justify-center rounded-lg px-3 py-1.5 text-sm md:min-h-9",
                  i === active && "bg-accent text-accent-foreground",
                )}
                onMouseEnter={() => setActive(i)}
                // mousedown: escolhe antes do blur fechar a lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
              >
                <span className="truncate font-medium">{o.label}</span>
                {o.hint && <span className="truncate text-xs text-muted-foreground">{o.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
