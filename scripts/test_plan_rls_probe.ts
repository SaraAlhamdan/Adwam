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
  
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authErr || !authData.session) {
    console.error("Auth failed:", authErr);
    return;
  }

  const userId = authData.user.id;
  console.log("Authenticated as:", userId);

  // 1. Check existing rows in memorization_plans
  console.log("\n1. Querying memorization_plans for user...");
  const { data: plans, error: qErr } = await supabase
    .from("memorization_plans")
    .select("*")
    .eq("user_id", userId);

  console.log("Query result:", { count: plans?.length, plans, error: qErr });

  // 2. Try to insert / upsert a plan
  console.log("\n2. Attempting to insert a plan with start_page: 5...");
  const { data: insertData, error: insErr } = await supabase
    .from("memorization_plans")
    .insert({
      user_id: userId,
      start_page: 5,
      current_position: 5,
      pages_per_day: 1,
      total_pages: 604,
      completed_pages: 0,
      streak: 0,
      duration_days: 600,
      goal_mode: "pace",
      goal: "pace",
      start_type: "specific",
      active_days: [1, 2, 3, 4],
    })
    .select();

  console.log("Insert result:", { insertData, error: insErr });

  // 3. Try to update start_page to 20
  console.log("\n3. Attempting to update start_page to 20...");
  const { data: updateData, error: updErr } = await supabase
    .from("memorization_plans")
    .update({
      start_page: 20,
      current_position: 20,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId)
    .select();

  console.log("Update result:", { updateData, error: updErr });
}

main().catch(console.error);
