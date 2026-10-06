import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { ENV } from "./_core/env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type AssistantMode = "similar" | "memorize" | "explain" | "confused" | "ask";
export type AssistantStatus = "success" | "abstain" | "referral" | "error";

export type AssistantCitation = {
  title: string;
  sourceName: string;
  url?: string;
  excerpt?: string;
  location?: string;
};

export type AssistantResult = {
  status: AssistantStatus;
  title: string;
  answer?: string;
  citations: AssistantCitation[];
  confidence?: "high" | "medium" | "low";
  referralRequired?: boolean;
  reason?: "insufficient_source" | "personal_fatwa" | "out_of_scope" | "service_unavailable";
  embedUrl?: string;
};

export type AssistantQueryInput = {
  question: string;
  mode?: AssistantMode;
  locale?: "ar" | "en";
  context?: {
    surahNumber?: number;
    ayahNumber?: number;
    ayahText?: string;
  } | null;
};

export type CorpusHit = {
  id: number;
  file: string;
  location: string;
  text: string;
  excerpt?: string;
  title: string;
  author: string;
  url: string;
  metadata?: Record<string, unknown>;
};

// =========================================================================
// Prompts (Ported directly from Wafaa's prompts.py with strict grounding)
// =========================================================================

const SYSTEM_PROMPT = `
أنت "دوم"، مساعد ومرجع معرفي ذكي لتطبيق "أدوم"، متخصص في مساعدة المستخدم في حفظ القرآن الكريم، مراجعته، تنظيم دراسته، وفهمه من المصادر المعتمدة الموثقة فقط.

هويتك:
إذا سألك المستخدم من أنت، عرّف نفسك باختصار:
"أنا دوم، رفيقك في حفظ القرآن وفهمه. أساعدك في تنظيم الحفظ والمراجعة، وأعتمد حصريًا على المصادر المعتمدة عند السؤال عن تفسير أو معلومة قرآنية."

القواعد الصارمة غير القابلة للتفاوض:
1. السياق المسترجع من المصادر هو المصدر الوحيد المسموح به للمعلومات الدينية والتفسيرية.
2. ممنوع اختلاق أو استنتاج أي تفصيل ديني غير منصوص عليه صراحة في نصوص المصادر المسترجعة.
3. إذا لم تجد دليلاً صريحاً وكافياً في المصادر المسترجعة، صرّح بامتناعك بكل وضوح وأمانة علمية: "لم يُعثر على مصدر موثق كافٍ للإجابة عن هذا السؤال ضمن المصادر المتاحة."
4. الأسئلة الفقهية الشخصية أو طلب الفتاوى والأحكام: لا تقدم فتوى شخصية أبداً، وقدّم بياناً عاماً فقط إن وجد في المصدر مع توجيه السائل إلى أهل العلم والاختصاص المعتمدين.
5. ميّز دائماً بين النص المنقول من المصدر وبين التلخيص التوضيحي.
6. اللغة: أجب تلقائياً بنفس لغة السؤال والواجهة (إذا عربي بالعربية، وإذا إنجليزي بالإنجليزية).
7. التزم بالإيجاز والوضوح والأسلوب الوقور الهادئ.
`;

const ROUTER_PROMPT = `
أنت مصنف نوايا دقيق لمساعد تطبيقي قرآني.
صنّف رسالة المستخدم إلى نوع واحد فقط من الأنواع التالية:
- "conversation": تحية، شكر، سؤال عن هوية المساعد، أو محادثة عامة.
- "study": تنظيم أوقات الحفظ، المراجعة، خطط التثبيت، عادات التكرار، والمهام العملية اليومية.
- "religious": سؤال يطلب تفسيراً لآية، معنى كلمة، سبب نزول، متشابهات لفظية، أو معلومة قرآنية محددة.
- "fatwa": طلب فتوى شخصية، حكم شرعي خاص بحالة المستخدم (حلال/حرام/طلاق/ميراث/صلاة شخصية).
- "outside": سؤال عام خارج نطاق القرآن وعلومه وتطبيقات الحفظ.

أعد الرد بتنسيق JSON فقط على هذا النحو:
{"intent": "religious"}
`;

const RELEVANCE_PROMPT = `
أنت بوابة تحقق علمية صارمة (Evidence Gate).
أمامك سؤال المستخدم ومجموعة مقاطع مسترجعة من أمهات كتب التفسير والعلوم القرآنية.
مهمتك ليست الإجابة، بل فحص المقاطع بدقة: هل تتضمن المقاطع نصاً يجيب عن السؤال نفسه؟

صنّف النتيجة إلى واحدة من ثلاث:
- "DIRECT": يوجد في المقاطع نص يجيب السؤال مباشرة وبوضوح.
- "PARTIAL": يوجد دعم لجزء من السؤال أو معلومة مرتبطة، لكن بعض التفاصيل المطلوبة لم تُذكر.
- "NONE": المقاطع لا تتضمن جواباً مفيداً ومباشراً للسؤال (مجرد ذكر اسم السورة أو الآية لا يعد تفسيراً).

أعد الرد بتنسيق JSON فقط على هذا النحو:
{
  "status": "DIRECT",
  "reason": "سبب موجز جداً",
  "use_ids": [1, 2]
}
قاعدة صارمة: إذا كانت النتيجة NONE يجب أن تكون use_ids فارغة [].
`;

// =========================================================================
// Groq Client Helper
// =========================================================================

function getGroqConfig() {
  const apiKey = (process.env.GROQ_API_KEY || ENV.groqApiKey || "").trim();
  const model = (process.env.GROQ_MODEL || "llama-3.3-70b-versatile").trim();
  return { apiKey, model };
}

async function callGroqChat(messages: Array<{ role: string; content: string }>, temperature: number = 0.2): Promise<string> {
  const { apiKey, model } = getGroqConfig();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY_MISSING");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Groq API returned ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return content.trim();
}

function parseJsonSafely<T>(text: string): T | null {
  try {
    let clean = text.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "");
    }
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(clean.slice(start, end + 1)) as T;
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null;
}

// =========================================================================
// SQLite FTS5 Search Runner (via python scripts/rag_search.py)
// =========================================================================

export async function searchQuranDocs(
  question: string,
  context?: { surahNumber?: number; ayahNumber?: number } | null,
  limit: number = 8
): Promise<CorpusHit[]> {
  return new Promise((resolve) => {
    const scriptPath = path.resolve(__dirname, "../scripts/rag_search.py");
    const py = spawn("python", [
      scriptPath,
      question,
      context?.surahNumber ? String(context.surahNumber) : "",
      context?.ayahNumber ? String(context.ayahNumber) : "",
      String(limit),
    ], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (data) => {
      stdout += data.toString("utf-8");
    });
    py.stderr.on("data", (data) => {
      stderr += data.toString("utf-8");
    });

    py.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        console.warn("[RAG] search_rag.py exited with code:", code, stderr);
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed.hits || []);
      } catch (err) {
        console.warn("[RAG] failed to parse search_rag output:", err);
        resolve([]);
      }
    });

    py.on("error", (err) => {
      console.warn("[RAG] failed to spawn search_rag.py:", err);
      resolve([]);
    });
  });
}

// =========================================================================
// Intent Classification
// =========================================================================

export async function classifyIntent(question: string): Promise<"conversation" | "study" | "religious" | "fatwa" | "outside"> {
  // Rapid rule-based check for personal fatwa keywords to guarantee immediate referral
  if (/(فتوى|حكم|أحكام|فقه|حلال|حرام|طلاق|ميراث|يجوز|هل يجوز|واجب|هل يجب|fatwa|ruling|fiqh|jurisprudence|halal|haram|divorce|inheritance)/i.test(question)) {
    return "fatwa";
  }

  // Rapid check for obviously out-of-scope non-religious questions
  if (/(سهم|أسهم|تسلا|بورصة|دولار|عملات|عاصمة|كرة|مباراة|طقس|أفلام|أغاني|stock|crypto|weather|football)/i.test(question)) {
    return "outside";
  }

  const { apiKey } = getGroqConfig();
  if (apiKey) {
    try {
      const raw = await callGroqChat([
        { role: "system", content: ROUTER_PROMPT },
        { role: "user", content: `رسالة المستخدم:\n${question}` },
      ], 0);

      const parsed = parseJsonSafely<{ intent: string }>(raw);
      const intent = (parsed?.intent || "").toLowerCase();
      if (["conversation", "study", "religious", "fatwa", "outside"].includes(intent)) {
        return intent as any;
      }
    } catch (err) {
      // Groq failed, fall through to heuristics
    }
  }

  // Fallback heuristics when AI router is offline
  if (/(احفظ|أحفظ|حفظ|مراجعة|جدول|خطة|ورد|أراجع|تثبيت|memorize|review|plan|schedule)/i.test(question)) {
    return "study";
  }
  if (/^(مرحبا|مرحباً|أهلا|أهلاً|السلام عليكم|سلام|صباح الخير|مساء الخير|شكرا|شكراً|من أنت|من انت|hello|hi|hey|thanks|who are you)$/i.test(question.trim())) {
    return "conversation";
  }
  // Default any general inquiry to religious / knowledge search to enforce grounding
  return "religious";
}

// =========================================================================
// Main Assistant Query Execution
// =========================================================================

export async function processAssistantQuery(input: AssistantQueryInput): Promise<AssistantResult> {
  const { question, mode = "ask", context } = input;
  const isEn = input.locale === "en" || /^[a-zA-Z\s0-9.,?!'"-]+$/.test(question.trim());
  const safeQuestion = (question || "").replace(/\s+/g, " ").trim().slice(0, 1200);

  if (!safeQuestion && mode === "ask") {
    return {
      status: "error",
      title: isEn ? "Question is empty" : "السؤال فارغ",
      citations: [],
      reason: "out_of_scope",
    };
  }

  // 1. Memorization mode special handling (guided pedagogical advice)
  if (mode === "memorize" && context?.surahNumber && context?.ayahNumber) {
    const ayahCitation: AssistantCitation = {
      title: isEn
        ? `Surah ${context.surahNumber} · Ayah ${context.ayahNumber}`
        : `سورة ${context.surahNumber} · الآية ${context.ayahNumber}`,
      sourceName: isEn ? "Verified Quranic Text (Madinah Mushaf)" : "النص القرآني المتحقق · مصحف المدينة",
      url: `https://quranpedia.net/surah/${context.surahNumber}/${context.ayahNumber}`,
      excerpt: context.ayahText,
    };

    return {
      status: "success",
      title: isEn ? "Ayah Memorization Guidance" : "مساعدة حفظ مرتبطة بالآية",
      answer: isEn
        ? "Divide the ayah into concise thematic units. Connect the end of each unit to the beginning of the next before continuous repetition. Test recall before looking back at the text. (Learning methodology, not a religious tafsir)."
        : "قسّم الآية إلى وحدات لفظية قصيرة، واربط نهاية كل مقطع ببداية المقطع التالي بالتكرار التدريجي، ثم اختبر نفسك دون النظر للنص. هذه طريقة تعلم وتثبيت وليست تفسيراً للآية.",
      citations: [ayahCitation],
      confidence: "high",
    };
  }

  // 2. Intent Classification
  const intent = await classifyIntent(safeQuestion);

  // 3. Handle FATWA: strictly refer to qualified scholars
  if (intent === "fatwa") {
    return {
      status: "referral",
      title: isEn ? "Specialist consultation required" : "يحتاج مراجعة أهل الاختصاص",
      answer: isEn
        ? "Questions regarding personal religious rulings (fatwas) or specific legal jurisprudence are referred to certified Islamic scholars and accredited institutions. Adwam refrains from issuing independent rulings."
        : "المسائل الفقهية والأسئلة المتعلقة بالفتاوى الشخصية أو الأحكام الخاصة تُحال إلى أهل العلم المعتمدين والمجامع الفقهية، ولا يقدم أدوم فتاوى مستقلة.",
      citations: [],
      referralRequired: true,
      reason: "personal_fatwa",
    };
  }

  // 4. Handle OUTSIDE: out of scope
  if (intent === "outside") {
    return {
      status: "abstain",
      title: isEn ? "Out of scope" : "خارج نطاق المساعد",
      answer: isEn
        ? "I am Adwam, specialized in helping you memorize and understand the Holy Quran through verified sources. Please feel free to ask about Quranic verses, memorization plans, or authentic explanations."
        : "أنا أدوم، مخصص لمساعدتك في حفظ القرآن الكريم ومراجعته وفهمه من المصادر الموثقة. يسعدني أن تسألني عن معاني الآيات أو تنظيم وردك وحفظك.",
      citations: [],
      reason: "out_of_scope",
    };
  }

  // 5. Handle CONVERSATION or STUDY (No RAG retrieval needed)
  if (intent === "conversation" || intent === "study") {
    try {
      const studyPrompt = `
سؤال المستخدم: "${safeQuestion}"
اللغة المطلوبة: ${isEn ? "English" : "العربية"}
نوع الطلب: ${intent}

أجب كمساعد ودود اسمه "دوم".
إذا كان الطلب يتعلق بتنظيم الوقت أو خطة الحفظ (study): قدّم خطة واضحة واقعية وميسرة.
إذا كان تحية أو حديثاً عاماً (conversation): رد بود واختصار.
لا تدّع أي معلومة دينية أو تفسير لم يُطلب منك.
`;
      const reply = await callGroqChat([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: studyPrompt },
      ], 0.3);

      return {
        status: "success",
        title: isEn ? "Adwam Assistant" : "مساعد أدوم",
        answer: reply,
        citations: [],
        confidence: "high",
      };
    } catch {
      // Fallback if Groq unavailable
      return {
        status: "success",
        title: isEn ? "Adwam Assistant" : "مساعد أدوم",
        answer: isEn
          ? "Welcome! I am Adwam, your companion for Quran memorization and understanding. How can I assist you with your review or study today?"
          : "أهلاً بك! أنا أدوم، رفيقك في رحلة حفظ القرآن الكريم وتثبيته. كيف أستطيع مساعدتك في تنظيم وردك أو فهم آياتك اليوم؟",
        citations: [],
      };
    }
  }

  // 6. RELIGIOUS / TAFSIR / EXPLAIN: Full Grounded RAG Flow
  // A) Retrieval from SQLite FTS5
  let hits = await searchQuranDocs(safeQuestion, context, 8);

  // If no hits found from question and context exists, try searching by context
  if (hits.length === 0 && context?.surahNumber && context?.ayahNumber) {
    hits = await searchQuranDocs(`سورة ${context.surahNumber} آية ${context.ayahNumber}`, context, 8);
  }

  if (!hits || hits.length === 0) {
    return {
      status: "abstain",
      title: isEn ? "Verified source not available" : "لم يتوفر مصدر معتمد كافٍ",
      answer: isEn
        ? `No sufficiently verified source was found to answer «${safeQuestion}» with scholarly precision. Adwam refrains from unreferenced answers to maintain fidelity.`
        : `لم يُعثر على مصدر معتمد كافٍ للإجابة عن «${safeQuestion}» بدقة وتوثيق شرعي ضمن المصادر المتاحة. يمتنع أدوم عن تقديم إجابة غير مسندة حرصاً على الأمانة العلمية.`,
      citations: [],
      confidence: "low",
      reason: "insufficient_source",
    };
  }

  // B) Evidence Gate evaluation
  const formattedHits = hits.map((h, i) => `[المقطع ${i + 1}]
المصدر: ${h.title}
المؤلف: ${h.author}
الموضع: ${h.location}
النص: ${h.text}`).join("\n\n");

  let gateStatus = "NONE";
  let useIds: number[] = [];

  const { apiKey } = getGroqConfig();

  if (apiKey) {
    try {
      const gateRaw = await callGroqChat([
        { role: "system", content: RELEVANCE_PROMPT },
        { role: "user", content: `السؤال:\n${safeQuestion}\n\nالمقاطع:\n${formattedHits}` },
      ], 0);

      const gateParsed = parseJsonSafely<{ status: string; reason: string; use_ids: number[] }>(gateRaw);
      if (gateParsed?.status) {
        gateStatus = gateParsed.status.toUpperCase();
        if (Array.isArray(gateParsed.use_ids) && gateParsed.use_ids.length > 0) {
          useIds = gateParsed.use_ids.filter(id => id >= 1 && id <= hits.length);
        }
      }
    } catch (err) {
      console.warn("[RAG] Evidence Gate LLM call failed:", err);
    }
  }

  // Heuristic Evidence Gate when API key is not present or LLM call failed
  if (!apiKey || (gateStatus === "NONE" && !apiKey)) {
    if ((context?.surahNumber && context?.ayahNumber) || mode === "explain") {
      gateStatus = "DIRECT";
      useIds = [1];
    } else {
      // Check for arbitrary placeholder patterns or temporal trivia that denote unverified/unknown queries
      const hasArbitraryPattern = /(سنة كذا|يوم كذا|تاريخ كذا|في عام كذا|في عهد كذا|تفاصيل مسافة|كم عدد تفاصيل)/i.test(safeQuestion);
      if (hasArbitraryPattern) {
        gateStatus = "NONE";
        useIds = [];
      } else {
        // Evaluate token overlap between query and top hit
        const stopWords = new Set([
          "ما", "ماذا", "من", "هل", "كم", "كيف", "أين", "اين", "في", "عن", "على", "إلى", "الى",
          "مع", "أو", "او", "ثم", "إن", "ان", "أن", "هو", "هي", "هذا", "هذه", "ذلك", "تلك",
          "عدد", "فيها", "فيه", "لها", "له", "عنها", "عنه", "بها", "به", "كذا",
          "what", "is", "the", "of", "in", "to", "and", "or", "a", "an"
        ]);
        const qTokens = safeQuestion.toLowerCase().split(/[\s,،.؟?()!]+/).filter(t => t.length >= 2 && !stopWords.has(t));

        const EN_AR_KEYWORDS: Record<string, string> = {
          kawthar: "كوثر",
          fatihah: "فاتحة",
          faatiha: "فاتحة",
          baqarah: "بقرة",
          baqara: "بقرة",
          ikhlas: "إخلاص",
          nas: "ناس",
          falaq: "فلق",
          kahf: "كهف",
          yasin: "يس",
          rahman: "رحمن",
          mulk: "ملك",
          tafsir: "تفسير",
          meaning: "معنى",
          surah: "سورة",
          verse: "آية",
          ayah: "آية",
        };

        const expandedTokens = qTokens.flatMap(t => {
          const stripped = t.replace(/^(al|el)[-_]?/, "");
          const mapped = EN_AR_KEYWORDS[t] || EN_AR_KEYWORDS[stripped];
          return mapped ? [t, mapped] : [t];
        });

        const topHitText = ((hits[0]?.text || "") + " " + (hits[0]?.title || "") + " " + (hits[0]?.location || "")).toLowerCase();
        const matched = expandedTokens.filter(t => topHitText.includes(t));
        const ratio = qTokens.length > 0 ? matched.length / qTokens.length : 0;

        // If query keywords match top hit or high overlap exists
        if (ratio >= 0.4 || matched.length >= 2 || (isEn && matched.length >= 1)) {
          gateStatus = "PARTIAL";
          useIds = [1, 2].slice(0, hits.length);
        } else {
          gateStatus = "NONE";
          useIds = [];
        }
      }
    }
  }

  // C) If Evidence Gate is NONE or no IDs: Abstain!
  if (gateStatus === "NONE" || useIds.length === 0) {
    return {
      status: "abstain",
      title: isEn ? "Direct answer not in sources" : "لم نجد جواباً مباشراً في المصادر",
      answer: isEn
        ? `Adwam searched the verified Quranic dataset for «${safeQuestion}», but the retrieved passages do not contain a direct referenced answer to this inquiry. Adwam refrains from guessing to preserve scientific fidelity.`
        : `بحث أدوم في المصادر المعتمدة الموثقة عن «${safeQuestion}»، لكن المقاطع المسترجعة لا تقدم جواباً مباشراً وصريحاً على هذا الاستفسار، ويمتنع أدوم عن استنتاج معلومات غير مدعومة بالمصدر.`,
      citations: hits.slice(0, 2).map(h => ({
        title: h.title,
        sourceName: h.author !== "غير مذكور" ? `${h.title} · ${h.author}` : h.title,
        location: h.location,
        url: h.url || undefined,
        excerpt: h.excerpt,
      })),
      confidence: "low",
      reason: "insufficient_source",
    };
  }

  // D) Build Grounded Generation Prompt with Approved Context Only
  const selectedHits = useIds.map(id => hits[id - 1]).filter(Boolean);
  const selectedContext = selectedHits.map((h, j) => `[المصدر ${j + 1}: ${h.title} | ${h.author} | ${h.location}]
${h.text}`).join("\n\n");

  const generationPrompt = `
سؤال المستخدم: "${safeQuestion}"
اللغة المطلوبة للإجابة: ${isEn ? "English" : "العربية"}
نتيجة بوابة التحقق: ${gateStatus}

السياق العلمي الموثق المسموح استخدامه حصرياً:
${selectedContext}

التعليمات الصارمة:
1. أجب عن السؤال بالاعتماد على النصوص أعلاه فقط.
2. إذا كانت النتيجة PARTIAL، وضّح ما ذكره المصدر وصرح بما لم يحدده.
3. ${isEn ? "Answer fluently in English, citing the authentic Arabic commentary faithfully." : "أجب بعربية فصيحة وميسرة مستندة للمصدر."}
4. لا تذكر عبارات مثل "بناءً على البرومبت" أو "في السياق المعطى".
5. اذكر اسم المصدر المعتمد في نهاية الإجابة.
`;

  let answerText = "";
  if (apiKey) {
    try {
      answerText = await callGroqChat([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: generationPrompt },
      ], 0.2);
    } catch (err) {
      console.warn("[RAG] Groq Generation error:", err);
    }
  }

  // If no API key or generation failed, provide high-fidelity excerpt from top verified source
  if (!answerText) {
    answerText = isEn
      ? `Explanation referenced from ${selectedHits[0]?.title || "authentic sources"}:\n\n${selectedHits[0]?.excerpt || ""}`
      : `بيان من ${selectedHits[0]?.title || "المصادر المعتمدة"}:\n\n${selectedHits[0]?.excerpt || ""}`;
  }

  // Format Citations
  const citations: AssistantCitation[] = selectedHits.map(h => ({
    title: h.title,
    sourceName: h.author !== "غير مذكور" ? `${h.title} · ${h.author}` : h.title,
    location: h.location,
    url: h.url || (context?.surahNumber && context?.ayahNumber ? `https://quranpedia.net/surah/${context.surahNumber}/${context.ayahNumber}` : undefined),
    excerpt: h.excerpt,
  }));

  return {
    status: "success",
    title: isEn ? "Verified Explanation & Commentary" : "بيان وتفسير من المصادر المعتمدة",
    answer: answerText,
    citations,
    confidence: gateStatus === "DIRECT" ? "high" : "medium",
  };
}
