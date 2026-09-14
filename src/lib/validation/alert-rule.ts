// Validation for the admin alert-rules form (`/admin/alert-rules`).
// Owned by Dev1 — see docs/ARCHITECTURE.md §8,
// `src/app/admin/alert-rules/actions.ts`.
//
// Exactly one of `fractionOfDuration` / `offsetDaysBeforeEnd` is meaningful
// per AlertRuleSetting row, matching which kind of point that row's `rule`
// is (see prisma/schema.prisma's AlertRuleSetting comment). The form only
// renders the field relevant to a given row, so both are optional here;
// `updateAlertRuleSetting` decides which one it requires non-empty, based
// on the row's `rule`, before writing to the DB.

import { z } from "zod";

// HTML checkboxes only appear in FormData when checked ("on"); an unchecked
// box is simply absent. Treat absence (or any falsy spelling) as false.
const enabledField = z
  .union([z.literal("on"), z.literal("true"), z.literal("false")])
  .optional()
  .transform((value) => value === "on" || value === "true");

function optionalNumberField(min: number, max: number) {
  return z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === "" ? undefined : Number(value)))
    .refine((value) => value === undefined || Number.isFinite(value), {
      message: "Must be a number.",
    })
    .refine((value) => value === undefined || (value >= min && value <= max), {
      message: `Must be between ${min} and ${max}.`,
    });
}

export const updateAlertRuleSettingSchema = z.object({
  enabled: enabledField,
  // HALF_TIME / THREE_QUARTER rows: point = startDate + floor(fraction * durationDays).
  fractionOfDuration: optionalNumberField(0, 1),
  // TWO_DAYS_BEFORE rows: point = endDate - offsetDaysBeforeEnd.
  offsetDaysBeforeEnd: optionalNumberField(0, 365),
});

export type UpdateAlertRuleSettingInput = z.infer<typeof updateAlertRuleSettingSchema>;
