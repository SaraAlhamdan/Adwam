if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class DummyWebSocket {} as any;
}
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://yhbqgdqoymbfuixojvmz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nsQ5Kpfyp8mmQV1SODN_LA_f1a6ADud";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

async function main() {
  const email = "testuser_1791280739796@adwam.app";
  const password = "ValidPassword123!";
  const { data: authData } = await supabase.auth.signInWithPassword({ email, password });
  const userId = authData?.user?.id;

  console.log("Logged in user:", userId);

  // 1. Fetch current row
  const { data: initialRows } = await supabase
    .from("memorization_plans")
    .select("*")
    .eq("user_id", userId);

  const initialRow = initialRows?.[0];
  console.log("Initial row:", {
    id: initialRow?.id,
    start_page: initialRow?.start_page,
    current_page: initialRow?.current_page,
    updated_at: initialRow?.updated_at
  });

  // Wait 1 second so timestamp clearly changes
  await new Promise(r => setTimeout(r, 1100));

  // 2. Update start_page to 42 and current_page to 42
  const newStartPage = 42;
  const newUpdatedAt = new Date().toISOString();

  const { data: updatedRows, error: updErr } = await supabase
    .from("memorization_plans")
    .update({
      start_page: newStartPage,
      current_page: newStartPage,
      updated_at: newUpdatedAt
    })
    .eq("user_id", userId)
    .select();

  if (updErr) {
    console.error("Update failed:", updErr);
    return;
  }

  const updatedRow = updatedRows?.[0];
  console.log("\nAfter update row:", {
    id: updatedRow?.id,
    start_page: updatedRow?.start_page,
    current_page: updatedRow?.current_page,
    updated_at: updatedRow?.updated_at
  });

  console.log("\nDid start_page change?", initialRow?.start_page !== updatedRow?.start_page, `(${initialRow?.start_page} -> ${updatedRow?.start_page})`);
  console.log("Did updated_at change?", initialRow?.updated_at !== updatedRow?.updated_at, `(${initialRow?.updated_at} -> ${updatedRow?.updated_at})`);
}

main().catch(console.error);
