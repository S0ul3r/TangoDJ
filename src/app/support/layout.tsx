import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support — TangoDJ",
  description:
    "Support TangoDJ development or contact the developer about bugs and feedback.",
};

export default function SupportLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
