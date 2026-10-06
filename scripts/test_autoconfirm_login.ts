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
  const email = `testuser_${Date.now()}@adwam.app`;
  const password = "ValidPassword123!";
  console.log("Signing up user:", email);

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: "طالب أدوم",
        contact: email,
        role: "student"
      }
    }
  });

  console.log("SignUp response:", {
    userId: signUpData?.user?.id,
    hasSession: Boolean(signUpData?.session),
    tokenLength: signUpData?.session?.access_token?.length,
    error: signUpError?.message
  });

  if (signUpData?.session) {
    console.log("Testing signInWithPassword on the new user...");
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    console.log("Login response:", {
      hasSession: Boolean(loginData?.session),
      userId: loginData?.user?.id,
      error: loginError?.message
    });
  }
}

main().catch(console.error);
