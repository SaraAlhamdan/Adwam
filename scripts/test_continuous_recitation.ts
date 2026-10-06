import { performWordAlignment } from "../supabase/functions/analyze-recitation/index";
import { isMuqattaatAyah, splitUthmaniMuqattaat, extractAyahWords, getSpokenPrompt } from "../shared/quran";

const testAyahs = [
  { surah: { number: 2, name: "البقرة" }, numberInSurah: 1, text_uthmani: "الٓمٓ", text_simple: "الم", page: 2 },
  { surah: { number: 2, name: "البقرة" }, numberInSurah: 2, text_uthmani: "ذَٰلِكَ ٱلْكِتَـٰبُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ", text_simple: "ذلك الكتاب لا ريب فيه هدى للمتقين", page: 2 },
];

const promptText = testAyahs.map(a => getSpokenPrompt(a as any)).join(" ");
const expectedAyahs = testAyahs.map(a => ({ ayah: a.numberInSurah, text: getSpokenPrompt(a as any) }));

// Reciter recited spoken letters "ألف لام ميم" then verse 2
const reciterSpoken = "ألف لام ميم ذلك الكتاب لا ريب فيه هدى للمتقين";

const res = performWordAlignment(promptText, reciterSpoken, expectedAyahs);

console.log("Match:", res.matchRate, "%");
console.log("Differences count:", res.differences.length);

let alignCursor = 0;
for (const ayah of testAyahs) {
  const words = extractAyahWords(ayah.text_uthmani);
  const isMuq = isMuqattaatAyah(ayah.surah.number, ayah.numberInSurah);
  console.log(`\n--- Ayah ${ayah.numberInSurah} (${words.length} words, muq=${isMuq}) ---`);
  for (let wIdx = 0; wIdx < words.length; wIdx++) {
    const w = words[wIdx];
    if (isMuq && wIdx === 0) {
      const letters = splitUthmaniMuqattaat(w);
      for (const l of letters) {
        const item = res.wordAlignment[alignCursor++];
        console.log(`Letter '${l}' -> Status: ${item?.status}, Expected: ${item?.expected}, Actual: ${item?.actual}`);
      }
    } else {
      const item = res.wordAlignment[alignCursor++];
      console.log(`Word '${w}' -> Status: ${item?.status}, Expected: ${item?.expected}, Actual: ${item?.actual}`);
    }
  }
}
console.log("\nFinal cursor:", alignCursor, "Total alignments:", res.wordAlignment.length);
