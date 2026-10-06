import {
  normalizeArabic,
  performWordAlignment,
  isUncertainMatch,
  levenshteinDistance,
} from "../supabase/functions/analyze-recitation/index";
import { fetchQuranRange, extractAyahWords } from "../shared/quran";

async function runAllTests() {
  console.log("=================================================================");
  console.log("TEST 1: Ayah 2:2 (Must be 100% when read correctly)");
  console.log("=================================================================");
  const range2_2 = await fetchQuranRange({
    type: "ayah",
    surahNumber: 2,
    fromAyah: 2,
    toAyah: 2,
  });
  const ayah2_2 = range2_2.ayahs[0];
  console.log("Uthmani Text: ", ayah2_2.text_uthmani);
  console.log("Simple Text:  ", ayah2_2.text_simple);
  console.log("Uthmani Words:", extractAyahWords(ayah2_2.text_uthmani));
  console.log("Simple Words: ", extractAyahWords(ayah2_2.text_simple));

  // Simulating Whisper correct transcription:
  const transcript2_2 = "ذلك الكتاب لا ريب فيه هدى للمتقين";
  const result2_2 = performWordAlignment(ayah2_2.text_simple, transcript2_2);
  console.log("Match Rate:   ", result2_2.matchRate + "%");
  console.log("Correct Count:", result2_2.correctCount);
  console.log("Uncertain:    ", result2_2.uncertainCount);
  console.log("Errors:       ", result2_2.errorCount);
  console.log("Differences:  ", result2_2.differences.length);
  if (result2_2.matchRate !== 100 || result2_2.errorCount !== 0) {
    throw new Error("TEST 1 FAILED: Expected 100% match for 2:2!");
  }
  console.log(">>> TEST 1 PASSED: 100% MATCH!\n");

  console.log("=================================================================");
  console.log("TEST 2: Verse containing الصلاة and الرحمن");
  console.log("=================================================================");
  // Test both with Maryam 19:58-59 and an explicit combined Quranic passage:
  // In Uthmani: "ٱلصَّلَوٰةَ" and "ٱلرَّحْمَٰنِ"
  // In Simple: "الصلاة" and "الرحمن"
  const expectedPassage = "الذين يقيمون الصلاة ويؤتون الزكاة وهم بالرحمن يوقنون";
  // Whisper returns standard spelling without tashkeel:
  const transcriptPassage = "الذين يقيمون الصلاه ويؤتون الزكاه وهم بالرحمن يوقنون";
  const resultPassage = performWordAlignment(expectedPassage, transcriptPassage);

  console.log("Expected:     ", expectedPassage);
  console.log("Transcript:   ", transcriptPassage);
  console.log("Match Rate:   ", resultPassage.matchRate + "%");
  console.log("Correct Count:", resultPassage.correctCount);
  console.log("Uncertain:    ", resultPassage.uncertainCount);
  console.log("Errors:       ", resultPassage.errorCount);

  // Also test with 1-character tolerance on "الرحمن" vs "الرحمان" and "الصلاة" vs "لصلاة":
  const transcriptWithNear = "الذين يقيمون لصلاة ويؤتون الزكاة وهم بالرحمان يوقنون";
  const resultNear = performWordAlignment(expectedPassage, transcriptWithNear);
  console.log("Near Match (tolerance test):");
  console.log("Uncertain Count:", resultNear.uncertainCount);
  console.log("Errors Count:   ", resultNear.errorCount, "(uncertain excluded from error count)");
  console.log("Match Rate:     ", resultNear.matchRate + "%");
  if (resultPassage.matchRate !== 100 || resultNear.errorCount !== 0) {
    throw new Error("TEST 2 FAILED!");
  }
  console.log(">>> TEST 2 PASSED: 'الصلاة' and 'الرحمن' handled with 100% accuracy & tolerance!\n");

  console.log("=================================================================");
  console.log("TEST 3: 3-Ayah Range (Al-Baqarah 2:1 to 2:3)");
  console.log("=================================================================");
  const range3 = await fetchQuranRange({
    type: "surah_range",
    surahNumber: 2,
    fromAyah: 1,
    toAyah: 3,
  });
  console.log("Range Title:   ", range3.title);
  console.log("Ayahs Count:   ", range3.ayahs.length);
  console.log("Total Words:   ", range3.totalWords);
  console.log("Word Mismatch: ", range3.hasWordCountMismatch);

  // Test segmented recitation for each of the 3 ayahs:
  const segmentResults = [];
  const transcripts = [
    "الم",
    "ذلك الكتاب لا ريب فيه هدى للمتقين",
    "الذين يؤمنون بالغيب ويقيمون الصلاة ومما رزقناهم ينفقون",
  ];

  for (let i = 0; i < range3.ayahs.length; i++) {
    const a = range3.ayahs[i];
    const t = transcripts[i];
    const segRes = performWordAlignment(a.text_simple, t, [{ ayah: a.numberInSurah, text: a.text_simple }]);
    segmentResults.push(segRes);
    console.log(`Segment ${i + 1} (2:${a.numberInSurah}): Match ${segRes.matchRate}%, Words: ${segRes.expectedWordsCount}, Correct: ${segRes.correctCount}`);
  }

  // Merge results for the whole range:
  const totalWords = segmentResults.reduce((s, r) => s + r.expectedWordsCount, 0);
  const totalCorrect = segmentResults.reduce((s, r) => s + r.correctCount, 0);
  const totalErrors = segmentResults.reduce((s, r) => s + r.errorCount, 0);
  const overallMatch = Math.round(((totalWords - totalErrors) / totalWords) * 100);
  console.log("Overall 3-Ayah Match Rate:", overallMatch + "%");
  if (overallMatch !== 100) {
    throw new Error("TEST 3 FAILED: 3-ayah range did not achieve 100%!");
  }
  console.log(">>> TEST 3 PASSED: 3-Ayah Range Segmented & Merged Successfully!\n");

  console.log("=================================================================");
  console.log("TEST 4: One Full Page (Page 2 - Al-Baqarah 2:1 to 2:5)");
  console.log("=================================================================");
  const pageRange = await fetchQuranRange({
    type: "page",
    pageNumber: 2,
  });
  console.log("Page Title:     ", pageRange.title);
  console.log("Page Ayahs:     ", pageRange.ayahs.length);
  console.log("Total Words:    ", pageRange.totalWords);
  console.log("Word Mismatch:  ", pageRange.hasWordCountMismatch);
  console.log("Mismatches:     ", pageRange.mismatchedAyahs);

  // Validate each ayah's word count consistency:
  for (const a of pageRange.ayahs) {
    const uCount = extractAyahWords(a.text_uthmani).length;
    const sCount = extractAyahWords(a.text_simple).length;
    console.log(`Ayah 2:${a.numberInSurah} -> Uthmani: ${uCount} words | Simple: ${sCount} words | Match: ${uCount === sCount}`);
    if (uCount !== sCount) {
      throw new Error(`Ayah 2:${a.numberInSurah} word count mismatch!`);
    }
  }

  // Simulate reciting the full page segment-by-segment:
  let pageTotalWords = 0;
  let pageCorrectWords = 0;
  for (let i = 0; i < pageRange.ayahs.length; i++) {
    const a = pageRange.ayahs[i];
    // Ideal recitation of simple text:
    const segRes = performWordAlignment(a.text_simple, a.text_simple, [{ ayah: a.numberInSurah, text: a.text_simple }]);
    pageTotalWords += segRes.expectedWordsCount;
    pageCorrectWords += segRes.correctCount;
  }
  const pageMatchRate = Math.round((pageCorrectWords / pageTotalWords) * 100);
  console.log(`Full Page 2 Results: ${pageCorrectWords}/${pageTotalWords} words correct (${pageMatchRate}%)`);
  if (pageMatchRate !== 100) {
    throw new Error("TEST 4 FAILED: Full page did not achieve 100%!");
  }
  console.log(">>> TEST 4 PASSED: Full Page 2 Verified 100%!\n");

  console.log("=================================================================");
  console.log("ALL 4 VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
  console.log("=================================================================");
}

runAllTests().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
