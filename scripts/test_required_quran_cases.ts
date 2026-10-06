import { fetchQuranRange, extractAyahWords, stripQuranSymbols } from "../shared/quran";
import { performWordAlignment } from "../supabase/functions/analyze-recitation/index";

async function run() {
  console.log("=================================================");
  console.log("AUDIT OF QURAN-SPECIFIC RECITATION CASES");
  console.log("=================================================\n");

  const testCases = [
    {
      name: "Al-Fatiha (1:1-1:7)",
      selection: { type: "surah_range" as const, surahNumber: 1, fromAyah: 1, toAyah: 7 },
      transcripts: [
        "بسم الله الرحمن الرحيم",
        "الحمد لله رب العالمين",
        "الرحمن الرحيم",
        "مالك يوم الدين",
        "إياك نعبد وإياك نستعين",
        "اهدنا الصراط المستقيم",
        "صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين"
      ]
    },
    {
      name: "2:1 (الم)",
      selection: { type: "ayah" as const, surahNumber: 2, fromAyah: 1, toAyah: 1 },
      transcripts: ["ألف لام ميم"]
    },
    {
      name: "2:2 (ذلك الكتاب لا ريب فيه هدى للمتقين - contains waqf sign ۛ)",
      selection: { type: "ayah" as const, surahNumber: 2, fromAyah: 2, toAyah: 2 },
      transcripts: ["ذلك الكتاب لا ريب فيه هدى للمتقين"]
    },
    {
      name: "Verse with الرحمن (55:1)",
      selection: { type: "ayah" as const, surahNumber: 55, fromAyah: 1, toAyah: 1 },
      transcripts: ["الرحمن"]
    },
    {
      name: "Verse with small waw or yeh (like بِهِۦ - 2:26)",
      selection: { type: "ayah" as const, surahNumber: 2, fromAyah: 26, toAyah: 26 },
      transcripts: [
        "إن الله لا يستحيي أن يضرب مثلا ما بعوضة فما فوقها فأما الذين آمنوا فيعلمون أنه الحق من ربهم وأما الذين كفروا فيقولون ماذا أراد الله بهذا مثلا يضل به كثيرا ويهدي به كثيرا وما يضل به إلا الفاسقين"
      ]
    },
    {
      name: "Verse with waqf signs (2:27 - contains ۚ and iqlab meem ۢ and small yeh ۦ)",
      selection: { type: "ayah" as const, surahNumber: 2, fromAyah: 27, toAyah: 27 },
      transcripts: [
        "الذين ينقضون عهد الله من بعد ميثاقه ويقطعون ما أمر الله به أن يوصل ويفسدون في الأرض أولئك هم الخاسرون"
      ]
    },
    {
      name: "Verse with non-read letter (2:5 - أولئك with rounded zero over waw)",
      selection: { type: "ayah" as const, surahNumber: 2, fromAyah: 5, toAyah: 5 },
      transcripts: [
        "أولئك على هدى من ربهم وأولئك هم المفلحون"
      ]
    },
    {
      name: "Verse with non-read letter (18:23 - لِشَا۟ىْءٍ with rounded zero over alef)",
      selection: { type: "ayah" as const, surahNumber: 18, fromAyah: 23, toAyah: 23 },
      transcripts: [
        "ولا تقولن لشيء إني فاعل ذلك غدا"
      ]
    },
    {
      name: "Verse with non-read letter (53:51 - وَثَمُودَا۟ with rounded zero over alef)",
      selection: { type: "ayah" as const, surahNumber: 53, fromAyah: 51, toAyah: 51 },
      transcripts: [
        "وثمود فما أبقى"
      ]
    }
  ];

  let allPassed = true;

  for (const tc of testCases) {
    console.log(`>>> Testing: ${tc.name}`);
    const rangeData = await fetchQuranRange(tc.selection);
    
    for (let idx = 0; idx < rangeData.ayahs.length; idx++) {
      const ayah = rangeData.ayahs[idx];
      const transcript = tc.transcripts[idx];
      const uWords = extractAyahWords(ayah.text_uthmani);
      const sWords = extractAyahWords(ayah.text_simple);

      console.log(`    Ayah ${ayah.surah.number}:${ayah.numberInSurah}`);
      console.log(`    - Uthmani Text : «${ayah.text_uthmani}»`);
      console.log(`    - Simple Clean : «${ayah.text_simple}»`);
      console.log(`    - Uthmani Words count: ${uWords.length} (${uWords.slice(0, 4).join(" ")}...)`);
      console.log(`    - Simple Words count : ${sWords.length} (${sWords.slice(0, 4).join(" ")}...)`);
      
      const expectedAyahs = [{ ayah: ayah.numberInSurah, text: ayah.text_simple }];
      const result = performWordAlignment(ayah.text_simple, transcript, expectedAyahs);

      console.log(`    - Alignment Result: Match=${result.matchRate}%, Correct=${result.correctCount}, Uncertain=${result.uncertainCount}, Errors=${result.errorCount}`);
      
      if (result.differences.length > 0) {
        console.log(`    - Differences:`, result.differences);
      }

      if (result.matchRate !== 100 || result.errorCount > 0) {
        console.error(`    FAILED for ${tc.name}!`);
        allPassed = false;
      } else {
        console.log(`    -> PASS (100% Match)`);
      }
    }
    console.log("");
  }

  if (allPassed) {
    console.log("ALL REQUIRED CASES AUDITED AND PASSED PERFECTLY (100%).");
  } else {
    console.error("SOME CASES FAILED AUDIT.");
    process.exit(1);
  }
}

run().catch(console.error);
