const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !publishableKey) {
  console.error("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local first.");
  process.exitCode = 1;
} else {
  try {
    // This read-only endpoint checks connectivity without depending on any
    // database tables, creating users, or sending authentication emails.
    const response = await fetch(new URL("/auth/v1/settings", url), {
      headers: { apikey: publishableKey },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Supabase Auth returned HTTP ${response.status}. Check the project URL, publishable key, and project status.`);
    }

    const settings = await response.json();
    if (!settings || typeof settings.external !== "object" || settings.external === null) {
      throw new Error("The endpoint did not return the expected Supabase Auth settings.");
    }

    console.log("Supabase connection verified: Auth is reachable and accepted the publishable key.");
    console.log("This check does not test login, email delivery, or database permissions.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Supabase connection check failed.");
    process.exitCode = 1;
  }
}
