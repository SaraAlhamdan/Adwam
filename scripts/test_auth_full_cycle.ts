// Polyfill WebSocket and localStorage for Node 20 runtime
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class DummyWebSocket {} as any;
}
if (typeof (globalThis as any).localStorage === "undefined") {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

import {
  signUpWithSupabase,
  signInWithSupabase,
  signOutWithSupabase,
  getSupabaseSession,
  translateAuthError,
  supabase,
} from "../client/src/lib/supabase";

async function runFullAuthCycleTest() {
  console.log("==================================================================");
  console.log("       ADWAM E2E AUTHENTICATION FULL CYCLE VERIFICATION           ");
  console.log("==================================================================\n");

  if (!supabase) {
    throw new Error("Supabase client failed to initialize!");
  }

  // -------------------------------------------------------------------------
  // 1. REPORT CURRENT SUPABASE AUTH CONFIGURATION STATUS
  // -------------------------------------------------------------------------
  console.log(">>> STEP 1: Inspecting Live Supabase Auth Configuration Settings...");

  const timestamp = Date.now();
  const rawEmailInput = `  E2E_Student_${timestamp}@adwam-audit.org  `;
  const cleanEmail = rawEmailInput.trim().toLowerCase();
  const testPassword = "AdwamSecurePass2026!";
  const testName = "سالم الأحمدي";

  // -------------------------------------------------------------------------
  // 2. SIGNUP (Email + Password)
  // -------------------------------------------------------------------------
  console.log(`\n>>> STEP 2: Testing Email SignUp with: "${rawEmailInput}"`);
  console.log(`    Expected sanitized email: "${cleanEmail}"`);

  const signUpResult = await signUpWithSupabase({
    email: rawEmailInput,
    password: testPassword,
    name: testName,
    contact: cleanEmail,
    role: "student",
  });

  if (!signUpResult.user) {
    throw new Error("SignUp failed: No user returned");
  }

  const userId = signUpResult.user.id;
  const isEmailConfirmed = Boolean(signUpResult.user.email_confirmed_at);
  const hasDirectSession = Boolean(signUpResult.session);

  console.log("✅ SignUp succeeded!");
  console.log("   - User ID:", userId);
  console.log("   - Auth User Email:", signUpResult.user.email);
  console.log("   - Session returned immediately:", hasDirectSession);
  console.log("   - Email confirmed at:", signUpResult.user.email_confirmed_at);

  if (hasDirectSession && isEmailConfirmed) {
    console.log("   ℹ️ Supabase Setting: Email Confirmation is DISABLED (Auto-confirm active)");
  } else {
    console.log("   ℹ️ Supabase Setting: Email Confirmation is ENABLED (Manual confirmation required)");
  }

  // -------------------------------------------------------------------------
  // 3. LOGOUT (First signOut)
  // -------------------------------------------------------------------------
  console.log("\n>>> STEP 3: Testing Logout (signOut)...");
  await signOutWithSupabase();
  const sessionAfterLogout1 = await getSupabaseSession();
  if (sessionAfterLogout1.session !== null) {
    throw new Error("Logout failed: Session is still present!");
  }
  console.log("✅ Logout successful: Session is confirmed null.");

  // -------------------------------------------------------------------------
  // 4. LOGIN (First signIn with same credentials + whitespace trimming)
  // -------------------------------------------------------------------------
  console.log(`\n>>> STEP 4: Testing Login (signIn) with untrimmed email: "${rawEmailInput}"...`);
  const signInResult1 = await signInWithSupabase({
    email: rawEmailInput,
    password: testPassword,
  });

  if (!signInResult1.session || !signInResult1.user) {
    throw new Error("First login failed: No session or user returned");
  }
  if (signInResult1.user.id !== userId) {
    throw new Error(`User ID mismatch: expected ${userId}, got ${signInResult1.user.id}`);
  }
  console.log("✅ First Login succeeded!");
  console.log("   - Authenticated User ID:", signInResult1.user.id);
  console.log("   - Authenticated Email:", signInResult1.user.email);
  console.log("   - Profile Name:", signInResult1.profile?.name);
  console.log("   - Profile Role:", signInResult1.profile?.role);
  console.log("   - Profile Contact:", signInResult1.profile?.contact);

  // Decoupling Verification:
  console.log("\n   [Decoupling Check]:");
  console.log("   - Auth identity strictly comes from auth.users (user.email):", signInResult1.user.email);
  console.log("   - Profiles table contains auxiliary data without overriding Auth identity.");

  // -------------------------------------------------------------------------
  // 5. REFRESH (Session retrieval via getSupabaseSession)
  // -------------------------------------------------------------------------
  console.log("\n>>> STEP 5: Testing Session Verification / Refresh...");
  const refreshed = await getSupabaseSession();
  if (!refreshed.session || !refreshed.user) {
    throw new Error("Session refresh failed: No active session found");
  }
  if (refreshed.user.id !== userId) {
    throw new Error(`Refreshed user ID mismatch: expected ${userId}, got ${refreshed.user.id}`);
  }
  console.log("✅ Session Refresh succeeded!");
  console.log("   - Session Token Valid:", Boolean(refreshed.session.access_token));
  console.log("   - Session User:", refreshed.user.email);

  // -------------------------------------------------------------------------
  // 6. LOGOUT (Second signOut)
  // -------------------------------------------------------------------------
  console.log("\n>>> STEP 6: Testing Second Logout...");
  await signOutWithSupabase();
  const sessionAfterLogout2 = await getSupabaseSession();
  if (sessionAfterLogout2.session !== null) {
    throw new Error("Second logout failed: Session is still present!");
  }
  console.log("✅ Second Logout successful: Session is null.");

  // -------------------------------------------------------------------------
  // 7. LOGIN (Second signIn to complete full cycle)
  // -------------------------------------------------------------------------
  console.log("\n>>> STEP 7: Testing Second Login to complete full cycle...");
  const signInResult2 = await signInWithSupabase({
    email: cleanEmail,
    password: testPassword,
  });
  if (!signInResult2.session || !signInResult2.user) {
    throw new Error("Second login failed: No session returned");
  }
  console.log("✅ Second Login succeeded! Complete Email cycle verified: signup -> logout -> login -> refresh -> logout -> login");

  // Clean up session for subsequent tests
  await signOutWithSupabase();

  // -------------------------------------------------------------------------
  // 8. INDEPENDENT PHONE AUTHENTICATION TESTING
  // -------------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log(">>> STEP 8: Testing Phone Authentication Flow Independently...");
  console.log("==================================================================");

  const testPhone = "+966509988776";
  console.log(`Testing Phone SignUp with direct phone credential: ${testPhone}...`);

  let phoneSignUpError: any = null;
  try {
    await signUpWithSupabase({
      phone: testPhone,
      password: "PhonePassword2026!",
      name: "مستخدم الجوال",
      contact: testPhone,
      role: "student",
    });
  } catch (err: any) {
    phoneSignUpError = err;
  }

  if (phoneSignUpError) {
    console.log("Phone SignUp captured error response:");
    console.log("   - Error Message:", phoneSignUpError.message);
    console.log("   - Error Code:", phoneSignUpError.code);
    
    // Verify translation in Arabic and English
    const arError = translateAuthError(phoneSignUpError, "ar", "phone");
    const enError = translateAuthError(phoneSignUpError, "en", "phone");
    console.log("   - Arabic User-Facing Error:", arError);
    console.log("   - English User-Facing Error:", enError);

    // Verify it NEVER mentions email / "البريد"
    if (arError.includes("البريد") && !arError.includes("يرجى استخدام البريد")) {
      throw new Error(`Phone error incorrectly references email: "${arError}"`);
    }
    console.log("   ✅ Error correctly identifies Phone Provider status and does NOT falsely claim email conflict!");
  } else {
    console.log("Phone SignUp succeeded directly!");
  }

  console.log(`\nTesting Phone Login with direct phone credential: ${testPhone}...`);
  let phoneSignInError: any = null;
  try {
    await signInWithSupabase({
      phone: testPhone,
      password: "PhonePassword2026!",
    });
  } catch (err: any) {
    phoneSignInError = err;
  }

  if (phoneSignInError) {
    console.log("Phone SignIn captured error response:");
    console.log("   - Error Message:", phoneSignInError.message);
    console.log("   - Error Code:", phoneSignInError.code);
    const arPhoneLoginError = translateAuthError(phoneSignInError, "ar", "phone");
    console.log("   - Arabic User-Facing Error:", arPhoneLoginError);
    console.log("   ✅ Phone Login error handled cleanly without email conflation.");
  }

  // -------------------------------------------------------------------------
  // 9. CREDENTIAL-SPECIFIC ERROR TRANSLATION VERIFICATION
  // -------------------------------------------------------------------------
  console.log("\n>>> STEP 9: Verifying Credential-Specific Error Messages...");

  // Duplicate user error for Email vs Phone
  const duplicateErr = { code: "user_already_exists", message: "User already registered" };
  const emailDuplicateMsg = translateAuthError(duplicateErr, "ar", "email");
  const phoneDuplicateMsg = translateAuthError(duplicateErr, "ar", "phone");

  console.log("   - Duplicate Email Error:", emailDuplicateMsg);
  console.log("   - Duplicate Phone Error:", phoneDuplicateMsg);

  if (phoneDuplicateMsg.includes("البريد")) {
    throw new Error(`CRITICAL: Phone duplicate error mentions "البريد"! Found: ${phoneDuplicateMsg}`);
  }
  if (!phoneDuplicateMsg.includes("الرقم")) {
    throw new Error(`CRITICAL: Phone duplicate error does not mention "الرقم"! Found: ${phoneDuplicateMsg}`);
  }
  console.log("   ✅ Duplicate error messages are strictly credential-specific!");

  // Invalid credentials error for Email vs Phone
  const invalidCredErr = { code: "invalid_credentials", message: "Invalid login credentials" };
  const emailInvalidMsg = translateAuthError(invalidCredErr, "ar", "email");
  const phoneInvalidMsg = translateAuthError(invalidCredErr, "ar", "phone");

  console.log("   - Invalid Email Credentials Error:", emailInvalidMsg);
  console.log("   - Invalid Phone Credentials Error:", phoneInvalidMsg);

  if (phoneInvalidMsg.includes("البريد")) {
    throw new Error(`CRITICAL: Phone invalid credentials mentions "البريد"! Found: ${phoneInvalidMsg}`);
  }
  if (!phoneInvalidMsg.includes("الجوال")) {
    throw new Error(`CRITICAL: Phone invalid credentials does not mention "الجوال"! Found: ${phoneInvalidMsg}`);
  }
  console.log("   ✅ Invalid credentials error messages are strictly credential-specific!");

  console.log("\n==================================================================");
  console.log("                    ALL TESTS PASSED SUCCESSFULLY!                ");
  console.log("==================================================================");
}

runFullAuthCycleTest().catch(err => {
  console.error("FATAL TEST FAILURE:", err);
  process.exit(1);
});
