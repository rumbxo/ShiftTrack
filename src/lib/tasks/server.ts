import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";
import { z } from "zod";

import { getOrganizationContext, getOrganizationMembers, OrganizationServiceError } from "@/lib/organizations/server";
import type { Organization } from "@/lib/organizations/types";
import { createClient } from "@/utils/supabase/server";

import { taskCategories, taskFrequencies, type Task, type TaskSnapshot } from "./types";

export type TaskErrorCode = "setup-required" | "unavailable" | "forbidden" | "conflict" | "invalid-input" | "unauthenticated" | "organization-required" | "stale-workspace";

const taskErrors: Record<TaskErrorCode, { message: string; status: number }> = {
  "setup-required": { message: "Task setup is not complete yet. Apply the task database migration, then try again.", status: 503 },
  unavailable: { message: "We could not load or save your tasks. Please try again.", status: 503 },
  forbidden: { message: "You do not have permission to make this task change. Employees can complete tasks assigned to them.", status: 403 },
  conflict: { message: "This task can no longer be changed. Refresh your tasks and try again. Completed tasks cannot be edited or deleted.", status: 409 },
  "invalid-input": { message: "Check the task details and choose a current workspace member, or leave it unassigned.", status: 400 },
  unauthenticated: { message: "Log in to continue.", status: 401 },
  "organization-required": { message: "Create or join an organization to access its tasks.", status: 409 },
  "stale-workspace": { message: "Your workspace access changed. Refresh the page before saving this change.", status: 403 },
};

export class TaskServiceError extends Error {
  readonly code: TaskErrorCode;
  readonly status: number;
  constructor(code: TaskErrorCode) {
    super(taskErrors[code].message);
    this.name = "TaskServiceError";
    this.code = code;
    this.status = taskErrors[code].status;
  }
}

/** Provider details stay on the server; never log task text or account values. */
export function taskServiceError(error: unknown, operation = "task-request"): TaskServiceError {
  if (error instanceof TaskServiceError) return error;
  if (error instanceof OrganizationServiceError) {
    return new TaskServiceError(error.code === "setup-required" || error.code === "forbidden" ? error.code : "unavailable");
  }
  const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = details.code;
  console.error("[ShiftTrack tasks]", JSON.stringify({
    operation,
    code: typeof code === "string" && /^[a-z0-9_]{1,64}$/i.test(code) ? code : "unknown",
    status: typeof details.status === "number" ? details.status : undefined,
    errorType: error instanceof Error ? error.name : undefined,
    validationFields: error instanceof z.ZodError ? error.issues.map((issue) => issue.path.join(".")) : undefined,
  }));
  switch (code) {
    case "42P01": case "42883": case "PGRST202": case "PGRST204": case "PGRST205":
      return new TaskServiceError("setup-required");
    case "42501":
      return new TaskServiceError("forbidden");
    case "55000": case "23505":
      return new TaskServiceError("conflict");
    case "22023": case "23514": case "23503":
      return new TaskServiceError("invalid-input");
    default:
      return new TaskServiceError("unavailable");
  }
}

export type TaskContext = { user: User; organization: Organization };

export async function requireTaskContext(): Promise<TaskContext> {
  const { user, organization } = await getOrganizationContext();
  if (!user) throw new TaskServiceError("unauthenticated");
  if (!organization) throw new TaskServiceError("organization-required");
  return { user, organization };
}

const timestampSchema = z.string().datetime({ offset: true }).transform((value) => new Date(value).toISOString());
const taskRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(160),
  description: z.string().max(2000),
  category: z.enum(taskCategories),
  assignee_id: z.string().uuid().nullable(),
  // Retain PostgreSQL's fractional precision so a title-only edit does not
  // accidentally change the due instant and reset its recurrence anchor.
  due_at: z.string().datetime({ offset: true }),
  frequency: z.enum(taskFrequencies),
  time_zone: z.string().min(1).max(100),
  completed_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  created_by: z.string().uuid().nullable(),
  completed_by: z.string().uuid().nullable(),
  parent_task_id: z.string().uuid().nullable(),
});

const taskColumns = "id, title, description, category, assignee_id, due_at, frequency, time_zone, completed_at, created_at, created_by, completed_by, parent_task_id";

async function readOrganizationTasks(organizationId: string): Promise<Task[]> {
  const supabase = await createClient();
  const tasks: Task[] = [];
  // Keyset pagination works even when a project's Data API row cap is below
  // 1,000. Continue until an empty page instead of silently trusting the cap.
  const signal = AbortSignal.timeout(10_000);
  let cursor: string | undefined;
  for (;;) {
    let query = supabase.from("tasks").select(taskColumns)
      .eq("organization_id", organizationId)
      .order("id", { ascending: true }).limit(1000).abortSignal(signal);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw taskServiceError(error, "read-tasks");
    const rows = z.array(taskRowSchema).parse(data);
    if (rows.length === 0) return tasks;
    const nextCursor = rows[rows.length - 1].id;
    if (cursor && nextCursor <= cursor) throw new TaskServiceError("unavailable");
    cursor = nextCursor;
    tasks.push(...rows.map((row) => ({
      id: row.id, title: row.title, description: row.description, category: row.category,
      assigneeId: row.assignee_id, dueAt: row.due_at, frequency: row.frequency,
      timeZone: row.time_zone, completedAt: row.completed_at, createdAt: row.created_at,
      createdBy: row.created_by, completedBy: row.completed_by, parentTaskId: row.parent_task_id,
    })));
  }
}

/** Request-local only. Each refresh verifies identity and reads current database access. */
export const getTaskSnapshot = cache(async (): Promise<TaskSnapshot> => {
  try {
    const { user, organization } = await requireTaskContext();
    const [tasks, members] = await Promise.all([
      readOrganizationTasks(organization.id),
      getOrganizationMembers(organization.id),
    ]);
    return { userId: user.id, organization, tasks, members, fetchedAt: new Date().toISOString() };
  } catch (error) {
    throw taskServiceError(error, "read-task-snapshot");
  }
});
