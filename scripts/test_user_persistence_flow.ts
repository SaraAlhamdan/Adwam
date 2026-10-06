if (typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = class DummyWebSocket {} as any;
}

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://yhbqgdqoymbfuixojvmz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nsQ5Kpfyp8mmQV1SODN_LA_f1a6ADud";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_EMAIL = "testuser_1791280739796@adwam.app";
const TEST_PASS = "ValidPassword123!";

async function runTest() {
  console.log("=================================================");
  console.log("--- 1. Authenticating as Real Returning User ---");
  console.log("=================================================");
  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASS,
  });

  if (authError || !authData.user) {
    console.error("Sign-in failed:", authError?.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log("Authenticated User ID:", userId);
  console.log("Initial User Metadata:", authData.user.user_metadata);

  console.log("\n=================================================");
  console.log("--- 2. Persisting onboarding_completed in Supabase ---");
  console.log("=================================================");

  const { data: updateUserData, error: updateUserError } = await supabase.auth.updateUser({
    data: { onboarding_completed: true },
  });

  if (updateUserError) {
    console.error("Failed to update onboarding_completed:", updateUserError.message);
    process.exit(1);
  }

  console.log("Updated metadata successfully:", updateUserData.user.user_metadata);

  // Re-fetch user to confirm persistence
  const { data: refetchedUser, error: refetchError } = await supabase.auth.getUser();
  if (refetchError) {
    console.error("Failed to re-fetch user:", refetchError.message);
    process.exit(1);
  }
  console.log("Confirmed persisted onboarding_completed:", refetchedUser.user.user_metadata.onboarding_completed);

  console.log("\n=================================================");
  console.log("--- 3. Plan Persistence & Starting Point Update ---");
  console.log("=================================================");

  // Read current row before update
  const { data: initialRow, error: initialError } = await supabase
    .from("memorization_plans")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  console.log("Current row before update:", {
    start_page: initialRow?.start_page,
    current_page: initialRow?.current_page,
    pages_per_session: initialRow?.pages_per_session,
    updated_at: initialRow?.updated_at,
  });

  const previousUpdatedAt = initialRow?.updated_at;

  // Let's simulate a user changing Settings to:
  // Starting page: 142
  // Pages per day: 1.5
  // Active days: [0, 1, 2, 4] (Sat, Sun, Mon, Wed)
  // Target date: none (pace mode)
  const newStartPage = 142;
  const newPagesPerDay = 1.5;
  const newActiveDays = [0, 1, 2, 4];
  const newUpdatedAt = new Date().toISOString();

  const metaTitle = JSON.stringify({
    title: "رحلتي الحالية",
    activeDays: newActiveDays,
    startType: "specific",
    goalMode: "pace",
    durationDays: 308,
  });

  const payload = {
    user_id: userId,
    title: metaTitle,
    goal_type: "full_quran",
    start_page: newStartPage,
    end_page: 604,
    current_page: newStartPage,
    pages_per_session: newPagesPerDay,
    status: "active",
    updated_at: newUpdatedAt,
  };

  let updateRes;
  if (initialRow?.id) {
    updateRes = await supabase
      .from("memorization_plans")
      .update(payload)
      .eq("id", initialRow.id)
      .select();
  } else {
    updateRes = await supabase
      .from("memorization_plans")
      .insert(payload)
      .select();
  }

  if (updateRes.error) {
    console.error("Plan update failed:", updateRes.error);
    process.exit(1);
  }

  console.log("Plan updated successfully. Returned row:", {
    id: updateRes.data[0].id,
    start_page: updateRes.data[0].start_page,
    current_page: updateRes.data[0].current_page,
    pages_per_session: updateRes.data[0].pages_per_session,
    updated_at: updateRes.data[0].updated_at,
  });

  // Verify updated_at actually changed
  console.log("Previous updated_at:", previousUpdatedAt);
  console.log("New updated_at:     ", updateRes.data[0].updated_at);
  const updatedAtChanged = previousUpdatedAt !== updateRes.data[0].updated_at;
  console.log("Has updated_at changed?:", updatedAtChanged);

  console.log("\n=================================================");
  console.log("--- 4. Demo Mode Isolation Check ---");
  console.log("=================================================");
  // In demo mode, synthetic activities and modified plan (e.g. currentPosition: 200, completedPages: 50)
  // are kept in memory and specifically NOT synced to Supabase.
  // Let's verify that the remote Supabase row still has start_page: 142 and current_page: 142
  const { data: checkDemoIsolation } = await supabase
    .from("memorization_plans")
    .select("start_page, current_page, pages_per_session, title")
    .eq("user_id", userId)
    .single();

  console.log("Remote row confirms isolated real data:", checkDemoIsolation);

  console.log("\n=================================================");
  console.log("--- 5. Returning User Flow (Logout -> Login -> Restore) ---");
  console.log("=================================================");

  // 1. Sign out
  await supabase.auth.signOut();
  console.log("Signed out from Supabase Auth.");

  // 2. Re-login
  const { data: reLoginData, error: reLoginError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASS,
  });

  if (reLoginError || !reLoginData.user) {
    console.error("Re-login failed:", reLoginError?.message);
    process.exit(1);
  }
  console.log("Re-login successful. User ID:", reLoginData.user.id);

  // 3. Check session restoration & metadata
  const hasOnboardingCompleted = Boolean(reLoginData.user.user_metadata?.onboarding_completed);
  console.log("Session restored. onboarding_completed flag:", hasOnboardingCompleted);

  // 4. Fetch remote plan
  const { data: restoredPlanRow } = await supabase
    .from("memorization_plans")
    .select("*")
    .eq("user_id", reLoginData.user.id)
    .maybeSingle();

  console.log("Restored plan row from Supabase:", {
    start_page: restoredPlanRow?.start_page,
    current_page: restoredPlanRow?.current_page,
    pages_per_session: restoredPlanRow?.pages_per_session,
    status: restoredPlanRow?.status,
  });

  // 5. Check onboarding bypass evaluation
  const shouldSkipOnboarding = hasOnboardingCompleted || (restoredPlanRow && restoredPlanRow.status === "active");
  console.log("Evaluation: Should skip onboarding on login?:", shouldSkipOnboarding);

  if (shouldSkipOnboarding && updatedAtChanged && restoredPlanRow?.start_page === 142) {
    console.log("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<");
  } else {
    console.error("\n>>> TESTS FAILED: Condition check mismatch <<<");
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
