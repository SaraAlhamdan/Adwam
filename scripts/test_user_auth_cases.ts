if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class DummyWebSocket {} as any;
}
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://yhbqgdqoymbfuixojvmz.supabase.co",
  "sb_publishable_nsQ5Kpfyp8mmQV1SODN_LA_f1a6ADud",
  { auth: { persistSession: false } }
);

async function testExistingUser() {
  const email = "adwam.test.1791277881958@gmail.com";
  console.log("Testing signInWithPassword with wrong password on user:", email);
  const { data: d1, error: e1 } = await supabase.auth.signInWithPassword({
    email,
    password: "WrongPassword123!"
  });
  console.log("Wrong password rejection:", {
    errorMessage: e1?.message,
    statusCode: e1?.status
  });

  console.log("\nTesting signInWithPassword with correct password on user:", email);
  const { data: d2, error: e2 } = await supabase.auth.signInWithPassword({
    email,
    password: "Password123!"
  });
  console.log("Correct password attempt:", {
    sessionExists: Boolean(d2.session),
    errorMessage: e2?.message,
    statusCode: e2?.status
  });

  console.log("\nTesting signOut:");
  const { error: e3 } = await supabase.auth.signOut();
  console.log("SignOut success (error is null):", e3 === null);

  console.log("\nTesting getSession:");
  const { data: d4, error: e4 } = await supabase.auth.getSession();
  console.log("Session after logout:", { session: d4.session, error: e4 });
}

testExistingUser().catch(console.error);
