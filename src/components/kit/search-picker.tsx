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

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtra opções por nome e dica (SKU, variação), sem diferenciar acentos e maiúsculas. */
export function matchOptions<T extends PickerOption>(options: readonly T[], q: string) {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...options];
  return options.filter((o) => {
    const text = fold(`${o.label} ${o.hint ?? ""}`);
    return terms.every((t) => text.includes(t));
  });
}

/**
 * Escolha de um item de uma lista longa por busca (nome, SKU, variação). Guarda o `value` da
 * opção escolhida; apagar ou mudar o texto desfaz a escolha.
 */
export function OptionSearchField({
  id,
  options,
  value,
  onChange,
  placeholder = "Buscar por nome ou SKU",
  emptyText = "Nenhum item encontrado.",
}: {
  id?: string;
  options: readonly PickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const selected = options.find((o) => o.value === value);
  const [text, setText] = useState(selected?.label ?? "");
  // Escolha feita de fora (ex.: valor inicial) atualiza o texto.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(selected?.label ?? "");
  }
  return (
    <SearchPicker
      id={id}
      value={text}
      placeholder={placeholder}
      emptyText={emptyText}
      onTextChange={(t) => {
        setText(t);
        if (value) onChange("");
      }}
      onPick={(o) => {
        setText(o.label);
        onChange(o.value);
      }}
      search={(q) => matchOptions(options, q === selected?.label ? "" : q)}
    />
  );
}
