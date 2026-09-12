import type { NextRequest } from "next/server";

import { authJson } from "@/lib/auth/http";
import { handleTaskPost, taskErrorResponse } from "@/lib/tasks/http";
import { taskIdSchema } from "@/lib/tasks/schemas";

export async function POST(request: NextRequest) {
  return handleTaskPost(request, taskIdSchema, true, async ({ taskId }, _context, supabase) => {
    const { error } = await supabase.rpc("delete_task", { p_task_id: taskId })
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) return taskErrorResponse(error);
    return authJson({ message: "Task deleted." });
  });
}
