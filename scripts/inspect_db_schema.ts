if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class DummyWebSocket {} as any;
}

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://yhbqgdqoymbfuixojvmz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nsQ5Kpfyp8mmQV1SODN_LA_f1a6ADud";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: "testuser_1791280739796@adwam.app",
    password: "ValidPassword123!",
  });

  if (authErr || !auth.user) {
    console.error("Auth error:", authErr);
    return;
  }

  console.log("Authenticated as user:", auth.user.id);

  // 1. Profiles
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id);
  console.log("Profiles data:", profiles, "error:", pErr);

  // 2. Memorization Plans
  const { data: plans, error: mErr } = await supabase
    .from("memorization_plans")
    .select("*")
    .eq("user_id", auth.user.id);
  console.log("Plans count:", plans?.length, "error:", mErr);
  if (plans && plans.length > 0) {
    console.log("Plan row keys:", Object.keys(plans[0]));
    console.log("Plan row sample:", plans[0]);
  }

  // 3. User Settings
  const { data: settings, error: sErr } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", auth.user.id);
  console.log("Settings data:", settings, "error:", sErr);

  // 5. Test title metadata update
  const meta = JSON.stringify({ name: "رحلتي الحالية", activeDays: [0, 1, 2, 3], startType: "specific", goalMode: "pace" });
  const { data: updateData, error: updateError } = await supabase
    .from("memorization_plans")
    .update({
      title: meta,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", auth.user.id)
    .select();
  console.log("Update title metadata result:", updateData?.[0]?.title, "error:", updateError);
}

main().catch(console.error);
