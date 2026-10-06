import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, BookOpen, CalendarDays, Check, ChevronLeft, CircleHelp, Grid2X2, Leaf, LogIn, Mic, Pause, Play, Square, Volume2, Share2, Settings as SettingsIcon, ShieldCheck, Sparkles, X, ClipboardCheck, MessageCircle, Send, AlertTriangle, BookMarked, RefreshCw, Flame } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import {
  normalizeQuranPage,
  pageSourceUrl,
  QURAN_SOURCE,
  fetchQuranRange,
  getSurahList,
  getSurahByNumber,
  extractAyahWords,
  isMuqattaatAyah,
  splitUthmaniMuqattaat,
  getSpokenPrompt,
  getPageMetadata,
  type QuranAyah,
  type QuranPage,
  type QuranRangeResult,
  type RangeSelection,
  type RangeSelectionType,
  type PageMetadata,
} from "@shared/quran";
import { getRoleNavigation, type ViewId } from "@shared/roles";
import { analyzeRecitation, type RecitationResult } from "@/features/recitationService";
import { queryAssistant, queryAyahAssistant, type AssistantMode, type AssistantResult } from "@/features/ragService";
import { calculateRecoveryPlan, calculateReviewSchedule } from "@/features/reviewService";
import { loadPlan, loadSession, savePlan, saveSession, loadUi, saveUi, todayKey, type Assessment, type PlanState, type ReviewItem, type Session, type UiPreferences, type ActivityRecord } from "@/features/persistence";
import { buildPlanSnapshot, buildProspectiveSnapshot, requiredQuotaForTarget, roundQuotaForPlan } from "@/features/planEngine";
import { AUDIO_SOURCE, RECITERS, ayahAudioUrl, reciterById } from "@/features/audioService";
import { signOutWithSupabase, fetchPlanFromSupabase, syncPlanToSupabase, completeOnboardingInSupabase } from "@/lib/supabase";

type View = ViewId;
type Modal = "onboarding" | "reader" | "settings" | "recovery" | "assistant" | "completion" | "privacy" | null;
type QuranState = { data: QuranPage | null; loading: boolean; error: string | null };

const days = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
const dayNames = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const icons: Record<View, ReactNode> = { home: <Grid2X2 size={17} />, calendar: <CalendarDays size={17} />, mastery: <Leaf size={17} />, review: <ClipboardCheck size={17} />, assistant: <MessageCircle size={17} />, teacher: <BookOpen size={17} /> };
const ar = (v: number | string) => String(v).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);
const uiText = (arText: string, enText: string) => document.documentElement.lang === "en" ? enText : arText;
const dateLabel = (v: string | Date) => new Intl.DateTimeFormat(document.documentElement.lang === "en" ? "en-US" : "ar-SA-u-ca-gregory", { day: "numeric", month: "long", year: "numeric" }).format(new Date(v));
const formatNumber = (v: number) => new Intl.NumberFormat(document.documentElement.lang === "en" ? "en-US" : "ar-SA", { maximumFractionDigits: 2 }).format(v);

function usePage(page: number): QuranState {
  const [state, setState] = useState<QuranState>({ data: null, loading: true, error: null });
  useEffect(() => { const controller = new AbortController(); setState({ data: null, loading: true, error: null }); fetch(pageSourceUrl(page), { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(payload => setState({ data: normalizeQuranPage(payload, page), loading: false, error: null })).catch(error => { if (error?.name !== "AbortError") setState({ data: null, loading: false, error: uiText("تعذر التحقق من نص هذه الصفحة", "Could not verify this Quran page") }); }); return () => controller.abort(); }, [page]);
  return state;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) { return <button className="icon-button" aria-label={label} onClick={onClick}>{children}</button>; }

function QuranText({ state, hidden, onAyah, onPlayAyah, activeAudioKey }: { state: QuranState; hidden?: boolean; onAyah: (ayah: QuranAyah) => void; onPlayAyah?: (ayah: QuranAyah) => void; activeAudioKey?: string | null }) {
  if (state.loading) return <div className="quran-text quran-status">{uiText("جارٍ التحقق من نص الصفحة من المصدر الموثوق…", "Verifying the page from the approved source…")}</div>;
  if (!state.data || state.error) return <div className="quran-text quran-status quran-error">{state.error || uiText("لا يوجد نص متحقق", "No verified text available")}. {uiText("لن نعرض آيات غير موثقة.", "Unverified verses will not be displayed.")}</div>;
  return <div className="quran-text"><div className="quran-surah-heading">{state.data.surahNames.join(" · ")}</div><div className={`quran-ayahs ${hidden ? "quran-hidden" : ""}`}>{state.data.ayahs.map(ayah => { const audioKey = `${ayah.surah.number}:${ayah.numberInSurah}`; return <span className={`ayah-unit ${activeAudioKey === audioKey ? "audio-active" : ""}`} key={ayah.number}><button className="quran-ayah" onClick={() => onAyah(ayah)} aria-label={`${uiText("مساعد الآية", "Ayah assistant")} ${ayah.numberInSurah}`}>{hidden ? `﴿${ar(ayah.numberInSurah)}﴾ …` : <>{ayah.text} <span className="ayah-number">﴿{ar(ayah.numberInSurah)}﴾</span></>}</button>{onPlayAyah && !hidden && <button className="ayah-audio-button" onClick={() => onPlayAyah(ayah)} aria-label={`${uiText("استمع للآية", "Listen to ayah")} ${ayah.numberInSurah}`}><Volume2 size={12}/></button>}</span>; })}</div><div className="quran-source">{uiText("النص", "Text")}: {QURAN_SOURCE.name} · {QURAN_SOURCE.mushaf} · <a href="https://tanzil.net/docs/medina_mushaf" target="_blank" rel="noreferrer">{uiText("معلومات المصدر", "Source information")}</a></div></div>;
}

function Header({ view, session, toast, settings }: { view: View; session: Session; toast: (text: string) => void; settings: () => void }) {
  const title = view === "home" ? uiText("لوحة اليوم", "Today") : view === "calendar" ? uiText("تقويم أدوم", "Adwam calendar") : view === "review" ? uiText("المراجعة والإتقان", "Review & mastery") : view === "mastery" ? uiText("المراجعة والإتقان", "Review & mastery") : view === "assistant" ? uiText("مساعد أدوم", "Adwam Assistant") : uiText("لوحة المتابعة", "Progress dashboard");
  return <header className="topbar"><div><div className="page-eyebrow">{uiText("خطوة هادئة اليوم مع كتاب الله.", "A calm step with the Quran today.")}</div><h1 className="page-title">{title}{view === "home" && session.name && <span>{uiText("، ", ", ")}{session.name.split(" ")[0]}</span>}</h1></div><div className="top-actions"><IconButton label={uiText("المساعدة", "Help")} onClick={() => toast(uiText("ابدأ من الورد الظاهر أمامك.", "Start with the quota shown here."))}><CircleHelp size={17} /></IconButton><IconButton label={uiText("التنبيهات", "Notifications")} onClick={() => toast(uiText("لا توجد تنبيهات جديدة.", "No new notifications."))}><Bell size={17} /></IconButton><button className="user-chip" onClick={settings} aria-label={uiText("فتح الإعدادات", "Open settings")}><span className="user-chip-text">{session.name}<small>{uiText("رحلة شخصية", "Personal journey")}</small></span><span className="avatar">{session.name.slice(0, 1)}</span></button></div></header>;
}

function Onboarding({ plan, save, close, isEditMode = false }: { plan: PlanState; save: (plan: PlanState) => void; close: () => void; isEditMode?: boolean }) {
  const [step, setStep] = useState(1);
  const [start, setStart] = useState(plan.startType);
  const [page, setPage] = useState(String(plan.startPage));
  const [amount, setAmount] = useState(plan.pagesPerDay === .5 ? "half" : plan.pagesPerDay === 1 ? "page" : plan.pagesPerDay === 2 ? "two" : "custom");
  const [custom, setCustom] = useState(String(plan.pagesPerDay));
  const [active, setActive] = useState(plan.activeDays.length ? plan.activeDays : [1, 2, 3, 4]);
  const [goalMode, setGoalMode] = useState<"pace" | "target">(plan.goalMode || "pace");
  const [targetDate, setTargetDate] = useState(plan.targetDate || "");

  const startPage = start === "beginning" ? 1 : Math.max(1, Math.min(604, Number(page) || 1));
  const preferredQuota = amount === "half" ? .5 : amount === "page" ? 1 : amount === "two" ? 2 : Math.max(.25, Number(custom) || 1);
  const remainingPages = Math.max(0, 604 - startPage + 1);
  const requiredForTarget = goalMode === "target" && targetDate ? requiredQuotaForTarget(remainingPages, active, targetDate) : undefined;
  const targetQuota = requiredForTarget && Number.isFinite(requiredForTarget) ? roundQuotaForPlan(requiredForTarget) : preferredQuota;
  const finalQuota = goalMode === "target" ? targetQuota : preferredQuota;
  const preview = buildProspectiveSnapshot({ startPage, pagesPerDay: finalQuota, activeDays: active, targetDate: goalMode === "target" ? targetDate : undefined });
  const targetValid = goalMode === "pace" || (Boolean(targetDate) && new Date(`${targetDate}T23:59:59`).getTime() > Date.now() && Number.isFinite(requiredForTarget));

  const finish = () => {
    if (!active.length || !targetValid) return;
    const goalDate = preview.estimatedCompletionDate;
    const startingPointChanged = plan.startPage !== startPage;

    if (isEditMode && startingPointChanged && (plan.completedPages > 0 || (plan.activities && plan.activities.length > 0))) {
      const confirmed = window.confirm(uiText(
        "تنبيه: تغيير موضع البداية سينقل وردك اليومي وجدولك إلى الصفحة الجديدة، مع الاحتفاظ بجميع تقييماتك وسجل إنجازاتك السابقة كما هي دون حذف. هل تود المتابعة؟",
        "Notice: Changing your starting point will move your daily quota and schedule to the new page, while preserving all your past assessments and achievement history intact. Do you want to continue?"
      ));
      if (!confirmed) return;
    }

    const nextPosition = startingPointChanged
      ? startPage
      : (plan.started ? plan.currentPosition : startPage);

    save({
      ...plan,
      started: true,
      startPage,
      currentPosition: nextPosition,
      pagesPerDay: finalQuota,
      durationDays: preview.remainingCalendarDays,
      activeDays: active,
      startType: start,
      goal: goalMode,
      goalMode,
      targetDate: goalMode === "target" ? targetDate : undefined,
      goalDate,
    });
    close();
  };

  const quotaLabel = `${formatNumber(finalQuota)} ${uiText("صفحة في يوم الحفظ", "pages per memorization day")}`;
  return <div className="overlay"><div className="modal onboarding-modal"><div className="modal-top"><div><h2 className="modal-title">{isEditMode ? uiText("إعداد الرحلة", "Journey settings") : uiText("لنرسم رحلتك برفق", "Let’s shape your journey")}</h2><p className="modal-subtitle">{isEditMode ? uiText("تعديل نقطة البداية والورد والأيام والهدف، مع حفظ التغييرات فوراً في حسابك.", "Edit starting point, quota, days, and goal, saved directly to your account.") : uiText("أنت تختار قدرتك الواقعية، وأدوم يحسب المدة تلقائيًا بدون خطة متناقضة.", "Choose a realistic pace and Adwam calculates the timeline without contradictory goals.")}</p></div><button className="close-button" onClick={close} aria-label={uiText("إغلاق", "Close")}><X size={15} /></button></div><div className="modal-stepper">{[1, 2, 3, 4].map(n => <i key={n} className={`step-dot ${n <= step ? "active" : ""}`} />)}</div>

    {step === 1 && <><h2 className="modal-section-title">{uiText("من أين نبدأ؟", "Where should we start?")}</h2><div className="choice-grid">{([["beginning", uiText("أبدأ من بداية المصحف", "Start from the beginning")], ["specific", uiText("أنا في موضع محدد", "I am at a specific position")], ["review", uiText("مراجعة فقط", "Review only")]] as const).map(([id, label]) => <button className={`choice ${start === id ? "selected" : ""}`} key={id} onClick={() => setStart(id)}><strong>{label}</strong><span>{uiText("يُبنى الحساب من موضعك الحقيقي.", "The plan starts from your real position.")}</span></button>)}</div>{start !== "beginning" && <div className="form-field"><label>{uiText("رقم الصفحة الحالية", "Current page")}</label><input className="text-input" inputMode="numeric" min={1} max={604} value={page} onChange={e => setPage(e.target.value)} /></div>}</>}

    {step === 2 && <><h2 className="modal-section-title">{uiText("كم يناسبك أن تحفظ في يوم الحفظ؟", "How much suits you on a memorization day?")}</h2><div className="choice-grid">{([["half", uiText("نصف صفحة", "Half a page")], ["page", uiText("صفحة", "One page")], ["two", uiText("صفحتان", "Two pages")], ["custom", uiText("مخصص", "Custom")]] as const).map(([id, label]) => <button className={`choice ${amount === id ? "selected" : ""}`} key={id} onClick={() => setAmount(id)}><strong>{label}</strong><span>{uiText("اختر وتيرة تستطيع الاستمرار عليها.", "Choose a pace you can sustain.")}</span></button>)}</div>{amount === "custom" && <div className="form-field"><label>{uiText("عدد الصفحات في يوم الحفظ", "Pages per memorization day")}</label><input className="text-input" inputMode="decimal" value={custom} onChange={e => setCustom(e.target.value)} /></div>}</>}

    {step === 3 && <><h2 className="modal-section-title">{uiText("ما الأيام المناسبة لك؟", "Which days suit you?")}</h2><p className="onboarding-hint">{uiText("هذه الأيام هي التي يدخلها أدوم في حساب موعد الإكمال وإعادة الجدولة.", "Only these days are used for completion estimates and rescheduling.")}</p><div className="day-grid">{dayNames.map((day, i) => <button key={day} className={`day-choice ${active.includes(i) ? "selected" : ""}`} onClick={() => setActive(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i].sort())}>{uiText(day, ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][i])}</button>)}</div>{!active.length && <div className="inline-warning">{uiText("اختر يوم حفظ واحدًا على الأقل.", "Choose at least one memorization day.")}</div>}</>}

    {step === 4 && <><h2 className="modal-section-title">{uiText("كيف تريد بناء الهدف؟", "How should Adwam build your goal?")}</h2><div className="goal-mode-grid"><button className={`choice ${goalMode === "pace" ? "selected" : ""}`} onClick={() => setGoalMode("pace")}><strong>{uiText("حسب قدرتي", "By my pace")}</strong><span>{uiText("أحدد الورد والأيام، وأدوم يحسب موعد الإكمال.", "I choose quota and days; Adwam calculates completion.")}</span></button><button className={`choice ${goalMode === "target" ? "selected" : ""}`} onClick={() => setGoalMode("target")}><strong>{uiText("لدي موعد مستهدف", "I have a target date")}</strong><span>{uiText("أحدد الموعد والأيام، وأدوم يحسب الورد المطلوب.", "I choose date and days; Adwam calculates the required quota.")}</span></button></div>
      {goalMode === "target" && <div className="form-field"><label>{uiText("الموعد المستهدف", "Target date")}</label><input className={`text-input ${!targetValid && targetDate ? "input-error" : ""}`} type="date" min={todayKey(new Date(Date.now() + 86400000))} value={targetDate} onChange={e => setTargetDate(e.target.value)} />{targetDate && !targetValid && <small className="field-help error">{uiText("اختر موعدًا مستقبليًا يسمح بوجود جلسات حفظ.", "Choose a future date with available memorization sessions.")}</small>}</div>}
      <div className="plan-preview-card"><div className="preview-header"><span>{uiText("معاينة خطتك", "Plan preview")}</span><strong>{quotaLabel}</strong></div><div className="preview-metrics"><div><small>{uiText("أيام الحفظ أسبوعيًا", "Memorization days/week")}</small><b>{ar(active.length)}</b></div><div><small>{uiText("المتبقي", "Remaining")}</small><b>{ar(preview.remainingPages)} {uiText("صفحة", "pages")}</b></div><div><small>{uiText("المتبقي لهدفك", "Time remaining")}</small><b>{ar(preview.remainingCalendarDays)} {uiText("يومًا", "days")}</b></div><div><small>{uiText("الإكمال المتوقع", "Expected completion")}</small><b>{dateLabel(preview.estimatedCompletionDate)}</b></div></div>
        {goalMode === "target" && targetDate && Number.isFinite(requiredForTarget) && <div className="target-explainer"><Sparkles size={15}/><span><strong>{uiText("للوصول إلى موعدك:", "To reach your target:")} {formatNumber(finalQuota)} {uiText("صفحة تقريبًا في كل يوم حفظ.", "pages per memorization day.")}</strong><small>{preferredQuota + .001 < (requiredForTarget || 0) ? uiText(`وتيرتك الأصلية (${formatNumber(preferredQuota)}) لا تكفي للموعد، لذلك حسب أدوم الورد المطلوب بدل قبول خطة مستحيلة.`, `Your original pace (${formatNumber(preferredQuota)}) would miss the target, so Adwam calculated the required quota instead of accepting an impossible plan.`) : uiText("وتيرتك الحالية تكفي للموعد المستهدف.", "Your current pace is enough for the target date.")}</small></span></div>}
      </div>
    </>}

    <div className="modal-footer">{step > 1 ? <button className="secondary-button" onClick={() => setStep(step - 1)}>{uiText("السابق", "Back")}</button> : <span /> }<button className="primary-button" disabled={(step === 3 && !active.length) || (step === 4 && !targetValid)} onClick={() => step === 4 ? finish() : setStep(step + 1)}>{step === 4 ? (isEditMode ? uiText("حفظ التعديلات", "Save changes") : uiText("اعتماد الخطة", "Confirm plan")) : uiText("التالي", "Next")}<ChevronLeft size={13} /></button></div>
  </div></div>;
}

function CompletionModal({
  plan,
  close,
  openRecovery,
  onComplete,
}: {
  plan: PlanState;
  close: () => void;
  openRecovery?: () => void;
  onComplete: (assessment: Assessment, completionRatio: number, extraPages?: number) => void;
}) {
  const [completionRatioChoice, setCompletionRatioChoice] = useState<0.5 | 1 | null>(null);
  const [assessmentChoice, setAssessmentChoice] = useState<Assessment | null>(null);
  const [hasExtra, setHasExtra] = useState(false);
  const [extraPages, setExtraPages] = useState<number>(1);
  const [halfSaved, setHalfSaved] = useState(false);
  const [notCompletedConfirm, setNotCompletedConfirm] = useState(false);

  const handleSubmit = () => {
    if (!completionRatioChoice || !assessmentChoice) return;

    if (assessmentChoice === "not_memorized") {
      setNotCompletedConfirm(true);
      return;
    }

    if (completionRatioChoice === 0.5) {
      onComplete(assessmentChoice, 0.5, 0);
      setHalfSaved(true);
      return;
    }

    onComplete(
      assessmentChoice,
      1,
      hasExtra ? extraPages : 0
    );
    close();
  };

  const handleConfirmNotCompleted = () => {
    onComplete("not_memorized", 0, 0);
    close();
    openRecovery?.();
  };

  const page = Math.max(1, Math.min(604, Math.floor(plan.currentPosition)));

  // If half ward was saved, show post-save summary card with clear rescue CTA
  if (halfSaved) {
    return (
      <div className="overlay">
        <div className="modal completion-modal" style={{ maxWidth: 440 }}>
          <div className="modal-top">
            <div>
              <h2 className="modal-title">{uiText("تم حفظ نصف الورد", "Half quota saved")}</h2>
              <p className="modal-subtitle">
                {uiText("سجّلنا نصف صفحة في إنجازك اليوم بنجاح", "Successfully recorded 0.5 page for today")}
              </p>
            </div>
            <button className="close-button" onClick={close} aria-label={uiText("إغلاق", "Close")}>
              <X size={15} />
            </button>
          </div>

          <div className="half-ward-saved-card">
            <div className="half-ward-saved-header">
              <Sparkles size={18} />
              <span>{uiText("كل خطوة محسوبة في رحلتك", "Every step counts in your journey")}</span>
            </div>
            <p className="half-ward-saved-text">
              {uiText(
                "تم حفظ النصف الذي أنجزته، والمتبقي (نصف صفحة) لم يضع؛ يمكنك الآن تداركه أو إعادة جدولته بسلاسة عبر خطة الإنقاذ دون التأثير على التزامك.",
                "Your completed half was saved. The remaining half is preserved; you can rescue or reschedule it now without losing momentum."
              )}
            </p>
          </div>

          <div className="half-ward-actions">
            <button
              className="primary-button"
              style={{ width: "100%", height: 42, justifyContent: "center" }}
              onClick={() => {
                close();
                openRecovery?.();
              }}
            >
              <Sparkles size={15} />
              {uiText("أنقذ بقية وردي / إعادة جدولة الباقي", "Rescue remaining / Reschedule")}
            </button>
            <button
              className="secondary-button"
              style={{ width: "100%", height: 38, justifyContent: "center" }}
              onClick={close}
            >
              {uiText("متابعة إلى الرئيسية", "Continue to dashboard")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If "لم يكتمل" selected, confirm routing to rescue flow
  if (notCompletedConfirm) {
    return (
      <div className="overlay">
        <div className="modal completion-modal" style={{ maxWidth: 440 }}>
          <div className="modal-top">
            <div>
              <h2 className="modal-title">{uiText("تسجيل عدم الإكمال", "Record uncompleted")}</h2>
              <p className="modal-subtitle">
                {uiText("تسجيل اليوم دون ادعاء إنجاز، مع إتاحة الإنقاذ", "Record without claiming completion, with rescue option")}
              </p>
            </div>
            <button className="close-button" onClick={close} aria-label={uiText("إغلاق", "Close")}>
              <X size={15} />
            </button>
          </div>

          <div className="half-ward-saved-card">
            <div className="half-ward-saved-header">
              <AlertTriangle size={18} />
              <span>{uiText("هل ترغب في فتح خطة الإنقاذ؟", "Open recovery plan?")}</span>
            </div>
            <p className="half-ward-saved-text">
              {uiText(
                "سنسجل اليوم كغير مكتمل مع الحفاظ على خطتك، ونفتح لك خطة الإنقاذ لتوزيع الورد أو استخدام يوم تدارك مرن.",
                "We will record today as not completed and offer recovery options to redistribute or use grace."
              )}
            </p>
          </div>

          <div className="half-ward-actions">
            <button
              className="primary-button"
              style={{ width: "100%", height: 42, justifyContent: "center" }}
              onClick={handleConfirmNotCompleted}
            >
              <Sparkles size={15} />
              {uiText("تأكيد وفتح خطة الإنقاذ (أنقذ وردي)", "Confirm & open rescue plan")}
            </button>
            <button
              className="secondary-button"
              style={{ width: "100%", height: 38, justifyContent: "center" }}
              onClick={() => {
                onComplete("not_memorized", 0, 0);
                close();
              }}
            >
              {uiText("تسجيل وإغلاق فقط", "Record and close only")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="modal completion-modal">
        <div className="modal-top">
          <div>
            <h2 className="modal-title">{uiText("تسجيل إنجاز الورد", "Log quota completion")}</h2>
            <p className="modal-subtitle">
              {uiText("الصفحة", "Page")} {ar(page)} · {formatNumber(plan.pagesPerDay)} {uiText("صفحة مخطط لها", "planned pages")}
            </p>
          </div>
          <button className="close-button" onClick={close} aria-label={uiText("إغلاق", "Close")}>
            <X size={15} />
          </button>
        </div>

        {/* Question 1: Mutually exclusive choice */}
        <div className="completion-field">
          <label className="completion-field-label">
            {uiText("١. كم أنجزت من ورد اليوم؟", "1. How much of today’s quota did you complete?")}
          </label>
          <div className="completion-pills">
            <button
              type="button"
              className={`completion-pill ${completionRatioChoice === 0.5 ? "selected" : ""}`}
              onClick={() => { setCompletionRatioChoice(0.5); setHasExtra(false); }}
            >
              {uiText("نصف الورد", "Half of quota")}
            </button>
            <button
              type="button"
              className={`completion-pill ${completionRatioChoice === 1 ? "selected" : ""}`}
              onClick={() => setCompletionRatioChoice(1)}
            >
              {uiText("كامل الورد", "Full quota")}
            </button>
          </div>
        </div>

        {/* Question 2: Independent quality evaluation */}
        <div className="completion-field">
          <label className="completion-field-label">
            {uiText("٢. كيف كانت جودة حفظك؟", "2. How was your memorization quality?")}
          </label>
          <div className="mastery-options" style={{ marginTop: 8 }}>
            {[
              ["strong", "متقن", "استدعاء ثابت دون تعثر", "Strong", "Stable recall"],
              ["average", "جيد", "تعثر بسيط ثم تذكرت", "Good", "Minor hesitation"],
              ["review", "يحتاج تثبيت", "أحتاج أن يعود قريبًا", "Needs reinforcement", "Bring it back sooner"],
              ["not_memorized", "لم يكتمل", "أسجله بدون ادعاء إنجاز", "Not completed", "Save without claiming completion"],
            ].map(([id, arTitle, arDesc, enTitle, enDesc]) => (
              <button
                key={id}
                type="button"
                className={`mastery-option ${id} ${assessmentChoice === id ? "selected" : ""}`}
                onClick={() => setAssessmentChoice(id as Assessment)}
              >
                <span className="mastery-emoji">
                  {id === "strong" ? "✓" : id === "average" ? "•" : id === "review" ? "!" : "×"}
                </span>
                <span>
                  <strong>{uiText(arTitle, enTitle)}</strong>
                  <span>{uiText(arDesc, enDesc)}</span>
                </span>
                {assessmentChoice === id && <Check size={15} style={{ marginRight: "auto" }} />}
              </button>
            ))}
          </div>
        </div>

        {/* Question 3: Optional extra memorization */}
        {completionRatioChoice === 1 && assessmentChoice && assessmentChoice !== "not_memorized" && (
          <div className="extra-ward-box">
            <strong>{uiText("هل حفظت شيئًا إضافيًا من وردك القادم؟", "Did you memorize extra from your upcoming quota?")}</strong>
            <small>
              {uiText(
                "عند اختيار «نعم»، يُسجّل ورد اليوم كمكتمل، ويُحفظ التقدم الزائد مباشرة كبداية في وردك القادم دون أن يضيع.",
                "If yes, today’s quota is marked complete, and extra progress is logged toward your next quota."
              )}
            </small>
            <div className="extra-options">
              <button
                type="button"
                className={`extra-btn ${!hasExtra ? "selected" : ""}`}
                onClick={() => setHasExtra(false)}
              >
                {uiText("لا، ورد اليوم فقط", "No, today only")}
              </button>
              <button
                type="button"
                className={`extra-btn ${hasExtra ? "selected" : ""}`}
                onClick={() => setHasExtra(true)}
              >
                {uiText("نعم، حفظت صفحة إضافية", "Yes, +1 extra page")}
              </button>
            </div>
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 18, paddingTop: 14 }}>
          <button className="secondary-button" onClick={close}>
            {uiText("إلغاء", "Cancel")}
          </button>
          <button
            className="primary-button"
            disabled={!completionRatioChoice || !assessmentChoice}
            onClick={handleSubmit}
          >
            {uiText("اعتماد الإنجاز", "Confirm completion")}
            <ChevronLeft size={13} style={{ verticalAlign: "-2px" }} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CelebrationModal({
  title,
  motivationalLine,
  streak,
  completedPage,
  nextPage,
  onViewTomorrow,
  onClose,
}: {
  title: string;
  motivationalLine: string;
  streak: number;
  completedPage: number;
  nextPage: number;
  onViewTomorrow: () => void;
  onClose: () => void;
}) {
  return (
    <div className="celebration-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="celebration-card" onClick={e => e.stopPropagation()}>
        <button className="celebration-close-btn" onClick={onClose} aria-label={uiText("إغلاق", "Close")}>
          <X size={15} />
        </button>
        <div className="celebration-icon-circle">
          <Check size={28} strokeWidth={2.6} />
        </div>
        <h2 className="celebration-title">{title}</h2>
        <p className="celebration-motivational">{motivationalLine}</p>
        <div className="celebration-metrics-row">
          <div className="celebration-chip streak">
            <Flame size={14} />
            <span>{uiText("سلسلة الحفظ:", "Streak:")} <strong>{ar(streak)} {streak === 1 ? uiText("يوم", "day") : uiText("أيام متتالية", "days")}</strong></span>
          </div>
          <div className="celebration-chip page">
            <BookOpen size={14} />
            <span>{uiText("أنجزت صفحة:", "Page done:")} <strong>{ar(completedPage)}</strong></span>
          </div>
        </div>
        <div className="celebration-actions">
          <button className="primary-button celebration-cta" onClick={onViewTomorrow}>
            {uiText("عرض ورد الغد", "View tomorrow’s ward")}
            <ChevronLeft size={16} />
          </button>
          <button className="secondary-button celebration-sub-cta" onClick={onClose}>
            {uiText("العودة للرئيسية", "Back to dashboard")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Reader({
  plan,
  save,
  close,
  assistant,
  toast,
  onComplete,
  onRequestCompletion,
  reviewItem,
  ui,
  setUi,
  initialMode = "read",
  openCompletion = false,
}: {
  plan: PlanState;
  save: (plan: PlanState) => void;
  close: () => void;
  assistant: (ayah: QuranAyah) => void;
  toast: (text: string) => void;
  onComplete: (
    assessment: Assessment,
    page: number,
    reviewItem?: ReviewItem,
    ayahCount?: number,
    completedSurah?: string,
    completionRatio?: number,
    durationMinutes?: number,
    surahNames?: string[],
    ayahFrom?: number,
    ayahTo?: number
  ) => void;
  onRequestCompletion?: () => void;
  reviewItem?: ReviewItem;
  ui: UiPreferences;
  setUi: (ui: UiPreferences) => void;
  initialMode?: "read" | "recite";
  openCompletion?: boolean;
}) {
  const page = reviewItem?.page || Math.max(1, Math.floor(plan.currentPosition));
  const q = usePage(page);
  const openedAt = useRef(Date.now());
  const [mode, setMode] = useState<"read" | "recite">(initialMode);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assessmentOpen, setAssessmentOpen] = useState(openCompletion);
  const [completionRatioChoice, setCompletionRatioChoice] = useState<0.5 | 1 | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [recitationResult, setRecitationResult] = useState<RecitationResult | null>(null);
  const [recitationError, setRecitationError] = useState<string | null>(null);
  const [recitationWarning, setRecitationWarning] = useState<string | null>(null);
  const recordingStartTime = useRef<number>(0);
  const [selectedAyahIndex, setSelectedAyahIndex] = useState<number>(0);
  const [seconds, setSeconds] = useState(0);
  const media = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioQueue = useRef<QuranAyah[]>([]);
  const audioQueueIndex = useRef(0);
  const [activeAudioKey, setActiveAudioKey] = useState<string | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // Simplified Range Selection for Continuous "اختبرني": ayah | surah_range | page | wird
  const surahs = getSurahList();
  const [rangeType, setRangeType] = useState<RangeSelectionType>("ayah");
  const [selectedSurahNum, setSelectedSurahNum] = useState<number>(2);
  const [fromAyahNum, setFromAyahNum] = useState<number>(2);
  const [toAyahNum, setToAyahNum] = useState<number>(2);
  const [selectedPageNum, setSelectedPageNum] = useState<number>(page);

  const [rangeResult, setRangeResult] = useState<QuranRangeResult | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [textHidden, setTextHidden] = useState<boolean>(true);

  const loadRange = async (override?: Partial<RangeSelection>) => {
    setRangeLoading(true);
    setRangeError(null);
    setRecitationError(null);
    setRecitationWarning(null);
    setResultMessage(null);
    setRecitationResult(null);
    try {
      const type = override?.type ?? rangeType;
      const surahNumber = override?.surahNumber ?? selectedSurahNum;
      const fromAyah = override?.fromAyah ?? fromAyahNum;
      const toAyah = override?.toAyah ?? toAyahNum;
      const pageNumber = override?.pageNumber ?? (type === "wird" ? page : selectedPageNum);

      const res = await fetchQuranRange({
        type,
        surahNumber,
        fromAyah,
        toAyah,
        pageNumber,
      });
      setRangeResult(res);
    } catch (err: any) {
      setRangeError(err?.message || "تعذر جلب الآيات المطلوبة للتسميع.");
    } finally {
      setRangeLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "recite" && !rangeResult) {
      const meta = getPageMetadata(page);
      const initialSurah = q.data?.firstVerse.surah.number || meta.surahNumber || 1;
      const initialAyah = q.data?.firstVerse.numberInSurah || meta.firstAyah || 1;
      const lastAyah = q.data?.lastVerse.numberInSurah || meta.lastAyah || 7;
      setSelectedSurahNum(initialSurah);
      setFromAyahNum(initialAyah);
      setToAyahNum(lastAyah);
      setSelectedPageNum(page);
      setRangeType("page");
      loadRange({
        type: "page",
        pageNumber: page,
      });
    }
  }, [mode, q.data, page]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds(v => v + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => () => { audio.current?.pause(); audio.current = null; }, []);

  const complete = (assessment: Assessment, completionRatio = 1) => {
    const completedSurah = q.data?.ayahs.find(a => a.numberInSurah === a.surah.numberOfAyahs)?.surah.name;
    const elapsedMinutes = Math.max(1, Math.round((Date.now() - openedAt.current) / 60000));
    onComplete(
      assessment,
      page,
      reviewItem,
      Math.round((q.data?.ayahs.length || 0) * completionRatio),
      completedSurah,
      completionRatio,
      elapsedMinutes,
      q.data?.surahNames || [],
      q.data?.firstVerse.numberInSurah,
      q.data?.lastVerse.numberInSurah
    );
  };

  // ONE continuous recording from beginning to end for full selected range
  const startRecording = async () => {
    setRecitationError(null);
    setRecitationWarning(null);
    setResultMessage(null);
    setRecitationResult(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setRecitationError(uiText("متصفحك لا يدعم تسجيل الصوت عبر الميكروفون.", "Your browser does not support audio recording."));
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mimeType = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm")) mimeType = "audio/webm";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";
        else if (MediaRecorder.isTypeSupported("audio/aac")) mimeType = "audio/aac";
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const durationMs = Date.now() - (recordingStartTime.current || Date.now());
        const durationSec = durationMs / 1000;
        if (durationSec < 2) {
          setRecitationWarning(uiText("تنبيه: التسجيل قصير جدًا (أقل من ثانيتين). يرجى التسميع بتمهل ووضوح.", "Notice: Recording is very short (under 2 seconds). Please recite slowly and clearly."));
        } else {
          setRecitationWarning(null);
        }

        const blob = new Blob(chunks.current, { type: chunks.current[0]?.type || mimeType });
        if (blob.size < 50) {
          setRecitationError(uiText("التسجيل فارغ أو لم يتم التقاط صوت. يرجى التحدث بوضوح في الميكروفون وإعادة المحاولة.", "Recording is empty or silent. Please speak clearly into the microphone."));
          setLoading(false);
          return;
        }
        setLoading(true);
        setRecitationError(null);
        try {
          const ayahsToRecite = rangeResult?.ayahs || (q.data?.ayahs ? [q.data.ayahs[selectedAyahIndex] || q.data.ayahs[0]] : []);
          if (!ayahsToRecite.length) throw new Error("لم يتم العثور على الآيات المطلوبة.");

          // Continuous prompt and expected sequence across full range
          const fullPromptText = ayahsToRecite.map(a => getSpokenPrompt(a)).join(" ");
          const expectedAyahs = ayahsToRecite.map(a => ({ ayah: a.numberInSurah, text: getSpokenPrompt(a) }));

          const session = loadSession();
          const result = await analyzeRecitation(blob, fullPromptText, expectedAyahs, session?.contact, ayahsToRecite[0]?.page || page);

          setRecitationResult(result);
          save({ ...plan, lastRecitation: { ...result, createdAt: new Date().toISOString() } });
          if (result.status === "uncertain") {
            setResultMessage(uiText(
              result.message || "التسجيل الصوتي غير مؤكد أو منخفض الوضوح. يرجى إعادة التسميع بنبرة أوضح.",
              result.message || "Recitation audio is uncertain or low confidence. Please recite clearly."
            ));
          } else {
            setResultMessage(uiText(`تم تحليل التسميع بنجاح — نسبة المطابقة ${Math.round(result.match)}٪`, `Recitation analyzed — match rate ${Math.round(result.match)}%`));
          }
        } catch (err: any) {
          setRecitationResult(null);
          setRecitationError(err?.message || uiText("فشل تحليل التسميع.", "Recitation analysis failed."));
        } finally {
          setLoading(false);
        }
      };
      media.current = recorder;
      recordingStartTime.current = Date.now();
      recorder.start(250);
      setSeconds(0);
      setRecording(true);
    } catch (err: any) {
      console.error("Mic error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setRecitationError(uiText("تم رفض إذن الميكروفون. يرجى السماح للتطبيق باستخدام الميكروفون من إعدادات المتصفح لإجراء التسميع.", "Microphone permission was denied. Please allow microphone access in your browser settings."));
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setRecitationError(uiText("لم يتم العثور على ميكروفون متصل بجهازك.", "No microphone detected on your device."));
      } else {
        setRecitationError(uiText(`تعذر فتح الميكروفون: ${err.message || err.name}`, `Could not access microphone: ${err.message || err.name}`));
      }
    }
  };

  const stopRecording = () => {
    media.current?.stop();
    setRecording(false);
  };

  const stopAudio = () => {
    audio.current?.pause();
    audio.current = null;
    audioQueue.current = [];
    audioQueueIndex.current = 0;
    setActiveAudioKey(null);
    setAudioPlaying(false);
  };

  const playQueueItem = (index: number) => {
    const ayah = audioQueue.current[index];
    if (!ayah) { stopAudio(); return; }
    audioQueueIndex.current = index;
    audio.current?.pause();
    const player = new Audio(ayahAudioUrl(ui.reciterId, ayah.surah.number, ayah.numberInSurah));
    audio.current = player;
    setActiveAudioKey(`${ayah.surah.number}:${ayah.numberInSurah}`);
    setAudioPlaying(true);
    player.onended = () => {
      if (audioQueue.current.length > index + 1) playQueueItem(index + 1);
      else stopAudio();
    };
    player.onerror = () => {
      stopAudio();
      toast(uiText("تعذر تشغيل هذا التسجيل. جرّب قارئًا آخر أو تحقق من الاتصال.", "This recording could not be played. Try another reciter or check your connection."));
    };
    player.play().catch(() => {
      stopAudio();
      toast(uiText("تعذر بدء الصوت في المتصفح.", "Audio playback could not start in this browser."));
    });
  };

  const playAyah = (ayah: QuranAyah) => {
    const key = `${ayah.surah.number}:${ayah.numberInSurah}`;
    if (activeAudioKey === key && audio.current && !audio.current.paused) { stopAudio(); return; }
    audioQueue.current = [ayah];
    playQueueItem(0);
  };

  const playWholeQuota = () => {
    if (audioPlaying) { stopAudio(); return; }
    if (!q.data?.ayahs.length) return;
    audioQueue.current = q.data.ayahs;
    playQueueItem(0);
  };

  const selectedReciter = reciterById(ui.reciterId);

  return (
    <div className="overlay">
      <div className="modal reader-modal">
        {/* Standardized Header with Quick Top Complete Action */}
        <div className="modal-top">
          <div>
            <h2 className="modal-title">{uiText("المصحف والتسميع", "Quran reading and recitation")}</h2>
            <p className="modal-subtitle">
              {q.data?.surahNames.join("، ")} · {uiText("الصفحة", "Page")} {ar(page)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginInlineStart: "auto" }}>
            <button
              className="reader-top-complete"
              onClick={() => {
                stopAudio();
                if (onRequestCompletion) {
                  close();
                  onRequestCompletion();
                } else {
                  setAssessmentOpen(true);
                }
              }}
              title={uiText("تسجيل إتمام الورد دون الحاجة للنزول لأسفل الصفحة", "Confirm completion without scrolling")}
            >
              <Check size={14} />
              {uiText("أتممت وردي", "Completed my quota")}
            </button>
            <button
              className="close-button"
              onClick={() => { stopAudio(); close(); }}
              aria-label={uiText("إغلاق", "Close")}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="reader-tools">
          <button
            className={`recall-toggle ${mode === "read" ? "active" : ""}`}
            onClick={() => setMode("read")}
          >
            {uiText("الحفظ والقراءة", "Reading and memorization")}
          </button>
          <button
            className={`recall-toggle ${mode === "recite" ? "active" : ""}`}
            onClick={() => { stopAudio(); setMode("recite"); }}
          >
            {uiText("اختبرني", "Test me")}
          </button>
        </div>

        {/* Reading Mode */}
        {mode === "read" && (
          <div className="reciter-bar">
            <div>
              <Volume2 size={16} />
              <span>
                <small>{uiText("القارئ", "Reciter")}</small>
                <strong>{uiText(selectedReciter.ar, selectedReciter.en)}</strong>
              </span>
            </div>
            <select
              value={ui.reciterId}
              onChange={e => { stopAudio(); setUi({ ...ui, reciterId: e.target.value as UiPreferences["reciterId"] }); }}
            >
              {RECITERS.map(r => (
                <option value={r.id} key={r.id}>{uiText(r.ar, r.en)}</option>
              ))}
            </select>
            <button className="audio-main-button" disabled={!q.data?.ayahs.length} onClick={playWholeQuota}>
              {audioPlaying ? <Square size={14} /> : <Play size={14} />} {audioPlaying ? uiText("إيقاف", "Stop") : uiText("استمع للورد", "Play quota")}
            </button>
          </div>
        )}

        {mode === "read" && <QuranText state={q} onAyah={assistant} onPlayAyah={playAyah} activeAudioKey={activeAudioKey} />}
        {mode === "read" && (
          <div className="audio-source-note">
            {uiText("التلاوات تُبث آيةً آية من", "Verse audio is streamed from")} <a href={AUDIO_SOURCE.url} target="_blank" rel="noreferrer">{AUDIO_SOURCE.name}</a>. {uiText("لا تُخزَّن التسجيلات داخل أدوم.", "Recordings are not bundled into Adwam.")}
          </div>
        )}

        {mode === "read" && !assessmentOpen && (
          <div className="reader-actions">
            <button
              className="primary-button"
              onClick={() => {
                if (onRequestCompletion) {
                  close();
                  onRequestCompletion();
                } else {
                  setAssessmentOpen(true);
                }
              }}
            >
              <Check size={15} />
              {uiText("تم حفظ وردي", "I completed my quota")}
            </button>
            <button className="secondary-button" onClick={() => { stopAudio(); setMode("recite"); }}>
              <Mic size={15} />
              {uiText("اختبرني", "Test me")}
            </button>
            <button className="secondary-button" disabled={!q.data?.ayahs.length} onClick={() => q.data?.ayahs[0] && assistant(q.data.ayahs[0])}>
              <CircleHelp size={15} />
              {uiText("أحتاج مساعدة", "I need help")}
            </button>
          </div>
        )}

        {/* Continuous Recitation Interface in Test Mode */}
        {mode === "recite" && (
          <div className="recitation-container" style={{ direction: "rtl", textAlign: "right" }}>
            {/* Range Selection Card: Simplified to 4 main choices */}
            <div className="range-selector-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: "13px", color: "var(--primary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <BookMarked size={15} />
                  {uiText("نطاق التسميع", "Recitation range")}
                </strong>
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                  {rangeResult?.title || uiText("اختر الآيات للتسميع", "Choose verses to recite")}
                </span>
              </div>

              {/* 4 Main Options: single ayah | ayah range | one page | today's ward */}
              <div className="range-tabs">
                <button
                  type="button"
                  className={`range-tab ${rangeType === "wird" ? "active" : ""}`}
                  onClick={() => {
                    setRangeType("wird");
                    loadRange({ type: "wird", pageNumber: page });
                  }}
                >
                  {uiText("ورد اليوم", "Today’s ward")}
                </button>
                <button
                  type="button"
                  className={`range-tab ${rangeType === "page" ? "active" : ""}`}
                  onClick={() => {
                    setRangeType("page");
                    loadRange({ type: "page", pageNumber: selectedPageNum });
                  }}
                >
                  {uiText("صفحة كاملة", "Full page")}
                </button>
                <button
                  type="button"
                  className={`range-tab ${rangeType === "surah_range" ? "active" : ""}`}
                  onClick={() => {
                    setRangeType("surah_range");
                    const maxAyahs = getSurahByNumber(selectedSurahNum).numberOfAyahs;
                    const to = Math.min(fromAyahNum + 4, maxAyahs);
                    setToAyahNum(to);
                    loadRange({ type: "surah_range", surahNumber: selectedSurahNum, fromAyah: fromAyahNum, toAyah: to });
                  }}
                >
                  {uiText("نطاق آيات", "Ayah range")}
                </button>
                <button
                  type="button"
                  className={`range-tab ${rangeType === "ayah" ? "active" : ""}`}
                  onClick={() => {
                    setRangeType("ayah");
                    loadRange({ type: "ayah", surahNumber: selectedSurahNum, fromAyah: fromAyahNum, toAyah: fromAyahNum });
                  }}
                >
                  {uiText("آية مفردة", "Single ayah")}
                </button>
              </div>

              {/* Range Controls Row */}
              <div className="range-controls-row">
                {rangeType === "wird" && (
                  <span style={{ fontSize: "12px", color: "var(--foreground)" }}>
                    {uiText("ورد اليوم المقرر · صفحة المصحف", "Scheduled ward · Quran page")} <strong>{ar(page)}</strong>
                  </span>
                )}

                {rangeType === "page" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{uiText("رقم الصفحة (1–604):", "Page #:")}</span>
                    <input
                      type="number"
                      min={1}
                      max={604}
                      value={selectedPageNum}
                      onChange={e => {
                        const pNum = Math.max(1, Math.min(604, Number(e.target.value) || 1));
                        setSelectedPageNum(pNum);
                        loadRange({ type: "page", pageNumber: pNum });
                      }}
                      className="range-select"
                      style={{ width: "70px", textAlign: "center" }}
                    />
                  </div>
                )}

                {(rangeType === "ayah" || rangeType === "surah_range") && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{uiText("السورة:", "Surah:")}</span>
                    <select
                      value={selectedSurahNum}
                      onChange={e => {
                        const sNum = Number(e.target.value);
                        setSelectedSurahNum(sNum);
                        const sInfo = getSurahByNumber(sNum);
                        const to = Math.min(3, sInfo.numberOfAyahs);
                        setFromAyahNum(1);
                        setToAyahNum(to);
                        if (rangeType === "ayah") {
                          loadRange({ type: "ayah", surahNumber: sNum, fromAyah: 1, toAyah: 1 });
                        } else {
                          loadRange({ type: "surah_range", surahNumber: sNum, fromAyah: 1, toAyah: to });
                        }
                      }}
                      className="range-select"
                    >
                      {surahs.map(s => (
                        <option key={s.number} value={s.number}>
                          {s.number}. {s.name} ({s.numberOfAyahs} {uiText("آية", "ayahs")})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {rangeType === "ayah" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{uiText("الآية:", "Ayah:")}</span>
                    <select
                      value={fromAyahNum}
                      onChange={e => {
                        const aNum = Number(e.target.value);
                        setFromAyahNum(aNum);
                        setToAyahNum(aNum);
                        loadRange({ type: "ayah", surahNumber: selectedSurahNum, fromAyah: aNum, toAyah: aNum });
                      }}
                      className="range-select"
                    >
                      {Array.from({ length: getSurahByNumber(selectedSurahNum).numberOfAyahs }, (_, i) => i + 1).map(num => (
                        <option key={num} value={num}>
                          {uiText("الآية", "Ayah")} {ar(num)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {rangeType === "surah_range" && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{uiText("من:", "From:")}</span>
                      <input
                        type="number"
                        min={1}
                        max={toAyahNum}
                        value={fromAyahNum}
                        onChange={e => {
                          const val = Math.max(1, Math.min(Number(e.target.value) || 1, toAyahNum));
                          setFromAyahNum(val);
                          loadRange({ type: "surah_range", surahNumber: selectedSurahNum, fromAyah: val, toAyah: toAyahNum });
                        }}
                        className="range-select"
                        style={{ width: "60px", textAlign: "center" }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{uiText("إلى:", "To:")}</span>
                      <input
                        type="number"
                        min={fromAyahNum}
                        max={getSurahByNumber(selectedSurahNum).numberOfAyahs}
                        value={toAyahNum}
                        onChange={e => {
                          const val = Math.max(fromAyahNum, Math.min(Number(e.target.value) || fromAyahNum, getSurahByNumber(selectedSurahNum).numberOfAyahs));
                          setToAyahNum(val);
                          loadRange({ type: "surah_range", surahNumber: selectedSurahNum, fromAyah: fromAyahNum, toAyah: val });
                        }}
                        className="range-select"
                        style={{ width: "60px", textAlign: "center" }}
                      />
                    </div>
                  </>
                )}

                <button
                  type="button"
                  className="primary-button"
                  disabled={rangeLoading}
                  onClick={() => loadRange()}
                  style={{ padding: "6px 14px", fontSize: "11px", marginInlineStart: "auto" }}
                >
                  {rangeLoading ? uiText("جارٍ التحميل…", "Loading…") : uiText("تطبيق النطاق", "Apply range")}
                </button>
              </div>
            </div>

            {/* Error banner if range fetch failed */}
            {rangeError && (
              <div className="recitation-error-banner" style={{ marginBottom: 12 }}>
                <strong><AlertTriangle size={15} /> {uiText("تعذر تحميل النطاق:", "Range loading notice:")}</strong>
                <span>{rangeError}</span>
              </div>
            )}

            {/* Scope Information & Memorization Mask/Prompt */}
            {rangeResult && (
              <div className="masked-verse-box" style={{ margin: "10px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: "13px", color: "var(--primary)" }}>
                    {rangeResult.title}
                  </strong>
                  <button
                    type="button"
                    className="hint-toggle-btn"
                    onClick={() => setTextHidden(!textHidden)}
                  >
                    <Sparkles size={13} />
                    {textHidden
                      ? uiText("إظهار النص للمساعدة", "Show text for aid")
                      : uiText("إخفاء النص لاختبار الحفظ", "Hide text for recall")}
                  </button>
                </div>

                {textHidden ? (
                  <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: "8px 0 0", lineHeight: 1.7 }}>
                    {uiText(
                      `النص مخفي لاختبار حفظك الغيبي (${rangeResult.ayahs.length} آية · ${rangeResult.totalWords} كلمة). اضغط «ابدأ التسميع» واقرأ الآيات متصلة من أولها لآخرها في تسجيل واحد.`,
                      `Text is hidden for recall testing (${rangeResult.ayahs.length} ayahs · ${rangeResult.totalWords} words). Click 'Start recitation' and recite continuously in one recording.`
                    )}
                  </p>
                ) : (
                  <div style={{ lineHeight: 2.3, fontSize: "18px", fontFamily: '"Amiri", serif', color: "var(--foreground)", padding: "8px 0" }}>
                    {rangeResult.ayahs.map(a => (
                      <span key={a.numberInSurah} style={{ margin: "0 4px" }}>
                        {a.text_uthmani} <span style={{ color: "var(--primary)", fontWeight: "bold" }}>﴿{ar(a.numberInSurah)}﴾</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ONE Continuous Recording Panel */}
            <div className="record-panel" style={{ marginTop: 10 }}>
              <div className="record-status">
                {recording ? (
                  <>
                    <span className="record-dot" />
                    {uiText("تسجيل متصل جارٍ", "Continuous recording")} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                  </>
                ) : (
                  uiText("تسجيل متصل واحد من البداية حتى النهاية دون توقف بين الآيات.", "One continuous recording from beginning to end.")
                )}
              </div>
              {recording ? (
                <button className="primary-button" onClick={stopRecording}>
                  <Pause size={15} />
                  {uiText("إنهاء التسميع وتحليل النطاق", "Stop and analyze range")}
                </button>
              ) : (
                <button
                  className="primary-button"
                  onClick={startRecording}
                  disabled={loading || rangeLoading || !rangeResult}
                >
                  <Mic size={15} />
                  {uiText("ابدأ التسميع", "Start recitation")}
                </button>
              )}
            </div>

            {loading && (
              <div className="ai-state loading" style={{ marginTop: 12 }}>
                {uiText("نحلل تسميعك المتصل كلمة بكلمة عبر النموذج الصوتي…", "Analyzing your continuous recitation word-by-word…")}
              </div>
            )}

            {/* Recitation Warning Banner */}
            {recitationWarning && (
              <div className="recitation-warning-banner" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(245,158,11,0.14)", color: "#b45309", borderRadius: 8, fontSize: "13px", marginTop: 10 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>{recitationWarning}</span>
              </div>
            )}

            {/* Recitation Error Banner */}
            {recitationError && (
              <div className="recitation-error-banner" style={{ marginTop: 10 }}>
                <strong><AlertTriangle size={15} /> {uiText("تعذر إكمال التسميع:", "Recitation notice:")}</strong>
                <span>{recitationError}</span>
                <button className="secondary-button" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={startRecording}>
                  <Mic size={14} /> {uiText("إعادة المحاولة", "Retry")}
                </button>
              </div>
            )}

            {/* Uncertainty state handling (no false errors invented) */}
            {recitationResult && recitationResult.status === "uncertain" && (
              <div className="ai-state empty" style={{ textAlign: "right", margin: "12px 0", border: "1px dashed #d97706", background: "rgba(245,158,11,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#b45309", marginBottom: 8 }}>
                  <AlertTriangle size={18} />
                  <strong>{uiText("التسجيل الصوتي غير مؤكد أو منخفض الوضوح", "Recitation audio is uncertain")}</strong>
                </div>
                <p style={{ fontSize: "13px", color: "var(--foreground)", margin: "0 0 12px", lineHeight: 1.7 }}>
                  {recitationResult.message || uiText("لم يتم التيقن من الصوت بوضوح كافٍ. لم نقم باختلاق أخطاء حفظ؛ يرجى إعادة التسميع بنبرة أوضح وقريبة من الميكروفون.", "Recitation audio is uncertain. No errors were invented; please recite clearly near the microphone.")}
                </p>
                <button className="primary-button" onClick={startRecording} style={{ fontSize: "12px", padding: "8px 16px" }}>
                  <Mic size={14} /> {uiText("إعادة التسميع", "Retry recitation")}
                </button>
              </div>
            )}

            {/* Successful Full Continuous Range Analysis Result */}
            {recitationResult && recitationResult.status === "success" && rangeResult && (
              <div className="ai-state empty" style={{ textAlign: "right", marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: "15px", color: "var(--primary)" }}>
                    {rangeResult.title} — {uiText("نسبة المطابقة", "Match Rate")} {Math.round(recitationResult.match)}%
                  </strong>
                </div>

                {/* Aggregated Alignment Stats */}
                <div className="recitation-stats-bar">
                  <span className="recitation-stat-badge score">
                    {uiText("نسبة المطابقة:", "Match:")} {Math.round(recitationResult.match)}%
                  </span>
                  <span className="recitation-stat-badge correct">
                    <Check size={13} /> {uiText("صحيحة:", "Correct:")} {recitationResult.correctWordsCount ?? recitationResult.wordAlignment?.filter(w => w.status === "correct").length ?? 0}
                  </span>
                  {(recitationResult.uncertainWordsCount ?? recitationResult.wordAlignment?.filter(w => w.status === "uncertain").length ?? 0) > 0 && (
                    <span className="recitation-stat-badge uncertain">
                      <Sparkles size={13} /> {uiText("غير مؤكدة (مقبولة):", "Uncertain (accepted):")} {recitationResult.uncertainWordsCount ?? recitationResult.wordAlignment?.filter(w => w.status === "uncertain").length}
                    </span>
                  )}
                  {recitationResult.differences.filter(d => d.type === "omission").length > 0 && (
                    <span className="recitation-stat-badge missed">
                      <X size={13} /> {uiText("مفقودة:", "Missed:")} {recitationResult.differences.filter(d => d.type === "omission").length}
                    </span>
                  )}
                  {recitationResult.differences.filter(d => d.type === "substitution").length > 0 && (
                    <span className="recitation-stat-badge wrong">
                      <RefreshCw size={13} /> {uiText("مستبدلة:", "Substituted:")} {recitationResult.differences.filter(d => d.type === "substitution").length}
                    </span>
                  )}
                  {recitationResult.differences.filter(d => d.type === "addition").length > 0 && (
                    <span className="recitation-stat-badge added">
                      + {uiText("إضافية:", "Added:")} {recitationResult.differences.filter(d => d.type === "addition").length}
                    </span>
                  )}
                </div>

                {/* Continuous Uthmani Verses Colored Across Full Range */}
                <div className="recitation-words-container">
                  <div className="recitation-words-title">
                    <span>{uiText("نص الآيات بالرسم العثماني ملوّنًا بحسب التسميع:", "Uthmani text colored by continuous recitation:")}</span>
                    <small style={{ fontSize: "11px", fontWeight: "normal", color: "var(--muted-foreground)" }}>
                      {uiText("الأخضر: صحيح · الأصفر: غير مؤكد · البرتقالي: استبدال · مشطوب: مفقود", "Green: correct · Yellow: uncertain · Orange: substitution · Strike: missed")}
                    </small>
                  </div>

                  <div style={{ lineHeight: 2.6, direction: "rtl", fontSize: "19px", fontFamily: '"Amiri", serif' }}>
                    {(() => {
                      let alignCursor = 0;
                      return rangeResult.ayahs.map((ayah, aIdx) => {
                        const words = extractAyahWords(ayah.text_uthmani);
                        const isMuqAyah = isMuqattaatAyah(ayah.surah.number, ayah.numberInSurah);

                        return (
                          <span key={aIdx} style={{ display: "inline", margin: "0 4px" }}>
                            {words.map((w, wIdx) => {
                              const isMuqWord = isMuqAyah && wIdx === 0;

                              if (isMuqWord) {
                                const letterUnits = splitUthmaniMuqattaat(w);
                                return (
                                  <span key={wIdx} style={{ display: "inline-flex", gap: "2px", margin: "0 2px", verticalAlign: "middle" }}>
                                    {letterUnits.map((lChar, lIdx) => {
                                      const align = recitationResult.wordAlignment?.[alignCursor++];
                                      const st = align?.status || "correct";
                                      const colorBg =
                                        st === "correct"
                                          ? "rgba(46,125,50,0.14)"
                                          : st === "uncertain"
                                          ? "rgba(245,158,11,0.18)"
                                          : st === "substitution"
                                          ? "rgba(239,68,68,0.18)"
                                          : "rgba(239,68,68,0.1)";
                                      const colorFg =
                                        st === "correct"
                                          ? "#1b5e20"
                                          : st === "uncertain"
                                          ? "#92400e"
                                          : "#b91c1c";
                                      return (
                                        <span
                                          key={lIdx}
                                          style={{
                                            backgroundColor: colorBg,
                                            color: colorFg,
                                            padding: "2px 4px",
                                            borderRadius: "4px",
                                            textDecoration: st === "omission" ? "line-through" : "none",
                                            fontSize: "20px",
                                          }}
                                          title={
                                            st === "uncertain"
                                              ? `غير مؤكد (مقبول): سمع «${align?.actual || ""}» للحرف «${align?.expected || ""}»`
                                              : st === "substitution"
                                              ? `استبدال: سمع «${align?.actual || ""}» بدلاً من «${align?.expected || ""}»`
                                              : st === "correct"
                                              ? `حرف صحيح: ${align?.expected || ""}`
                                              : `حرف مفقود: ${align?.expected || ""}`
                                          }
                                        >
                                          {lChar}
                                        </span>
                                      );
                                    })}
                                  </span>
                                );
                              }

                              const align = recitationResult.wordAlignment?.[alignCursor++];
                              const st = align?.status || "correct";
                              const colorBg =
                                st === "correct"
                                  ? "rgba(46,125,50,0.12)"
                                  : st === "uncertain"
                                  ? "rgba(245,158,11,0.16)"
                                  : st === "substitution"
                                  ? "rgba(239,68,68,0.16)"
                                  : "rgba(239,68,68,0.1)";
                              const colorFg =
                                st === "correct"
                                  ? "#1b5e20"
                                  : st === "uncertain"
                                  ? "#92400e"
                                  : "#b91c1c";

                              return (
                                <span
                                  key={wIdx}
                                  style={{
                                    backgroundColor: colorBg,
                                    color: colorFg,
                                    padding: "2px 4px",
                                    borderRadius: "4px",
                                    margin: "0 2px",
                                    textDecoration: st === "omission" ? "line-through" : "none",
                                  }}
                                  title={
                                    st === "uncertain"
                                      ? `غير مؤكد (مقبول): سمع «${align?.actual || ""}» بدلاً من «${align?.expected || ""}»`
                                      : st === "substitution"
                                      ? `استبدال: سمع «${align?.actual || ""}» بدلاً من «${align?.expected || ""}»`
                                      : st === "correct"
                                      ? `صحيح: ${align?.expected || ""}`
                                      : `مفقود: ${align?.expected || ""}`
                                  }
                                >
                                  {w}
                                </span>
                              );
                            })}
                            <span style={{ color: "var(--primary)", fontWeight: "bold", margin: "0 4px" }}>
                              ﴿{ar(ayah.numberInSurah)}﴾
                            </span>
                          </span>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Prominent Raw Audio Transcript Box */}
                <div className="recitation-raw-box">
                  <div className="recitation-raw-header">
                    <span>{uiText("النص المسموع الفعلي (Raw Transcript):", "Raw Audio Transcript:")}</span>
                    <span style={{ fontSize: "10px", fontWeight: "normal", color: "var(--muted-foreground)" }}>
                      {recitationResult.supportedBy}
                    </span>
                  </div>
                  <div className="recitation-raw-content">
                    {recitationResult.transcript}
                  </div>
                </div>

                {/* Passages to Review */}
                {recitationResult.differences?.filter(d => d.type === "substitution" || d.type === "omission" || d.type === "addition").length > 0 && (
                  <div className="recitation-differences">
                    <strong>{uiText("مواضع تحتاج مراجعة بالتفصيل", "Passages to review")}</strong>
                    {recitationResult.differences
                      .filter(d => d.type === "substitution" || d.type === "omission" || d.type === "addition")
                      .map((d, i) => (
                        <div className={`recitation-diff ${d.type}`} key={i}>
                          <span>
                            {d.ayah ? `${uiText("آية", "Ayah")} ${ar(d.ayah)} · ` : ""}
                            {d.position ? `${uiText("الكلمة رقم", "Word #")} ${ar(d.position)} · ` : ""}
                            {d.type === "substitution" ? uiText("استبدال كلمة", "Word substitution") : d.type === "omission" ? uiText("كلمة مفقودة", "Omitted word") : uiText("كلمة إضافية", "Extra word")}
                          </span>
                          <small>
                            {d.type === "substitution"
                              ? uiText(`سُمع: «${d.actual}» · والصحيح بحسب النص: «${d.expected}»`, `Heard: “${d.actual}” · Expected: “${d.expected}”`)
                              : d.type === "omission"
                              ? uiText(`لم تُلتقط كلمة: «${d.expected}»`, `Missing: “${d.expected}”`)
                              : uiText(`التقط النظام كلمة إضافية: «${d.actual}»`, `Extra: “${d.actual}”`)}
                          </small>
                        </div>
                      ))}
                  </div>
                )}

                <p className="recitation-caveat">
                  {uiText("هذا تحليل حفظ على مستوى الكلمات والترتيب، وليس حكمًا على التجويد أو المخارج أو المدود.", "This checks word-level memorization, not tajweed, makharij, or madd rules.")}
                </p>

                {/* Action Buttons */}
                <div className="reader-actions" style={{ marginTop: 14 }}>
                  <button className="secondary-button" onClick={startRecording}>
                    <Mic size={14} />
                    {uiText("إعادة التسميع", "Recite again")}
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => {
                      if (onRequestCompletion) {
                        close();
                        onRequestCompletion();
                      } else {
                        setAssessmentOpen(true);
                      }
                    }}
                  >
                    <Check size={14} />
                    {uiText("أتممت وردي / سجل النتيجة", "Confirm quota completion")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Inline completion if open inside reader */}
        {assessmentOpen && (
          <div className="completion-field" style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <label className="completion-field-label">
              {uiText("١. كم أنجزت من ورد اليوم؟", "1. How much did you complete?")}
            </label>
            <div className="completion-pills">
              <button
                type="button"
                className={`completion-pill ${completionRatioChoice === 0.5 ? "selected" : ""}`}
                onClick={() => setCompletionRatioChoice(0.5)}
              >
                {uiText("نصف الورد", "Half of quota")}
              </button>
              <button
                type="button"
                className={`completion-pill ${completionRatioChoice === 1 ? "selected" : ""}`}
                onClick={() => setCompletionRatioChoice(1)}
              >
                {uiText("كامل الورد", "Full quota")}
              </button>
            </div>

            {completionRatioChoice && (
              <div style={{ marginTop: 14 }}>
                <label className="completion-field-label">
                  {uiText("٢. كيف كانت جودة حفظك؟", "2. How was your memorization quality?")}
                </label>
                <div className="mastery-options">
                  {[
                    ["strong", "متقن", "استدعاء ثابت دون تعثر", "Strong", "Stable recall"],
                    ["average", "جيد", "تعثر بسيط ثم تذكرت", "Good", "Minor hesitation"],
                    ["review", "يحتاج تثبيت", "أحتاج أن يعود قريبًا", "Needs reinforcement", "Bring it back sooner"],
                    ["not_memorized", "لم يكتمل", "أسجله بدون ادعاء إنجاز", "Not completed", "Save without claiming completion"],
                  ].map(([id, arTitle, arDesc, enTitle, enDesc]) => (
                    <button
                      key={id}
                      type="button"
                      className={`mastery-option ${id}`}
                      onClick={() => complete(id as Assessment, id === "not_memorized" ? 0 : completionRatioChoice)}
                    >
                      <span className="mastery-emoji">
                        {id === "strong" ? "✓" : id === "average" ? "•" : id === "review" ? "!" : "×"}
                      </span>
                      <span>
                        <strong>{uiText(arTitle, enTitle)}</strong>
                        <span>{uiText(arDesc, enDesc)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function splitAyahForMemorization(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const targetSize = words.length <= 8 ? Math.ceil(words.length / 2) : words.length <= 16 ? 4 : 5;
  const chunks: string[][] = [];
  for (let i = 0; i < words.length; i += targetSize) chunks.push(words.slice(i, i + targetSize));
  return chunks;
}

function stripArabicMarks(value: string) {
  return value
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[ٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function maskMemorizationChunk(words: string[], level: number) {
  if (level <= 0) return words.map(word => ({ word, hidden: false }));
  const hiddenRatio = [0, .25, .5, .75, 1][Math.min(4, level)] ?? 1;
  const hideCount = Math.max(1, Math.round(words.length * hiddenRatio));
  const hiddenIndexes = new Set<number>();
  for (let i = 0; i < hideCount; i++) hiddenIndexes.add(Math.min(words.length - 1, Math.floor((i + .5) * words.length / hideCount)));
  return words.map((word, index) => ({ word, hidden: hiddenIndexes.has(index) }));
}

function MemorizeAid({ ayah, onTest, onComplete }: { ayah: QuranAyah; onTest: () => void; onComplete: () => void }) {
  const chunks = splitAyahForMemorization(ayah.text);
  const [step, setStep] = useState<"observe" | "practice" | "recall">("observe");
  const [hideLevel, setHideLevel] = useState(1);
  const [meaning, setMeaning] = useState<AssistantResult | null>(null);
  const [similar, setSimilar] = useState<AssistantResult | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingSources(true);
    Promise.all([
      queryAyahAssistant(ayah, "explain"),
      queryAyahAssistant(ayah, "similar"),
    ]).then(([meaningResult, similarResult]) => {
      if (!active) return;
      setMeaning(meaningResult);
      setSimilar(similarResult);
    }).finally(() => active && setLoadingSources(false));
    return () => { active = false; };
  }, [ayah.number]);

  const openingCue = ayah.text.trim().split(/\s+/).slice(0, 2).join(" ");

  return <section className="memorize-aid" aria-label={uiText("وضع حفظ تفاعلي", "Interactive memorization mode")}>
    <div className="memorize-head">
      <div><span className="memorize-kicker">{uiText("وضع حفظ تفاعلي", "Interactive memorization")}</span><h3>{uiText("ثبّت الآية قبل أن تختبر نفسك", "Build the ayah before testing yourself")}</h3></div>
      <div className="memorize-steps" aria-label={uiText("مراحل الحفظ", "Memorization stages")}>
        <span className={step === "observe" ? "active" : ""}>١</span><span className={step === "practice" ? "active" : ""}>٢</span><span className={step === "recall" ? "active" : ""}>٣</span>
      </div>
    </div>

    {step === "observe" && <>
      <p className="memorize-instruction">{uiText("ابدأ بقراءة المقاطع على مهل، واربط كل مقطع بما بعده.", "Read the short chunks slowly and connect each chunk to the next.")}</p>
      <div className="memorize-chunks">{chunks.map((chunk, index) => <article className="memorize-chunk" key={index}><small>{uiText("المقطع", "Chunk")} {ar(index + 1)}</small><p>{chunk.join(" ")}</p></article>)}</div>
      <div className="memorize-source-grid">
        <article className="memory-source-card"><strong>{uiText("المعنى المختصر", "Brief meaning")}</strong>{loadingSources ? <p>{uiText("جارٍ التحقق من المصدر…", "Checking the source…")}</p> : meaning?.status === "success" ? <p>{meaning.answer}</p> : <p className="source-pending">{uiText("يُعرض المعنى المعتمد من المصادر الموثوقة دون توليد غير مسند.", "A verified meaning is displayed here from approved sources.")}</p>}</article>
        <article className="memory-source-card"><strong>{uiText("مواضع الالتباس والمتشابهات", "Similar wording / confusion points")}</strong>{loadingSources ? <p>{uiText("جارٍ التحقق من المصدر…", "Checking the source…")}</p> : similar?.status === "success" ? <p>{similar.answer}</p> : <p className="source-pending">{uiText("تُعرض المتشابهات عند استرجاعها من المصدر الموثوق.", "Similar verses appear when retrieved from the approved source.")}</p>}</article>
      </div>
      <button className="primary-button memorize-next" onClick={() => setStep("practice")}>{uiText("ابدأ الإخفاء التدريجي", "Start progressive hiding")}<ChevronLeft size={14}/></button>
    </>}

    {step === "practice" && <>
      <div className="memorize-practice-top"><p className="memorize-instruction">{uiText("أكمل الكلمات المخفية من ذاكرتك، ثم زد مستوى الإخفاء.", "Complete the hidden words from memory, then increase the hiding level.")}</p><span>{uiText("مستوى الإخفاء", "Hide level")}: {ar(hideLevel)}/٤</span></div>
      <div className="memorize-chunks practice">{chunks.map((chunk, index) => <article className="memorize-chunk" key={index}><small>{uiText("المقطع", "Chunk")} {ar(index + 1)}</small><p>{maskMemorizationChunk(chunk, hideLevel).map((item, wordIndex) => item.hidden ? <span className="memory-blank" key={wordIndex} aria-label={uiText("كلمة مخفية", "Hidden word")}>••••</span> : <span key={wordIndex}>{item.word} </span>)}</p></article>)}</div>
      <div className="memorize-controls"><button className="secondary-button" onClick={() => setHideLevel(level => Math.max(1, level - 1))} disabled={hideLevel === 1}>{uiText("إظهار أكثر", "Show more")}</button><button className="secondary-button" onClick={() => setHideLevel(level => Math.min(4, level + 1))} disabled={hideLevel === 4}>{uiText("إخفاء أكثر", "Hide more")}</button><button className="primary-button" onClick={() => { setStep("recall"); setChecked(false); }}>{uiText("اختبار الاستدعاء", "Recall check")}</button></div>
    </>}

    {step === "recall" && <>
      <p className="memorize-instruction">{uiText("هذه ليست ميزة «اختبرني» الكاملة؛ هذا فحص خفيف في نهاية جلسة الحفظ لتثبيت الآية.", "This is a light recall check at the end of memorization, not the full ‘Test me’ assessment.")}</p>
      <div className="recall-cue"><small>{uiText("بداية الآية", "Opening cue")}</small><strong>{openingCue}…</strong></div>
      <div className="recall-selfcheck"><strong>{uiText("جرّب تسميع الآية بصوتك من غير النظر للنص.", "Recite the ayah aloud without looking at the text.")}</strong><p>{uiText("ثم اختر النتيجة الأقرب لك. لا نطلب كتابة القرآن يدويًا.", "Then choose the closest result. We do not ask you to type Quran text manually.")}</p><div><button onClick={() => setChecked(true)}>{uiText("تذكرتها كاملة", "Recalled it fully")}</button><button onClick={() => { setChecked(false); setStep("practice"); }}>{uiText("توقفت أو التبست عليّ", "I hesitated / got confused")}</button></div></div>
      {checked && <div className="recall-feedback good"><strong>{uiText("تمام — اختر خطوتك التالية بدون ما تطلع من المسار.", "Great — choose your next step without leaving the flow.")}</strong><small>{uiText("هذا فحص استدعاء ذاتي، وليس حكمًا آليًا على صحة التلاوة.", "This is a self-check, not an automated recitation verdict.")}</small><div className="recall-next-actions"><button className="primary-button" onClick={onTest}><Mic size={14}/>{uiText("اختبرني بالصوت", "Test me by voice")}</button><button className="secondary-button" onClick={onComplete}><Check size={14}/>{uiText("تم الحفظ — أكمل وردي", "Memorized — complete my quota")}</button></div></div>}
      <div className="memorize-controls"><button className="secondary-button" onClick={() => { setStep("practice"); setChecked(false); }}>{uiText("ارجع للتثبيت", "Back to practice")}</button></div>
    </>}
  </section>;
}

function Assistant({ ayah, close, openFull, returnToReader }: { ayah: QuranAyah; close: () => void; openFull: (ayah: QuranAyah) => void; returnToReader: (mode: "read" | "recite", completion?: boolean) => void }) {
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [memorizeOpen, setMemorizeOpen] = useState(false);
  const [showArabicOriginal, setShowArabicOriginal] = useState(false);

  const ask = async (mode: AssistantMode) => {
    if (mode === "memorize") { setResult(null); setMemorizeOpen(true); return; }
    setMemorizeOpen(false);
    setLoading(true); setResult(null);
    setShowArabicOriginal(false);
    try { setResult(await queryAyahAssistant(ayah, mode)); }
    catch { setResult({ status: "error", title: uiText("تعذر الوصول إلى المساعد", "Assistant unavailable"), answer: uiText("حاول مرة أخرى لاحقًا.", "Please try again later."), citations: [], reason: "service_unavailable" }); }
    finally { setLoading(false); }
  };

  return <div className="overlay"><div className="modal assistant-modal"><div className="modal-top"><div><h2 className="modal-title">{uiText("مساعدة مرتبطة بالآية", "Ayah assistance")}</h2><p className="modal-subtitle">{ayah.surah.name} · {uiText("الآية", "Ayah")} {ar(ayah.numberInSurah)}</p></div><button className="close-button" onClick={close} aria-label={uiText("إغلاق", "Close")}><X size={15}/></button></div><blockquote>{ayah.text}</blockquote><div className="assistant-actions">{([["explain", "شرح مختصر", "Brief explanation"], ["similar", "متشابهات الآية", "Related verses"], ["memorize", "ساعدني أحفظها", "Memorization aid"]] as const).map(([mode, arLabel, enLabel]) => <button className={memorizeOpen && mode === "memorize" ? "active" : ""} key={mode} onClick={() => ask(mode)}>{uiText(arLabel, enLabel)}</button>)}</div>{memorizeOpen && <MemorizeAid ayah={ayah} onTest={() => returnToReader("recite")} onComplete={() => returnToReader("read", true)}/>} {loading && <div className="ai-state loading">{uiText("نبحث في المصادر المعتمدة…", "Searching approved sources…")}</div>}{result && <div className={`assistant-result ${result.status === "success" ? "success" : "empty"}`}><strong>{result.title}</strong>{result.answer && <p style={{ whiteSpace: "pre-line" }}>{result.answer}</p>}{result.originalArabicAnswer && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)" }}><button className="link-button" onClick={() => setShowArabicOriginal(v => !v)} style={{ fontSize: 11, fontWeight: 700 }}>{showArabicOriginal ? uiText("إخفاء النص العربي الأصلي", "Hide original Arabic text") : uiText("عرض النص العربي الأصلي (التفسير الميسر)", "View original Arabic source text")}</button>{showArabicOriginal && <blockquote style={{ margin: "8px 0 0", padding: "10px 12px", background: "rgba(0,0,0,0.03)", borderRadius: 10, fontSize: 13, lineHeight: 1.8, fontFamily: "'Amiri', serif" }}>{result.originalArabicAnswer}</blockquote>}</div>}{result.embedUrl && <div className="source-embed-wrap"><iframe className="source-embed" src={result.embedUrl} title={result.title} loading="lazy" /></div>}{result.citations.map((citation, index) => <div className="source-card" key={`${citation.sourceName}-${index}`}><BookMarked size={15}/><span><small>{uiText("المصدر", "Source")}</small><strong>{citation.title}</strong><em>{citation.sourceName}</em>{citation.url && <a href={citation.url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 3 }}>{uiText("فتح المصدر", "Open source")}</a>}{citation.originalArabicUrl && <a href={citation.originalArabicUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginInlineStart: 8, marginTop: 3, color: "var(--primary)" }}>{uiText("المصدر العربي", "Original Arabic source")}</a>}</span></div>)}</div>}<button className="assistant-open-full" onClick={() => openFull(ayah)}><MessageCircle size={15}/><span>{uiText("اسأل أكثر عن الآية", "Ask more about this ayah")}</span><ChevronLeft size={14}/></button></div></div>;
}


function AssistantHub({ initialAyah }: { initialAyah?: QuranAyah | null }) {
  type ChatMessage = { role: "user" | "assistant"; text: string; result?: AssistantResult; feedback?: "helpful" | "not-helpful" };
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<QuranAyah | null>(initialAyah || null);
  useEffect(() => { if (initialAyah) setContext(initialAyah); }, [initialAyah?.number]);
  const suggestions = context
    ? [uiText("اشرح لي معنى هذه الآية باختصار", "Explain this ayah briefly"), uiText("هل لها مواضع متشابهة لفظيًا؟", "Are there similar wordings elsewhere?"), uiText("ساعدني بطريقة لحفظها", "Help me memorize it")]
    : [uiText("كيف أراجع ما حفظته دون أن يتراكم؟", "How can I review without building a backlog?"), uiText("كيف أتعامل مع الآيات المتشابهة؟", "How should I handle similar verses?"), uiText("أريد أن أسأل عن آية", "I want to ask about an ayah")];

  const send = async (preset?: string) => {
    const q = (preset ?? question).replace(/\s+/g, " ").trim().slice(0, 1200);
    if (!q || loading) return;
    setMessages(v => [...v, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    try {
      const mode: AssistantMode = /متشابه|similar/i.test(q) ? "similar" : /احفظ|memor/i.test(q) ? "memorize" : "ask";
      const result = await queryAssistant(q, mode, context);
      setMessages(v => [...v, { role: "assistant", text: result.answer || result.title, result }]);
    } catch {
      const result: AssistantResult = { status: "error", title: uiText("تعذر الوصول إلى المساعد", "Assistant unavailable"), answer: uiText("تعذر الوصول إلى الخدمة الآن، ولم يتم إنشاء إجابة بديلة غير موثقة.", "The service is unavailable and no unverified fallback answer was generated."), citations: [], reason: "service_unavailable" };
      setMessages(v => [...v, { role: "assistant", text: result.answer!, result }]);
    } finally { setLoading(false); }
  };

  const feedback = (index: number, value: "helpful" | "not-helpful") => {
    setMessages(current => current.map((message, i) => i === index ? { ...message, feedback: value } : message));
  };

  return <div className="assistant-page">
    <section className="assistant-intro"><div className="assistant-mark"><MessageCircle size={22}/></div><div><h2>{uiText("اسأل عن آية أو معنى", "Ask about an ayah or meaning")}</h2><p>{uiText("التفسير والمتشابهات وطرق الحفظ من مصادر موثقة، مع إظهار المصدر.", "Tafsir, similar passages, and memorization help with visible sources.")}</p></div><div className="assistant-trust"><ShieldCheck size={15}/>{uiText("إجابات مسندة · يمتنع عند غياب المصدر", "Cited answers · abstains without a source")}</div></section><section className="assistant-scope-card"><div><ShieldCheck size={16}/><span><strong>{uiText("حدود واضحة", "Clear boundaries")}</strong><small>{uiText("الأسئلة التي تتطلب فتوى شخصية لا يجيب عنها أدوم باستقلال، ويطلب الرجوع إلى مختص مؤهل.", "Questions requiring a personal fatwa are not answered independently; users are directed to a qualified specialist.")}</small></span></div></section>
    {context ? <div className="context-chip"><BookOpen size={14}/><span>{context.surah.name} · {uiText("الآية", "Ayah")} {ar(context.numberInSurah)}</span><button onClick={() => setContext(null)} aria-label={uiText("إزالة سياق الآية", "Remove ayah context")}><X size={13}/></button></div> : <div className="assistant-context-note"><BookOpen size={14}/><span>{uiText("تقدر تسأل سؤالًا عامًا، ولأفضل دقة افتح آية من المصحف ثم اختر «اسأل أكثر».", "You can ask generally, or open an ayah and choose ‘Ask more’ for precise context.")}</span></div>}
    <section className="assistant-conversation">{messages.length === 0 ? <div className="assistant-empty"><div><BookMarked size={22}/><h3>{uiText("ابدأ بسؤال مرتبط بفهمك وحفظك", "Start with a question about understanding or memorization")}</h3><p>{uiText("لن يعرض أدوم تفسيرًا أو حكمًا شرعيًا دون مصدر معتمد.", "Adwam will not present tafsir or a religious ruling without an approved source.")}</p></div><div className="assistant-suggestions">{suggestions.map(x => <button key={x} onClick={() => send(x)}>{x}</button>)}</div></div> : <div className="assistant-thread">{messages.map((m,i)=><article key={i} className={`assistant-message ${m.role} ${m.result?.status || ""}`}><div className="message-role">{m.role === "assistant" ? uiText("أدوم", "Adwam") : uiText("أنت", "You")}</div><p>{m.text}</p>{m.result?.embedUrl && <div className="source-embed-wrap compact"><iframe className="source-embed" src={m.result.embedUrl} title={m.result.title} loading="lazy" /></div>}{m.result?.citations.map((citation, ci) => <div className="source-card" key={`${i}-${ci}`}><BookMarked size={15}/><span><small>{uiText("المصدر", "Source")}</small><strong>{citation.title}</strong><em>{citation.sourceName}</em>{citation.excerpt && <q>{citation.excerpt}</q>}{citation.url && <a href={citation.url} target="_blank" rel="noreferrer">{uiText("فتح المصدر", "Open source")}</a>}</span></div>)}{m.result?.status === "referral" && <div className="referral-card"><ShieldCheck size={15}/><span><strong>{uiText("يحتاج مختصًا", "Specialist needed")}</strong>{uiText("هذه الحالة لا يجيب عنها أدوم باستقلال. يرجى الرجوع إلى مختص مؤهل.", "Adwam does not answer this independently. Please consult a qualified specialist.")}</span></div>}{m.role === "assistant" && <div className="answer-actions"><button className={m.feedback === "helpful" ? "selected" : ""} onClick={() => feedback(i, "helpful")}>{m.feedback === "helpful" ? uiText("تم · مفيد", "Saved · Helpful") : uiText("مفيد", "Helpful")}</button><button className={m.feedback === "not-helpful" ? "selected" : ""} onClick={() => feedback(i, "not-helpful")}>{m.feedback === "not-helpful" ? uiText("تم · غير مفيد", "Saved · Not helpful") : uiText("غير مفيد", "Not helpful")}</button></div>}</article>)}{loading && <div className="assistant-thinking"><span/><span/><span/>{uiText("نبحث في المصادر…", "Searching sources…")}</div>}</div>}</section>
    <form className="assistant-composer" onSubmit={e => { e.preventDefault(); send(); }}><textarea value={question} maxLength={1200} onChange={e=>setQuestion(e.target.value)} placeholder={context ? uiText("اكتب سؤالك عن الآية…", "Ask about the ayah…") : uiText("اكتب سؤالك…", "Ask a question…")} rows={2}/><button type="submit" disabled={!question.trim() || loading} aria-label={uiText("إرسال", "Send")}><Send size={17}/></button></form>
    <div className="assistant-safety-note"><AlertTriangle size={14}/><span>{uiText("الأسئلة التي تتطلب فتوى شخصية أو تقديرًا شرعيًا خاصًا تُحال إلى مختص ولا يجيب عنها أدوم باستقلال.", "Questions requiring a personal fatwa or qualified religious judgment are referred to a specialist rather than answered independently.")}</span></div>
  </div>;
}

function Recovery({ plan, save, close, toast }: { plan: PlanState; save: (plan: PlanState) => void; close: () => void; toast: (text: string) => void }) {
  const [kind, setKind] = useState<"half" | "review" | "redistribute" | "none">("half");
  const proposal = calculateRecoveryPlan(plan, kind);
  const snapshot = buildPlanSnapshot(plan);
  const graceStillActive = Boolean(plan.graceActiveUntil && new Date(plan.graceActiveUntil).getTime() > Date.now());
  const graceAvailable = !graceStillActive && plan.graceDaysUsed < (plan.graceAllowance || 1);
  const intervalDays = Math.max(1, Math.ceil(7 / Math.max(1, plan.activeDays.length || 1)));
  const lostPages = kind === "half" ? Math.max(0, plan.pagesPerDay - proposal.pages) : kind === "redistribute" ? 0 : plan.pagesPerDay;
  const addedSessions = kind === "redistribute" ? 0 : Math.ceil(lostPages / Math.max(.25, plan.pagesPerDay));
  const afterDate = new Date(`${snapshot.estimatedCompletionDate}T12:00:00`);
  afterDate.setDate(afterDate.getDate() + addedSessions * intervalDays);

  const approve = () => {
    const today = todayKey();
    const shouldUseGrace = kind === "none" && graceAvailable;
    const graceActiveUntil = shouldUseGrace ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : plan.graceActiveUntil;
    save({
      ...plan,
      todayRecoveryPages: proposal.pages || undefined,
      recovery: [...plan.recovery.filter(r => r.date !== today), { date: today, minutes: kind === "half" ? 0 : kind === "review" ? "review" : "none", approved: true, label: proposal.label, quota: proposal.pages, kind, redistribution: proposal.redistribution }],
      calendarStatuses: { ...plan.calendarStatuses, [today]: kind === "none" ? "vacation" : "recovery" },
      missedDays: kind === "none" ? plan.missedDays + 1 : plan.missedDays,
      streak: kind === "none" && !shouldUseGrace ? 0 : plan.streak,
      graceDaysUsed: shouldUseGrace ? plan.graceDaysUsed + 1 : plan.graceDaysUsed,
      graceActiveUntil,
      lastAction: kind === "none" ? "missed" : "recovery",
    });
    close();
    toast(kind === "none"
      ? shouldUseGrace
        ? uiText("فُعّلت مهلة الاستمرار لمدة 24 ساعة ولم تنكسر السلسلة.", "A 24-hour grace period was activated and your streak is protected.")
        : uiText("تم تسجيل اليوم كمؤجل؛ مهلة الاستمرار غير متاحة حاليًا.", "Today was deferred; a grace day is not currently available.")
      : uiText("تم حفظ التكييف؛ تُحتسب الاستمرارية بعد إتمام المهمة.", "Adjustment saved; the streak counts only after completion."));
  };

  return <div className="overlay"><div className="modal"><div className="modal-top"><div><h2 className="modal-title">{uiText("أنقذ وردي", "Rescue today’s quota")}</h2><p className="modal-subtitle">{uiText("لم يناسبك ورد اليوم؟ اختر تعديلًا واضحًا وشاهد أثره قبل الاعتماد.", "Today’s quota did not fit? Choose a clear adjustment and preview its impact first.")}</p></div><button className="close-button" onClick={close} aria-label={uiText("إغلاق", "Close")}><X size={15} /></button></div>
    <div className="choice-grid">{([["half", "نصف النصاب الحالي", "Half of current quota"], ["review", "مراجعة فقط", "Review only"], ["redistribute", "ترحيل ذكي", "Smart redistribution"], ["none", "تسجيل اليوم كمؤجل", "Defer today"]] as const).map(([id, arLabel, enLabel]) => <button key={id} className={`choice ${kind === id ? "selected" : ""}`} onClick={() => setKind(id)}><strong>{uiText(arLabel, enLabel)}</strong></button>)}</div>
    {kind === "none" && <div className={`grace-option ${graceAvailable ? "available" : "unavailable"}`}><ShieldCheck size={16}/><span><strong>{graceAvailable ? uiText("مهلة الاستمرار متاحة", "Grace day available") : graceStillActive ? uiText("مهلة الاستمرار فعّالة أصلًا", "Grace period already active") : uiText("مهلة الاستمرار استُخدمت", "Grace day already used")}</strong><small>{graceAvailable ? uiText("يُجمّد الستريك 24 ساعة بدل كسره فورًا. المهلة محدودة حتى تبقى الاستمرارية ذات معنى.", "Your streak is frozen for 24 hours instead of breaking immediately. Grace is limited so the streak remains meaningful.") : uiText("إذا أُجّل اليوم بدون مهلة متاحة ستبدأ السلسلة من جديد.", "If today is deferred without available grace, the streak restarts.")}</small></span></div>}
    <div className="recovery-preview"><div><small>{uiText("قبل التكييف", "Before adjustment")}</small><strong>{formatNumber(plan.pagesPerDay)} {uiText("صفحة", "pages")}</strong><small>{dateLabel(snapshot.estimatedCompletionDate)}</small></div><div><small>{uiText("بعد التكييف", "After adjustment")}</small><strong>{proposal.pages ? `${formatNumber(proposal.pages)} ${uiText("صفحة", "pages")}` : uiText(proposal.label, proposal.kind === "review" ? "Review only" : proposal.kind === "none" ? "Deferred" : "Redistributed")}</strong><small>{dateLabel(kind === "redistribute" ? snapshot.estimatedCompletionDate : afterDate)}</small></div><p>{uiText(proposal.note, proposal.kind === "half" ? "Today’s quota is reduced and the expected completion date is recalculated." : proposal.kind === "review" ? "New memorization is replaced with saved due reviews." : proposal.kind === "redistribute" ? "Remaining quota moves only to selected memorization days." : "The day is deferred; grace protects the streak only when available.")}</p></div>
    <div className="modal-footer"><button className="secondary-button" onClick={close}>{uiText("لا، أبقِ خطتي", "Keep my plan")}</button><button className="primary-button" onClick={approve}>{uiText("اعتماد التكييف", "Confirm adjustment")}</button></div>
  </div></div>;
}

function milestoneMessage(plan: PlanState) {
  const latest = plan.lastMilestone;
  if (latest?.date === todayKey()) {
    if (latest.type === "return") return uiText("عودتك اليوم إنجاز بحد ذاته؛ المهم أن تعود الرحلة وتستمر.", "Returning today is an achievement in itself — what matters is resuming the journey.");
    if (latest.type === "surah") return uiText(`أتممت سورة ${latest.surahName || ""}؛ بارك الله لك فيما حفظت.`, `You completed ${latest.surahName || "a surah"}; may your memorization be blessed.`);
    if (latest.type === "ayah100") return uiText("لقد أتممت مئة آية في رحلتك؛ مئة خطوة من نور بُنيت آيةً آية.", "You have completed 100 ayahs — one hundred steps built ayah by ayah.");
    if (latest.type === "ayah50") return uiText("لقد أتممت خمسين آية من نور، أضاء الله بها دربك.", "You have completed 50 ayahs — a meaningful milestone in your journey.");
    if (latest.type === "streak30") return uiText("ثلاثون يومًا من التعاهد؛ ثبات هادئ يستحق أن يُحفظ.", "Thirty days of consistency — a quiet rhythm worth keeping.");
    if (latest.type === "streak7") return uiText("سبعة أيام متتابعة؛ أدومها وإن قلّ.", "Seven consecutive days — small, sustainable steps.");
  }
  if (plan.streak >= 30) return uiText("ثلاثون يومًا من التعاهد؛ ثبات هادئ يستحق أن يُحفظ.", "Thirty days of consistency — a quiet rhythm worth keeping.");
  if (plan.streak >= 7) return uiText("أسبوع كامل من الاستمرارية؛ أدومها وإن قلّ.", "A full week of consistency — small, sustainable steps.");
  if (plan.completedAyahs >= 100) return uiText("مئة آية أتممتها في رحلتك؛ استمر على الوتيرة التي تستطيع دوامها.", "You have completed 100 ayahs; keep the pace you can sustain.");
  if (plan.completedAyahs >= 50) return uiText("خمسون آية محفوظة في سجل رحلتك؛ خطوة جميلة بُنيت يومًا بعد يوم.", "Fifty ayahs completed in your journey, built one day at a time.");
  return uiText("ابدأ بخطوة اليوم؛ الاستمرارية تُبنى من ورد واحد في كل مرة.", "Start with today’s step; consistency is built one quota at a time.");
}

function assessmentScore(a?: Assessment): 1 | 2 | 3 | 4 { return a === "strong" ? 4 : a === "average" ? 3 : a === "review" ? 2 : 1; }
function expectedCompletionDate(plan: PlanState) {
  const snapshot = buildPlanSnapshot(plan);
  return new Date(`${snapshot.estimatedCompletionDate}T12:00:00`);
}
function activitiesForDate(plan: PlanState, date: string) { return (plan.activities || []).filter(a => a.date === date || a.originalDate === date).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
function activityLabel(a: ActivityRecord) { const kind = a.kind === "review" ? uiText("مراجعة", "Review") : a.kind === "external" ? uiText("حفظ خارج التطبيق", "Outside-app memorization") : uiText("حفظ", "Memorization"); const pages = a.pageFrom === a.pageTo ? `${uiText("صفحة", "Page")} ${ar(a.pageFrom)}` : `${uiText("صفحات", "Pages")} ${ar(a.pageFrom)}–${ar(a.pageTo)}`; return `${kind}: ${pages}`; }

function Dashboard({ plan, modal, view, toast, isDemoMode, disableDemo }: { plan: PlanState; modal: (m: Modal) => void; view: (v: View) => void; toast: (text: string) => void; isDemoMode?: boolean; disableDemo?: () => void }) {
  const page = Math.max(1, Math.min(604, Math.floor(plan.currentPosition)));
  const q = usePage(page);
  const progress = Math.min(100, Math.round(plan.completedPages / Math.max(1, 605 - plan.startPage) * 100));
  const due = plan.reviewQueue.filter(item => item.nextReview <= todayKey());
  const snapshot = buildPlanSnapshot(plan);
  const graceActive = Boolean(plan.graceActiveUntil && new Date(plan.graceActiveUntil).getTime() > Date.now());
  const targetBehind = plan.goalMode === "target" && plan.targetDate && snapshot.targetFeasible === false;
  const shareAchievement = async () => {
    const message = uiText(`أتممت ${Math.round(plan.completedPages)} صفحة و${plan.completedAyahs || 0} آية في رحلة أدوم، واستمراريتي ${plan.streak} أيام.`, `I completed ${Math.round(plan.completedPages)} pages and ${plan.completedAyahs || 0} ayahs in Adwam, with a ${plan.streak}-day streak.`);
    try {
      if (navigator.share) await navigator.share({ title: uiText("إنجازي في أدوم", "My Adwam achievement"), text: message });
      else { await navigator.clipboard.writeText(message); toast(uiText("تم نسخ بطاقة الإنجاز كنص للمشاركة.", "Achievement text copied for sharing.")); }
    } catch { /* user cancelled share */ }
  };

  const todayCompleted = plan.completedDates.includes(todayKey());
  return (
    <div>
      {isDemoMode && (
        <div className="demo-active-banner" style={{
          background: "var(--primary-subtle, #fbf7f0)",
          border: "1px dashed var(--primary, #907052)",
          borderRadius: "10px",
          padding: "10px 14px",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          fontSize: "12px",
          color: "var(--foreground)"
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Sparkles size={15} style={{ color: "var(--primary, #907052)", flexShrink: 0 }} />
            <span>
              <strong>{uiText("وضع العرض للحكام مفعّل: ", "Judges demo active: ")}</strong>
              {uiText("البيانات المعروضة تجريبية ومعزولة عن خطتك الشخصية.", "Displayed data is synthetic and isolated from your personal plan.")}
            </span>
          </span>
          {disableDemo && (
            <button
              onClick={disableDemo}
              className="primary-small"
              style={{ padding: "4px 10px", fontSize: "11px", whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {uiText("استعادة خطتي الحقيقية", "Restore real plan")}
            </button>
          )}
        </div>
      )}
      <div className="dashboard-grid">
      <div className="left-column">
        {todayCompleted && (
          <div className="daily-completion-banner">
            <span><Check size={16}/></span>
            <div>
              <strong>{uiText("تم ورد اليوم", "Today’s quota is complete")}</strong>
              <p>{uiText("بارك الله في ثباتك؛ وردك القادم جاهز، ومراجعاتك ستظهر في موعدها.", "A steady step is saved. Your next quota is ready and reviews will appear when due.")}</p>
            </div>
          </div>
        )}
        <section className="card wird-card">
          <div className="wird-meta">
            <span className="wird-kicker">
              {todayCompleted ? (
                <span style={{ color: "#2e7d32", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Check size={13}/>{uiText("وردك القادم", "Upcoming quota")}
                </span>
              ) : uiText("وردك اليوم", "Today’s quota")}
              {" "}<strong>• {uiText("الصفحة", "Page")} {ar(page)}</strong>
            </span>
            <span className="date-badge">{formatNumber(plan.pagesPerDay)} {uiText("صفحة", "pages")}</span>
          </div>
          <div className="wird-content">
            <p className="wird-surah">{q.loading ? uiText("جارٍ التحقق…", "Verifying…") : q.data?.surahNames.join("، ")}</p>
            <h2 className="wird-title">{q.data ? `${uiText("الآيات", "Ayahs")} ${ar(q.data.firstVerse.numberInSurah)}–${ar(q.data.lastVerse.numberInSurah)}` : `${uiText("الصفحة", "Page")} ${ar(page)}`}</h2>
            <p className="wird-verses">{q.error ? uiText("لا نعرض آيات غير متحققة", "Unverified verses are hidden") : uiText("من مصدر موثق", "Approved source")}</p>
            <button className="view-wird" onClick={() => modal("reader")}>
              {uiText("افتح الورد", "Open quota")} <ChevronLeft size={13}/>
            </button>
          </div>
          <div className="divider"/>
          <div className="action-row">
            <button className="main-action done-action" onClick={() => modal("reader")}>
              <Check size={15}/>{todayCompleted ? uiText("افتح الورد القادم", "Open next quota") : uiText("افتح الورد", "Open quota")}
            </button>
            {!todayCompleted && (
              <button className="main-action miss-action" onClick={() => modal("recovery")}>
                <span className="action-icon">◷</span>{uiText("لم أتمكن اليوم", "I could not today")}
              </button>
            )}
          </div>
        </section>

        <section>
          <div className="section-heading">
            <div>
              <h2>{uiText("مراجعتي اليوم", "Today’s reviews")}</h2>
              <p>{uiText("من نتائجك وتقييمك الفعلي.", "Based on your saved results and assessments.")}</p>
            </div>
            <button className="link-button" onClick={() => view("review")}>
              {uiText("مراجعتي", "My reviews")} <ChevronLeft size={12}/></button>
          </div>
          {due.length ? (
            <div className="review-list">
              {due.slice(0, 3).map(item => (
                <div className="review-item" key={item.id}>
                  <span>{uiText("صفحة", "Page")} {ar(item.page)} · {uiText("آية", "Ayah")} {ar(item.ayah)}</span>
                  <small>{item.reason} · {dateLabel(item.nextReview)}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">{uiText("لا توجد مراجعات مجدولة اليوم.", "No reviews scheduled today.")}</div>
          )}
        </section>

        {/* Compact Weekly Plan Summary */}
        <section className="card week-plan-summary-card">
          <div className="section-heading">
            <div>
              <h2>{uiText("خطة الأسبوع", "Weekly Plan")}</h2>
              <p>{uiText("ملخص نظامك الأسبوعي وإيقاعك المعتمد.", "Summary of your weekly schedule and pace.")}</p>
            </div>
          </div>
          <div className="week-plan-summary-chips">
            <span className="week-plan-summary-badge memorize">
              {ar(plan.activeDays.length)} {uiText("أيام حفظ", "memorization days")}
            </span>
            <span className="week-plan-summary-badge pace">
              {formatNumber(plan.pagesPerDay)} {uiText("صفحة لكل جلسة", "pages per session")}
            </span>
            <span className="week-plan-summary-badge rest">
              {ar(7 - plan.activeDays.length)} {uiText("أيام راحة", "rest days")}
            </span>
          </div>
        </section>
      </div>

      <div className="right-column">
        <section className="card ring-card">
          <div className="ring" style={{ background: `conic-gradient(#907052 0 ${progress}%, #ece2d5 ${progress}% 100%)` }}>
            <div className="ring-inner">
              <span className="ring-value">{ar(progress)}٪</span>
              <span className="ring-label">{uiText("من رحلتك", "of your journey")}</span>
            </div>
          </div>
          <h2 className="ring-title">{progress ? uiText("تقدم محفوظ", "Saved progress") : uiText("بداية مباركة بإذن الله", "A blessed beginning")}</h2>
          <div className="streak-highlight">
            <Sparkles size={15}/>
            <strong>{ar(plan.streak)}</strong>
            <span>{uiText("يوم استمرارية", "day streak")}</span>
          </div>
          {graceActive && (
            <div className="grace-banner">
              <ShieldCheck size={14}/>
              <span>
                <strong>{uiText("مهلة الاستمرار فعّالة", "Grace day active")}</strong>
                <small>{uiText("سلسلتك محفوظة مؤقتًا؛ عُد لوردك قبل انتهاء المهلة.", "Your streak is temporarily protected; return before the grace period ends.")}</small>
              </span>
            </div>
          )}
          <div className="ring-stats">
            <div className="ring-stat">
              <b>{ar(plan.completedAyahs || 0)}</b>
              <span>{uiText("آية مكتملة", "completed ayahs")}</span>
            </div>
            <div className="ring-stat">
              <b>{ar(plan.missedDays)}</b>
              <span>{uiText("يوم مؤجل", "deferred days")}</span>
            </div>
          </div>
          <div className="goal-countdown">
            <div>
              <small>{uiText("المتبقي لهدفك", "Remaining for your goal")}</small>
              <strong>{ar(snapshot.remainingCalendarDays)} {uiText("يومًا", "days")}</strong>
            </div>
            <div>
              <small>{uiText("صفحات متبقية", "Pages remaining")}</small>
              <strong>{ar(Math.ceil(snapshot.remainingPages))}</strong>
            </div>
          </div>
          <div className="expected-date">
            <small>{uiText("الإكمال المتوقع حسب وتيرتك الحالية", "Expected completion at your current pace")}</small>
            <strong>{dateLabel(expectedCompletionDate(plan))}</strong>
            {plan.goalMode === "target" && plan.targetDate && (
              <span className={targetBehind ? "target-status behind" : "target-status on-track"}>
                {targetBehind ? uiText(`تحتاج تقريبًا ${formatNumber(snapshot.requiredPagesPerSession || plan.pagesPerDay)} صفحة في يوم الحفظ للحفاظ على موعدك المستهدف.`, `You need about ${formatNumber(snapshot.requiredPagesPerSession || plan.pagesPerDay)} pages per memorization day to keep the target.`) : uiText(`على المسار نحو موعدك المستهدف: ${dateLabel(plan.targetDate)}`, `On track for your target: ${dateLabel(plan.targetDate)}`)}
              </span>
            )}
          </div>
          <p className="milestone-message">{milestoneMessage(plan)}</p>
          {plan.completedPages > 0 && (
            <button className="achievement-share" onClick={shareAchievement}>
              <Share2 size={14}/>{uiText("شارك إنجازًا بدون بيانات شخصية", "Share an achievement without personal data")}
            </button>
          )}
        </section>

        {/* Compact Upcoming Days */}
        <section className="card calendar-card compact-upcoming-card">
          <div className="calendar-title">
            <h3>{uiText("الأيام القادمة", "Coming days")}</h3>
            <button className="calendar-link" onClick={() => view("calendar")}>{uiText("التقويم الكامل", "Full calendar")}</button>
          </div>
          <div className="week-preview-list">
            {Array.from({ length: 7 }, (_, offset) => {
              const date = new Date();
              date.setHours(12, 0, 0, 0);
              date.setDate(date.getDate() + offset);
              const key = todayKey(date);
              const idx = (date.getDay() + 1) % 7;
              const active = plan.activeDays.includes(idx);
              const reviews = plan.reviewQueue.filter(r => r.nextReview === key);
              const activeBefore = Array.from({ length: offset }, (_, j) => {
                const d = new Date();
                d.setHours(12, 0, 0, 0);
                d.setDate(d.getDate() + j);
                return plan.activeDays.includes((d.getDay() + 1) % 7) ? 1 : 0;
              }).reduce((a: number, b: number) => a + b, 0);
              const plannedPage = Math.min(604, Math.floor(plan.currentPosition + activeBefore * plan.pagesPerDay));

              let taskText = "";
              if (active) {
                taskText = reviews.length > 0
                  ? `${uiText("حفظ", "Memorize")} ص${ar(plannedPage)} + ${uiText("مراجعة", "review")}`
                  : `${uiText("حفظ", "Memorize")} ص${ar(plannedPage)}`;
              } else {
                taskText = reviews.length > 0 ? uiText("مراجعة", "Review") : uiText("راحة", "Rest");
              }

              return (
                <button
                  key={key}
                  className={`week-preview-row ${offset === 0 ? "today" : ""} ${active ? "status-memorize" : "status-rest"}`}
                  onClick={() => view("calendar")}
                >
                  <span>
                    <b>{offset === 0 ? uiText("اليوم", "Today") : new Intl.DateTimeFormat(document.documentElement.lang === "en" ? "en-US" : "ar-SA-u-ca-gregory", { weekday: "short", day: "numeric" }).format(date)}</b>
                    <small>{taskText}</small>
                  </span>
                  {reviews.length > 0 && <em>{reviews.length} {uiText("مراجعة", "review")}</em>}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  </div>
  );
}

function ReviewCenter({ plan, startReview, startCycle }: { plan: PlanState; startReview: (item: ReviewItem) => void; startCycle: () => void }) {
  const [drilldown, setDrilldown] = useState<"mastered" | "needs_review" | "completed" | null>(null);

  // Compute mastered pages (distinct pages assessed as strong)
  const masteredPages = Array.from(new Set(
    (plan.masteryHistory || []).filter(m => m.assessment === "strong").map(m => m.page)
  ));
  const masteredCount = masteredPages.length || (plan.completedPages > 0 ? Math.min(plan.completedPages, Math.floor(plan.completedPages * 0.8)) : 0);

  // Group mastery history by page to show real progression over time (no fake history)
  const progressionByPage = new Map<number, Array<{ date: string; assessment: Assessment; score: number }>>();
  (plan.masteryHistory || []).forEach(m => {
    const list = progressionByPage.get(m.page) || [];
    list.push({ date: m.date, assessment: m.assessment, score: m.score });
    progressionByPage.set(m.page, list);
  });
  const pagesWithHistory = Array.from(progressionByPage.entries()).slice(-6);

  return (
    <div className="view-shell">
      <section className="card page-panel">
        <div className="section-heading">
          <div>
            <h2>{uiText("المراجعة والإتقان", "Review & mastery")}</h2>
            <p>{uiText("مراجعاتك الحالية وتطور جودة الحفظ في مكان واحد — اضغط على أي رقم لعرض تفاصيل المواضع.", "Your current reviews and mastery history in one place — tap any counter to see exact items.")}</p>
          </div>
        </div>

        {/* Tappable Summary Counters with Drill-down */}
        <div className="compact-mastery-summary">
          <button
            className="mastery-summary-btn"
            onClick={() => setDrilldown("needs_review")}
            style={{ border: "1px solid var(--border)", background: "var(--secondary)", borderRadius: 15, padding: 13, display: "grid", gap: 5, textAlign: "start", cursor: "pointer" }}
          >
            <small style={{ fontSize: 11, color: "var(--muted-foreground)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {uiText("تحتاج مراجعة", "Needs review")} <ChevronLeft size={13}/>
            </small>
            <strong style={{ fontSize: 22, color: "#b45309" }}>{ar(plan.reviewQueue.length)}</strong>
          </button>

          <button
            className="mastery-summary-btn"
            onClick={() => setDrilldown("mastered")}
            style={{ border: "1px solid var(--border)", background: "var(--secondary)", borderRadius: 15, padding: 13, display: "grid", gap: 5, textAlign: "start", cursor: "pointer" }}
          >
            <small style={{ fontSize: 11, color: "var(--muted-foreground)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {uiText("متقن", "Mastered")} <ChevronLeft size={13}/>
            </small>
            <strong style={{ fontSize: 22, color: "#2e7d32" }}>{ar(masteredCount)}</strong>
          </button>

          <button
            className="mastery-summary-btn"
            onClick={() => setDrilldown("completed")}
            style={{ border: "1px solid var(--border)", background: "var(--secondary)", borderRadius: 15, padding: 13, display: "grid", gap: 5, textAlign: "start", cursor: "pointer" }}
          >
            <small style={{ fontSize: 11, color: "var(--muted-foreground)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {uiText("صفحات مكتملة", "Completed pages")} <ChevronLeft size={13}/>
            </small>
            <strong style={{ fontSize: 22, color: "var(--primary)" }}>{ar(plan.completedPages)}</strong>
          </button>
        </div>

        {/* Drilldown Modal */}
        {drilldown && (
          <div className="overlay" onClick={() => setDrilldown(null)}>
            <div className="modal drilldown-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-top">
                <div>
                  <span className="modal-subtitle">{uiText("تفاصيل القائمة", "List Details")}</span>
                  <h2 className="modal-title">
                    {drilldown === "needs_review" ? uiText("المواضع التي تحتاج مراجعة", "Passages Needing Review") :
                     drilldown === "mastered" ? uiText("الصفحات المتقنة", "Mastered Pages") :
                     uiText("الصفحات المكتملة في رحلتك", "Completed Pages in Your Journey")}
                  </h2>
                </div>
                <button className="close-button" onClick={() => setDrilldown(null)} aria-label={uiText("إغلاق", "Close")}><X size={15}/></button>
              </div>
              <div className="drilldown-list">
                {drilldown === "needs_review" && (
                  plan.reviewQueue.length ? plan.reviewQueue.map(item => {
                    const meta = getPageMetadata(item.page);
                    return (
                      <div className="drilldown-item" key={item.id}>
                        <div>
                          <strong>{uiText("صفحة", "Page")} {ar(item.page)} · {uiText(meta.surahName, meta.surahEnglishName)} · {uiText("الآية", "Ayah")} {ar(item.ayah)}</strong>
                          <small>{item.reason} · {dateLabel(item.nextReview)}</small>
                        </div>
                        <button className="primary-small" onClick={() => { setDrilldown(null); startReview(item); }}>
                          {uiText("راجع الآن", "Review now")}
                        </button>
                      </div>
                    );
                  }) : <div className="empty-state">{uiText("لا توجد عناصر تحتاج مراجعة الآن.", "No review items need action.")}</div>
                )}
                {drilldown === "mastered" && (
                  (masteredPages.length ? masteredPages : [Math.max(1, Math.floor(plan.currentPosition - 1))]).map(page => {
                    const meta = getPageMetadata(page);
                    return (
                      <div className="drilldown-item" key={page}>
                        <div>
                          <strong>{uiText("صفحة", "Page")} {ar(page)} · {uiText(meta.surahName, meta.surahEnglishName)}</strong>
                          <small>{uiText("الآيات", "Ayahs")} {ar(meta.ayahRangeLabel)}</small>
                        </div>
                        <span className="status-pill status-completed">{uiText("متقن", "Mastered")}</span>
                      </div>
                    );
                  })
                )}
                {drilldown === "completed" && (
                  (plan.activities || []).filter(a => a.completedPages > 0).map(a => {
                    const meta = getPageMetadata(a.pageFrom);
                    return (
                      <div className="drilldown-item" key={a.id}>
                        <div>
                          <strong>{uiText("صفحة", "Page")} {ar(a.pageFrom === a.pageTo ? a.pageFrom : `${a.pageFrom}–${a.pageTo}`)} · {uiText(meta.surahName, meta.surahEnglishName)}</strong>
                          <small>{dateLabel(a.date)} · {formatNumber(a.completedPages)} {uiText("صفحة", "pages")}</small>
                        </div>
                        <span className="status-pill status-completed">{uiText("مكتمل", "Completed")}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Useful Mastery History: Progression Over Time */}
        {pagesWithHistory.length > 0 && (
          <div className="mastery-history" style={{ margin: "20px 0" }}>
            <div className="section-heading">
              <div>
                <h3>{uiText("تطور جودة الحفظ عبر الزمن", "Mastery Progression Over Time")}</h3>
                <p>{uiText("كيف تحسن حفظ الصفحات بين المراجعات والتقييمات المتتالية في سجلك.", "How pages evolved between successive reviews and assessments.")}</p>
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {pagesWithHistory.map(([pageNum, historyList]) => {
                const meta = getPageMetadata(pageNum);
                return (
                  <div className="mastery-progression-row" key={pageNum}>
                    <div className="mastery-progression-header">
                      <strong>{uiText("صفحة", "Page")} {ar(pageNum)} · {uiText(meta.surahName, meta.surahEnglishName)}</strong>
                      <small style={{ color: "var(--muted-foreground)" }}>{historyList.length} {uiText("جلسات محفوظة", "sessions recorded")}</small>
                    </div>
                    <div className="mastery-progression-steps">
                      {historyList.map((step, si) => (
                        <span key={si} className={`mastery-progression-step score-${step.score}`}>
                          <small style={{ fontSize: 9, opacity: 0.8 }}>{step.date.slice(5)}:</small>
                          <span>{step.assessment === "strong" ? uiText("متقن", "Mastered") : step.assessment === "average" ? uiText("جيد", "Good") : step.assessment === "review" ? uiText("يحتاج تثبيت", "Review") : uiText("لم يكتمل", "Not complete")}</span>
                          {si < historyList.length - 1 && <span style={{ marginInlineStart: 4, opacity: 0.5 }}>→</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actionable Review Items List */}
        <div className="section-heading review-heading">
          <div>
            <h3>{uiText("المراجعات القادمة", "Upcoming reviews")}</h3>
            <p>{uiText("تظهر هنا فقط المواضع التي تحتاج إجراءً فعليًا مع سبب المراجعة والتوجيه الموصى به.", "Only passages that need action appear here with clear reason and recommended action.")}</p>
          </div>
        </div>

        {plan.reviewQueue.length ? (
          <div className="review-center-list">
            {plan.reviewQueue.map(item => {
              const meta = getPageMetadata(item.page);
              const lastHistory = (plan.masteryHistory || []).filter(m => m.page === item.page).slice(-1)[0];
              const lastDate = lastHistory?.date || item.nextReview;
              const lastResult = lastHistory ? (lastHistory.assessment === "strong" ? uiText("متقن", "Strong") : lastHistory.assessment === "average" ? uiText("جيد", "Good") : uiText("يحتاج تثبيت", "Needs reinforcement")) : uiText("جديد في المراجعة", "New in review");

              return (
                <article className="actionable-review-item" key={item.id}>
                  <div className="actionable-review-header">
                    <h3>
                      {uiText("سورة", "Surah")} {uiText(meta.surahName, meta.surahEnglishName)} · {uiText("صفحة", "Page")} {ar(item.page)} · {uiText("الآية", "Ayah")} {ar(item.ayah)}
                    </h3>
                    <span className={`status-pill ${item.priority === "high" ? "status-rescheduled" : "status-review"}`}>
                      {item.priority === "high" ? uiText("أولوية عالية", "High priority") : uiText("مراجعة دورية", "Scheduled")}
                    </span>
                  </div>
                  <div className="actionable-review-body">
                    <div>
                      <b>{uiText("سبب المراجعة:", "Why this review:")}</b> {item.reason}
                    </div>
                    <div>
                      <small>
                        {uiText("آخر تقييم:", "Last assessment:")} <b>{lastResult}</b> · {uiText("تاريخ الجلسة:", "Date:")} {dateLabel(lastDate)}
                      </small>
                    </div>
                    <div>
                      <small style={{ color: "var(--foreground)" }}>
                        <b>{uiText("التوجيه الموصى به:", "Recommended action:")}</b> {uiText("تكرار الورد والاستماع للآيات المحددة قبل التسميع لتثبيت الحفظ.", "Repeat passage and listen to ayahs before recitation to consolidate memorization.")}
                      </small>
                    </div>
                  </div>
                  <div className="actionable-review-footer">
                    <time style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                      {uiText("الموعد المجدول:", "Scheduled date:")} {dateLabel(item.nextReview)}
                    </time>
                    <button className="primary-button" onClick={() => startReview(item)}>
                      {uiText("راجع الآن", "Review now")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">{uiText("لا توجد مراجعات تحتاج إجراءً الآن. كل مواضعك المنجزة مستقرة.", "No reviews need action right now. All your completed passages are consolidated.")}</div>
        )}

        {/* Full Review Cycle Option */}
        {plan.currentPosition > plan.totalPages && (
          <div className="cycle-card ready" style={{ marginTop: 18 }}>
            <div>
              <strong>{uiText("ابدأ دورة مراجعة شاملة", "Start a full review cycle")}</strong>
              <small>{uiText("أكملت هدف الحفظ؛ أنشئ دورة مراجعة من سجلك دون تصفير تقدمك.", "Build a review cycle from your saved history without resetting progress.")}</small>
            </div>
            <button className="primary-small" onClick={startCycle}>{uiText("إنشاء دورة المراجعة", "Create review cycle")}</button>
          </div>
        )}
      </section>
    </div>
  );
}

function Calendar({ plan, save, toast }: { plan: PlanState; save: (plan: PlanState) => void; toast: (text: string) => void }) {
  const [tab, setTab] = useState<"month" | "week" | "history">("month");
  const [selected, setSelected] = useState(todayKey());
  const [detailOpen, setDetailOpen] = useState(false);
  const [reportDrilldown, setReportDrilldown] = useState<"completed_pages" | "sessions" | "time" | "streak" | null>(null);
  const [externalOpen, setExternalOpen] = useState(false);
  const [externalPage, setExternalPage] = useState(String(Math.max(1, Math.floor(plan.currentPosition))));
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const leadingBlanks = (monthStart.getDay() + 1) % 7; // Saturday = 0
  const selectedActivities = activitiesForDate(plan, selected);
  const selectedReviews = plan.reviewQueue.filter(r => r.nextReview === selected);
  const selectedDateObj = new Date(`${selected}T12:00:00`);
  const planDayIndex = (selectedDateObj.getDay() + 1) % 7;
  const isPlannedMemorizationDay = plan.activeDays.includes(planDayIndex);
  const selectedOverride = plan.recovery.find(r => r.date === selected);
  const selectedQuota = selectedOverride?.quota ?? plan.pagesPerDay;

  const plannedPageFor = (dateKey: string) => {
    const target = new Date(`${dateKey}T12:00:00`);
    const today = new Date(`${todayKey()}T12:00:00`);
    if (target <= today) return Math.max(1, Math.floor(plan.currentPosition));
    let activeBefore = 0;
    for (let d = new Date(today); d < target; d.setDate(d.getDate() + 1)) {
      const idx = (d.getDay() + 1) % 7;
      if (plan.activeDays.includes(idx)) activeBefore += 1;
    }
    return Math.min(604, Math.max(1, Math.floor(plan.currentPosition + activeBefore * plan.pagesPerDay)));
  };
  const selectedPlannedPage = plannedPageFor(selected);
  const selectedMeta = getPageMetadata(selectedPlannedPage);

  // Explicit, meaningful statuses without generic "قادم"
  const statusFor = (date: string): "completed" | "partial" | "rescheduled" | "memorize_review" | "memorize" | "review" | "rest" => {
    const acts = activitiesForDate(plan, date);
    if (acts.some(a => a.status === "completed")) return "completed";
    if (acts.some(a => a.status === "partial")) return "partial";
    if (plan.recovery.some(r => r.date === date && r.kind === "redistribute")) return "rescheduled";
    if (plan.recovery.some(r => r.date === date && r.kind === "none")) return "rest";
    if (plan.calendarStatuses[date] === "vacation") return "rest";
    if (plan.completedDates.includes(date)) return "completed";

    const dObj = new Date(`${date}T12:00:00`);
    const dayIdx = (dObj.getDay() + 1) % 7;
    const isActiveDay = plan.activeDays.includes(dayIdx);
    const revs = plan.reviewQueue.filter(r => r.nextReview === date);

    if (isActiveDay) {
      return revs.length > 0 ? "memorize_review" : "memorize";
    } else {
      return revs.length > 0 ? "review" : "rest";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "completed": return uiText("مكتمل", "Completed");
      case "partial": return uiText("جزئي", "Partial");
      case "rescheduled": return uiText("مؤجل / معاد جدولته", "Rescheduled");
      case "memorize_review": return uiText("حفظ + مراجعة", "Memorize & Review");
      case "memorize": return uiText("حفظ", "Memorize");
      case "review": return uiText("مراجعة", "Review");
      case "rest": return uiText("راحة", "Rest");
      default: return uiText("حفظ", "Memorize");
    }
  };

  const apply = (status: "light" | "vacation" | "increased") => {
    const quota = status === "vacation" ? 0 : status === "light" ? Math.max(.25, plan.pagesPerDay / 2) : plan.pagesPerDay + Math.max(.5, plan.pagesPerDay * .5);
    const label = status === "vacation" ? uiText("راحة لهذا اليوم", "Rest for this day") : status === "light" ? uiText("ورد خفيف لهذا اليوم", "Light quota for this day") : uiText("زيادة ورد هذا اليوم", "Increased quota for this day");
    const record = { date: selected, minutes: "none" as const, approved: true, label, quota, kind: status === "vacation" ? "none" as const : status === "light" ? "half" as const : "redistribute" as const };
    save({ ...plan, calendarStatuses: { ...plan.calendarStatuses, [selected]: status }, recovery: [...plan.recovery.filter(r => r.date !== selected), record] });
    toast(uiText(`تم تطبيق «${label}» على ${dateLabel(selected)} فقط.`, `${label} applied to ${dateLabel(selected)} only.`));
  };

  const addExternal = () => {
    const page = Math.max(1, Math.min(604, Number(externalPage) || 1));
    const id = `external-${Date.now()}`;
    const meta = getPageMetadata(page);
    const rec: ActivityRecord = { id, date: selected, kind: "external", pageFrom: page, pageTo: page, surahNames: [meta.surahName], plannedPages: 1, completedPages: 1, assessment: "average", status: "completed", source: "outside_app", createdAt: new Date().toISOString() };
    save({
      ...plan,
      activities: [...(plan.activities || []), rec],
      completedPages: plan.completedPages + 1,
      currentPosition: Math.max(plan.currentPosition, page + 1),
      completedDates: plan.completedDates.includes(selected) ? plan.completedDates : [...plan.completedDates, selected],
      calendarStatuses: { ...plan.calendarStatuses, [selected]: "completed" },
      masteryHistory: [...(plan.masteryHistory || []), { date: selected, page, assessment: "average", score: 3, sourceActivityId: id }],
    });
    setExternalOpen(false);
    toast(uiText("تم تسجيل الحفظ خارج التطبيق وإضافته للتقرير.", "Outside-app memorization was added to the report."));
  };

  const currentSatIndex = (now.getDay() + 1) % 7;
  const weekStart = new Date(now); weekStart.setHours(12, 0, 0, 0); weekStart.setDate(now.getDate() - currentSatIndex);
  const weekDates = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i, 12));
  const history = [...(plan.activities || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const historyCompletedPages = history.reduce((sum, a) => sum + (a.completedPages || 0), 0);
  const historyMinutes = history.reduce((sum, a) => sum + (a.durationMinutes || 0), 0);
  const completedSessions = history.filter(a => a.status === "completed").length;

  return (
    <div className="view-shell">
      <section className="card page-panel calendar-page">
        <div className="section-heading">
          <div>
            <h2>{uiText("تقويم الرحلة", "Journey calendar")}</h2>
            <p>{uiText("ما خُطط له، وما أُنجز فعلًا، وما يحتاج مراجعة — في خط زمني واحد.", "Planned work, actual progress and reviews in one timeline.")}</p>
          </div>
          <button className="secondary-button" onClick={() => setExternalOpen(v => !v)}>
            <Check size={14}/>
            {uiText("تسجيل حفظ خارج أدوم", "Log outside memorization")}
          </button>
        </div>

        {externalOpen && (
          <div className="external-log">
            <label>
              {uiText("رقم الصفحة", "Page")}
              <input className="text-input" value={externalPage} onChange={e => setExternalPage(e.target.value)} inputMode="numeric" />
            </label>
            <button className="primary-button" onClick={addExternal}>
              {uiText("إضافة للتقرير", "Add to report")}
            </button>
          </div>
        )}

        <div className="view-tabs">
          {[["month", "شهري", "Month"], ["week", "هذا الأسبوع", "This week"], ["history", "تقرير الرحلة", "Journey report"]].map(([id, a, e]) => (
            <button key={id} className={`view-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id as typeof tab)}>
              {uiText(a, e)}
            </button>
          ))}
        </div>

        {tab === "month" && (
          <>
            <div className="calendar-month-title">
              <strong>{new Intl.DateTimeFormat(document.documentElement.lang === "en" ? "en-US" : "ar-SA-u-ca-gregory", { month: "long", year: "numeric" }).format(now)}</strong>
              <small>{uiText("اضغط على أي يوم لرؤية تفاصيله فورًا", "Tap any day to see its details immediately")}</small>
            </div>
            <div className="full-calendar">
              {dayNames.map((day, i) => (
                <div className="calendar-weekday" key={day}>
                  {uiText(day, ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][i])}
                </div>
              ))}
              {Array.from({ length: leadingBlanks }, (_, i) => <div className="calendar-blank" key={`blank-${i}`}/>)}
              {Array.from({ length: count }, (_, i) => {
                const date = todayKey(new Date(now.getFullYear(), now.getMonth(), i + 1, 12));
                const status = statusFor(date);
                const acts = activitiesForDate(plan, date);
                const reviews = plan.reviewQueue.filter(r => r.nextReview === date);
                const isToday = date === todayKey();
                return (
                  <button
                    className={`calendar-cell status-${status} ${date === selected ? "selected" : ""} ${isToday ? "is-today" : ""}`}
                    key={date}
                    onClick={() => { setSelected(date); setDetailOpen(true); }}
                  >
                    <span className="calendar-date-number">{i + 1}</span>
                    <small>{statusLabel(status)}</small>
                    {(acts.length > 0 || reviews.length > 0) && <i className="activity-dot"/>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {tab === "week" && (
          <div className="week-view">
            <div className="week-view-head">
              <div>
                <strong>{uiText("هذا الأسبوع", "This week")}</strong>
                <small>{uiText("كل يوم يظهر بوضعه الحقيقي: حفظ، مراجعة، راحة، أو منجز.", "Each day shows its actual state: memorization, review, rest, or completed.")}</small>
              </div>
            </div>
            <div className="week-cards">
              {weekDates.map((date, i) => {
                const key = todayKey(date);
                const status = statusFor(key);
                const plannedPage = plannedPageFor(key);
                const reviews = plan.reviewQueue.filter(r => r.nextReview === key);
                return (
                  <button
                    key={key}
                    className={`week-day-card ${key === todayKey() ? "today" : ""} status-${status}`}
                    onClick={() => { setSelected(key); setDetailOpen(true); }}
                  >
                    <span>{uiText(dayNames[i], ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][i])}</span>
                    <b>{date.getDate()}</b>
                    <small>{status === "memorize" ? `${uiText("حفظ", "Memorize")} · ص${ar(plannedPage)}` : status === "memorize_review" ? `${uiText("حفظ", "Memorize")} ص${ar(plannedPage)} + مراجعة` : statusLabel(status)}</small>
                    {reviews.length > 0 && <em>{reviews.length} {uiText("مراجعة", "review")}</em>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Journey Report Tab: Dedicated reporting without day modification controls */}
        {tab === "history" && (
          <div className="journey-report">
            <div className="report-summary">
              <div className="report-metric-card memo" onClick={() => setReportDrilldown("completed_pages")}>
                <small>{uiText("الصفحات المسجلة", "Pages logged")} <ChevronLeft size={12}/></small>
                <strong>{formatNumber(historyCompletedPages)}</strong>
              </div>
              <div className="report-metric-card review" onClick={() => setReportDrilldown("sessions")}>
                <small>{uiText("الجلسات المكتملة", "Completed sessions")} <ChevronLeft size={12}/></small>
                <strong>{ar(completedSessions)}</strong>
              </div>
              <div className="report-metric-card time" onClick={() => setReportDrilldown("time")}>
                <small>{uiText("وقت الجلسات", "Session time")} <ChevronLeft size={12}/></small>
                <strong>{ar(historyMinutes)} {uiText("د", "min")}</strong>
              </div>
              <div className="report-metric-card streak" onClick={() => setReportDrilldown("streak")}>
                <small>{uiText("الاستمرارية", "Streak")} <ChevronLeft size={12}/></small>
                <strong>{ar(plan.streak)} {uiText("أيام", "days")}</strong>
              </div>
            </div>

            {/* Drilldown Modal if open */}
            {reportDrilldown && (
              <div className="overlay" onClick={() => setReportDrilldown(null)}>
                <div className="modal drilldown-modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-top">
                    <div>
                      <span className="modal-subtitle">{uiText("تفاصيل المؤشر", "Metric Drill-down")}</span>
                      <h2 className="modal-title">
                        {reportDrilldown === "completed_pages" ? uiText("الصفحات المسجلة والمحفوظة", "Logged & Memorized Pages") :
                         reportDrilldown === "sessions" ? uiText("سجل الجلسات المكتملة", "Completed Sessions Record") :
                         reportDrilldown === "time" ? uiText("أوقات الجلسات ومددها", "Session Durations") :
                         uiText("سجل الاستمرارية والأيام المتتالية", "Streak & Consistency Record")}
                      </h2>
                    </div>
                    <button className="close-button" onClick={() => setReportDrilldown(null)} aria-label={uiText("إغلاق", "Close")}><X size={15}/></button>
                  </div>
                  <div className="drilldown-list">
                    {reportDrilldown === "completed_pages" && (
                      history.filter(a => a.completedPages > 0).map(a => {
                        const meta = getPageMetadata(a.pageFrom);
                        return (
                          <div className="drilldown-item" key={a.id}>
                            <div>
                              <strong>{uiText("صفحة", "Page")} {ar(a.pageFrom === a.pageTo ? a.pageFrom : `${a.pageFrom}–${a.pageTo}`)} · {uiText(meta.surahName, meta.surahEnglishName)}</strong>
                              <small>{dateLabel(a.date)} · {a.ayahFrom ? `${uiText("الآيات", "Ayahs")} ${ar(a.ayahFrom)}–${ar(a.ayahTo || a.ayahFrom)}` : `${formatNumber(a.completedPages)} ${uiText("صفحة", "pages")}`}</small>
                            </div>
                            <span className="status-pill status-completed">{a.assessment === "strong" ? uiText("متقن", "Mastered") : uiText("منجز", "Completed")}</span>
                          </div>
                        );
                      })
                    )}
                    {reportDrilldown === "sessions" && (
                      history.map(a => (
                        <div className="drilldown-item" key={a.id}>
                          <div>
                            <strong>{activityLabel(a)}</strong>
                            <small>{dateLabel(a.date)} · {a.source === "outside_app" ? uiText("خارج التطبيق", "Outside app") : uiText("داخل أدوم", "In Adwam")}</small>
                          </div>
                          <span className={`status-pill status-${a.status}`}>{a.status === "completed" ? uiText("مكتمل", "Completed") : uiText("جزئي", "Partial")}</span>
                        </div>
                      ))
                    )}
                    {reportDrilldown === "time" && (
                      history.map(a => (
                        <div className="drilldown-item" key={a.id}>
                          <div>
                            <strong>{activityLabel(a)}</strong>
                            <small>{dateLabel(a.date)}</small>
                          </div>
                          <b>{a.durationMinutes || 15} {uiText("دقيقة", "min")}</b>
                        </div>
                      ))
                    )}
                    {reportDrilldown === "streak" && (
                      <div style={{ padding: 14, textAlign: "center", display: "grid", gap: 6 }}>
                        <strong style={{ fontSize: 24, color: "var(--primary)" }}>{ar(plan.streak)} {uiText("أيام متتالية", "consecutive days")}</strong>
                        <small style={{ color: "var(--muted-foreground)" }}>{uiText("استمرارية مباركة بدون انقطاع. الورد اليومي يبني العادة الراسخة.", "Blessed consistency without interruption. Daily habit builds steadfast memorization.")}</small>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Report Timeline */}
            {history.length ? (
              <div className="report-timeline">
                {history.map(a => (
                  <article className="report-entry" key={a.id}>
                    <div className="report-date">
                      <strong>{dateLabel(a.date)}</strong>
                      <small>{a.source === "outside_app" ? uiText("خارج أدوم", "Outside Adwam") : uiText("داخل أدوم", "In Adwam")}</small>
                    </div>
                    <div>
                      <strong>{activityLabel(a)}</strong>
                      <small>
                        {a.status === "partial" ? uiText("إنجاز جزئي", "Partial completion") : a.status === "missed" ? uiText("لم يكتمل", "Not completed") : uiText("مكتمل", "Completed")}
                        {a.assessment ? ` · ${a.assessment === "strong" ? uiText("متقن", "Strong") : a.assessment === "average" ? uiText("جيد", "Good") : a.assessment === "review" ? uiText("يحتاج تثبيت", "Needs reinforcement") : uiText("غير مكتمل", "Not completed")}` : ""}
                      </small>
                    </div>
                    <span>{formatNumber(a.completedPages)} {uiText("صفحة", "pages")}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">{uiText("سيظهر تقرير رحلتك هنا بعد أول جلسة محفوظة.", "Your journey report will appear after the first saved session.")}</div>
            )}
          </div>
        )}
      </section>

      {/* Immediate Compact Modal for Selected Day (NO scrolling required) */}
      {detailOpen && (
        <div className="overlay" onClick={() => setDetailOpen(false)}>
          <div className="modal day-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-top">
              <div>
                <span className="modal-subtitle">{uiText("تفاصيل اليوم في خطتك", "Day details in your plan")}</span>
                <h2 className="modal-title">{dateLabel(selected)}</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`status-pill status-${statusFor(selected)}`}>
                  {statusLabel(statusFor(selected))}
                </span>
                <button className="close-button" onClick={() => setDetailOpen(false)} aria-label={uiText("إغلاق", "Close")}>
                  <X size={15}/>
                </button>
              </div>
            </div>

            <div className="day-plan-vs-actual">
              {/* Planned Section */}
              {statusFor(selected) === "rest" ? (
                <div className="day-section-card rest">
                  <strong>{uiText("يوم راحة", "Rest Day")}</strong>
                  <p>{uiText("يوم راحة مجدول وفق أيام خطتك الأسبوعية؛ لا يُطلب حفظ جديد لهذا اليوم.", "Scheduled rest day according to your weekly plan; no new quota is expected.")}</p>
                  {selectedReviews.length > 0 && (
                    <div className="day-meta-tags">
                      <span className="day-meta-tag">{uiText("مراجعة مجدولة:", "Scheduled review:")} {selectedReviews.map(r => `ص${ar(r.page)} (${r.reason})`).join("، ")}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="day-section-card planned">
                  <strong>
                    <span>{uiText("الورد المخطط", "Planned Quota")}</span>
                    <span>{formatNumber(selectedQuota)} {uiText("صفحة", "pages")}</span>
                  </strong>
                  <p>
                    {uiText("السورة", "Surah")}: <b>{uiText(selectedMeta.surahName, selectedMeta.surahEnglishName)}</b> · {uiText("الصفحة", "Page")} <b>{ar(selectedPlannedPage)}</b> · {uiText("الآيات", "Ayahs")} <b>{ar(selectedMeta.ayahRangeLabel)}</b>
                  </p>
                  <small>{uiText("بحسب أيام خطتك وموضعك الحالي في المصحف", "Based on your active plan days and current mushaf position")}</small>
                  {selectedReviews.length > 0 && (
                    <div className="day-meta-tags">
                      {selectedReviews.map(r => (
                        <span className="day-meta-tag" key={r.id}>
                          {uiText("مراجعة مجدولة:", "Scheduled review:")} {uiText("صفحة", "Page")} {ar(r.page)} ({r.reason})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actual Section */}
              {selectedActivities.length > 0 ? (
                <div className="day-section-card actual">
                  <strong>
                    <span>{uiText("المنجز الفعلي", "Actual Completed")}</span>
                    <span>{formatNumber(selectedActivities.reduce((s, a) => s + (a.completedPages || 0), 0))} {uiText("صفحة", "pages")}</span>
                  </strong>
                  {selectedActivities.map(a => (
                    <div key={a.id} style={{ display: "grid", gap: 3, marginTop: 4 }}>
                      <p><b>{activityLabel(a)}</b> — {a.surahNames?.join("، ") || uiText("سجل محفوظ", "Saved record")}{a.ayahFrom ? ` · ${uiText("الآيات", "Ayahs")} ${ar(a.ayahFrom)}–${ar(a.ayahTo || a.ayahFrom)}` : ""}</p>
                      <div className="day-meta-tags">
                        {a.assessment && (
                          <span className="day-meta-tag">
                            {uiText("جودة الحفظ:", "Mastery:")} {a.assessment === "strong" ? uiText("متقن", "Mastered") : a.assessment === "average" ? uiText("جيد", "Good") : a.assessment === "review" ? uiText("يحتاج تثبيت", "Needs reinforcement") : uiText("لم يكتمل", "Not completed")}
                          </span>
                        )}
                        {a.durationMinutes && (
                          <span className="day-meta-tag">{a.durationMinutes} {uiText("دقيقة", "minutes")}</span>
                        )}
                        {a.status === "partial" && (
                          <span className="day-meta-tag" style={{ color: "#b45309" }}>{uiText("إنجاز جزئي — رُحّل المتبقي تلقائيًا", "Partial — rest rescheduled")}</span>
                        )}
                        {(a.status === "rescheduled" || (a.status as string) === "recovery") && (
                          <span className="day-meta-tag">{uiText("معاد جدولته:", "Rescheduled:")} {a.reason}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed #d0e2ce", display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted-foreground)" }}>
                    <span>{uiText("المقارنة مع الخطة:", "Plan vs Actual:")}</span>
                    <b>{statusFor(selected) === "partial" ? uiText("إنجاز جزئي (50%)", "Partial (50%)") : uiText("مكتمل بالكامل (100%)", "Fully completed (100%)")}</b>
                  </div>
                </div>
              ) : (
                <div className="day-section-card">
                  <strong>{uiText("المنجز الفعلي", "Actual Completed")}</strong>
                  <p>{statusFor(selected) === "rest" ? uiText("يوم راحة — لم يُطلب حفظ.", "Rest day — no quota required.") : uiText("لم يُسجل إنجاز لهذا اليوم بعد. بانتظار إتمامك للورد.", "No activity recorded yet for this day. Awaiting your session.")}</p>
                </div>
              )}

              {/* Adjust this day only */}
              <div className="day-management" style={{ marginTop: 10 }}>
                <strong>{uiText("تعديل هذا اليوم فقط", "Adjust this day only")}</strong>
                <small>{uiText("سترى التغيير مباشرة داخل تفاصيل اليوم والتقويم.", "The change appears immediately in this day and the calendar.")}</small>
                <div>
                  <button onClick={() => { apply("light"); setDetailOpen(false); }}>{uiText("خفف ورد هذا اليوم", "Lighten this day")}</button>
                  <button onClick={() => { apply("vacation"); setDetailOpen(false); }}>{uiText("اجعله راحة", "Make it rest")}</button>
                  <button onClick={() => { apply("increased"); setDetailOpen(false); }}>{uiText("زد ورد هذا اليوم", "Increase this day")}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrivacyModal({ close }: { close: () => void }) {
  return (
    <div className="overlay" onClick={close}>
      <div className="modal privacy-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-top">
          <div>
            <span className="modal-subtitle">{uiText("أمان وشفافية البيانات", "Data Safety & Transparency")}</span>
            <h2 className="modal-title">{uiText("الخصوصية وحفظ البيانات", "Privacy & Data Protection")}</h2>
          </div>
          <button className="close-button" onClick={close} aria-label={uiText("إغلاق", "Close")}><X size={15}/></button>
        </div>

        <div className="privacy-section">
          <strong><ShieldCheck size={16}/>{uiText("ما هي البيانات التي نحفظها؟", "What data is stored?")}</strong>
          <p>{uiText("نحفظ بيانات حسابك الأساسية (الاسم والبريد)، وإعدادات خطة الحفظ (نقطة البداية، الورد اليومي، والأيام النشطة)، وسجل الإنجاز والتقييم الذاتي للحفظ والمراجعة.", "We store basic account details (name and email), your memorization plan settings (start page, daily quota, active days), and progress records with self-assessments.")}</p>
          <small>{uiText("التسجيلات الصوتية للتسميع تُعالج لحظيًا للتحقق ولا تُحفظ كملفات دائمة إلا في سياق تقييم الجلسة الحالية.", "Recitation audio is processed in real-time for word alignment and is not retained permanently outside active session feedback.")}</small>
        </div>

        <div className="privacy-section">
          <strong><BookOpen size={16}/>{uiText("لماذا نحفظ هذه البيانات؟", "Why is it stored?")}</strong>
          <p>{uiText("لحساب تقدمك بدقة في الختمة، وبناء جدول مراجعة ذكي مخصص لاحتياجك، ومزامنة خطتك بأمان بين أجهزتك المختلفة دون انقطاع.", "To calculate your exact journey progress, construct a personalized adaptive review schedule, and securely sync your plan across your devices.")}</p>
        </div>

        <div className="privacy-section">
          <strong><Sparkles size={16}/>{uiText("كيف تُستخدم بياناتك؟", "How is your data used?")}</strong>
          <p>{uiText("تُستخدم بياناتك حصرًا لخدمة رحلتك القرآنية داخل التطبيق. لا نبيع بياناتك، ولا نشاركها مع أي طرف ثالث، ولا نستخدمها لأي أغراض إعلانية.", "Your data is used strictly to serve your personal Quran journey within the app. We never sell, share with third parties, or use data for advertising.")}</p>
        </div>

        <div className="privacy-section">
          <strong><SettingsIcon size={16}/>{uiText("كيف تدير بياناتك؟", "How can you manage your data?")}</strong>
          <p>{uiText("يمكنك تعديل خطتك القرآنية في أي وقت من الإعدادات، أو تصدير إنجازك، أو تسجيل الخروج، أو طلب حذف حسابك وسجلك بالكامل.", "You can adjust your plan at any time in Settings, export your achievements, log out, or request complete deletion of your account and records.")}</p>
        </div>
      </div>
    </div>
  );
}

function Settings({
  close,
  journey,
  privacy,
  logout,
  ui,
  setUi,
  plan,
  isDemoMode,
  enableDemo,
  disableDemo,
  toast,
}: {
  close: () => void;
  journey: () => void;
  privacy: () => void;
  logout: () => void;
  ui: UiPreferences;
  setUi: (ui: UiPreferences) => void;
  plan: PlanState;
  isDemoMode: boolean;
  enableDemo: () => void;
  disableDemo: () => void;
  toast: (text: string) => void;
}) {
  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-top">
          <h2 className="modal-title">{uiText("إعدادات الحساب", "Account settings")}</h2>
          <button className="close-button" onClick={close} aria-label={uiText("إغلاق", "Close")}><X size={15}/></button>
        </div>
        <div className="settings-list">
          <button onClick={journey}>
            <SettingsIcon size={16}/>
            <span>
              <strong>{uiText("إعداد الرحلة", "Journey settings")}</strong>
              <small>{uiText("تعديل نقطة البداية والورد والأيام والهدف", "Edit starting point, quota, days and goal")}</small>
            </span>
            <ChevronLeft size={14}/>
          </button>
          <div className="preference-row">
            <strong>{uiText("اللغة", "Language")}</strong>
            <div>
              <button className={ui.language === "ar" ? "selected" : ""} onClick={() => setUi({ ...ui, language: "ar" })}>العربية</button>
              <button className={ui.language === "en" ? "selected" : ""} onClick={() => setUi({ ...ui, language: "en" })}>English</button>
            </div>
          </div>
          <div className="preference-row">
            <strong>{uiText("المظهر", "Theme")}</strong>
            <div>
              <button className={ui.theme === "sand" ? "selected" : ""} onClick={() => setUi({ ...ui, theme: "sand" })}>{uiText("سكينة", "Sand")}</button>
              <button className={ui.theme === "sage" ? "selected" : ""} onClick={() => setUi({ ...ui, theme: "sage" })}>{uiText("روضة", "Sage")}</button>
              <button className={ui.theme === "night" ? "selected" : ""} onClick={() => setUi({ ...ui, theme: "night" })}>{uiText("تهجد", "Night")}</button>
            </div>
          </div>
          <div className="preference-row">
            <strong>{uiText("قارئ التلاوة", "Reciter")}</strong>
            <select className="settings-select" value={ui.reciterId} onChange={e => setUi({ ...ui, reciterId: e.target.value as UiPreferences["reciterId"] })}>
              {RECITERS.map(r => <option value={r.id} key={r.id}>{uiText(r.ar, r.en)}</option>)}
            </select>
          </div>
          <button onClick={privacy}>
            <ShieldCheck size={16}/>
            <span>
              <strong>{uiText("الخصوصية وحفظ البيانات", "Privacy & Data Protection")}</strong>
              <small>{uiText("بياناتك مشفرة ومحمية، ولا تُستخدم إلا لخدمة تقدمك القرآني.", "Your data is secure and used solely for your Quranic journey.")}</small>
            </span>
            <ChevronLeft size={14}/>
          </button>
          {isDemoMode ? (
            <button className="demo-seed-button active" onClick={disableDemo} style={{ border: "1px solid var(--primary, #907052)" }}>
              <Sparkles size={16}/>
              <span>
                <strong>{uiText("إيقاف وضع العرض واستعادة خطتي الشخصية", "Exit Demo Mode & Restore Personal Plan")}</strong>
                <small>{uiText("العودة إلى بياناتك الشخصية المحفوظة.", "Return to your personal saved data.")}</small>
              </span>
            </button>
          ) : (
            <button className="demo-seed-button" onClick={enableDemo}>
              <Sparkles size={16}/>
              <span>
                <strong>{uiText("سيناريو عرض للحكام (بيانات معزولة)", "Judging Demo Scenario (Isolated)")}</strong>
                <small>{uiText("بيانات تجريبية للمعاينة فقط دون التأثير على خطتك الشخصية.", "Synthetic data for judging only, without affecting your personal plan.")}</small>
              </span>
            </button>
          )}
          <button onClick={logout}>
            <LogIn size={16}/>
            <span>
              <strong>{uiText("تسجيل الخروج", "Log out")}</strong>
              <small>{uiText("العودة إلى شاشة الدخول", "Return to sign in")}</small>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomeV2() {
  const [view, setView] = useState<View>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [plan, setPlan] = useState<PlanState>(loadPlan);
  const [session, setSession] = useState<Session>(() => loadSession() || { name: "", role: "student", contact: "" });
  const [ui, setUi] = useState<UiPreferences>(loadUi);
  const [toastText, setToastText] = useState("");
  const [ayah, setAyah] = useState<QuranAyah | null>(null);
  const [reviewItem, setReviewItem] = useState<ReviewItem | undefined>();
  const [celebration, setCelebration] = useState<{ title: string; text: string } | null>(null);
  const [celebrationModalData, setCelebrationModalData] = useState<{
    title: string;
    motivationalLine: string;
    streak: number;
    completedPage: number;
    nextPage: number;
  } | null>(null);
  const [readerIntent, setReaderIntent] = useState<{ mode: "read" | "recite"; completion: boolean }>({ mode: "read", completion: false });

  // Plan loading and Demo mode state
  const [isPlanLoaded, setIsPlanLoaded] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const realPlanRef = useRef<PlanState | null>(null);
  const isInitialSyncSkippedRef = useRef(true);

  document.documentElement.lang = ui.language;
  document.documentElement.dir = ui.language === "ar" ? "rtl" : "ltr";

  // Load remote plan from Supabase (single source of truth)
  useEffect(() => {
    let mounted = true;
    async function loadRemotePlan() {
      if (!session.userId) {
        setIsPlanLoaded(true);
        return;
      }
      try {
        const remote = await fetchPlanFromSupabase(session.userId);
        if (remote && mounted) {
          setPlan(remote);
          realPlanRef.current = remote;
          savePlan(remote);
          if (remote.started && !session.onboardingCompleted) {
            setSession(s => ({ ...s, onboardingCompleted: true }));
          }
        }
      } catch (err) {
        console.warn("[HomeV2] Error loading remote plan:", err);
      } finally {
        if (mounted) setIsPlanLoaded(true);
      }
    }
    loadRemotePlan();
    return () => { mounted = false; };
  }, [session.userId]);

  // Sync plan changes to Supabase (ONLY when plan is loaded and NOT in demo mode)
  useEffect(() => {
    if (!isPlanLoaded || isDemoMode || !session.userId || !plan.started) return;
    if (isInitialSyncSkippedRef.current) {
      isInitialSyncSkippedRef.current = false;
      return;
    }
    savePlan(plan);
    syncPlanToSupabase(plan, session.userId).catch(err => {
      console.warn("[HomeV2] Error syncing plan:", err);
    });
  }, [plan, session.userId, isPlanLoaded, isDemoMode]);

  useEffect(() => { saveUi(ui); document.documentElement.lang = ui.language; document.documentElement.dir = ui.language === "ar" ? "rtl" : "ltr"; }, [ui]);
  useEffect(() => saveSession(session), [session]);

  // Show onboarding ONLY once for genuine new students who have not completed onboarding and have no plan
  useEffect(() => {
    if (isPlanLoaded && !isDemoMode && !session.onboardingCompleted && !plan.started && session.role === "student" && modal === null) {
      setModal("onboarding");
    }
  }, [isPlanLoaded, isDemoMode, session.onboardingCompleted, plan.started, session.role]);

  useEffect(() => {
    if (!plan.graceActiveUntil) return;
    if (new Date(plan.graceActiveUntil).getTime() > Date.now()) return;
    if (plan.lastAction === "missed") setPlan(current => ({ ...current, streak: 0, graceActiveUntil: undefined }));
    else setPlan(current => ({ ...current, graceActiveUntil: undefined }));
  }, [plan.graceActiveUntil, plan.lastAction]);

  const toast = (text: string) => { setToastText(text); window.setTimeout(() => setToastText(""), 2800); };
  const logout = async () => {
    await signOutWithSupabase();
    localStorage.removeItem("adom-session");
    localStorage.removeItem("adom-plan");
    window.location.href = "/login";
  };
  const showCelebration = (title: string, text: string) => {
    setCelebration({ title, text });
    try { navigator.vibrate?.(25); } catch { /* optional haptic */ }
    window.setTimeout(() => setCelebration(null), 3600);
  };

  const handleFinishOnboarding = async (newPlan: PlanState) => {
    setPlan(newPlan);
    realPlanRef.current = newPlan;
    savePlan(newPlan);
    setModal(null);
    setSession(s => ({ ...s, onboardingCompleted: true }));

    if (session.userId && !isDemoMode) {
      await syncPlanToSupabase(newPlan, session.userId);
      await completeOnboardingInSupabase(session.userId);
    }
    toast(uiText("تم اعتماد خطتك وحفظها في حسابك بنجاح.", "Plan confirmed and saved to your account."));
  };

  const handleUpdatePlanSettings = async (updatedPlan: PlanState) => {
    setPlan(updatedPlan);
    realPlanRef.current = updatedPlan;
    savePlan(updatedPlan);
    setModal(null);

    if (session.userId && !isDemoMode) {
      const ok = await syncPlanToSupabase(updatedPlan, session.userId);
      if (ok) {
        toast(uiText("تم تحديث وحفظ خطتك في السحابة بنجاح.", "Plan updated and saved in the cloud successfully."));
      } else {
        toast(uiText("تم حفظ التعديلات محلياً، جارٍ محاولة المزامنة...", "Changes saved locally, syncing..."));
      }
    }
  };

  const enableDemoMode = () => {
    if (!window.confirm(uiText(
      "سيقوم وضع العرض للحكام بتحميل سيناريو بيانات تجريبية مؤقتة للمعاينة، ولن يتم تعديل أو استبدال بيانات خطتك الحقيقية في Supabase. متابعة؟",
      "Judges Demo Mode loads temporary synthetic data for preview, and will NOT overwrite or alter your real plan in Supabase. Continue?"
    ))) return;

    realPlanRef.current = plan; // Keep clean backup of real plan
    const now = new Date();
    const dates = Array.from({ length: 7 }, (_, i) => todayKey(new Date(now.getTime() - (6 - i) * 86400000)));
    const demoActivities: ActivityRecord[] = dates.slice(0, 6).map((date, i) => ({
      id: `demo-${date}`,
      date,
      kind: "memorization",
      pageFrom: Math.max(1, plan.startPage + i),
      pageTo: Math.max(1, plan.startPage + i),
      plannedPages: 1,
      completedPages: 1,
      assessment: i === 4 ? "review" : i === 2 ? "average" : "strong",
      status: "completed",
      source: "inside_app",
      durationMinutes: 18 + i,
      createdAt: new Date(`${date}T18:00:00`).toISOString(),
      reason: "بيانات عرض تجريبية للحكام",
    }));
    const demoReview: ReviewItem = { id: "demo-review-1", page: Math.max(1, plan.startPage + 4), ayah: 7, reason: "ظهر اليوم لأن آخر تقييم احتاج تثبيتًا", priority: "high", nextReview: todayKey(), repetitions: 2 };

    setIsDemoMode(true);
    setPlan({
      ...plan,
      started: true,
      completedPages: Math.max(plan.completedPages, 50),
      completedAyahs: Math.max(plan.completedAyahs, 55),
      currentPosition: Math.max(plan.currentPosition, plan.startPage + 50),
      streak: 7,
      completedDates: Array.from(new Set([...plan.completedDates, ...dates.slice(0, 6)])),
      activities: [...(plan.activities || []).filter(a => !a.id.startsWith("demo-")), ...demoActivities],
      reviewQueue: [...plan.reviewQueue.filter(r => !r.id.startsWith("demo-")), demoReview],
      masteryHistory: [...(plan.masteryHistory || []).filter(m => !m.sourceActivityId?.startsWith("demo-")), ...demoActivities.map(a => ({ date: a.date, page: a.pageFrom, assessment: a.assessment || "average" as Assessment, score: assessmentScore(a.assessment), sourceActivityId: a.id }))],
      lastMilestone: { type: "streak7", date: todayKey() },
      graceDaysUsed: Math.min(plan.graceAllowance || 1, 1),
      calendarStatuses: { ...plan.calendarStatuses, [dates[5]]: "completed", [todayKey()]: "recovery" },
    });
    setModal(null);
    toast(uiText("تم تفعيل وضع العرض للحكام (بيانات تجريبية مؤقتة معزولة).", "Judges demo mode activated (isolated temporary data)."));
  };

  const disableDemoMode = async () => {
    setIsDemoMode(false);
    if (realPlanRef.current) {
      setPlan(realPlanRef.current);
      savePlan(realPlanRef.current);
    }
    if (session.userId) {
      const remote = await fetchPlanFromSupabase(session.userId);
      if (remote) {
        setPlan(remote);
        realPlanRef.current = remote;
        savePlan(remote);
      }
    }
    setModal(null);
    toast(uiText("تم إيقاف وضع العرض واستعادة خطتك الأصلية بنجاح.", "Demo mode disabled, real plan restored."));
  };

  const complete = (
    assessment: Assessment,
    page: number,
    item?: ReviewItem,
    ayahCount = 0,
    completedSurah?: string,
    completionRatio = 1,
    durationMinutes = 1,
    surahNames: string[] = [],
    ayahFrom?: number,
    ayahTo?: number,
    extraPages = 0
  ) => {
    const today = todayKey();
    const recoveryKind = plan.recovery.find(r => r.date === today)?.kind;
    const plannedQuota = item ? 0 : plan.todayRecoveryPages ?? (recoveryKind === "review" || recoveryKind === "redistribute" ? 0 : plan.pagesPerDay);
    const completed = assessment !== "not_memorized" && completionRatio > 0;
    const completedQuota = item ? 0 : Math.max(0, plannedQuota * completionRatio);
    const isFull = completed && completionRatio >= 1;
    const isNewDailyCompletion = isFull && !item && !plan.completedDates.includes(today);
    const queue = calculateReviewSchedule(page, [item?.ayah || ayahFrom || 1], assessment, plan.reviewQueue);
    const nextQueue = item ? queue.filter(existing => existing.id !== item.id) : queue;
    const nextStreak = isNewDailyCompletion ? plan.streak + 1 : plan.streak;
    const nextAyahs = completed && !item ? (plan.completedAyahs || 0) + ayahCount : (plan.completedAyahs || 0);
    let lastMilestone = plan.lastMilestone;
    if (isNewDailyCompletion) {
      if (plan.lastAction === "missed") lastMilestone = { type: "return", date: today };
      else if (completedSurah) lastMilestone = { type: "surah", date: today, surahName: completedSurah };
      else if ((plan.completedAyahs || 0) < 100 && nextAyahs >= 100) lastMilestone = { type: "ayah100", date: today };
      else if ((plan.completedAyahs || 0) < 50 && nextAyahs >= 50) lastMilestone = { type: "ayah50", date: today };
      else if (plan.streak < 30 && nextStreak >= 30) lastMilestone = { type: "streak30", date: today };
      else if (plan.streak < 7 && nextStreak >= 7) lastMilestone = { type: "streak7", date: today };
    }

    const activityId = `${item ? "review" : "memorize"}-${Date.now()}`;
    const activity: ActivityRecord = {
      id: activityId, date: today, kind: item ? "review" : "memorization", pageFrom: page,
      pageTo: Math.max(page, Math.floor(page + Math.max(0, completedQuota) - .01)), ayahFrom, ayahTo, surahNames,
      plannedPages: item ? 0 : plannedQuota, completedPages: item ? 0 : completedQuota, assessment,
      status: item ? "completed" : !completed ? "missed" : completionRatio < 1 ? "partial" : "completed",
      source: "inside_app", durationMinutes, createdAt: new Date().toISOString(), reason: item?.reason,
    };

    // Extra upcoming ward memorization if recorded
    const extraActivities: ActivityRecord[] = [];
    const extraMastery: Array<{ date: string; page: number; assessment: Assessment; score: 1 | 2 | 3 | 4; sourceActivityId: string }> = [];
    if (completed && !item && isFull && extraPages > 0) {
      const extraStartPage = Math.floor(page + completedQuota);
      const extraEndPage = extraStartPage + extraPages - 1;
      const extraActivityId = `memorize-extra-${Date.now()}`;
      const extraActivity: ActivityRecord = {
        id: extraActivityId,
        date: today,
        kind: "memorization",
        pageFrom: extraStartPage,
        pageTo: extraEndPage,
        plannedPages: extraPages,
        completedPages: extraPages,
        assessment,
        status: "completed",
        source: "inside_app",
        durationMinutes: 5,
        createdAt: new Date().toISOString(),
        reason: uiText("إنجاز إضافي مبكر من الورد القادم", "Early progress on upcoming quota"),
      };
      extraActivities.push(extraActivity);
      extraMastery.push({
        date: today,
        page: extraStartPage,
        assessment,
        score: assessmentScore(assessment),
        sourceActivityId: extraActivityId,
      });
    }

    const leftover = !item && completed && completionRatio < 1 ? Math.max(0, plannedQuota - completedQuota) : 0;
    const recoveryRecord = leftover > 0 ? {
      date: today, minutes: "none" as const, approved: true,
      label: uiText("تم ترحيل الجزء المتبقي تلقائيًا", "Remaining portion rescheduled automatically"),
      quota: leftover, kind: "redistribute" as const,
      redistribution: { [todayKey(new Date(Date.now() + 86400000))]: leftover },
    } : null;

    const totalAddedPages = completed && !item ? completedQuota + extraPages : 0;
    const nextCurrentPosition = completed && !item ? Math.min(plan.totalPages + 1, plan.currentPosition + totalAddedPages) : plan.currentPosition;

    const nextBase: PlanState = {
      ...plan,
      todayRecoveryPages: undefined,
      assessments: { ...plan.assessments, [today]: assessment },
      reviewQueue: nextQueue,
      completedDates: isNewDailyCompletion ? [...plan.completedDates, today] : plan.completedDates,
      completedPages: completed ? Math.min(plan.totalPages - plan.startPage + 1, plan.completedPages + totalAddedPages) : plan.completedPages,
      completedAyahs: nextAyahs,
      currentPosition: nextCurrentPosition,
      streak: nextStreak,
      lastAction: isNewDailyCompletion ? "done" : !completed ? "missed" : plan.lastAction,
      graceActiveUntil: isNewDailyCompletion ? undefined : plan.graceActiveUntil,
      lastMilestone,
      activities: [...(plan.activities || []), activity, ...extraActivities],
      masteryHistory: [...(plan.masteryHistory || []), { date: today, page, assessment, score: assessmentScore(assessment), sourceActivityId: activityId }, ...extraMastery],
      recovery: recoveryRecord ? [...plan.recovery.filter(r => r.date !== today), recoveryRecord] : plan.recovery,
      calendarStatuses: !item ? { ...plan.calendarStatuses, [today]: !completed ? "vacation" : completionRatio < 1 ? "partial" : "completed" } : plan.calendarStatuses,
    };
    const nextSnapshot = buildPlanSnapshot(nextBase);
    const nextPlan = { ...nextBase, durationDays: nextSnapshot.remainingCalendarDays, goalDate: nextSnapshot.estimatedCompletionDate };
    setPlan(nextPlan);
    setModal(null); setReviewItem(undefined);

    const dynamicDuas = [
      uiText("زادك الله ثباتًا ونفعًا بالقرآن.", "May Allah grant you steadfastness and benefit through the Quran."),
      uiText("بارك الله في حفظك، ويسّر لك مراجعته.", "May Allah bless your memorization and ease its review."),
      uiText("هنيئاً لك ما حفظت؛ جعله الله شفيعاً لك ونوراً.", "Congratulations on what you memorized; may it be a light for you."),
    ];
    const dua = dynamicDuas[Math.floor(Math.random() * dynamicDuas.length)];

    if (item) {
      showCelebration(uiText("تمت المراجعة", "Review complete"), uiText("سُجلت المراجعة وتحدث موعد عودتك القادمة لهذا الموضع.", "Your review was saved and its next return was updated."));
    } else if (completionRatio < 1) {
      // Partial completion saved; CompletionModal renders post-save card with rescue CTA
    } else if (completed) {
      const motivational = extraPages > 0 
        ? `${uiText("تم إتمام ورد اليوم وحفظ تقدم صفحة إضافية من وردك القادم.", "Today’s quota complete and extra progress saved toward next quota.")} ${dua}` 
        : dua;
      setCelebrationModalData({
        title: uiText("تم ورد اليوم", "Today’s quota is complete"),
        motivationalLine: motivational,
        streak: nextStreak,
        completedPage: page,
        nextPage: Math.min(604, Math.floor(nextCurrentPosition)),
      });
    } else {
      toast(uiText("تم تسجيل اليوم بدون ادعاء إنجاز لم يحدث.", "Today was recorded without claiming an uncompleted quota."));
    }
  };

  const startReview = (item: ReviewItem) => { setReviewItem(item); setModal("reader"); };
  const startCycle = () => {
    const pages = Array.from(new Set((plan.activities || []).filter(a => a.kind !== "review" && a.completedPages > 0).map(a => a.pageFrom))).sort((a,b) => a-b);
    const queue = pages.map((page,index): ReviewItem => ({ id:`cycle-${Date.now()}-${page}`, page, ayah:1, reason:uiText("دورة مراجعة جديدة بعد إكمال رحلة الحفظ", "New review cycle after completing memorization"), priority:index<5?"high":"medium", nextReview:todayKey(new Date(Date.now()+index*86400000)), repetitions:0 }));
    setPlan({...plan, reviewQueue:queue, startType:"review"}); setView("review"); toast(uiText("بدأت دورة مراجعة جديدة من سجل حفظك.", "A new review cycle was created from your memorization history."));
  };

  const nav = getRoleNavigation(session.role, ui.language).filter(item => item.id !== "teacher" && item.id !== "mastery");
  const body = view === "home" ? <Dashboard plan={plan} modal={setModal} view={setView} toast={toast} isDemoMode={isDemoMode} disableDemo={disableDemoMode}/> : view === "calendar" ? <Calendar plan={plan} save={setPlan} toast={toast}/> : view === "review" || view === "mastery" ? <ReviewCenter plan={plan} startReview={startReview} startCycle={startCycle}/> : <AssistantHub initialAyah={ayah}/>;

  return <div className={`app-shell theme-${ui.theme} dir-${ui.language}`}>
    <aside className="sidebar"><div className="brand"><BrandLogo/></div><div><div className="nav-label">{uiText("مساحتك", "Your space")}</div><nav className="nav-list">{nav.map(item => <button className={`nav-item ${view === item.id ? "active" : ""}`} key={item.id} onClick={() => setView(item.id)}><span className="nav-icon">{icons[item.id]}</span>{item.label}</button>)}</nav></div><div className="sidebar-bottom"><div className="support-mini"><strong>{uiText("رحلة بلا ضغط", "A gentle journey")}</strong>{uiText("الخطة تتكيف مع حياتك.", "A plan that adapts to your life.")}</div><div className="profile-mini"><span className="avatar">{session.name.slice(0, 1)}</span><span className="profile-name">{session.name}<span className="profile-role">{uiText("رحلة شخصية", "Personal journey")}</span></span><button className="plain-icon" onClick={() => setModal("settings")} aria-label={uiText("إعدادات الحساب", "Account settings")}><SettingsIcon size={14}/></button></div></div></aside>
    <main className="main-content"><Header view={view} session={session} toast={toast} settings={() => setModal("settings")}/>{body}</main>
    <nav className="mobile-bottom-nav" aria-label={uiText("التنقل الرئيسي", "Main navigation")}>{nav.map(item => <button className={view === item.id ? "active" : ""} key={`mobile-${item.id}`} onClick={() => { setView(item.id); setModal(null); }}><span>{icons[item.id]}</span><small>{item.label}</small></button>)}</nav>

    {modal === "onboarding" && <Onboarding plan={plan} isEditMode={Boolean(session.onboardingCompleted || plan.started)} save={session.onboardingCompleted || plan.started ? handleUpdatePlanSettings : handleFinishOnboarding} close={() => setModal(null)}/>} 
    {modal === "completion" && (
      <CompletionModal
        plan={plan}
        close={() => setModal(null)}
        openRecovery={() => setModal("recovery")}
        onComplete={(assessment, completionRatio, extraPages) => {
          complete(
            assessment,
            Math.max(1, Math.floor(plan.currentPosition)),
            undefined,
            undefined,
            undefined,
            completionRatio,
            1,
            [],
            undefined,
            undefined,
            extraPages || 0
          );
        }}
      />
    )}
    {modal === "reader" && (
      <Reader
        plan={plan}
        save={setPlan}
        close={() => { setModal(null); setReviewItem(undefined); setReaderIntent({ mode: "read", completion: false }); }}
        assistant={selected => { setAyah(selected); setModal("assistant"); }}
        toast={toast}
        onComplete={complete}
        onRequestCompletion={() => setModal("completion")}
        reviewItem={reviewItem}
        ui={ui}
        setUi={setUi}
        initialMode={readerIntent.mode}
        openCompletion={readerIntent.completion}
      />
    )} 
    {modal === "assistant" && ayah && <Assistant ayah={ayah} close={() => { setAyah(null); setReaderIntent({ mode: "read", completion: false }); setModal("reader"); }} returnToReader={(mode, completion = false) => { setReaderIntent({ mode, completion }); setAyah(null); setModal("reader"); }} openFull={(selected) => { setAyah(selected); setModal(null); setView("assistant"); }}/>} 
    {modal === "recovery" && <Recovery plan={plan} save={setPlan} close={() => setModal(null)} toast={toast}/>} 
    {modal === "privacy" && <PrivacyModal close={() => setModal("settings")}/>}
    {modal === "settings" && <Settings close={() => setModal(null)} journey={() => setModal("onboarding")} privacy={() => setModal("privacy")} logout={logout} ui={ui} setUi={setUi} plan={plan} isDemoMode={isDemoMode} enableDemo={enableDemoMode} disableDemo={disableDemoMode} toast={toast}/>} 
    {view === "home" && <button className="recovery-fab" onClick={() => setModal("recovery")}><Sparkles size={15}/>{uiText("أنقذ وردي", "Rescue today’s quota")}</button>}
    {celebration && <div className="micro-celebration" role="status"><span className="celebration-check"><Check size={18}/></span><div><strong>{celebration.title}</strong><p>{celebration.text}</p></div></div>}
    {celebrationModalData && (
      <CelebrationModal
        title={celebrationModalData.title}
        motivationalLine={celebrationModalData.motivationalLine}
        streak={celebrationModalData.streak}
        completedPage={celebrationModalData.completedPage}
        nextPage={celebrationModalData.nextPage}
        onViewTomorrow={() => {
          setCelebrationModalData(null);
          setReviewItem(undefined);
          setReaderIntent({ mode: "read", completion: false });
          setModal("reader");
        }}
        onClose={() => setCelebrationModalData(null)}
      />
    )}
    {toastText && <div className="toast" role="status">{toastText}</div>}
  </div>;
}

