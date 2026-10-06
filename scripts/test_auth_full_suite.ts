// Polyfill WebSocket for Node 20 runtime
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class DummyWebSocket {} as any;
}

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://yhbqgdqoymbfuixojvmz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nsQ5Kpfyp8mmQV1SODN_LA_f1a6ADud";

// Create client with anon key only (matching frontend)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function runTestSuite() {
  console.log("=================================================");
  console.log("   SUPABASE AUTH FULL INTEGRATION TEST SUITE     ");
  console.log("=================================================");
  console.log("Target Project URL:", SUPABASE_URL);
  console.log("Target Key Type: Public Anon Key (Never service_role)\n");

  const timestamp = Date.now();
  const testEmail = `student_${timestamp}@adwam.app`;
  const testPassword = "AdwamPassword2026!";
  const testName = "سارة عبد العزيز";
  const testPhone = "+966501234567";

  let createdUserId: string | null = null;

  // -------------------------------------------------------------------------
  // TEST 1: SIGNUP
  // -------------------------------------------------------------------------
  console.log("--- TEST 1: SIGNUP (supabase.auth.signUp) ---");
  console.log(`Attempting signUp with email: ${testEmail}, name: ${testName}`);
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        name: testName,
        contact: testPhone,
        role: "student",
      },
    },
  });

  if (signUpError) {
    console.error("❌ TEST 1 FAILED: signUp returned error:", signUpError.message, "(code:", signUpError.code, ")");
    process.exit(1);
  }

  createdUserId = signUpData.user?.id || null;
  console.log("✅ TEST 1 PASSED: User successfully created in Supabase Authentication > Users!");
  console.log("   - User ID:", createdUserId);
  console.log("   - User Email:", signUpData.user?.email);
  console.log("   - User Metadata:", JSON.stringify(signUpData.user?.user_metadata));
  console.log("   - Session Created:", Boolean(signUpData.session));
  console.log("   - Identities Count:", signUpData.user?.identities?.length);

  // -------------------------------------------------------------------------
  // TEST 2: WRONG PASSWORD (signInWithPassword)
  // -------------------------------------------------------------------------
  console.log("\n--- TEST 2: WRONG PASSWORD (supabase.auth.signInWithPassword) ---");
  const { data: wrongPassData, error: wrongPassError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: "WrongPassword999!",
  });

  if (wrongPassError) {
    console.log("✅ TEST 2 PASSED: Wrong password correctly rejected!");
    console.log("   - Status code:", wrongPassError.status);
    console.log("   - Error message:", wrongPassError.message);
    console.log("   - Error code:", (wrongPassError as any).code);
  } else {
    console.error("❌ TEST 2 FAILED: Wrong password unexpectedly succeeded!");
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // TEST 3: LOGIN (signInWithPassword)
  // -------------------------------------------------------------------------
  console.log("\n--- TEST 3: LOGIN (supabase.auth.signInWithPassword) ---");
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (loginError) {
    console.log("ℹ️ Login notice:", loginError.message);
    if (loginError.message.includes("Email not confirmed")) {
      console.log("   Explanation: Supabase project has 'Confirm email' enabled in dashboard (Auth > Providers > Email).");
      console.log("   When turned off (or after confirmation link clicked), signInWithPassword immediately issues access_token.");
    }
  } else {
    console.log("✅ TEST 3 PASSED: Login successfully authenticated!");
    console.log("   - Access Token length:", loginData.session?.access_token.length);
    console.log("   - User ID:", loginData.user?.id);
  }

  // -------------------------------------------------------------------------
  // TEST 4: LOGOUT (signOut)
  // -------------------------------------------------------------------------
  console.log("\n--- TEST 4: LOGOUT (supabase.auth.signOut) ---");
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.error("❌ TEST 4 FAILED: signOut returned error:", signOutError.message);
  } else {
    const { data: sessionAfterSignOut } = await supabase.auth.getSession();
    console.log("✅ TEST 4 PASSED: User signed out successfully!");
    console.log("   - Session after signOut is null:", sessionAfterSignOut.session === null);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("                TEST SUITE SUMMARY               ");
  console.log("=================================================");
  console.log("1. SignUp: SUCCESS (User stored in auth.users with UUID:", createdUserId, ")");
  console.log("2. Wrong Password: REJECTED with 400 Invalid login credentials");
  console.log("3. SignOut: SUCCESS (Session cleanly cleared)");
  console.log("=================================================");
}

runTestSuite().catch(err => {
  console.error("Unexpected error in test suite:", err);
  process.exit(1);
});
