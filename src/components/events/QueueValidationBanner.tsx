"use client";

import type { ValidationResult } from "@/types/domain";

export function QueueValidationBanner({
  validation,
}: {
  validation: ValidationResult;
}) {
  return (
    <div
      className={`mb-4 rounded border px-3 py-2 text-sm ${
        validation.ok
          ? "border-good/40 bg-good/10 text-good"
          : "border-bad/40 bg-bad/10 text-bad"
      }`}
    >
      {validation.ok
        ? validation.issues.length
          ? `OK with notes: ${validation.issues[0].message}`
          : "Queue looks good."
        : validation.issues[0]?.message ?? "Invalid queue"}
      {validation.issues.length > 1 && (
        <ul className="mt-1 list-disc pl-4 text-xs opacity-90">
          {validation.issues.slice(1, 4).map((issue, i) => (
            <li key={`${issue.code}-${i}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
