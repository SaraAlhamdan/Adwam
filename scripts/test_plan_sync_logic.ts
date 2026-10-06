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

  // 1. Fetch existing plan
  const { data: existingRows } = await supabase
    .from("memorization_plans")
    .select("*")
    .eq("user_id", userId);

  console.log("Existing plan count:", existingRows?.length);
  const rowBefore = existingRows?.[0];

  // 2. Change starting point to page 75
  const newStartPage = 75;
  const newQuota = 2; // 2 pages per day
  const payload = {
    user_id: userId,
    title: "رحلتي الحالية",
    goal_type: "full_quran",
    start_page: newStartPage,
    end_page: 604,
    current_page: newStartPage,
    pages_per_session: newQuota,
    calculated_completion_date: "2027-08-01",
    status: "active",
    updated_at: new Date().toISOString()
  };

  let updateResult;
  if (rowBefore?.id) {
    updateResult = await supabase
      .from("memorization_plans")
      .update(payload)
      .eq("id", rowBefore.id)
      .select();
  } else {
    updateResult = await supabase
      .from("memorization_plans")
      .insert(payload)
      .select();
  }

  console.log("Update / Insert result:", updateResult);

  // 3. Re-fetch from Supabase and confirm
  const { data: freshRows } = await supabase
    .from("memorization_plans")
    .select("*")
    .eq("user_id", userId);

  const fresh = freshRows?.[0];
  console.log("\n--- Verification from Supabase ---");
  console.log("start_page in DB:", fresh.start_page);
  console.log("current_page in DB:", fresh.current_page);
  console.log("pages_per_session in DB:", fresh.pages_per_session);
  console.log("updated_at in DB:", fresh.updated_at);
  console.log("Updated at changed?", fresh.updated_at !== rowBefore?.updated_at);
}

main().catch(console.error);
