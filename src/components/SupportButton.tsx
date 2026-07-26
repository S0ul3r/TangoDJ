import Link from "next/link";
import { IconHeart } from "@/components/IconHeart";

type SupportButtonVariant = "header" | "block" | "inline";

const VARIANT_CLASS: Record<SupportButtonVariant, string> = {
  header: "min-h-9 shrink-0 px-3 text-sm sm:min-h-10 sm:px-4",
  block: "min-h-11 w-full px-4 text-sm",
  inline: "min-h-10 px-4 text-sm",
};

export function SupportButton({
  className = "",
  variant = "block",
}: Readonly<{
  className?: string;
  variant?: SupportButtonVariant;
}>) {
  const label =
    variant === "header" ? (
      <>
        <span className="sm:hidden">Support</span>
        <span className="hidden sm:inline">Support the project</span>
      </>
    ) : (
      "Support the project"
    );

  return (
    <Link
      href="/support"
      title="Support the project"
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#c9a227] bg-gradient-to-b from-[#f0d978] to-[#d4b24a] font-bold text-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_rgba(184,146,58,0.28)] transition hover:brightness-105 ${VARIANT_CLASS[variant]} ${className}`}
    >
      <IconHeart className="shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
