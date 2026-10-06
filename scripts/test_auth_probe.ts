// Polyfill WebSocket for Node 20 testing
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
  console.log("Connecting to Supabase at:", SUPABASE_URL);

  // 1. Check getSession
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  console.log("Current session:", sessionData.session, sessionErr);

  // 2. Try to query public.profiles
  const { data: profiles, error: profilesErr } = await supabase.from("profiles").select("*").limit(5);
  console.log("Profiles query:", { count: profiles?.length, profilesErr });
}

main().catch(console.error);
