import { ImageResponse } from "next/og";
import { brandIconDataUri } from "@/lib/brand-icon";

const SIZES = {
  "32": { size: 32, padded: false },
  "192": { size: 192, padded: false },
  "512": { size: 512, padded: false },
  "maskable-512": { size: 512, padded: true },
} as const;

export function generateImageMetadata() {
  return Object.entries(SIZES).map(([id, { size }]) => ({
    id,
    contentType: "image/png",
    size: { width: size, height: size },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const key = String(await id) as keyof typeof SIZES;
  const { size, padded } = SIZES[key] ?? SIZES["192"];
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brandIconDataUri(padded)} width={size} height={size} alt="" />,
    { width: size, height: size },
  );
}
