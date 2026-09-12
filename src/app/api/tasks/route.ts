import type { NextRequest } from "next/server";

import { authJson } from "@/lib/auth/http";
import { handleTaskPost, taskErrorResponse, taskMutationResponse, taskRpcParameters } from "@/lib/tasks/http";
import { taskInputSchema } from "@/lib/tasks/schemas";
import { getTaskSnapshot } from "@/lib/tasks/server";

export async function GET() {
  try { return authJson(await getTaskSnapshot()); }
  catch (error) { return taskErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  return handleTaskPost(request, taskInputSchema, true, async (input, context, supabase) => {
    const { data, error } = await supabase.rpc("create_task", {
      p_organization_id: context.organization.id, ...taskRpcParameters(input),
    }).abortSignal(AbortSignal.timeout(10_000));
    if (error) return taskErrorResponse(error);
    return taskMutationResponse(data, "Task created.");
  });
}
