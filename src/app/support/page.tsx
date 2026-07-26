"use client";

import Link from "next/link";
import { useState } from "react";
import { ContactDeveloperCard } from "@/components/ContactDeveloperCard";
import { useSpotify } from "@/context/SpotifyContext";
import { hasAnySupportChannel, SUPPORT_CONFIG } from "@/lib/support";

function CopyRow({
  label,
  value,
  hint,
}: Readonly<{
  label: string;
  value: string;
  hint?: string;
}>) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be unavailable outside a secure context.
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-sm text-muted">{label}</span>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-accent transition hover:bg-accent-soft"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code className="block break-all text-sm text-foreground">{value}</code>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function ExternalSupportLink({
  href,
  children,
}: Readonly<{
  href: string;
  children: React.ReactNode;
}>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface-2 px-4 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
    >
      {children}
    </a>
  );
}

function DonationChannels() {
  const {
    buyMeACoffeeUrl,
    revolutUrl,
    paypalEmail,
    blikPhone,
    bankIban,
    bankRecipient,
    transferTitle,
  } = SUPPORT_CONFIG;

  if (!hasAnySupportChannel()) return null;

  const bankHint = [
    bankRecipient ? `Recipient: ${bankRecipient}` : null,
    transferTitle ? `Transfer title: ${transferTitle}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mb-8 flex flex-col gap-3">
      {buyMeACoffeeUrl ? (
        <ExternalSupportLink href={buyMeACoffeeUrl}>
          Buy Me a Coffee
        </ExternalSupportLink>
      ) : null}
      {revolutUrl ? (
        <ExternalSupportLink href={revolutUrl}>Revolut</ExternalSupportLink>
      ) : null}
      {paypalEmail ? (
        <CopyRow
          label="PayPal"
          value={paypalEmail}
          hint="Send via PayPal using this email — there isn’t a PayPal.me link."
        />
      ) : null}
      {blikPhone ? <CopyRow label="BLIK phone" value={blikPhone} /> : null}
      {bankIban ? (
        <CopyRow
          label="Bank transfer (IBAN)"
          value={bankIban}
          hint={bankHint || undefined}
        />
      ) : null}
    </div>
  );
}

export default function SupportPage() {
  const { isAuthenticated } = useSpotify();
  const backHref = isAuthenticated ? "/library" : "/";
  const backLabel = isAuthenticated ? "Back to library" : "Back home";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="site-bg" aria-hidden />
      <div className="site-bg-veil" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-lg flex-1 px-6 py-12 sm:py-16">
        <Link
          href={backHref}
          className="mb-8 inline-block text-sm text-muted transition hover:text-accent"
        >
          ← {backLabel}
        </Link>

        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Support the project
        </h1>
        <p className="mb-8 text-base leading-relaxed text-muted">
          TangoDJ is built in spare time. If the app helps you and you’d like to
          support further development — or just buy me a coffee — use one of the
          options below:
        </p>

        <DonationChannels />
        <ContactDeveloperCard />
      </div>
    </div>
  );
}
