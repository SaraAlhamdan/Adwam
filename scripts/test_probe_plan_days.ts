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

  const planId = '57c9c032-b182-434e-a1d5-3c0c42b6135e';
  // Try inserting with plan_id
  const { data, error } = await supabase.from("plan_days").insert({ plan_id: planId }).select();
  console.log("plan_days with plan_id:", { data, error });
}

main().catch(console.error);
