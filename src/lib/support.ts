/** Public support & contact details for TangoDJ. */
export const SUPPORT_CONFIG = {
  buyMeACoffeeUrl: "https://buymeacoffee.com/s0ul",
  paypalEmail: "jakubkulewicz05@gmail.com",
  revolutUrl: "https://revolut.me/jakubkul",
  blikPhone: "",
  bankIban: "",
  bankRecipient: "",
  transferTitle: "TangoDJ — wsparcie",
} as const;

export const CONTACT_CONFIG = {
  email: "jakubkulewicz05@gmail.com",
  linkedInUrl: "https://www.linkedin.com/in/jakub-k-977216129/",
} as const;

export function hasAnySupportChannel() {
  const c = SUPPORT_CONFIG;
  return Boolean(
    c.buyMeACoffeeUrl ||
      c.paypalEmail ||
      c.revolutUrl ||
      c.blikPhone ||
      c.bankIban
  );
}
