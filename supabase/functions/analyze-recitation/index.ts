// Supabase Edge Function: analyze-recitation
// Uses Groq's OpenAI-compatible transcription endpoint (whisper-large-v3)
// and performs word-level Arabic alignment with tolerance layer and confidence validation.

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Complete list of all 30 Quranic opening letter verses (الحروف المقطّعة) across 29 Surahs:
 * Standalone: 2:1, 3:1, 7:1, 19:1, 20:1, 26:1, 28:1, 29:1, 30:1, 31:1, 32:1, 36:1, 40:1, 41:1, 42:1, 42:2, 43:1, 44:1, 45:1, 46:1
 * Opening word: 10:1, 11:1, 12:1, 13:1, 14:1, 15:1, 27:1, 38:1, 50:1, 68:1
 */
export const MUQATTAAT_VERSES = new Set<string>([
  "2:1", "3:1", "7:1", "10:1", "11:1", "12:1", "13:1", "14:1", "15:1",
  "19:1", "20:1", "26:1", "27:1", "28:1", "29:1", "30:1", "31:1", "32:1",
  "36:1", "38:1", "40:1", "41:1", "42:1", "42:2", "43:1", "44:1", "45:1",
  "46:1", "50:1", "68:1",
]);

/**
 * Standard letter name expansion table:
 * ا=ألف، ل=لام، م=ميم، ص=صاد، ر=را، ك=كاف، ه=ها، ي=يا، ع=عين، ط=طا، س=سين، ح=حا، ق=قاف، ن=نون
 */
export const MUQATTAAT_LETTER_EXPANSIONS: Record<string, string> = {
  "ا": "ألف",
  "أ": "ألف",
  "إ": "ألف",
  "آ": "ألف",
  "ٱ": "ألف",
  "ل": "لام",
  "م": "ميم",
  "ص": "صاد",
  "ر": "را",
  "ك": "كاف",
  "ه": "ها",
  "ي": "يا",
  "ى": "يا",
  "ع": "عين",
  "ط": "طا",
  "س": "سين",
  "ح": "حا",
  "ق": "قاف",
  "ن": "نون",
};

export const KNOWN_MUQATTAAT_WORDS = new Set<string>([
  "الم", "المص", "الر", "المر", "كهيعص", "طه", "طسم", "طس", "يس", "ص", "حم", "عسق", "ق", "ن"
]);

export function isMuqattaatAyah(surah: number, ayah: number): boolean {
  return MUQATTAAT_VERSES.has(`${surah}:${ayah}`);
}

/**
 * Splits an Uthmani muqatta'at word (e.g. الٓمٓ, كٓهيعٓصٓ) into its individual letter units
 * keeping combining marks (such as maddah U+0653) attached to each base letter.
 */
export function splitUthmaniMuqattaat(uthmaniWord: string): string[] {
  const regex = /[\u0621-\u064A][\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]*/g;
  const matches = uthmaniWord.match(regex);
  return matches && matches.length > 0 ? matches : [uthmaniWord];
}

/**
 * Expands a single muqatta'ah word (e.g. "الم" -> ["ألف", "لام", "ميم"])
 */
export function expandMuqattaatWord(word: string): string[] {
  const clean = word
    .normalize("NFKD")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .trim();
  const spoken: string[] = [];
  for (const ch of clean) {
    if (MUQATTAAT_LETTER_EXPANSIONS[ch]) {
      spoken.push(MUQATTAAT_LETTER_EXPANSIONS[ch]);
    }
  }
  return spoken;
}

/**
 * Expands expected ayah text if it is or begins with muqatta'at
 */
export function expandMuqattaatText(text: string, surah?: number, ayah?: number): string {
  if (!text) return "";
  const key = surah && ayah ? `${surah}:${ayah}` : null;
  if (key && !MUQATTAAT_VERSES.has(key)) {
    return text;
  }
  const words = text.trim().split(/\s+/);
  const expanded: string[] = [];
  for (let idx = 0; idx < words.length; idx++) {
    const rawWord = words[idx];
    const cleanWord = rawWord.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "");
    if (KNOWN_MUQATTAAT_WORDS.has(cleanWord) || (key && MUQATTAAT_VERSES.has(key) && idx === 0)) {
      const letterNames = expandMuqattaatWord(cleanWord);
      if (letterNames.length > 0) {
        expanded.push(...letterNames);
        continue;
      }
    }
    expanded.push(rawWord);
  }
  return expanded.join(" ");
}

/**
 * Expands transcript text if Whisper transcribed joined muqatta'at letters (e.g. "الم" -> "ألف لام ميم")
 */
export function expandTranscriptMuqattaat(transcript: string): string {
  if (!transcript) return "";
  const words = transcript.trim().split(/\s+/);
  const result: string[] = [];
  for (const rawWord of words) {
    const cleanWord = rawWord.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\.,!؟،]/g, "");
    if (KNOWN_MUQATTAAT_WORDS.has(cleanWord)) {
      const letterNames = expandMuqattaatWord(cleanWord);
      if (letterNames.length > 0) {
        result.push(...letterNames);
        continue;
      }
    }
    result.push(rawWord);
  }
  return result.join(" ");
}

/**
 * Normalizes Arabic text according to recitation test rules:
 * - Removes tashkeel (harakat: \u064B-\u065F) and tatweel (kashida: \u0640)
 * - Removes Quranic pause/annotation symbols (\u0610-\u061A, \u06D6-\u06ED)
 * - Removes dagger alef (\u0670) without global conversion to alef
 * - Unifies all alef/hamza forms [إأآٱ] -> ا
 * - Unifies ya and alef maqsura [ى] -> ي
 * - Unifies ta marbuta [ة] -> ه
 * - Unifies hamza on waw and ya [ؤ] -> و, [ئ] -> ي
 * - Normalizes letter names ending with hamza (e.g. طاء -> طا, حاء -> حا, هاء -> ها, راء -> را, ياء -> يا)
 * - Strips non-Arabic letters/punctuation/digits
 */
export function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFKD")
    .replace(/\uFEFF/g, "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0621-\u064A\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b([طحركهي])اء\b/g, "$1ا")
    .trim();
}

/**
 * Calculates Levenshtein edit distance
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const row: number[] = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= m; i++) {
    let prevDiag = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        row[j] + 1,       // deletion
        row[j - 1] + 1,   // insertion
        prevDiag + cost   // substitution
      );
      prevDiag = temp;
    }
  }

  return row[n];
}

/**
 * Tolerance check: if transcript word and expected word differ by only one character
 * or have high similarity (ratio >= 0.8), mark it "uncertain", not "substitution".
 */
export function isUncertainMatch(expected: string, actual: string): boolean {
  if (!expected || !actual) return false;
  if (expected === actual) return false;
  const dist = levenshteinDistance(expected, actual);
  if (dist <= 1) return true;
  const maxLen = Math.max(expected.length, actual.length);
  const ratio = 1 - dist / maxLen;
  return ratio >= 0.8;
}

export type DifferenceItem = {
  type: "omission" | "addition" | "substitution" | "uncertain";
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

export function performWordAlignment(
  expectedText: string,
  transcriptText: string,
  expectedAyahs?: Array<{ ayah: number; text: string }>
) {
  let textToExp = expectedText;
  if (Array.isArray(expectedAyahs) && expectedAyahs.length > 0) {
    const parts = expectedAyahs.map(a => expandMuqattaatText(a.text, undefined, a.ayah));
    textToExp = parts.join(" ");
  } else {
    textToExp = expandMuqattaatText(expectedText);
  }

  const textToAct = expandTranscriptMuqattaat(transcriptText);

  const normExpected = normalizeArabic(textToExp);
  const normActual = normalizeArabic(textToAct);

  const expectedWords = normExpected.split(" ").filter(Boolean);
  const actualWords = normActual.split(" ").filter(Boolean);

  const m = expectedWords.length;
  const n = actualWords.length;

  // Build ayah lookup map for each expected word index
  const ayahRanges: Array<{ ayah: number; start: number; end: number }> = [];
  if (Array.isArray(expectedAyahs) && expectedAyahs.length > 0) {
    let cursor = 0;
    for (const item of expectedAyahs) {
      if (!item || typeof item.ayah !== "number" || typeof item.text !== "string") continue;
      const count = normalizeArabic(expandMuqattaatText(item.text, undefined, item.ayah)).split(" ").filter(Boolean).length;
      ayahRanges.push({ ayah: item.ayah, start: cursor, end: Math.max(cursor, cursor + count - 1) });
      cursor += count;
    }
  }
  const getAyahForWordIndex = (index: number) => {
    return ayahRanges.find(r => index >= r.start && index <= r.end)?.ayah;
  };

  // Dynamic Programming Matrix for sequence alignment
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const match = expectedWords[i - 1] === actualWords[j - 1];
      const cost = match ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // omission (deletion from expected)
        dp[i][j - 1] + 1,      // addition (insertion into actual)
        dp[i - 1][j - 1] + cost // substitution or match
      );
    }
  }

  // Backtrack to extract exact alignment operations
  const differences: DifferenceItem[] = [];
  const wordAlignment: WordAlignmentItem[] = [];
  const ops: Array<{
    type: "match" | "substitution" | "omission" | "addition";
    i: number;
    j: number;
  }> = [];

  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expectedWords[i - 1] === actualWords[j - 1]) {
      ops.push({ type: "match", i: i - 1, j: j - 1 });
      i--;
      j--;
      continue;
    }

    const sub = i > 0 && j > 0 ? dp[i - 1][j - 1] : Infinity;
    const del = i > 0 ? dp[i - 1][j] : Infinity;
    const ins = j > 0 ? dp[i][j - 1] : Infinity;
    const best = Math.min(sub, del, ins);

    if (best === sub) {
      ops.push({ type: "substitution", i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (best === del) {
      ops.push({ type: "omission", i: i - 1, j: -1 });
      i--;
    } else {
      ops.push({ type: "addition", i: Math.max(0, i - 1), j: j - 1 });
      j--;
    }
  }

  ops.reverse();

  let correctCount = 0;
  let uncertainCount = 0;
  let substitutionCount = 0;
  let omissionCount = 0;
  let additionCount = 0;

  for (const op of ops) {
    if (op.type === "match") {
      correctCount++;
      wordAlignment.push({
        position: op.i + 1,
        expected: expectedWords[op.i],
        actual: actualWords[op.j],
        status: "correct",
        ayah: getAyahForWordIndex(op.i),
      });
    } else if (op.type === "substitution") {
      const exp = expectedWords[op.i];
      const act = actualWords[op.j];
      const dist = levenshteinDistance(exp, act);
      const ratio = 1 - dist / Math.max(exp.length, act.length);

      // Tolerance check: if differs by 1 character or similarity ratio >= 0.8
      if (dist <= 1 || ratio >= 0.8) {
        uncertainCount++;
        differences.push({
          type: "uncertain",
          expected: exp,
          actual: act,
          position: op.i + 1,
          ayah: getAyahForWordIndex(op.i),
          similarityRatio: Math.round(ratio * 100) / 100,
        });
        wordAlignment.push({
          position: op.i + 1,
          expected: exp,
          actual: act,
          status: "uncertain",
          ayah: getAyahForWordIndex(op.i),
        });
      } else {
        substitutionCount++;
        differences.push({
          type: "substitution",
          expected: exp,
          actual: act,
          position: op.i + 1,
          ayah: getAyahForWordIndex(op.i),
          similarityRatio: Math.round(ratio * 100) / 100,
        });
        wordAlignment.push({
          position: op.i + 1,
          expected: exp,
          actual: act,
          status: "substitution",
          ayah: getAyahForWordIndex(op.i),
        });
      }
    } else if (op.type === "omission") {
      omissionCount++;
      differences.push({
        type: "omission",
        expected: expectedWords[op.i],
        position: op.i + 1,
        ayah: getAyahForWordIndex(op.i),
      });
      wordAlignment.push({
        position: op.i + 1,
        expected: expectedWords[op.i],
        status: "omission",
        ayah: getAyahForWordIndex(op.i),
      });
    } else if (op.type === "addition") {
      additionCount++;
      differences.push({
        type: "addition",
        actual: actualWords[op.j],
        position: op.i + 1,
        ayah: getAyahForWordIndex(op.i),
      });
    }
  }

  // Error count excludes uncertain matches per requirement
  const errorCount = substitutionCount + omissionCount;
  const denom = Math.max(1, m);
  const matchRate = Math.max(0, Math.min(100, Math.round(((denom - errorCount) / denom) * 100)));

  return {
    matchRate,
    differences,
    wordAlignment,
    expectedWordsCount: m,
    actualWordsCount: n,
    correctCount,
    uncertainCount,
    substitutionCount,
    omissionCount,
    additionCount,
    errorCount,
  };
}

// Supabase Edge Function Handler
if (typeof Deno !== "undefined" && typeof (Deno as any).serve === "function") {
  // @ts-ignore
  Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      // Read key only from GROQ_API_KEY in Supabase Edge Function Secrets
      // @ts-ignore
      const groqApiKey = Deno.env.get("GROQ_API_KEY");
      if (!groqApiKey) {
        return new Response(
          JSON.stringify({
            error: "GROQ_API_KEY_MISSING",
            message: "خدمة المعالجة الصوتية غير متوفرة حالياً، يرجى المحاولة لاحقاً.",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const contentType = req.headers.get("content-type") || "";
      let audioBlob: Blob | null = null;
      let mimeType = "audio/webm";
      let expectedText = "";
      let expectedAyahs: Array<{ ayah: number; text: string }> | undefined = undefined;

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        const file = formData.get("file") || formData.get("audio");
        if (file instanceof Blob) {
          audioBlob = file;
          mimeType = file.type || "audio/webm";
        }
        expectedText = String(formData.get("expectedText") || "");
        const ayahsJson = formData.get("expectedAyahs");
        if (typeof ayahsJson === "string") {
          try { expectedAyahs = JSON.parse(ayahsJson); } catch {}
        }
      } else {
        const body = await req.json().catch(() => ({}));
        expectedText = body.expectedText || "";
        expectedAyahs = body.expectedAyahs;
        mimeType = body.mimeType || "audio/webm";

        if (body.audioBase64) {
          const binaryString = atob(body.audioBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          audioBlob = new Blob([bytes], { type: mimeType });
        }
      }

      if (!audioBlob || audioBlob.size < 50) {
        return new Response(
          JSON.stringify({
            status: "uncertain",
            transcript: "",
            match: 0,
            differences: [],
            wordAlignment: [],
            message: "التسجيل فارغ أو لم يتم التقاط صوت (غير مؤكد). يرجى التأكد من الميكروفون وإعادة المحاولة.",
            supportedBy: "Groq whisper-large-v3",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!expectedText.trim()) {
        return new Response(
          JSON.stringify({
            error: "MISSING_EXPECTED_TEXT",
            message: "النص القرآني المتوقع مفقود.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Prepare Groq Transcription API request (model: whisper-large-v3, language: ar, format: verbose_json)
      const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("wav") ? "wav" : mimeType.includes("m4a") ? "m4a" : "webm";
      const filename = `recitation.${ext}`;

      // Pass spoken letter names as the Whisper prompt for muqatta'at ayahs
      const spokenPrompt = expandMuqattaatText(expectedText).trim();

      const groqFormData = new FormData();
      groqFormData.append("file", audioBlob, filename);
      groqFormData.append("model", "whisper-large-v3");
      groqFormData.append("language", "ar");
      groqFormData.append("prompt", spokenPrompt);
      groqFormData.append("response_format", "verbose_json");

      const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: groqFormData,
      });

      if (!groqResponse.ok) {
        if (groqResponse.status === 429) {
          return new Response(
            JSON.stringify({
              error: "RATE_LIMIT_EXCEEDED",
              message: "تم تجاوز حد الطلبات المسموح به مؤقتًا لدى خدمة Groq (Rate Limit Exceeded). يرجى الانتظار بضع ثوانٍ ثم إعادة المحاولة.",
              status: 429,
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const errDetails = await groqResponse.text().catch(() => "");
        return new Response(
          JSON.stringify({
            error: "GROQ_TRANSCRIPTION_FAILED",
            message: `فشل التعرف على الصوت من Groq (${groqResponse.status}): ${errDetails}`,
            status: groqResponse.status,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const payload = await groqResponse.json();
      const rawTranscript = (payload.text || "").trim();

      if (!rawTranscript) {
        return new Response(
          JSON.stringify({
            status: "uncertain",
            transcript: "",
            match: 0,
            differences: [],
            wordAlignment: [],
            message: "التسجيل الصوتي صامت أو لم يتم التقاط كلام واضح (غير مؤكد). يرجى التأكد من الميكروفون والتسميع بنبرة واضحة ومسموعة.",
            supportedBy: "Groq whisper-large-v3",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check confidence metrics: no_speech_prob and avg_logprob from verbose_json segments
      const segments: Array<{ no_speech_prob?: number; avg_logprob?: number; text?: string }> = payload.segments || [];
      let totalNoSpeech = 0;
      let totalLogprob = 0;
      let segmentCount = 0;

      for (const seg of segments) {
        if (typeof seg.no_speech_prob === "number") {
          totalNoSpeech += seg.no_speech_prob;
        }
        if (typeof seg.avg_logprob === "number") {
          totalLogprob += seg.avg_logprob;
        }
        segmentCount++;
      }

      const avgNoSpeech = segmentCount > 0 ? totalNoSpeech / segmentCount : 0;
      const avgLogprob = segmentCount > 0 ? totalLogprob / segmentCount : 0;

      // If high probability of no speech or very low logprob confidence: return "uncertain"
      if (avgNoSpeech > 0.65 || (segmentCount > 0 && avgLogprob < -1.25)) {
        return new Response(
          JSON.stringify({
            status: "uncertain",
            transcript: rawTranscript,
            confidence: {
              avgNoSpeech,
              avgLogprob,
            },
            message: "التسجيل الصوتي غير مؤكد أو منخفض الوضوح (قد يكون هادئًا جدًا أو محاطًا بضوضاء). لم نقم باختلاق أخطاء؛ يرجى إعادة التسميع بنبرة أوضح وقريبة من الميكروفون.",
            supportedBy: "Groq whisper-large-v3",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Word-level alignment
      const alignmentResult = performWordAlignment(expectedText, rawTranscript, expectedAyahs);

      return new Response(
        JSON.stringify({
          status: "success",
          transcript: rawTranscript,
          match: alignmentResult.matchRate,
          differences: alignmentResult.differences,
          wordAlignment: alignmentResult.wordAlignment,
          expectedWordsCount: alignmentResult.expectedWordsCount,
          actualWordsCount: alignmentResult.actualWordsCount,
          correctWordsCount: alignmentResult.correctCount,
          uncertainWordsCount: alignmentResult.uncertainCount,
          substitutionWordsCount: alignmentResult.substitutionCount,
          omissionWordsCount: alignmentResult.omissionCount,
          additionWordsCount: alignmentResult.additionCount,
          errorCount: alignmentResult.errorCount,
          supportedBy: "Groq whisper-large-v3 + Word Alignment",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error: any) {
      console.error("Edge function error:", error);
      return new Response(
        JSON.stringify({
          error: "EDGE_FUNCTION_ERROR",
          message: error?.message || "حدث خطأ غير متوقع أثناء معالجة التسميع.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  });
}
