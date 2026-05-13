/**
 * Demographics helpers. Centralizes read/write of race_or_ethnicity and gender
 * so we can swap plaintext storage for envelope encryption (KMS) later without
 * touching callers.
 *
 * Spec section 11.2 flags these as field-level encrypted at rest. For now the
 * value travels as { value: string } in jsonb. When KMS is wired, the helper
 * encrypts on write and decrypts on read; the column shape stays the same.
 */

export type SensitiveValue = { value: string } | null;

const RACE_SUGGESTIONS = [
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Middle Eastern or North African",
  "Native American or Indigenous",
  "Native Hawaiian or Pacific Islander",
  "South Asian",
  "White",
  "Multiracial",
  "Other",
  "Prefer not to say",
] as const;

const GENDER_SUGGESTIONS = [
  "Woman",
  "Man",
  "Non-binary",
  "Genderqueer",
  "Transgender",
  "Other",
  "Prefer not to say",
] as const;

export const DEMOGRAPHIC_SUGGESTIONS = {
  race: RACE_SUGGESTIONS,
  gender: GENDER_SUGGESTIONS,
};

export function encodeSensitive(value: string | null | undefined): SensitiveValue {
  if (!value || value.trim() === "") return null;
  return { value: value.trim() };
}

export function decodeSensitive(v: SensitiveValue): string | null {
  return v?.value ?? null;
}
