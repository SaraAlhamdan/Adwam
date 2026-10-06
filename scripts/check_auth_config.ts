// @ts-ignore
if (typeof globalThis.WebSocket === "undefined") {
  // @ts-ignore
  globalThis.WebSocket = class {};
}

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://yhbqgdqoymbfuixojvmz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nsQ5Kpfyp8mmQV1SODN_LA_f1a6ADud";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

async function checkAuthConfig() {
  console.log("=== Checking Supabase Auth Configuration ===");

  // 1. Test Email Signup
  const testEmail = `test_probe_${Date.now()}@example.com`;
  const testPassword = "Password123!@#";
  console.log(`\n1. Testing Email Signup with ${testEmail}...`);
  const emailRes = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: { name: "Test Probe", role: "student" },
    },
  });

  if (emailRes.error) {
    console.error("Email signup error:", emailRes.error);
  } else {
    console.log("Email signup response:", {
      user_id: emailRes.data.user?.id,
      email: emailRes.data.user?.email,
      email_confirmed_at: emailRes.data.user?.email_confirmed_at,
      has_session: !!emailRes.data.session,
      identities: emailRes.data.user?.identities?.length,
    });
    if (emailRes.data.session) {
      console.log(">> Email Confirmation is DISABLED (auto-confirm enabled, session returned immediately)");
    } else if (emailRes.data.user && !emailRes.data.user.email_confirmed_at) {
      console.log(">> Email Confirmation is ENABLED (user created, but session is null until confirmed)");
    }
  }

  // If email signup succeeded, test login immediately
  if (emailRes.data.user) {
    console.log(`\n2. Testing Email Login with ${testEmail}...`);
    const loginRes = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (loginRes.error) {
      console.error("Email login error:", loginRes.error);
    } else {
      console.log("Email login succeeded! Session user:", loginRes.data.user?.id);
    }
  }

  // 3. Test Phone Signup directly via Supabase Auth
  const testPhone = `+9665${Math.floor(10000000 + Math.random() * 90000000)}`;
  console.log(`\n3. Testing Phone Signup directly via Supabase Auth with ${testPhone}...`);
  try {
    const phoneRes = await supabase.auth.signUp({
      phone: testPhone,
      password: testPassword,
      options: {
        data: { name: "Phone Probe", role: "student" },
      },
    });

    if (phoneRes.error) {
      console.log("Phone signup error:", phoneRes.error.message, "code:", (phoneRes.error as any).code);
    } else {
      console.log("Phone signup response:", {
        user_id: phoneRes.data.user?.id,
        phone: phoneRes.data.user?.phone,
        phone_confirmed_at: phoneRes.data.user?.phone_confirmed_at,
        has_session: !!phoneRes.data.session,
      });
      if (phoneRes.data.session) {
        console.log(">> Phone Confirmation is DISABLED (session returned immediately)");
      } else {
        console.log(">> Phone Confirmation is ENABLED (session is null until confirmed via SMS)");
      }
    }
  } catch (e: any) {
    console.error("Phone signup exception:", e.message);
  }

  // 4. Test Phone signInWithPassword directly via Supabase Auth
  console.log(`\n4. Testing Phone Login directly via Supabase Auth with ${testPhone}...`);
  try {
    const phoneLoginRes = await supabase.auth.signInWithPassword({
      phone: testPhone,
      password: testPassword,
    });
    if (phoneLoginRes.error) {
      console.log("Phone login error:", phoneLoginRes.error.message, "code:", (phoneLoginRes.error as any).code);
    } else {
      console.log("Phone login succeeded! User:", phoneLoginRes.data.user?.id);
    }
  } catch (e: any) {
    console.error("Phone login exception:", e.message);
  }
}

checkAuthConfig().catch(console.error);
