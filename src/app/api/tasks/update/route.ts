import type { NextRequest } from "next/server";

import { handleTaskPost, taskErrorResponse, taskMutationResponse, taskRpcParameters } from "@/lib/tasks/http";
import { updateTaskSchema } from "@/lib/tasks/schemas";

export async function POST(request: NextRequest) {
  return handleTaskPost(request, updateTaskSchema, true, async (input, _context, supabase) => {
    const { data, error } = await supabase.rpc("update_task", {
      p_task_id: input.taskId, ...taskRpcParameters(input),
    }).abortSignal(AbortSignal.timeout(10_000));
    if (error) return taskErrorResponse(error);
    return taskMutationResponse(data, "Task saved.");
  });
}
