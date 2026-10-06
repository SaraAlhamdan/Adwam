import { useState, useEffect } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, LockKeyhole, Mail, Phone, UserRound, Loader2 } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import {
  signUpWithSupabase,
  signInWithSupabase,
  getSupabaseSession,
  translateAuthError,
} from "@/lib/supabase";
import { saveSession } from "@/features/persistence";

type Language = "ar" | "en";
type FieldErrors = { name?: string; contact?: string; password?: string; general?: string };
const text = (language: Language, ar: string, en: string) => language === "en" ? en : ar;

const COUNTRY_CODES = [
  { code: "+966", ar: "السعودية", en: "Saudi Arabia" },
  { code: "+971", ar: "الإمارات", en: "UAE" },
  { code: "+965", ar: "الكويت", en: "Kuwait" },
  { code: "+974", ar: "قطر", en: "Qatar" },
  { code: "+973", ar: "البحرين", en: "Bahrain" },
  { code: "+968", ar: "عُمان", en: "Oman" },
  { code: "+20", ar: "مصر", en: "Egypt" },
  { code: "+962", ar: "الأردن", en: "Jordan" },
  { code: "+44", ar: "المملكة المتحدة", en: "United Kingdom" },
  { code: "+1", ar: "أمريكا/كندا", en: "US/Canada" },
  { code: "+86", ar: "الصين", en: "China" },
];

function LoginShell({ children, teacher = false, language, setLanguage }: { children: React.ReactNode; teacher?: boolean; language: Language; setLanguage: (language: Language) => void }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-language">
          <button className={language === "ar" ? "selected" : ""} onClick={() => setLanguage("ar")}>العربية</button>
          <button className={language === "en" ? "selected" : ""} onClick={() => setLanguage("en")}>English</button>
        </div>
        <div className="auth-brand"><BrandLogo /></div>
        <div className="auth-intro">
          <h1>{teacher ? text(language, "مرحبًا بك في مساحة المعلم", "Welcome to teacher space") : text(language, "أهلًا بك في أدوم", "Welcome to Adwam")}</h1>
          <p>{teacher ? text(language, "تابع تقدم المتعلمين برفق عبر Supabase.", "Follow learner progress with care via Supabase.") : text(language, "خطة حفظ ومراجعة تتكيّف مع وتيرتك وتبقى معك خطوة بخطوة.", "A memorization and review plan that adapts to your pace, step by step.")}</p>
        </div>
        {children}
      </section>
      <p className="auth-quote">«أحب الأعمال إلى الله أدومها وإن قلّ»</p>
    </main>
  );
}

function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <span className="auth-field-error"><AlertTriangle size={12}/>{children}</span>;
}

export default function Login() {
  const [language, setLanguage] = useState<Language>(() => {
    try { return JSON.parse(localStorage.getItem("adom-ui") || "{}").language || "ar"; } catch { return "ar"; }
  });
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [countryCode, setCountryCode] = useState("+966");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    try {
      const current = JSON.parse(localStorage.getItem("adom-ui") || "{}");
      localStorage.setItem("adom-ui", JSON.stringify({ ...current, language: next }));
    } catch { /* ignore preference error */ }
  };

  const validate = () => {
    const next: FieldErrors = {};
    const cleanName = name.trim();
    const cleanValue = value.trim();
    const cleanPassword = password.trim();

    if (mode === "signup") {
      if (!cleanName) next.name = text(language, "الاسم مطلوب.", "Name is required.");
      else if (cleanName.length < 2) next.name = text(language, "اكتب اسمًا صحيحًا من حرفين على الأقل.", "Enter a valid name with at least 2 characters.");
    }

    if (!cleanValue) {
      next.contact = method === "email" ? text(language, "البريد الإلكتروني مطلوب.", "Email is required.") : text(language, "رقم الجوال مطلوب.", "Phone number is required.");
    } else if (method === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanValue)) {
      next.contact = text(language, "صيغة البريد الإلكتروني غير صحيحة.", "Enter a valid email address.");
    } else if (method === "phone") {
      const phoneDigits = cleanValue.replace(/\D/g, "").replace(/^0+/, "");
      if (phoneDigits.length < 6 || phoneDigits.length > 14) {
        next.contact = text(language, "أدخل رقم جوال صحيحًا بعد اختيار مفتاح الدولة.", "Enter a valid phone number after selecting the country code.");
      }
    }

    if (!cleanPassword) {
      next.password = text(language, "كلمة المرور مطلوبة.", "Password is required.");
    } else if (cleanPassword.length < 8) {
      next.password = text(language, "كلمة المرور يجب أن تكون 8 أحرف على الأقل.", "Password must be at least 8 characters.");
    }

    setErrors(next);
    return { valid: Object.keys(next).length === 0, cleanName, cleanValue, cleanPassword };
  };

  useEffect(() => {
    let active = true;
    getSupabaseSession().then(({ session }) => {
      if (active && session) {
        window.location.href = "/";
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    setNotice(null);
    const result = validate();
    if (!result.valid) return;

    const cleanPassword = result.cleanPassword;
    const cleanName = result.cleanName;

    let authContact: string;
    let signUpParams: Parameters<typeof signUpWithSupabase>[0];
    let signInParams: Parameters<typeof signInWithSupabase>[0];

    if (method === "email") {
      const cleanEmail = result.cleanValue.toLowerCase().trim();
      authContact = cleanEmail;
      signUpParams = {
        email: cleanEmail,
        password: cleanPassword,
        name: cleanName,
        contact: cleanEmail,
        role: "student",
      };
      signInParams = {
        email: cleanEmail,
        password: cleanPassword,
      };
    } else {
      const cleanDigits = result.cleanValue.replace(/\D/g, "").replace(/^0+/, "");
      const fullPhone = `${countryCode}${cleanDigits}`;
      authContact = fullPhone;
      signUpParams = {
        phone: fullPhone,
        password: cleanPassword,
        name: cleanName,
        contact: fullPhone,
        role: "student",
      };
      signInParams = {
        phone: fullPhone,
        password: cleanPassword,
      };
    }

    setLoading(true);
    setErrors({});

    try {
      if (mode === "signup") {
        const data = await signUpWithSupabase(signUpParams);

        if (data?.session && data.user) {
          // Direct session
          saveSession({
            userId: data.user.id,
            name: cleanName,
            role: "student",
            contact: data.user.email || data.user.phone || authContact,
          });
          window.location.href = "/";
          return;
        }

        // Confirmation required
        setNotice(text(
          language,
          method === "phone"
            ? "تم إنشاء الحساب بنجاح في Supabase! إذا كان خيار تأكيد رقم الجوال مفعّلًا لديك، يرجى تفقّد رسائل التحقق أو إيقاف Phone Confirmation في لوحة Supabase."
            : "تم إنشاء الحساب بنجاح في Supabase! إذا كان خيار Confirm email مفعّلًا لديك، يرجى تفقّد بريدك لتأكيده أو إيقاف Email Confirmation في لوحة Supabase لتسجيل الدخول الفوري.",
          method === "phone"
            ? "Account created in Supabase! If phone confirmation is enabled, please check your SMS verification code or disable Phone Confirmation in Supabase dashboard."
            : "Account created in Supabase! If Email Confirmation is enabled, please verify your email or turn off Confirm email in Supabase dashboard to sign in immediately."
        ));
        setMode("login");
      } else {
        const resultData = await signInWithSupabase(signInParams);

        if (resultData?.session && resultData.user) {
          saveSession({
            userId: resultData.user.id,
            name: resultData.profile?.name || cleanName || (resultData.user.email ? resultData.user.email.split("@")[0] : resultData.user.phone) || "مستخدم",
            role: (resultData.profile?.role || "student") as "student" | "teacher",
            contact: resultData.user.email || resultData.user.phone || resultData.profile?.contact || authContact,
            onboardingCompleted: resultData.profile?.onboardingCompleted ?? Boolean(resultData.user.user_metadata?.onboarding_completed),
          });
          window.location.href = "/";
        }
      }
    } catch (err: any) {
      console.error("[Supabase Auth Error]:", err);
      const friendlyMessage = translateAuthError(err, language, method);
      setErrors({ general: friendlyMessage });
    } finally {
      setLoading(false);
    }
  };

  const setAuthMode = (next: "login" | "signup") => {
    setMode(next);
    setErrors({});
    setNotice(null);
  };

  const setAuthMethod = (next: "email" | "phone") => {
    setMethod(next);
    setValue("");
    setErrors(current => ({ ...current, contact: undefined, general: undefined }));
    setNotice(null);
  };

  return (
    <LoginShell language={language} setLanguage={changeLanguage}>
      <div className="auth-tabs">
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => setAuthMode("login")}
        >
          {text(language, "تسجيل الدخول", "Sign in")}
        </button>
        <button
          className={mode === "signup" ? "active" : ""}
          onClick={() => setAuthMode("signup")}
        >
          {text(language, "إنشاء حساب", "Create account")}
        </button>
      </div>

      {notice && (
        <div style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          color: "#065f46",
          padding: "10px 14px",
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 16,
          lineHeight: 1.5
        }}>
          <CheckCircle2 size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      {mode === "signup" && (
        <label className="auth-label">
          {text(language, "الاسم", "Name")}
          <div className={`auth-input-wrap ${errors.name ? "invalid" : ""}`}>
            <UserRound size={15} />
            <input
              aria-invalid={Boolean(errors.name)}
              value={name}
              onChange={e => {
                setName(e.target.value);
                if (errors.name) setErrors(x => ({ ...x, name: undefined }));
              }}
              type="text"
              placeholder={text(language, "الاسم الكامل", "Full name")}
            />
          </div>
          <FieldError>{errors.name}</FieldError>
        </label>
      )}

      <div className="auth-methods">
        <button
          className={method === "email" ? "selected" : ""}
          onClick={() => setAuthMethod("email")}
        >
          <Mail size={15} /> {text(language, "البريد", "Email")}
        </button>
        <button
          className={method === "phone" ? "selected" : ""}
          onClick={() => setAuthMethod("phone")}
        >
          <Phone size={15} /> {text(language, "الجوال", "Phone")}
        </button>
      </div>

      <label className="auth-label">
        {method === "email" ? text(language, "البريد الإلكتروني", "Email") : text(language, "رقم الجوال", "Phone number")}
        <div className={`auth-contact-row ${method === "phone" ? "with-code" : ""}`}>
          {method === "phone" && (
            <select
              className="country-code-select"
              aria-label={text(language, "مفتاح الدولة", "Country code")}
              value={countryCode}
              onChange={e => setCountryCode(e.target.value)}
            >
              {COUNTRY_CODES.map(c => (
                <option value={c.code} key={c.code}>{c.code} · {text(language, c.ar, c.en)}</option>
              ))}
            </select>
          )}
          <div className={`auth-input-wrap ${errors.contact ? "invalid" : ""}`}>
            {method === "email" ? <Mail size={15} /> : <Phone size={15} />}
            <input
              aria-invalid={Boolean(errors.contact)}
              value={value}
              onChange={e => {
                setValue(e.target.value);
                if (errors.contact) setErrors(x => ({ ...x, contact: undefined, general: undefined }));
              }}
              type={method === "email" ? "email" : "tel"}
              inputMode={method === "phone" ? "tel" : "email"}
              placeholder={method === "email" ? "name@example.com" : text(language, "5xxxxxxxx", "Phone number")}
            />
          </div>
        </div>
        <FieldError>{errors.contact}</FieldError>
      </label>

      <label className="auth-label">
        {text(language, "كلمة المرور", "Password")}
        <div className={`auth-input-wrap ${errors.password ? "invalid" : ""}`}>
          <LockKeyhole size={15} />
          <input
            aria-invalid={Boolean(errors.password)}
            value={password}
            onChange={e => {
              setPassword(e.target.value);
              if (errors.password) setErrors(x => ({ ...x, password: undefined, general: undefined }));
            }}
            type="password"
            placeholder="••••••••"
          />
        </div>
        <FieldError>{errors.password}</FieldError>
      </label>

      {errors.general && (
        <div className="auth-general-error">
          <AlertTriangle size={14} />
          <span>{errors.general}</span>
        </div>
      )}

      <button className="auth-primary" disabled={loading} onClick={submit}>
        {loading ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Loader2 size={16} className="animate-spin" />
            {mode === "login" ? text(language, "جاري الدخول...", "Signing in...") : text(language, "جاري إنشاء الحساب...", "Creating account...")}
          </span>
        ) : (
          <>
            {mode === "login" ? text(language, "تسجيل الدخول", "Sign in") : text(language, "إنشاء الحساب", "Create account")}
            <ArrowLeft size={15} />
          </>
        )}
      </button>

      <p className="auth-privacy">
        {text(
          language,
          "يتم تسجيل الدخول والحسابات عبر خدمة Supabase Auth السحابية المباشرة مع التحقق الآمن من كلمة المرور.",
          "Authentication is managed securely via live Supabase Auth with encrypted credentials."
        )}
      </p>
    </LoginShell>
  );
}

export function TeacherLogin() {
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState<Language>("ar");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const enterTeacher = async () => {
    const next: FieldErrors = {};
    const email = value.trim().toLowerCase();
    const pass = password.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      next.contact = text(language, "صيغة البريد الإلكتروني غير صحيحة.", "Enter a valid email address.");
    }
    if (pass.length < 8) {
      next.password = text(language, "كلمة المرور يجب أن تكون 8 أحرف على الأقل.", "Password must be at least 8 characters.");
    }

    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const resultData = await signInWithSupabase({ email, password: pass });
      if (resultData?.session && resultData.user) {
        saveSession({
          userId: resultData.user.id,
          name: resultData.profile?.name || email.split("@")[0],
          role: "teacher",
          contact: email,
        });
        window.location.href = "/";
      }
    } catch (err: any) {
      setErrors({ general: translateAuthError(err, language, "email") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell teacher language={language} setLanguage={setLanguage}>
      <label className="auth-label">
        {text(language, "البريد الإلكتروني للمعلم", "Teacher email")}
        <div className={`auth-input-wrap ${errors.contact ? "invalid" : ""}`}>
          <Mail size={15} />
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            type="email"
            placeholder="teacher@school.org"
          />
        </div>
        <FieldError>{errors.contact}</FieldError>
      </label>

      <label className="auth-label">
        {text(language, "كلمة المرور", "Password")}
        <div className={`auth-input-wrap ${errors.password ? "invalid" : ""}`}>
          <LockKeyhole size={15} />
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
          />
        </div>
        <FieldError>{errors.password}</FieldError>
      </label>

      {errors.general && (
        <div className="auth-general-error">
          <AlertTriangle size={14} />
          <span>{errors.general}</span>
        </div>
      )}

      <button className="auth-primary" disabled={loading} onClick={enterTeacher}>
        {loading ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Loader2 size={16} className="animate-spin" />
            {text(language, "جاري الدخول...", "Signing in...")}
          </span>
        ) : (
          <>
            {text(language, "تسجيل الدخول", "Sign in")}
            <ArrowLeft size={15} />
          </>
        )}
      </button>

      <div style={{ textAlign: "center", marginTop: 14 }}>
        <a href="/login" style={{ fontSize: 13, color: "#0f766e", textDecoration: "none" }}>
          {text(language, "العودة لحساب الطالب أو إنشاء حساب جديد", "Return to student login or create account")}
        </a>
      </div>
    </LoginShell>
  );
}
