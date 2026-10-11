import { cn } from "cn";

export const CHANNELS = {
  shopee: {
    label: "Shopee",
    className: "text-channel-shopee bg-channel-shopee/10",
    dot: "bg-channel-shopee",
  },
  whatsapp: {
    label: "WhatsApp",
    className: "text-channel-whatsapp bg-channel-whatsapp/10",
    dot: "bg-channel-whatsapp",
  },
  balcao: {
    label: "Balcão",
    className: "text-channel-balcao bg-channel-balcao/10",
    dot: "bg-channel-balcao",
  },
} as const;

export type Channel = keyof typeof CHANNELS;

/** Pílula com bolinha colorida identificando o canal de venda. */
export function ChannelBadge({ channel, className }: { channel: Channel; className?: string }) {
  const config = CHANNELS[channel];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        config.className,
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
