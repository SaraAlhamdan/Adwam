import {
  isMuqattaatAyah,
  splitUthmaniMuqattaat,
  expandMuqattaatText,
  expandTranscriptMuqattaat,
  getSpokenPrompt,
  MUQATTAAT_VERSES,
  fetchQuranRange,
} from "../shared/quran";
import { performWordAlignment } from "../supabase/functions/analyze-recitation/index";

async function run() {
  console.log("================================================================");
  console.log("QURANIC OPENING LETTERS (الحروف المقطّعة) VERIFICATION REPORT");
  console.log("================================================================\n");

  // 1. Verify 2:1 (ألف لام ميم)
  console.log("1. Testing 2:1 (Al-Baqarah Ayah 1):");
  const q2_1 = await fetchQuranRange({ type: "ayah", surahNumber: 2, fromAyah: 1, toAyah: 1 });
  const ayah2_1 = q2_1.ayahs[0];
  console.log(`   - Uthmani Text : «${ayah2_1.text_uthmani}»`);
  console.log(`   - Simple Clean : «${ayah2_1.text_simple}»`);
  console.log(`   - Is Muqatta'ah: ${isMuqattaatAyah(2, 1)}`);
  const spokenPrompt2_1 = getSpokenPrompt(ayah2_1);
  console.log(`   - Spoken Prompt: «${spokenPrompt2_1}»`);
  const letters2_1 = splitUthmaniMuqattaat(ayah2_1.text_uthmani);
  console.log(`   - Uthmani Units: [${letters2_1.join(", ")}] (count: ${letters2_1.length})`);

  // Spoken transcription
  const res2_1_spoken = performWordAlignment(ayah2_1.text_simple, "ألف لام ميم", [{ ayah: 1, text: ayah2_1.text_simple }]);
  console.log(`   - Result with spoken transcription «ألف لام ميم»: Match = ${res2_1_spoken.matchRate}%, Errors = ${res2_1_spoken.errorCount}`);
  console.log(`     Alignment chips:`, res2_1_spoken.wordAlignment.map(w => `${w.expected}: ${w.status}`));

  // Joined transcription
  const res2_1_joined = performWordAlignment(ayah2_1.text_simple, "الم", [{ ayah: 1, text: ayah2_1.text_simple }]);
  console.log(`   - Result with joined transcription «الم»: Match = ${res2_1_joined.matchRate}%, Errors = ${res2_1_joined.errorCount}`);
  if (res2_1_spoken.matchRate !== 100 || res2_1_joined.matchRate !== 100) {
    throw new Error("2:1 verification failed!");
  }
  console.log("   -> PASS\n");

  // 2. Verify 19:1 (كهيعص)
  console.log("2. Testing 19:1 (Maryam Ayah 1):");
  const q19_1 = await fetchQuranRange({ type: "ayah", surahNumber: 19, fromAyah: 1, toAyah: 1 });
  const ayah19_1 = q19_1.ayahs[0];
  console.log(`   - Uthmani Text : «${ayah19_1.text_uthmani}»`);
  console.log(`   - Simple Clean : «${ayah19_1.text_simple}»`);
  console.log(`   - Is Muqatta'ah: ${isMuqattaatAyah(19, 1)}`);
  const spokenPrompt19_1 = getSpokenPrompt(ayah19_1);
  console.log(`   - Spoken Prompt: «${spokenPrompt19_1}»`);
  const letters19_1 = splitUthmaniMuqattaat(ayah19_1.text_uthmani);
  console.log(`   - Uthmani Units: [${letters19_1.join(", ")}] (count: ${letters19_1.length})`);

  const res19_1_spoken = performWordAlignment(ayah19_1.text_simple, "كاف ها يا عين صاد", [{ ayah: 1, text: ayah19_1.text_simple }]);
  console.log(`   - Result with spoken transcription «كاف ها يا عين صاد»: Match = ${res19_1_spoken.matchRate}%, Errors = ${res19_1_spoken.errorCount}`);
  console.log(`     Alignment chips:`, res19_1_spoken.wordAlignment.map(w => `${w.expected}: ${w.status}`));

  const res19_1_joined = performWordAlignment(ayah19_1.text_simple, "كهيعص", [{ ayah: 1, text: ayah19_1.text_simple }]);
  console.log(`   - Result with joined transcription «كهيعص»: Match = ${res19_1_joined.matchRate}%, Errors = ${res19_1_joined.errorCount}`);
  if (res19_1_spoken.matchRate !== 100 || res19_1_joined.matchRate !== 100) {
    throw new Error("19:1 verification failed!");
  }
  console.log("   -> PASS\n");

  // 3. Verify 42:1-2 (حم / عسق)
  console.log("3. Testing 42:1-2 (Ash-Shura Ayahs 1 and 2):");
  const q42 = await fetchQuranRange({ type: "surah_range", surahNumber: 42, fromAyah: 1, toAyah: 2 });
  const ayah42_1 = q42.ayahs[0];
  const ayah42_2 = q42.ayahs[1];
  console.log(`   - Ayah 1: Uthmani «${ayah42_1.text_uthmani}», Simple «${ayah42_1.text_simple}», Prompt «${getSpokenPrompt(ayah42_1)}»`);
  console.log(`   - Ayah 2: Uthmani «${ayah42_2.text_uthmani}», Simple «${ayah42_2.text_simple}», Prompt «${getSpokenPrompt(ayah42_2)}»`);

  const expected42 = [
    { ayah: 1, text: ayah42_1.text_simple },
    { ayah: 2, text: ayah42_2.text_simple },
  ];
  const expectedText42 = `${ayah42_1.text_simple} ${ayah42_2.text_simple}`;
  const res42_spoken = performWordAlignment(expectedText42, "حا ميم عين سين قاف", expected42);
  console.log(`   - Combined spoken recitation «حا ميم عين سين قاف»: Match = ${res42_spoken.matchRate}%, Errors = ${res42_spoken.errorCount}`);
  console.log(`     Alignment with ayah mapping:`, res42_spoken.wordAlignment.map(w => `${w.expected} (Ayah ${w.ayah}): ${w.status}`));

  const res42_joined = performWordAlignment(expectedText42, "حم عسق", expected42);
  console.log(`   - Combined joined recitation «حم عسق»: Match = ${res42_joined.matchRate}%, Errors = ${res42_joined.errorCount}`);
  if (res42_spoken.matchRate !== 100 || res42_joined.matchRate !== 100) {
    throw new Error("42:1-2 verification failed!");
  }
  console.log("   -> PASS\n");

  // 4. Verify 36:1 (يس)
  console.log("4. Testing 36:1 (Ya-Seen Ayah 1):");
  const q36_1 = await fetchQuranRange({ type: "ayah", surahNumber: 36, fromAyah: 1, toAyah: 1 });
  const ayah36_1 = q36_1.ayahs[0];
  console.log(`   - Uthmani Text : «${ayah36_1.text_uthmani}»`);
  console.log(`   - Simple Clean : «${ayah36_1.text_simple}»`);
  console.log(`   - Is Muqatta'ah: ${isMuqattaatAyah(36, 1)}`);
  const spokenPrompt36_1 = getSpokenPrompt(ayah36_1);
  console.log(`   - Spoken Prompt: «${spokenPrompt36_1}»`);

  const res36_1_spoken = performWordAlignment(ayah36_1.text_simple, "يا سين", [{ ayah: 1, text: ayah36_1.text_simple }]);
  console.log(`   - Result with spoken transcription «يا سين»: Match = ${res36_1_spoken.matchRate}%, Errors = ${res36_1_spoken.errorCount}`);
  console.log(`     Alignment chips:`, res36_1_spoken.wordAlignment.map(w => `${w.expected}: ${w.status}`));

  const res36_1_joined = performWordAlignment(ayah36_1.text_simple, "يس", [{ ayah: 1, text: ayah36_1.text_simple }]);
  console.log(`   - Result with joined transcription «يس»: Match = ${res36_1_joined.matchRate}%, Errors = ${res36_1_joined.errorCount}`);
  if (res36_1_spoken.matchRate !== 100 || res36_1_joined.matchRate !== 100) {
    throw new Error("36:1 verification failed!");
  }
  console.log("   -> PASS\n");

  // 5. Verify detection of all 30 muqatta'at verses
  console.log("5. Verifying detection of all 30 Muqatta'at verses in Holy Quran:");
  console.log(`   Total loaded from verse data source: ${MUATTAAT_COUNT()} verses.`);
  for (const ref of MUQATTAAT_VERSES) {
    const [s, a] = ref.split(":").map(Number);
    if (!isMuqattaatAyah(s, a)) {
      throw new Error(`Failed detection for ${ref}`);
    }
  }
  console.log(`   All ${MUQATTAAT_VERSES.size} verses correctly identified without guessing.`);
  console.log("   -> PASS\n");

  console.log("ALL TESTS COMPLETED SUCCESSFULLY! 100% PASS.");
}

function MUATTAAT_COUNT() {
  return MUQATTAAT_VERSES.size;
}

run().catch(err => {
  console.error("FATAL VERIFICATION ERROR:", err);
  process.exit(1);
});
