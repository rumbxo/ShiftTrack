import type { NextRequest, NextResponse } from "next/server";
import { z, type ZodType } from "zod";

import { authJson, handleAuthPost } from "@/lib/auth/http";
import { createClient } from "@/utils/supabase/server";

import { requireTaskContext, TaskServiceError, taskServiceError, type TaskContext } from "./server";
import type { TaskInput } from "./types";

export function taskErrorResponse(error: unknown) {
  const mapped = taskServiceError(error);
  return authJson({ error: mapped.message, code: mapped.code }, mapped.status);
}

export function taskMutationResponse(taskId: unknown, message: string) {
  return authJson({ taskId: z.string().uuid().parse(taskId), message });
}

export function handleTaskPost<T>(
  request: NextRequest,
  schema: ZodType<T>,
  managementRequired: boolean,
  handle: (input: T, context: TaskContext, supabase: Awaited<ReturnType<typeof createClient>>) => Promise<NextResponse>,
) {
  return handleAuthPost(request, schema, async (input) => {
    try {
      const context = await requireTaskContext();
      // Browser forms bind writes to the workspace they were opened in. Direct
      // API callers may omit this hint; Auth and database permissions still apply.
      const expectedMembership = request.headers.get("X-ShiftTrack-Membership");
      if (expectedMembership !== null && expectedMembership !== context.organization.membershipId) {
        throw new TaskServiceError("stale-workspace");
      }
      if (managementRequired && context.organization.role === "employee") throw new TaskServiceError("forbidden");
      return await handle(input, context, await createClient());
    } catch (error) {
      return taskErrorResponse(error);
    }
  });
}

export function taskRpcParameters(input: TaskInput) {
  return {
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_assignee_id: input.assigneeId,
    p_due_at: input.dueAt,
    p_frequency: input.frequency,
    p_time_zone: input.timeZone,
  };
}
