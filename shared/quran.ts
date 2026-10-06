import { QURAN_METADATA } from "./quranMeta";

export const QURAN_SOURCE = {
  name: "AlQuran.cloud",
  edition: "quran-uthmani",
  url: "https://api.alquran.cloud/v1/page/{page}/quran-uthmani",
  mushaf: "مصحف المدينة · رواية حفص",
} as const;

export type QuranAyah = {
  number: number;
  text: string;           // Display (same as text_uthmani for backward compatibility)
  text_uthmani: string;   // Display only (Uthmani script)
  text_simple: string;    // Comparison only (Imla'i script)
  numberInSurah: number;
  page: number;
  juz?: number;
  hizbQuarter?: number;
  surah: {
    number: number;
    name: string;
    numberOfAyahs: number;
    englishName?: string;
  };
  wordCountUthmani?: number;
  wordCountSimple?: number;
  hasWordCountMismatch?: boolean;
};

export type QuranPage = {
  page: number;
  ayahs: QuranAyah[];
  surahNames: string[];
  firstVerse: QuranAyah;
  lastVerse: QuranAyah;
  hasWordCountMismatch?: boolean;
  mismatchedAyahs?: number[];
};

export type RangeSelectionType =
  | "ayah"         // Single Ayah
  | "surah_range"  // Surah + From Ayah to To Ayah
  | "page"         // Page (1-604)
  | "wird"         // Today's Ward
  | "half_page"    // Half a page (backward-compat)
  | "juz"          // Juz (backward-compat)
  | "rub";         // Rub' al-Hizb (backward-compat)

export type RangeSelection = {
  type: RangeSelectionType;
  surahNumber?: number;
  fromAyah?: number;
  toAyah?: number;
  pageNumber?: number;
  halfIndex?: 1 | 2;
  juzNumber?: number;
  rubNumber?: number;
};

export type QuranRangeResult = {
  selection: RangeSelection;
  title: string;
  label: string;
  ayahs: QuranAyah[];
  surahNames: string[];
  firstVerse: QuranAyah;
  lastVerse: QuranAyah;
  totalWords: number;
  hasWordCountMismatch: boolean;
  mismatchedAyahs: number[];
};

/**
 * Strips Quranic pause and annotation marks (e.g. ۛ, ۚ, ۖ, ۗ, ۘ, ۙ, ۜ, ۝, ۞, ۩, ؕ etc.)
 * Preserves Uthmani letter glyphs, small waw/yeh, zero signs, sukun variants, and small meem.
 */
export function stripQuranSymbols(text: string): string {
  if (!text) return "";
  return text
    .replace(/\uFEFF/g, "")
    .replace(/[\u06D6-\u06DC\u06DD\u06DE\u06E9\u0615]/g, "");
}

/**
 * Splits Quran ayah text into words after stripping pause marks
 */
export function extractAyahWords(text: string): string[] {
  if (!text) return [];
  return stripQuranSymbols(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Normalizes Arabic text strictly adhering to recitation testing rules:
 * 1. Remove tashkeel (harakat), Quranic pause/annotation symbols, and tatweel (\u0640)
 * 2. Unify all Alef/Hamza forms: [أإآٱ] -> ا
 * 3. Unify Waw Hamza -> و, Ya Hamza -> ي
 * 4. Unify ى and ي -> ي
 * 5. Unify ة and ه -> ه
 * 6. Strip non-Arabic letters/punctuation/digits except spaces
 * NOTE: Dagger alef (\u0670) is stripped from text_simple/transcript without global conversion to alef
 */
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
 * Gets the spoken letter prompt to guide Whisper transcription
 */
export function getSpokenPrompt(ayah: { text: string; text_simple?: string; surah?: { number: number }; numberInSurah?: number }): string {
  const surahNum = ayah.surah?.number;
  const ayahNum = ayah.numberInSurah;
  const baseText = (ayah.text_simple || ayah.text || "").trim();
  return expandMuqattaatText(baseText, surahNum, ayahNum);
}

export function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFKD")
    .replace(/\uFEFF/g, "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
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
 * Calculates Levenshtein edit distance between two strings
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
 * Tolerance check: if words differ by <= 1 character or similarity ratio >= 0.8
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

/**
 * Merges Uthmani and Simple Clean representations into rich QuranAyah items
 * and checks for word count consistency per ayah
 */
export function mergeAyahEditions(
  uthmaniAyahs: any[],
  simpleAyahs: any[],
  defaultSurah?: { number: number; name: string; numberOfAyahs: number; englishName?: string }
): { ayahs: QuranAyah[]; hasMismatch: boolean; mismatchedAyahs: number[] } {
  const ayahs: QuranAyah[] = [];
  const mismatchedAyahs: number[] = [];

  for (let i = 0; i < uthmaniAyahs.length; i++) {
    const u = uthmaniAyahs[i];
    const s = simpleAyahs[i] || u;
    let uText = u.text || "";
    let sText = s.text || "";
    const surahNum = u.surah?.number ?? defaultSurah?.number ?? 1;
    const surahName = u.surah?.name ?? defaultSurah?.name ?? "";
    const surahAyahsCount = u.surah?.numberOfAyahs ?? defaultSurah?.numberOfAyahs ?? 7;

    // In Quran databases, Basmalah is often prefixed to verse 1 for surahs 2..114 as a header.
    // Strip it so the expected verse text matches what reciters actually pronounce.
    if (surahNum > 1 && u.numberInSurah === 1) {
      uText = uText
        .replace(/^بِسْمِ\s+ٱللَّهِ\s+ٱلرَّحْمَٰنِ\s+ٱلرَّحِيمِ\s*/, "")
        .replace(/^بِسْمِ\s+اللَّهِ\s+الرَّحْمَٰنِ\s+الرَّحِيمِ\s*/, "")
        .trim();
      sText = sText
        .replace(/^بسم\s+الله\s+الرحمن\s+الرحيم\s*/, "")
        .trim();
    }

    const uWords = extractAyahWords(uText);
    const sWords = extractAyahWords(sText);
    const isMismatch = uWords.length !== sWords.length;
    if (isMismatch) {
      mismatchedAyahs.push(u.numberInSurah);
    }

    ayahs.push({
      number: u.number,
      text: uText,
      text_uthmani: uText,
      text_simple: sText,
      numberInSurah: u.numberInSurah,
      page: u.page,
      juz: u.juz,
      hizbQuarter: u.hizbQuarter,
      surah: {
        number: surahNum,
        name: surahName,
        numberOfAyahs: surahAyahsCount,
        englishName: u.surah?.englishName ?? defaultSurah?.englishName,
      },
      wordCountUthmani: uWords.length,
      wordCountSimple: sWords.length,
      hasWordCountMismatch: isMismatch,
    });
  }

  return {
    ayahs,
    hasMismatch: mismatchedAyahs.length > 0,
    mismatchedAyahs,
  };
}

/**
 * Backward compatibility parser for single page
 */
export function normalizeQuranPage(payload: unknown, requestedPage: number): QuranPage {
  if (!payload || typeof payload !== "object") throw new Error("مصدر القرآن لم يُرجع بيانات قابلة للتحقق");
  const response = payload as { code?: number; data?: { number?: number; ayahs?: unknown[] } };
  if (response.code !== 200 || !response.data || !Array.isArray(response.data.ayahs)) {
    throw new Error("تعذر التحقق من صفحة القرآن من المصدر");
  }
  const rawAyahs = response.data.ayahs as any[];
  if (rawAyahs.length === 0) throw new Error("لم تصل آيات صحيحة لهذه الصفحة");

  const { ayahs, hasMismatch, mismatchedAyahs } = mergeAyahEditions(rawAyahs, rawAyahs);
  const page = response.data.number === requestedPage ? response.data.number : requestedPage;
  const surahNames = Array.from(new Set(ayahs.map(ayah => ayah.surah.name)));
  return {
    page,
    ayahs,
    surahNames,
    firstVerse: ayahs[0],
    lastVerse: ayahs[ayahs.length - 1],
    hasWordCountMismatch: hasMismatch,
    mismatchedAyahs,
  };
}

export function verseRangeLabel(page: { firstVerse: QuranAyah; lastVerse: QuranAyah }): string {
  const first = `${page.firstVerse.surah.number}:${page.firstVerse.numberInSurah}`;
  const last = `${page.lastVerse.surah.number}:${page.lastVerse.numberInSurah}`;
  return first === last ? first : `${first}–${last}`;
}

export function pageSourceUrl(page: number): string {
  return QURAN_SOURCE.url.replace("{page}", String(page));
}

/**
 * Tanzil Quran Metadata Helper Accessors
 */
export function getSurahList() {
  return QURAN_METADATA.surahs.references;
}

export function getSurahByNumber(num: number) {
  return QURAN_METADATA.surahs.references.find(s => s.number === num) || QURAN_METADATA.surahs.references[0];
}


export function getJuzMetadata(juz: number) {
  if (juz < 1 || juz > 30) return null;
  return QURAN_METADATA.juzs.references[juz - 1];
}

export function getRubMetadata(rub: number) {
  if (rub < 1 || rub > 240) return null;
  return QURAN_METADATA.hizbQuarters.references[rub - 1];
}

/**
 * Fetches dual editions (Uthmani + Simple Clean) for any range selection
 */
export async function fetchQuranRange(selection: RangeSelection): Promise<QuranRangeResult> {
  let title = "";
  let label = "";
  let uthmaniData: any[] = [];
  let simpleData: any[] = [];

  switch (selection.type) {
    case "ayah": {
      const surahNum = selection.surahNumber || 2;
      const ayahNum = selection.fromAyah || 2;
      const surahInfo = getSurahByNumber(surahNum);
      title = `${surahInfo.name} · الآية ${ayahNum}`;
      label = `${surahNum}:${ayahNum}`;

      const res = await fetch(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/editions/quran-uthmani,quran-simple-clean`);
      const payload = await res.json();
      if (payload.code !== 200 || !Array.isArray(payload.data) || payload.data.length < 2) {
        throw new Error(`تعذر جلب الآية ${surahNum}:${ayahNum} من المصدر.`);
      }
      uthmaniData = [payload.data[0]];
      simpleData = [payload.data[1]];
      break;
    }

    case "surah_range": {
      const surahNum = selection.surahNumber || 1;
      const surahInfo = getSurahByNumber(surahNum);
      const from = Math.max(1, Math.min(selection.fromAyah || 1, surahInfo.numberOfAyahs));
      const to = Math.max(from, Math.min(selection.toAyah || surahInfo.numberOfAyahs, surahInfo.numberOfAyahs));
      title = `${surahInfo.name} · الآيات ${from}–${to}`;
      label = `${surahNum}:${from}–${surahNum}:${to}`;

      const [uRes, sRes] = await Promise.all([
        fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/quran-uthmani`).then(r => r.json()),
        fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/quran-simple-clean`).then(r => r.json()),
      ]);
      if (uRes.code !== 200 || sRes.code !== 200) {
        throw new Error(`تعذر جلب سورة ${surahInfo.name} من المصدر.`);
      }
      uthmaniData = (uRes.data?.ayahs || []).slice(from - 1, to);
      simpleData = (sRes.data?.ayahs || []).slice(from - 1, to);
      break;
    }

    case "page": {
      const pageNum = Math.max(1, Math.min(selection.pageNumber || 1, 604));
      title = `صفحة المصحف رقم ${pageNum}`;
      label = `صفحة ${pageNum}`;

      const [uRes, sRes] = await Promise.all([
        fetch(`https://api.alquran.cloud/v1/page/${pageNum}/quran-uthmani`).then(r => r.json()),
        fetch(`https://api.alquran.cloud/v1/page/${pageNum}/quran-simple-clean`).then(r => r.json()),
      ]);
      if (uRes.code !== 200 || sRes.code !== 200) {
        throw new Error(`تعذر جلب صفحة ${pageNum} من المصدر.`);
      }
      uthmaniData = uRes.data?.ayahs || [];
      simpleData = sRes.data?.ayahs || [];
      break;
    }

    case "wird": {
      const pageNum = Math.max(1, Math.min(selection.pageNumber || 1, 604));
      title = `ورد اليوم · صفحة المصحف ${pageNum}`;
      label = `ورد اليوم (صفحة ${pageNum})`;

      const [uRes, sRes] = await Promise.all([
        fetch(`https://api.alquran.cloud/v1/page/${pageNum}/quran-uthmani`).then(r => r.json()),
        fetch(`https://api.alquran.cloud/v1/page/${pageNum}/quran-simple-clean`).then(r => r.json()),
      ]);
      if (uRes.code !== 200 || sRes.code !== 200) {
        throw new Error(`تعذر جلب ورد اليوم (صفحة ${pageNum}) من المصدر.`);
      }
      uthmaniData = uRes.data?.ayahs || [];
      simpleData = sRes.data?.ayahs || [];
      break;
    }

    case "half_page": {
      const pageNum = Math.max(1, Math.min(selection.pageNumber || 1, 604));
      const half = selection.halfIndex === 2 ? 2 : 1;
      const [uRes, sRes] = await Promise.all([
        fetch(`https://api.alquran.cloud/v1/page/${pageNum}/quran-uthmani`).then(r => r.json()),
        fetch(`https://api.alquran.cloud/v1/page/${pageNum}/quran-simple-clean`).then(r => r.json()),
      ]);
      if (uRes.code !== 200 || sRes.code !== 200) {
        throw new Error(`تعذر جلب صفحة ${pageNum} من المصدر.`);
      }
      const allU = uRes.data?.ayahs || [];
      const allS = sRes.data?.ayahs || [];
      const mid = Math.max(1, Math.ceil(allU.length / 2));
      if (half === 1) {
        uthmaniData = allU.slice(0, mid);
        simpleData = allS.slice(0, mid);
        title = `صفحة ${pageNum} · النصف الأول`;
      } else {
        uthmaniData = allU.slice(mid);
        simpleData = allS.slice(mid);
        title = `صفحة ${pageNum} · النصف الثاني`;
      }
      label = `صفحة ${pageNum} (${half === 1 ? "نصف 1" : "نصف 2"})`;
      break;
    }

    case "juz": {
      const juzNum = Math.max(1, Math.min(selection.juzNumber || 1, 30));
      title = `الجزء ${juzNum}`;
      label = `جزء ${juzNum}`;

      const [uRes, sRes] = await Promise.all([
        fetch(`https://api.alquran.cloud/v1/juz/${juzNum}/quran-uthmani`).then(r => r.json()),
        fetch(`https://api.alquran.cloud/v1/juz/${juzNum}/quran-simple-clean`).then(r => r.json()),
      ]);
      if (uRes.code !== 200 || sRes.code !== 200) {
        throw new Error(`تعذر جلب الجزء ${juzNum} من المصدر.`);
      }
      uthmaniData = uRes.data?.ayahs || [];
      simpleData = sRes.data?.ayahs || [];
      break;
    }

    case "rub": {
      const rubNum = Math.max(1, Math.min(selection.rubNumber || 1, 240));
      const hizb = Math.floor((rubNum - 1) / 4) + 1;
      const quarter = ((rubNum - 1) % 4) + 1;
      title = `ربع الحزب رقم ${rubNum} (الحزب ${hizb} · الربع ${quarter})`;
      label = `ربع ${rubNum}`;

      const [uRes, sRes] = await Promise.all([
        fetch(`https://api.alquran.cloud/v1/hizbQuarter/${rubNum}/quran-uthmani`).then(r => r.json()),
        fetch(`https://api.alquran.cloud/v1/hizbQuarter/${rubNum}/quran-simple-clean`).then(r => r.json()),
      ]);
      if (uRes.code !== 200 || sRes.code !== 200) {
        throw new Error(`تعذر جلب ربع الحزب ${rubNum} من المصدر.`);
      }
      uthmaniData = uRes.data?.ayahs || [];
      simpleData = sRes.data?.ayahs || [];
      break;
    }
  }

  if (uthmaniData.length === 0) {
    throw new Error("لم يتم العثور على أي آيات للنطاق المحدد.");
  }

  const defaultSurah = selection.surahNumber ? getSurahByNumber(selection.surahNumber) : undefined;
  const { ayahs, hasMismatch, mismatchedAyahs } = mergeAyahEditions(uthmaniData, simpleData, defaultSurah);
  const surahNames = Array.from(new Set(ayahs.map(a => a.surah.name)));
  const totalWords = ayahs.reduce((sum, a) => sum + (a.wordCountUthmani || 0), 0);

  return {
    selection,
    title,
    label,
    ayahs,
    surahNames,
    firstVerse: ayahs[0],
    lastVerse: ayahs[ayahs.length - 1],
    totalWords,
    hasWordCountMismatch: hasMismatch,
    mismatchedAyahs,
  };
}

export type PageMetadata = {
  page: number;
  surahNumber: number;
  surahName: string;
  surahEnglishName: string;
  firstAyah: number;
  lastAyah: number;
  ayahRangeLabel: string;
};

export function getPageMetadata(pageNumber: number): PageMetadata {
  const p = Math.max(1, Math.min(604, Math.floor(pageNumber) || 1));
  const current = QURAN_METADATA.pages.references[p - 1];
  const next = p < 604 ? QURAN_METADATA.pages.references[p] : null;
  const surahInfo = QURAN_METADATA.surahs.references[current.surah - 1];

  const firstAyah = current.ayah;
  let lastAyah = surahInfo.numberOfAyahs;
  if (next) {
    if (next.surah === current.surah) {
      lastAyah = next.ayah - 1;
    } else {
      lastAyah = surahInfo.numberOfAyahs;
    }
  }

  return {
    page: p,
    surahNumber: current.surah,
    surahName: surahInfo.name,
    surahEnglishName: surahInfo.englishName,
    firstAyah,
    lastAyah,
    ayahRangeLabel: `${firstAyah}–${lastAyah}`,
  };
}
