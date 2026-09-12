import { z } from "zod";

import { taskCategories, taskFrequencies } from "./types";

const taskId = z.string().uuid("Choose a valid task.");
const dueAt = z.string().datetime({ offset: true, error: "Choose a valid due date and time, including its time zone." })
  .refine((value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9998;
  }, "Choose a due date between years 0001 and 9998.");

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Enter a task title.").max(160, "Use a task title with 160 characters or fewer."),
  description: z.string().trim().max(2000, "Use a description with 2,000 characters or fewer."),
  category: z.enum(taskCategories, { error: "Choose a task category." }),
  assigneeId: z.string().uuid("Choose a current workspace member.").nullable(),
  dueAt,
  frequency: z.enum(taskFrequencies, { error: "Choose a task frequency." }),
  timeZone: z.string().trim().min(1, "Choose a time zone.").max(100, "Choose a valid time zone.").refine((value) => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; }
    catch { return false; }
  }, "Choose a valid time zone."),
}).strict();

export const updateTaskSchema = taskInputSchema.extend({ taskId });
export const taskIdSchema = z.object({ taskId }).strict();
