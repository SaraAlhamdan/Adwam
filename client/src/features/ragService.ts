import type { QuranAyah } from "@shared/quran";

export type AssistantMode = "similar" | "memorize" | "explain" | "confused" | "ask";
export type AssistantStatus = "success" | "abstain" | "referral" | "error";

export type AssistantCitation = {
  title: string;
  sourceName: string;
  url?: string;
  excerpt?: string;
  originalArabicUrl?: string;
  originalArabicTitle?: string;
  location?: string;
};

export type AssistantResult = {
  status: AssistantStatus;
  title: string;
  answer?: string;
  originalArabicAnswer?: string;
  citations: AssistantCitation[];
  confidence?: "high" | "medium" | "low";
  referralRequired?: boolean;
  reason?: "insufficient_source" | "personal_fatwa" | "out_of_scope" | "service_unavailable";
  embedUrl?: string;
};

type AssistantContext = Pick<QuranAyah, "text" | "numberInSurah" | "surah"> | null | undefined;

const clean = (value?: string) => (value || "").replace(/\s+/g, " ").trim().slice(0, 1200);

const isEnglishUi = () => typeof document !== "undefined" && document.documentElement.lang === "en";

/**
 * Query the live Adwam Assistant backed by Quranpedia RAG and Groq.
 * Conforms strictly to ASSISTANT_INTEGRATION_CONTRACT.md.
 */
export async function queryAssistant(
  question: string,
  mode: AssistantMode = "ask",
  ayah?: AssistantContext,
): Promise<AssistantResult> {
  const isEn = isEnglishUi();
  const safeQuestion = clean(question);

  if (!safeQuestion && mode === "ask") {
    return {
      status: "error",
      title: isEn ? "Question is empty" : "السؤال فارغ",
      citations: [],
      reason: "out_of_scope",
    };
  }

  const payload = {
    question: safeQuestion,
    mode,
    locale: isEn ? "en" : "ar",
    context: ayah
      ? {
          surahNumber: ayah.surah.number,
          ayahNumber: ayah.numberInSurah,
          ayahText: ayah.text,
        }
      : null,
  };

  // When running in Node.js / test environments where browser fetch has no relative URL origin
  if (typeof window === "undefined") {
    try {
      const serverEnginePath = "../../../server/ragEngine";
      const { processAssistantQuery } = await import(/* @vite-ignore */ serverEnginePath);
      const data = await processAssistantQuery(payload);
      if (ayah && !data.embedUrl) {
        if (mode === "similar") {
          data.embedUrl = `https://api.quranpedia.net/embed?surah=${ayah.surah.number}&ayah=${ayah.numberInSurah}&type=similar`;
        } else if (mode === "explain") {
          data.embedUrl = `https://api.quranpedia.net/embed?surah=${ayah.surah.number}&ayah=${ayah.numberInSurah}&type=tafsir`;
        }
      }
      return data;
    } catch (err) {
      console.warn("[ragService] node environment direct engine call failed:", err);
    }
  }

  try {
    const res = await fetch("/api/assistant/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data: AssistantResult = await res.json();

      // If mode is similar or explain and an ayah context is present, add the verified embedUrl if not already present
      if (ayah && !data.embedUrl) {
        if (mode === "similar") {
          data.embedUrl = `https://api.quranpedia.net/embed?surah=${ayah.surah.number}&ayah=${ayah.numberInSurah}&type=similar`;
        } else if (mode === "explain") {
          data.embedUrl = `https://api.quranpedia.net/embed?surah=${ayah.surah.number}&ayah=${ayah.numberInSurah}&type=tafsir`;
        }
      }

      return data;
    }
  } catch (err) {
    console.warn("[ragService] live assistant query failed, using fallback:", err);
  }

  // Graceful fallback when server endpoint is unavailable
  return {
    status: "error",
    title: isEn ? "Assistant temporarily unavailable" : "تعذر الوصول إلى المساعد حالياً",
    answer: isEn
      ? "Could not connect to the assistant service. Please check your network and server connection."
      : "تعذر الاتصال بخدمة المساعد حالياً. يرجى التحقق من تشغيل الخادم والمحاولة لاحقاً.",
    citations: [],
    reason: "service_unavailable",
  };
}

export async function queryAyahAssistant(ayah: QuranAyah, mode: AssistantMode, question?: string) {
  return queryAssistant(question || "", mode, ayah);
}
