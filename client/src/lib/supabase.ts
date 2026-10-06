import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadPlan, type PlanState, type ActivityRecord, type MasterySnapshot, type ReviewItem } from "@/features/persistence";

// Ensure WebSocket constructor exists in Node test environments
if (typeof globalThis !== "undefined" && typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class DummyWebSocket {} as any;
}

const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : (typeof process !== "undefined" && process.env ? process.env : {} as any);
const supabaseUrl = env.VITE_SUPABASE_URL || "https://yhbqgdqoymbfuixojvmz.supabase.co";
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_nsQ5Kpfyp8mmQV1SODN_LA_f1a6ADud";

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseUrl.startsWith("http") &&
  supabaseAnonKey &&
  supabaseAnonKey.length > 10
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface SignUpParams {
  email?: string;
  phone?: string;
  password: string;
  name: string;
  contact?: string;
  role?: "student" | "teacher";
}

export interface SignInParams {
  email?: string;
  phone?: string;
  password: string;
}

export function translateAuthError(
  err: any,
  lang: "ar" | "en" = "ar",
  method: "email" | "phone" = "email"
): string {
  if (!err) return "";
  const msg = typeof err === "string" ? err : err.message || err.error_description || "";
  const code = (err.code || "").toLowerCase();

  if (code === "invalid_credentials" || msg.includes("Invalid login credentials")) {
    if (method === "phone") {
      return lang === "ar"
        ? "بيانات الدخول غير صحيحة (يرجى التحقق من رقم الجوال وكلمة المرور)."
        : "Invalid login credentials (please check phone number and password).";
    }
    return lang === "ar"
      ? "بيانات الدخول غير صحيحة (يرجى التحقق من البريد الإلكتروني وكلمة المرور)."
      : "Invalid login credentials (please check email and password).";
  }

  if (code === "user_already_exists" || msg.includes("User already registered") || msg.includes("already registered")) {
    if (method === "phone") {
      return lang === "ar"
        ? "يوجد حساب مسجل بهذا الرقم بالفعل. سجّل الدخول مباشرة."
        : "An account with this phone number already exists. Sign in instead.";
    }
    return lang === "ar"
      ? "يوجد حساب مسجل بهذا البريد بالفعل. سجّل الدخول مباشرة."
      : "An account with this email already exists. Sign in instead.";
  }

  if (
    code === "phone_provider_disabled" ||
    msg.includes("Phone signups are disabled") ||
    msg.includes("Phone logins are disabled") ||
    msg.includes("phone_provider_disabled")
  ) {
    return lang === "ar"
      ? "التسجيل والدخول برقم الجوال غير مفعّل في خادم Supabase حالياً (Phone Provider is disabled). يرجى استخدام البريد الإلكتروني."
      : "Phone authentication is disabled in Supabase Auth settings. Please use email.";
  }

  if (code === "email_not_confirmed" || msg.includes("Email not confirmed")) {
    return lang === "ar"
      ? "البريد الإلكتروني لم يتم تأكيده بعد. يرجى مراجعة بريدك، أو إيقاف خيار تأكيد البريد (Email Confirmation) في إعدادات Supabase لتسجيل الدخول الفوري."
      : "Email not confirmed. Please verify your email or disable email confirmation in Supabase Auth settings.";
  }

  if (code === "phone_not_confirmed" || msg.includes("Phone not confirmed")) {
    return lang === "ar"
      ? "رقم الجوال لم يتم تأكيده بعد."
      : "Phone number is not confirmed.";
  }

  if (code === "email_address_invalid" || msg.includes("is invalid") || msg.includes("valid email")) {
    return lang === "ar"
      ? "صيغة البريد الإلكتروني غير صالحة. يرجى إدخال بريد إلكتروني صحيح."
      : "Invalid email address. Please enter a valid email.";
  }

  if (code === "phone_number_invalid" || msg.includes("valid phone") || msg.includes("Invalid phone")) {
    return lang === "ar"
      ? "صيغة رقم الجوال غير صالحة. يرجى إدخال رقم هاتف بصيغة دولية صحيحة."
      : "Invalid phone number format.";
  }

  if (code === "sms_send_failed" || msg.includes("Error sending sms") || msg.includes("sms")) {
    return lang === "ar"
      ? "تعذر إرسال رسالة التأكيد إلى رقم الجوال. يرجى استخدام البريد الإلكتروني."
      : "Failed to send SMS confirmation. Please use email.";
  }

  if (code === "weak_password" || msg.includes("Password should be") || msg.includes("least 6 characters")) {
    return lang === "ar"
      ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل."
      : "Password must be at least 8 characters.";
  }

  if (msg.includes("rate limit") || msg.includes("over_email_send_rate_limit") || msg.includes("over_request_rate_limit")) {
    return lang === "ar"
      ? "تم تجاوز حد المحاولات المسموح به مؤقتًا. يرجى الانتظار والمحاولة لاحقًا."
      : "Rate limit exceeded. Please wait a moment and try again.";
  }

  return msg;
}

export async function signUpWithSupabase(params: SignUpParams) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { email, phone, password, name, contact, role = "student" } = params;

  let credentials: any;
  const trimmedPassword = password.trim();
  const trimmedName = name.trim();

  if (email && email.trim()) {
    const cleanEmail = email.trim().toLowerCase();
    credentials = {
      email: cleanEmail,
      password: trimmedPassword,
      options: {
        data: {
          name: trimmedName,
          contact: contact ? contact.trim() : cleanEmail,
          role,
        },
      },
    };
  } else if (phone && phone.trim()) {
    const cleanPhone = phone.trim();
    credentials = {
      phone: cleanPhone,
      password: trimmedPassword,
      options: {
        data: {
          name: trimmedName,
          contact: contact ? contact.trim() : cleanPhone,
          role,
        },
      },
    };
  } else {
    throw new Error("Missing email or phone for sign up");
  }

  const { data, error } = await supabase.auth.signUp(credentials);
  if (error) throw error;

  if (data?.session && data.user) {
    try {
      const userContact = (email && email.trim().toLowerCase()) || (phone && phone.trim()) || (contact ? contact.trim() : "");
      await supabase.from("profiles").upsert({
        id: data.user.id,
        name: trimmedName,
        contact: userContact,
        role,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    } catch (upsertErr) {
      console.warn("[Supabase] Profile client-side upsert notice:", upsertErr);
    }
  }

  return data;
}

export type AuthResult = {
  session: any;
  user: any;
  profile?: { name: string; contact: string; role: "student" | "teacher"; onboardingCompleted?: boolean };
};

export async function signInWithSupabase(params: SignInParams): Promise<AuthResult> {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { email, phone, password } = params;

  let credentials: any;
  const trimmedPassword = password.trim();

  if (email && email.trim()) {
    credentials = {
      email: email.trim().toLowerCase(),
      password: trimmedPassword,
    };
  } else if (phone && phone.trim()) {
    credentials = {
      phone: phone.trim(),
      password: trimmedPassword,
    };
  } else {
    throw new Error("Missing email or phone for sign in");
  }

  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error) throw error;

  if (data?.session && data.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    const name = profile?.name || data.user.user_metadata?.name || (data.user.email ? data.user.email.split("@")[0] : data.user.phone) || "مستخدم";
    const authIdentity = data.user.email || data.user.phone || "";
    const contact = profile?.contact || data.user.user_metadata?.contact || authIdentity;
    const role = (profile?.role || data.user.user_metadata?.role || "student") as "student" | "teacher";
    const onboardingCompleted = Boolean(data.user.user_metadata?.onboarding_completed);

    if (!profile) {
      try {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          name,
          contact: contact || authIdentity,
          role,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
      } catch (upsertErr) {
        console.warn("[Supabase] Profile client-side fallback upsert notice:", upsertErr);
      }
    }

    return {
      session: data.session,
      user: data.user,
      profile: { name, contact: contact || authIdentity, role, onboardingCompleted },
    };
  }

  return {
    session: data.session,
    user: data.user,
    profile: undefined,
  };
}

export async function signOutWithSupabase() {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("[Supabase] signOut error:", err);
  } finally {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("adom-session");
    }
  }
}

export async function getSupabaseSession() {
  if (!supabase) return { session: null, user: null, profile: null };
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user) {
    return { session: null, user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  const name = profile?.name || session.user.user_metadata?.name || (session.user.email ? session.user.email.split("@")[0] : session.user.phone) || "مستخدم";
  const contact = session.user.email || session.user.phone || profile?.contact || session.user.user_metadata?.contact || "";
  const role = (profile?.role || session.user.user_metadata?.role || "student") as "student" | "teacher";
  const onboardingCompleted = Boolean(session.user.user_metadata?.onboarding_completed);

  return {
    session,
    user: session.user,
    profile: { name, contact, role, onboardingCompleted },
  };
}

/**
 * Uploads a recorded recitation audio blob to Supabase Storage in the 'recitations' bucket
 */
export async function uploadRecitationAudio(
  blob: Blob,
  userId: string,
  prefix = "recitation"
): Promise<string | null> {
  if (!supabase) return null;
  try {
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("wav") ? "wav" : "webm";
    const filename = `${userId}/${prefix}_${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("recitations")
      .upload(filename, blob, {
        contentType: blob.type || "audio/webm",
        upsert: true,
      });

    if (error) {
      console.warn("[Supabase Storage] upload warning:", error.message);
      return null;
    }

    const { data: publicData } = supabase.storage
      .from("recitations")
      .getPublicUrl(data.path);

    return publicData.publicUrl || null;
  } catch (err) {
    console.warn("[Supabase Storage] upload error:", err);
    return null;
  }
}

/**
 * Invokes the Supabase Edge Function 'analyze-recitation'
 */
export async function invokeAnalyzeRecitation(
  audioBlob: Blob,
  expectedText: string,
  expectedAyahs?: Array<{ ayah: number; text: string }>
) {
  // Convert blob to base64 once for both Supabase Edge Function and Express fallback
  const audioBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("فشل قراءة ملف الصوت"));
    reader.onload = () => {
      const val = String(reader.result || "");
      const comma = val.indexOf(",");
      resolve(comma >= 0 ? val.slice(comma + 1) : val);
    };
    reader.readAsDataURL(audioBlob);
  });

  const mimeType = audioBlob.type || "audio/webm";

  // 1. Try Supabase Edge Function 'analyze-recitation' first (has GROQ_API_KEY server-side)
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke("analyze-recitation", {
        body: {
          audioBase64,
          mimeType,
          expectedText,
          expectedAyahs,
        },
      });

      if (error) {
        const contextMsg = (error as any)?.context?.json?.message || (error as any)?.message;
        if (contextMsg?.includes("429") || contextMsg?.includes("Rate limit") || (error as any)?.status === 429) {
          throw new Error("تم تجاوز حد الطلبات المسموح به مؤقتًا لدى خدمة Groq (Rate limit exceeded). يرجى الانتظار بضع ثوانٍ وإعادة المحاولة.");
        }
        if (contextMsg?.includes("GROQ_API_KEY") || contextMsg?.includes("OPENAI_API_KEY") || contextMsg?.includes("configured")) {
          throw new Error("خدمة المعالجة الصوتية غير متوفرة حالياً، يرجى المحاولة لاحقاً.");
        }
        throw new Error(contextMsg || error.message || "Supabase Edge Function failed");
      }

      if (data && (data.status === "success" || data.status === "uncertain")) {
        return data;
      }
      if (data && data.error) {
        if (data.error === "RATE_LIMIT_EXCEEDED" || data.status === 429) {
          throw new Error("تم تجاوز حد الطلبات المسموح به مؤقتًا لدى خدمة Groq (Rate limit exceeded). يرجى الانتظار بضع ثوانٍ وإعادة المحاولة.");
        }
        if (data.message?.includes("GROQ_API_KEY") || data.message?.includes("OPENAI_API_KEY") || data.message?.includes("configured")) {
          throw new Error("خدمة المعالجة الصوتية غير متوفرة حالياً، يرجى المحاولة لاحقاً.");
        }
        throw new Error(data.message || data.error);
      }
    } catch (err: any) {
      if (err.message && (err.message.includes("429") || err.message.includes("Rate limit") || err.message.includes("تجاوز حد الطلبات"))) {
        throw err;
      }
      if (err.message && err.message.includes("خدمة المعالجة الصوتية")) {
        throw err;
      }
      console.warn("[Supabase Edge Function invoke failed, falling back to server API]:", err.message);
      // Fall through to server API
    }
  }

  // 2. Fallback to Express backend /api/recitation/analyze
  const response = await fetch("/api/recitation/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      mimeType,
      expectedText,
      expectedAyahs,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const rawMsg = payload?.message || payload?.error || "";
    if (rawMsg.includes("GROQ_API_KEY") || rawMsg.includes("OPENAI_API_KEY") || rawMsg.includes("configured") || rawMsg.includes("SERVICE_ERROR")) {
      throw new Error("خدمة المعالجة الصوتية غير متوفرة حالياً، يرجى المحاولة لاحقاً.");
    }
    throw new Error(rawMsg || `فشل فحص التسميع (${response.status})`);
  }

  return await response.json();
}

/**
 * Mark onboarding as completed in Supabase Auth user metadata
 */
export async function completeOnboardingInSupabase(userId: string): Promise<boolean> {
  if (!supabase || !userId) return false;
  try {
    const { error } = await supabase.auth.updateUser({
      data: { onboarding_completed: true },
    });
    if (error) {
      console.warn("[Supabase] completeOnboardingInSupabase error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase] completeOnboardingInSupabase error:", err);
    return false;
  }
}

/**
 * Sync user plan to Supabase
 */
export async function fetchPlanFromSupabase(userId: string): Promise<PlanState | null> {
  if (!supabase || !userId) return null;
  try {
    const { data: row, error } = await supabase
      .from("memorization_plans")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !row) return null;

    const startPage = Math.max(1, Math.min(604, row.start_page ?? 1));
    const currentPosition = Math.max(1, Math.min(604, row.current_page ?? startPage));
    const pagesPerDay = Number(row.pages_per_session) || 1;
    const targetDate = row.target_date || undefined;
    const goalDate = row.calculated_completion_date || undefined;
    const started = row.status === "active" || Boolean(row.start_page);

    const local = loadPlan();
    let activeDays = local.activeDays && local.activeDays.length ? local.activeDays : [1, 2, 3, 4];
    let startType = local.startType || "beginning";
    let goalMode = local.goalMode || "pace";
    let durationDays = local.durationDays || 604;

    if (row.title && typeof row.title === "string" && row.title.startsWith("{")) {
      try {
        const meta = JSON.parse(row.title);
        if (Array.isArray(meta.activeDays) && meta.activeDays.length) {
          activeDays = meta.activeDays;
        }
        if (meta.startType) startType = meta.startType;
        if (meta.goalMode) goalMode = meta.goalMode;
        if (typeof meta.durationDays === "number") durationDays = meta.durationDays;
      } catch {}
    }

    return {
      ...local,
      started,
      startPage,
      currentPosition,
      pagesPerDay,
      targetDate,
      goalDate,
      activeDays,
      startType,
      goalMode,
      durationDays,
    };
  } catch (err) {
    console.warn("[Supabase] fetchPlanFromSupabase failed:", err);
    return null;
  }
}

/**
 * Sync user plan to Supabase memorization_plans table (single source of truth)
 */
export async function syncPlanToSupabase(plan: PlanState, userId: string): Promise<boolean> {
  if (!supabase || !userId) return false;
  try {
    const startPage = Math.max(1, Math.min(604, Math.floor(plan.startPage || 1)));
    const currentPosition = Math.max(1, Math.min(604, Math.floor(plan.currentPosition || startPage)));
    const pagesPerDay = plan.pagesPerDay || 1;

    let metaTitle = "رحلتي الحالية";
    try {
      metaTitle = JSON.stringify({
        title: "رحلتي الحالية",
        activeDays: plan.activeDays || [],
        startType: plan.startType || "beginning",
        goalMode: plan.goalMode || "pace",
        durationDays: plan.durationDays,
      });
    } catch {}

    const payload = {
      user_id: userId,
      title: metaTitle,
      goal_type: plan.goalMode === "target" ? "target_date" : "full_quran",
      start_page: startPage,
      end_page: plan.totalPages || 604,
      current_page: currentPosition,
      pages_per_session: pagesPerDay,
      target_date: plan.targetDate || null,
      calculated_completion_date: plan.goalDate || null,
      status: plan.started ? "active" : "draft",
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("memorization_plans")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("memorization_plans")
        .update(payload)
        .eq("id", existing.id);
      if (error) {
        console.warn("[Supabase] update plan error:", error.message);
        return false;
      }
      return true;
    } else {
      const { error } = await supabase
        .from("memorization_plans")
        .insert(payload);
      if (error) {
        console.warn("[Supabase] insert plan error:", error.message);
        return false;
      }
      return true;
    }
  } catch (err) {
    console.warn("[Supabase] syncPlanToSupabase failed:", err);
    return false;
  }
}

/**
 * Sync an activity or plan day to Supabase
 */
export async function syncActivityToSupabase(activity: ActivityRecord, userId: string): Promise<boolean> {
  if (!supabase || !userId) return false;
  try {
    const { error } = await supabase
      .from("plan_days")
      .upsert({
        id: activity.id,
        user_id: userId,
        date: activity.date,
        kind: activity.kind,
        page_from: activity.pageFrom,
        page_to: activity.pageTo,
        ayah_from: activity.ayahFrom,
        ayah_to: activity.ayahTo,
        surah_names: activity.surahNames || [],
        planned_pages: activity.plannedPages,
        completed_pages: activity.completedPages,
        assessment: activity.assessment,
        status: activity.status,
        source: activity.source,
        duration_minutes: activity.durationMinutes,
        reason: activity.reason,
      });

    return !error;
  } catch {
    return false;
  }
}

/**
 * Record recitation attempt in Supabase
 */
export async function recordRecitationAttempt(
  userId: string,
  page: number,
  expectedText: string,
  transcript: string,
  matchRate: number,
  differences: any[],
  audioUrl?: string | null
): Promise<boolean> {
  if (!supabase || !userId) return false;
  try {
    const { error } = await supabase
      .from("recitation_attempts")
      .insert({
        user_id: userId,
        page,
        expected_text: expectedText,
        transcript,
        match_rate: matchRate,
        differences,
        audio_url: audioUrl || null,
      });

    return !error;
  } catch {
    return false;
  }
}
