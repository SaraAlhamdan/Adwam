import { fetchQuranRange } from "../shared/quran";

function stripQuranSymbolsRefined(text: string): string {
  if (!text) return "";
  return text
    .replace(/\uFEFF/g, "")
    .replace(/[\u06D6-\u06DC\u06DD\u06DE\u06E9\u0615]/g, "");
}

function extractAyahWordsRefined(text: string): string[] {
  if (!text) return [];
  return stripQuranSymbolsRefined(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

async function testAll() {
  const verses = [
    { ref: "1:1", note: "Fatiha 1 (الرحمن)" },
    { ref: "1:2", note: "Fatiha 2" },
    { ref: "1:7", note: "Fatiha 7 (الضالين with madda)" },
    { ref: "2:1", note: "2:1 (الم)" },
    { ref: "2:2", note: "2:2 (waqf sign ۛ)" },
    { ref: "55:1", note: "55:1 (الرحمن)" },
    { ref: "2:26", note: "2:26 (بِهِۦ, waqf signs, rub el hizb ۞)" },
    { ref: "2:27", note: "2:27 (مِيثَٰقِهِۦ, بِهِۦ, مِنۢ بَعْدِ, أُو۟لَٰٓئِكَ)" },
    { ref: "2:5", note: "2:5 (أُو۟لَٰٓئِكَ with zero ۟)" },
    { ref: "18:23", note: "18:23 (لِشَا۟ىْءٍ with zero ۟)" },
    { ref: "53:51", note: "53:51 (وَثَمُودَا۟ with zero ۟)" },
    { ref: "2:130", note: "2:130 (نَفْسَهُۥ with small waw ۥ)" },
  ];

  for (const v of verses) {
    const range = await fetchQuranRange({
      type: "ayah",
      surahNumber: Number(v.ref.split(":")[0]),
      fromAyah: Number(v.ref.split(":")[1]),
      toAyah: Number(v.ref.split(":")[1])
    });
    const ayah = range.ayahs[0];
    const uWords = extractAyahWordsRefined(ayah.text_uthmani);
    const sWords = extractAyahWordsRefined(ayah.text_simple);

    console.log(`\n=== [${v.ref}] ${v.note} ===`);
    console.log(`Uthmani sample: ${uWords.slice(0, 5).join(" | ")}`);
    console.log(`Simple sample : ${sWords.slice(0, 5).join(" | ")}`);
    console.log(`Count match: Uthmani=${uWords.length}, Simple=${sWords.length} -> ${uWords.length === sWords.length ? "MATCH" : "MISMATCH"}`);

    // Check specific glyph preservations in Uthmani
    if (v.ref === "2:26") {
      const bihi = uWords.find(w => w.includes("بِهِ"));
      console.log(`  Checking بِهِۦ in Uthmani: «${bihi}» -> Has small yeh ۦ: ${bihi?.includes("ۦ")}`);
    }
    if (v.ref === "2:27") {
      const meem = uWords.find(w => w.includes("مِنۢ"));
      console.log(`  Checking مِنۢ in Uthmani: «${meem}» -> Has small meem ۢ: ${meem?.includes("ۢ")}`);
    }
    if (v.ref === "2:130") {
      const nafsu = uWords.find(w => w.includes("نَفْسَهُ"));
      console.log(`  Checking نَفْسَهُۥ in Uthmani: «${nafsu}» -> Has small waw ۥ: ${nafsu?.includes("ۥ")}`);
    }
    if (v.ref === "2:5") {
      const ula = uWords.find(w => w.includes("أُو۟"));
      console.log(`  Checking أُو۟لَٰٓئِكَ in Uthmani: «${ula}» -> Has rounded zero ۟: ${ula?.includes("۟")}`);
    }
    if (v.ref === "53:51") {
      const thamud = uWords.find(w => w.includes("ثَمُودَا"));
      console.log(`  Checking وَثَمُودَا۟ in Uthmani: «${thamud}» -> Has rounded zero ۟: ${thamud?.includes("۟")}`);
    }
    if (v.ref === "18:23") {
      const shayin = uWords.find(w => w.includes("لِشَا"));
      console.log(`  Checking لِشَا۟ىْءٍ in Uthmani: «${shayin}» -> Has rounded zero ۟: ${shayin?.includes("۟")}`);
    }
  }
}

testAll().catch(console.error);
