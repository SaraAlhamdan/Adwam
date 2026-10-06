import { describe, it, expect } from "vitest";

// Letter names mapping as required by user
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

export const MUQATTAAT_VERSES = new Set<string>([
  "2:1", "3:1", "7:1", "10:1", "11:1", "12:1", "13:1", "14:1", "15:1",
  "19:1", "20:1", "26:1", "27:1", "28:1", "29:1", "30:1", "31:1", "32:1",
  "36:1", "38:1", "40:1", "41:1", "42:1", "42:2", "43:1", "44:1", "45:1",
  "46:1", "50:1", "68:1",
]);

export const KNOWN_MUQATTAAT_WORDS = new Set<string>([
  "الم", "المص", "الر", "المر", "كهيعص", "طه", "طسم", "طس", "يس", "ص", "حم", "عسق", "ق", "ن"
]);

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

export function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFKD")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    // Normalize letter names ending with hamza (e.g. طاء -> طا, حاء -> حا, هاء -> ها, راء -> را, ياء -> يا)
    .replace(/\b([طحركهي])اء\b/g, "$1ا")
    .replace(/[^\u0621-\u064A\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("Muqattaat expansions", () => {
  it("expands 2:1 (الم) -> ألف لام ميم", () => {
    expect(expandMuqattaatText("الم", 2, 1)).toBe("ألف لام ميم");
    expect(normalizeArabic(expandMuqattaatText("الم", 2, 1))).toBe("الف لام ميم");
  });

  it("expands 19:1 (كهيعص) -> كاف ها يا عين صاد", () => {
    expect(expandMuqattaatText("كهيعص", 19, 1)).toBe("كاف ها يا عين صاد");
    expect(normalizeArabic(expandMuqattaatText("كهيعص", 19, 1))).toBe("كاف ها يا عين صاد");
  });

  it("expands 42:1-2 (حم / عسق)", () => {
    expect(expandMuqattaatText("حم", 42, 1)).toBe("حا ميم");
    expect(expandMuqattaatText("عسق", 42, 2)).toBe("عين سين قاف");
  });

  it("expands 36:1 (يس)", () => {
    expect(expandMuqattaatText("يس", 36, 1)).toBe("يا سين");
  });

  it("expands 20:1 (طه)", () => {
    expect(expandMuqattaatText("طه", 20, 1)).toBe("طا ها");
  });

  it("accepts joined letters in transcript (الم, حم)", () => {
    expect(expandTranscriptMuqattaat("الم")).toBe("ألف لام ميم");
    expect(expandTranscriptMuqattaat("حم")).toBe("حا ميم");
    expect(expandTranscriptMuqattaat("يس")).toBe("يا سين");
    expect(expandTranscriptMuqattaat("كهيعص")).toBe("كاف ها يا عين صاد");
  });

  it("normalizes hamza variants of letter names correctly", () => {
    expect(normalizeArabic("طاء هاء")).toBe("طا ها");
    expect(normalizeArabic("حاء ميم")).toBe("حا ميم");
    expect(normalizeArabic("كاف هاء ياء عين صاد")).toBe("كاف ها يا عين صاد");
    expect(normalizeArabic("الف لام راء")).toBe("الف لام را");
  });
});
