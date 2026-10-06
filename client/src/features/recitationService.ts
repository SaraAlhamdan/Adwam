import { invokeAnalyzeRecitation, uploadRecitationAudio, recordRecitationAttempt } from "@/lib/supabase";

export type RecitationDifference = {
  type: "substitution" | "omission" | "addition" | "uncertain";
  expected?: string;
  actual?: string;
  position: number;
  ayah?: number;
  similarityRatio?: number;
};

export type WordAlignmentItem = {
  position: number;
  expected: string;
  actual?: string;
  status: "correct" | "uncertain" | "substitution" | "omission";
  ayah?: number;
};

export type RecitationResult = {
  status: "success" | "uncertain";
  transcript: string;
  match: number;
  weakAyahs: number[];
  differences: RecitationDifference[];
  wordAlignment?: WordAlignmentItem[];
  expectedWordsCount?: number;
  actualWordsCount?: number;
  correctWordsCount?: number;
  uncertainWordsCount?: number;
  substitutionWordsCount?: number;
  omissionWordsCount?: number;
  additionWordsCount?: number;
  errorCount?: number;
  supportedBy?: string;
  message?: string;
  audioUrl?: string | null;
};

export async function analyzeRecitation(
  audio: Blob,
  expectedTextSimple: string,
  expectedAyahs?: Array<{ ayah: number; text: string }>,
  userId?: string,
  page = 1
): Promise<RecitationResult> {
  if (!audio || audio.size < 50) {
    throw new Error("التسجيل فارغ أو لم يتم التقاط صوت. يرجى التأكد من الميكروفون وإعادة المحاولة.");
  }
  if (!expectedTextSimple.trim()) {
    throw new Error("النص القرآني المتوقع مفقود.");
  }

  // 1. Invoke Supabase Edge Function (or backend fallback)
  const result = await invokeAnalyzeRecitation(audio, expectedTextSimple, expectedAyahs);

  // If uncertain (low confidence or silent)
  if (result.status === "uncertain") {
    return {
      status: "uncertain",
      transcript: result.transcript || "",
      match: 0,
      weakAyahs: [],
      differences: [],
      message: result.message || "التسجيل الصوتي منخفض الوضوح أو غير مؤكد.",
      supportedBy: result.supportedBy || "Groq whisper-large-v3",
    };
  }

  // 2. Optionally upload to Supabase storage in background if user is authenticated
  let audioUrl: string | null = null;
  if (userId) {
    uploadRecitationAudio(audio, userId).then(url => {
      audioUrl = url;
      if (url) {
        recordRecitationAttempt(
          userId,
          page,
          expectedTextSimple,
          result.transcript,
          result.match ?? 0,
          result.differences || [],
          url
        );
      }
    }).catch(() => {});
  }

  // Calculate weak ayahs from differences (only true errors: omissions and substitutions)
  const diffs: RecitationDifference[] = result.differences || [];
  const weakAyahs = Array.from(
    new Set(
      diffs
        .filter(d => d.type === "substitution" || d.type === "omission")
        .map(d => d.ayah)
        .filter((a): a is number => typeof a === "number")
    )
  );

  return {
    status: "success",
    transcript: result.transcript || "",
    match: typeof result.match === "number" ? result.match : 0,
    weakAyahs,
    differences: diffs,
    wordAlignment: result.wordAlignment || [],
    expectedWordsCount: result.expectedWordsCount,
    actualWordsCount: result.actualWordsCount,
    correctWordsCount: result.correctWordsCount ?? result.correctCount ?? 0,
    uncertainWordsCount: result.uncertainWordsCount ?? result.uncertainCount ?? 0,
    substitutionWordsCount: result.substitutionWordsCount ?? result.substitutionCount ?? 0,
    omissionWordsCount: result.omissionWordsCount ?? result.omissionCount ?? 0,
    additionWordsCount: result.additionWordsCount ?? result.additionCount ?? 0,
    errorCount: result.errorCount ?? 0,
    supportedBy: result.supportedBy || "Groq whisper-large-v3 + Word Alignment",
    audioUrl,
  };
}
