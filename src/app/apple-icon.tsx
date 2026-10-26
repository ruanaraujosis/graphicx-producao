import { ImageResponse } from "next/og";
import { brandIconDataUri } from "@/lib/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brandIconDataUri(true)} width={180} height={180} alt="" />,
    size,
  );
}
