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

  const { data } = await supabase
    .from("memorization_plans")
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  if (data && data[0]) {
    console.log("ALL COLUMNS in memorization_plans:", Object.keys(data[0]));
    console.log("Full row sample:", data[0]);
  }
}

main().catch(console.error);
