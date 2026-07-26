import { CONTACT_CONFIG } from "@/lib/support";

export function ContactDeveloperCard({
  className = "",
}: Readonly<{ className?: string }>) {
  return (
    <section className={`panel p-5 sm:p-6 ${className}`}>
      <h2 className="mb-2 text-lg font-semibold text-foreground">
        Contact the developer
      </h2>
      <p className="mb-5 text-sm leading-relaxed text-muted">
        Found a bug, have an idea, or want to say hello about TangoDJ? Reach out
        anytime — feedback is welcome.
      </p>
      <div className="flex flex-col gap-2">
        <a
          href={`mailto:${CONTACT_CONFIG.email}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-sm transition hover:border-accent hover:text-accent"
        >
          <span className="text-muted">Email</span>
          <span className="truncate font-medium text-foreground">
            {CONTACT_CONFIG.email}
          </span>
        </a>
        <a
          href={CONTACT_CONFIG.linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-sm transition hover:border-accent hover:text-accent"
        >
          <span className="text-muted">LinkedIn</span>
          <span className="font-medium text-foreground">Open profile →</span>
        </a>
      </div>
    </section>
  );
}
