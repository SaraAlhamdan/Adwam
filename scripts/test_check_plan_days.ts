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

  // Check columns of plan_days
  const { data, error } = await supabase
    .from("plan_days")
    .insert({
      id: `test-day-${Date.now()}`,
      user_id: userId,
      date: "2026-10-06",
      kind: "memorization",
      page_from: 1,
      page_to: 1
    })
    .select();

  console.log("plan_days insert check:", { data, error });
}

main().catch(console.error);
