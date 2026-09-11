import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error && (!error.status || error.status === 429 || error.status >= 500)) {
      return NextResponse.json({ error: "Account service unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ userId: data.user?.id ?? "" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Account service unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
