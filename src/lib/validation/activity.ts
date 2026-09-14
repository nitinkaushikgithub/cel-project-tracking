import { z } from "zod";
import { ActivityStatus } from "@prisma/client";

function isValidDateString(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

// Shared by createActivity and updateActivity — the field set is identical
// (docs/ARCHITECTURE.md §8). Dates are day-granular strings from a plain
// <input type="date"> (CLAUDE.md §10: dates, not timestamps).
const activityFieldsSchema = z
  .object({
    name: z.string().min(1, "Activity name is required.").max(200),
    startDate: z.string().refine(isValidDateString, "Enter a valid start date."),
    endDate: z.string().refine(isValidDateString, "Enter a valid end date."),
    assignedToId: z.string().min(1, "An assignee is required."),
    target: z.string().min(1, "Target is required.").max(2000),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  });

export const createActivitySchema = activityFieldsSchema;
export const updateActivitySchema = activityFieldsSchema;

export const updateActivityStatusSchema = z.object({
  status: z.nativeEnum(ActivityStatus),
  actual: z.string().max(2000).optional(),
});

// "Support from HOD" is a text note only (CLAUDE.md §9 open question 3 —
// not yet a workflow). hodSupportRequested is a plain checkbox.
export const updateDelayRecordSchema = z.object({
  reasonForDelay: z.string().max(2000).optional(),
  correctiveAction: z.string().max(2000).optional(),
  hodSupportRequested: z.boolean(),
  hodRemark: z.string().max(2000).optional(),
});
