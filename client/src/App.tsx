import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Login, { TeacherLogin } from "@/pages/Login";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/HomeV2";
import { supabase, getSupabaseSession } from "./lib/supabase";
import { saveSession, loadSession } from "./features/persistence";

function EntryRoute() {
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        if (!supabase) {
          const local = loadSession();
          if (mounted) {
            setHasSession(Boolean(local?.name));
            setLoading(false);
          }
          return;
        }

        // Restore session on page load via supabase.auth.getSession
        const { session, user, profile } = await getSupabaseSession();

        if (session && user) {
          saveSession({
            userId: user.id,
            name: profile?.name || user.user_metadata?.name || (user.email ? user.email.split("@")[0] : user.phone) || "مستخدم",
            role: (profile?.role || user.user_metadata?.role || "student") as "student" | "teacher",
            contact: user.email || user.phone || profile?.contact || user.user_metadata?.contact || "",
            onboardingCompleted: profile?.onboardingCompleted ?? Boolean(user.user_metadata?.onboarding_completed),
          });
          if (mounted) {
            setHasSession(true);
            setLoading(false);
          }
        } else {
          localStorage.removeItem("adom-session");
          if (mounted) {
            setHasSession(false);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("[Auth] Session restoration error:", err);
        if (mounted) {
          setHasSession(false);
          setLoading(false);
        }
      }
    }

    restoreSession();

    // Listen to Supabase auth events (login, logout, token refresh)
    const { data: authListener } = supabase?.auth.onAuthStateChange(async (event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user && supabase) {
        const user = session.user;
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        saveSession({
          userId: user.id,
          name: profile?.name || user.user_metadata?.name || (user.email ? user.email.split("@")[0] : user.phone) || "مستخدم",
          role: (profile?.role || user.user_metadata?.role || "student") as "student" | "teacher",
          contact: user.email || user.phone || profile?.contact || user.user_metadata?.contact || "",
          onboardingCompleted: Boolean(user.user_metadata?.onboarding_completed),
        });
        if (mounted) setHasSession(true);
      } else if (event === "SIGNED_OUT") {
        localStorage.removeItem("adom-session");
        if (mounted) setHasSession(false);
      }
    }) ?? { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fcfbf7",
        fontFamily: "system-ui, sans-serif"
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 38,
            height: 38,
            border: "3px solid #e7e5e4",
            borderTopColor: "#0f766e",
            borderRadius: "50%",
            animation: "auth-spinner 0.8s linear infinite",
            margin: "0 auto 12px"
          }} />
          <style>{`@keyframes auth-spinner { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "#78716c", fontSize: 14 }}>جاري التحقق من الجلسة...</p>
        </div>
      </div>
    );
  }

  return hasSession ? <Home /> : <Login />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/teacher/login" component={TeacherLogin} />
      <Route path="/" component={EntryRoute} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
