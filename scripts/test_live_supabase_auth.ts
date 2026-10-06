if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class DummyWebSocket {} as any;
}
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://yhbqgdqoymbfuixojvmz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nsQ5Kpfyp8mmQV1SODN_LA_f1a6ADud";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

async function testAuth() {
  const testEmail = `adwam.test.${Date.now()}@gmail.com`;
  const testPassword = "Password123!";
  
  console.log("1. Testing signUp with:", testEmail);
  const { data: signData, error: signError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        name: "طالب تجريبي",
        role: "student",
        contact: testEmail
      }
    }
  });

  if (signError) {
    console.error("SignUp error:", signError);
  } else {
    console.log("SignUp success!");
    console.log("User ID:", signData.user?.id);
    console.log("User email:", signData.user?.email);
    console.log("Session present:", Boolean(signData.session));
    console.log("User identities:", signData.user?.identities?.length);
  }

  console.log("\n2. Testing signInWithPassword with wrong password...");
  const { data: wrongData, error: wrongError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: "WrongPassword999!"
  });
  console.log("Wrong password error:", wrongError?.message, "Status:", wrongError?.status);

  console.log("\n3. Testing signInWithPassword with correct password...");
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });
  if (loginError) {
    console.log("Login error (expected if email unconfirmed):", loginError.message);
  } else {
    console.log("Login success! Session token exists:", Boolean(loginData.session?.access_token));
  }
}

testAuth().catch(console.error);
