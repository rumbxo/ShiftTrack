import type { NextRequest } from "next/server";

import { handleTaskPost, taskErrorResponse, taskMutationResponse } from "@/lib/tasks/http";
import { taskIdSchema } from "@/lib/tasks/schemas";

export async function POST(request: NextRequest) {
  return handleTaskPost(request, taskIdSchema, false, async ({ taskId }, _context, supabase) => {
    // The database checks employee assignment, records completion, and creates
    // one future occurrence for a recurring task in the same transaction.
    const { data, error } = await supabase.rpc("complete_task", { p_task_id: taskId })
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) return taskErrorResponse(error);
    return taskMutationResponse(data, "Task completed.");
  });
}
