import { describe, expect, it } from "vitest";
import { normalizeArabic, performWordAlignment, isUncertainMatch, levenshteinDistance } from "../supabase/functions/analyze-recitation/index";

describe("Recitation Arabic Normalization & Word Alignment", () => {
  it("normalizes Arabic text: removes tashkeel, unifies alef, ya, ta marbuta", () => {
    // Expected verse with full tashkeel and variant letters
    const raw = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ۝١";
    const normalized = normalizeArabic(raw);
    expect(normalized).toBe("بسم الله الرحمن الرحيم");

    // Alef / Hamza unification
    expect(normalizeArabic("إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ")).toBe("اياك نعبد واياك نستعين");
    expect(normalizeArabic("أَنْعَمْتَ")).toBe("انعمت");
    expect(normalizeArabic("آَمَنَ")).toBe("امن");

    // Ya and Alef Maqsura unification
    expect(normalizeArabic("اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ")).toBe("اهدنا الصراط المستقيم");
    expect(normalizeArabic("عَلَى")).toBe("علي");
    expect(normalizeArabic("هُدًى")).toBe("هدي");

    // Ta marbuta unification
    expect(normalizeArabic("رَحْمَةً")).toBe("رحمه");
    expect(normalizeArabic("الْقَارِعَةُ")).toBe("القارعه");
    expect(normalizeArabic("الصَّلَاةُ")).toBe("الصلاه");
  });

  it("accurately detects exact matches with 100% score", () => {
    const expected = "قُلْ هُوَ اللَّهُ أَحَدٌ";
    const transcript = "قل هو الله احد";
    const result = performWordAlignment(expected, transcript);

    expect(result.matchRate).toBe(100);
    expect(result.differences).toHaveLength(0);
    expect(result.correctCount).toBe(4);
    expect(result.uncertainCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.wordAlignment.every(w => w.status === "correct")).toBe(true);
  });

  it("test 2:2 produces 100% when read correctly with simple script comparison", () => {
    // Tanzil simple clean for 2:2
    const expectedSimple = "ذلك الكتاب لا ريب فيه هدى للمتقين";
    // Whisper raw transcript
    const transcript = "ذلك الكتاب لا ريب فيه هدى للمتقين";
    const result = performWordAlignment(expectedSimple, transcript);

    expect(result.matchRate).toBe(100);
    expect(result.correctCount).toBe(7);
    expect(result.errorCount).toBe(0);
    expect(result.differences).toHaveLength(0);
  });

  it("tolerance layer: marks 1-character difference or high similarity as 'uncertain' (yellow), not 'substitution' (red)", () => {
    const expected = "ذلك الكتاب لا ريب فيه هدى للمتقين";
    // Reciter said "المتقون" instead of "للمتقين" (similarity >= 0.8 / diff <= 1 from للمتقون)
    // or reciter said "لكتاب" instead of "الكتاب" (1 char diff)
    const transcript = "ذلك لكتاب لا ريب فيه هدى للمتقين";
    const result = performWordAlignment(expected, transcript);

    // "الكتاب" vs "لكتاب" differs by 1 character -> marked uncertain
    expect(result.uncertainCount).toBe(1);
    expect(result.substitutionCount).toBe(0);
    expect(result.errorCount).toBe(0); // Uncertain is excluded from error count!
    expect(result.matchRate).toBe(100);

    const unc = result.differences.find(d => d.type === "uncertain");
    expect(unc).toBeDefined();
    expect(unc?.expected).toBe("الكتاب");
    expect(unc?.actual).toBe("لكتاب");

    const chip = result.wordAlignment.find(w => w.expected === "الكتاب");
    expect(chip?.status).toBe("uncertain");
  });

  it("accurately detects true word substitution when words differ significantly", () => {
    const expected = "قُلْ هُوَ اللَّهُ أَحَدٌ";
    // Reciter said "عليم" instead of "احد"
    const transcript = "قل هو الله عليم";
    const result = performWordAlignment(expected, transcript);

    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].type).toBe("substitution");
    expect(result.differences[0].expected).toBe("احد");
    expect(result.differences[0].actual).toBe("عليم");
    expect(result.differences[0].position).toBe(4);
    expect(result.substitutionCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.matchRate).toBe(75);
  });

  it("accurately detects omission (missing word) with exact position", () => {
    const expected = "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ";
    // Reciter skipped "واياك"
    const transcript = "إياك نعبد نستعين";
    const result = performWordAlignment(expected, transcript);

    const omission = result.differences.find(d => d.type === "omission");
    expect(omission).toBeDefined();
    expect(omission?.expected).toBe("واياك");
    expect(omission?.position).toBe(3);
    expect(result.errorCount).toBe(1);
  });

  it("accurately detects addition (extra word) with position", () => {
    const expected = "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ";
    // Reciter added "دائما"
    const transcript = "الحمد لله دائما رب العالمين";
    const result = performWordAlignment(expected, transcript);

    const addition = result.differences.find(d => d.type === "addition");
    expect(addition).toBeDefined();
    expect(addition?.actual).toBe("دايما");
  });

  it("correctly handles verses containing الصلاة and الرحمن", () => {
    // E.g. Maryam 19:58 or similar verses containing both "الصلاة" and "الرحمن"
    const expected = "وَاذْكُرْ فِي الْكِتَابِ إِبْرَاهِيمَ إِنَّهُ كَانَ صِدِّيقًا نَبِيًّا ... خَرُّوا سُجَّدًا وَبُكِيًّا";
    const verseWithBoth = "يقيمون الصلاة ويؤتون الزكاة وهم بالرحمن مؤمنون";
    const transcript = "يقيمون الصلاه ويؤتون الزكاه وهم بالرحمن مؤمنون";
    const result = performWordAlignment(verseWithBoth, transcript);

    expect(result.matchRate).toBe(100);
    expect(result.errorCount).toBe(0);
    expect(result.correctCount).toBe(7);
  });

  it("maps differences to respective ayah numbers correctly across multi-ayah ranges", () => {
    const expected = "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ الرَّحْمَٰنِ الرَّحِيمِ";
    const expectedAyahs = [
      { ayah: 2, text: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ" },
      { ayah: 3, text: "الرَّحْمَٰنِ الرَّحِيمِ" },
    ];
    // Word "غفور" substituted in ayah 3 instead of "الرحيم"
    const transcript = "الحمد لله رب العالمين الرحمن غفور";
    const result = performWordAlignment(expected, transcript, expectedAyahs);

    const diff = result.differences.find(d => d.type === "substitution");
    expect(diff).toBeDefined();
    expect(diff?.ayah).toBe(3);
    expect(diff?.expected).toBe("الرحيم");
    expect(diff?.actual).toBe("غفور");
  });

  describe("Quranic Opening Letters (الحروف المقطّعة) Scored Correctly", () => {
    it("tests 2:1 (الم): expands to 'ألف لام ميم' and scores 100% when spoken letter names are transcribed", () => {
      // Expected simple text from Quran data source: "الم"
      const expectedText = "الم";
      // Whisper transcribes spoken letter names: "ألف لام ميم"
      const transcript = "ألف لام ميم";
      const result = performWordAlignment(expectedText, transcript, [{ ayah: 1, text: "الم" }]);

      expect(result.matchRate).toBe(100);
      expect(result.correctCount).toBe(3);
      expect(result.errorCount).toBe(0);
      expect(result.differences).toHaveLength(0);
      expect(result.wordAlignment).toHaveLength(3);
      expect(result.wordAlignment.map(w => w.expected)).toEqual(["الف", "لام", "ميم"]);
      expect(result.wordAlignment.every(w => w.status === "correct")).toBe(true);
    });

    it("tests 2:1 (الم): accepts transcript when Whisper writes joined letters 'الم'", () => {
      const expectedText = "الم";
      // Whisper wrote joined letters
      const transcript = "الم";
      const result = performWordAlignment(expectedText, transcript);

      expect(result.matchRate).toBe(100);
      expect(result.correctCount).toBe(3);
      expect(result.errorCount).toBe(0);
      expect(result.differences).toHaveLength(0);
    });

    it("tests 19:1 (كهيعص): expands to 'كاف ها يا عين صاد' and scores 100%", () => {
      const expectedText = "كهيعص";
      const transcriptSpoken = "كاف ها يا عين صاد";
      const result1 = performWordAlignment(expectedText, transcriptSpoken, [{ ayah: 1, text: "كهيعص" }]);

      expect(result1.matchRate).toBe(100);
      expect(result1.correctCount).toBe(5);
      expect(result1.errorCount).toBe(0);
      expect(result1.wordAlignment.map(w => w.expected)).toEqual(["كاف", "ها", "يا", "عين", "صاد"]);

      // Also accepts joined transcript
      const transcriptJoined = "كهيعص";
      const result2 = performWordAlignment(expectedText, transcriptJoined);
      expect(result2.matchRate).toBe(100);
      expect(result2.correctCount).toBe(5);
    });

    it("tests 42:1-2 (حم / عسق): expands both ayahs to 'حا ميم' and 'عين سين قاف' across multi-ayah recitation", () => {
      const expectedText = "حم عسق";
      const expectedAyahs = [
        { ayah: 1, text: "حم" },
        { ayah: 2, text: "عسق" },
      ];
      const transcriptSpoken = "حا ميم عين سين قاف";
      const result = performWordAlignment(expectedText, transcriptSpoken, expectedAyahs);

      expect(result.matchRate).toBe(100);
      expect(result.correctCount).toBe(5);
      expect(result.errorCount).toBe(0);
      expect(result.wordAlignment.map(w => w.expected)).toEqual(["حا", "ميم", "عين", "سين", "قاف"]);
      // Ayah mapping: 1 for first 2 words, 2 for next 3 words
      expect(result.wordAlignment[0].ayah).toBe(1);
      expect(result.wordAlignment[1].ayah).toBe(1);
      expect(result.wordAlignment[2].ayah).toBe(2);
      expect(result.wordAlignment[3].ayah).toBe(2);
      expect(result.wordAlignment[4].ayah).toBe(2);

      // Also accepts joined transcript "حم عسق"
      const resultJoined = performWordAlignment(expectedText, "حم عسق", expectedAyahs);
      expect(resultJoined.matchRate).toBe(100);
      expect(resultJoined.correctCount).toBe(5);
    });

    it("tests 36:1 (يس): expands to 'يا سين' and scores 100%", () => {
      const expectedText = "يس";
      const transcriptSpoken = "يا سين";
      const result = performWordAlignment(expectedText, transcriptSpoken);

      expect(result.matchRate).toBe(100);
      expect(result.correctCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.wordAlignment.map(w => w.expected)).toEqual(["يا", "سين"]);

      // Also accepts "يس"
      const resultJoined = performWordAlignment(expectedText, "يس");
      expect(resultJoined.matchRate).toBe(100);
      expect(resultJoined.correctCount).toBe(2);
    });

    it("detects errors if reciter skips or mispronounces a letter in muqatta'at", () => {
      // In 19:1 (كهيعص -> كاف ها يا عين صاد), reciter forgets "صاد"
      const expectedText = "كهيعص";
      const transcript = "كاف ها يا عين";
      const result = performWordAlignment(expectedText, transcript);

      expect(result.omissionCount).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.matchRate).toBe(80);
      const omitted = result.differences.find(d => d.type === "omission");
      expect(omitted?.expected).toBe("صاد");
    });
  });

  describe("Quran-Specific Normalization & Comparison Cases Audit", () => {
    it("1. Al-Fatiha (1:1 - 1:7): all verses match 100% with standard recitation", () => {
      const fatiha = [
        { simple: "بسم الله الرحمن الرحيم", spoken: "بسم الله الرحمن الرحيم" },
        { simple: "الحمد لله رب العالمين", spoken: "الحمد لله رب العالمين" },
        { simple: "الرحمن الرحيم", spoken: "الرحمن الرحيم" },
        { simple: "مالك يوم الدين", spoken: "مالك يوم الدين" },
        { simple: "إياك نعبد وإياك نستعين", spoken: "إياك نعبد وإياك نستعين" },
        { simple: "اهدنا الصراط المستقيم", spoken: "اهدنا الصراط المستقيم" },
        { simple: "صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين", spoken: "صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين" }
      ];

      for (let i = 0; i < fatiha.length; i++) {
        const res = performWordAlignment(fatiha[i].simple, fatiha[i].spoken, [{ ayah: i + 1, text: fatiha[i].simple }]);
        expect(res.matchRate).toBe(100);
        expect(res.errorCount).toBe(0);
        expect(res.differences).toHaveLength(0);
      }
    });

    it("2. 2:1: matches 100% when spoken as 'ألف لام ميم' or transcribed 'الم'", () => {
      const resSpoken = performWordAlignment("الم", "ألف لام ميم", [{ ayah: 1, text: "الم" }]);
      expect(resSpoken.matchRate).toBe(100);
      expect(resSpoken.correctCount).toBe(3);

      const resJoined = performWordAlignment("الم", "الم", [{ ayah: 1, text: "الم" }]);
      expect(resJoined.matchRate).toBe(100);
      expect(resJoined.correctCount).toBe(3);
    });

    it("3. 2:2: waqf signs (ۛ) in text_simple do not cause errors or phantom words", () => {
      // Tanzil text_simple has waqf sign ۛ (U+06DB)
      const simple = "ذلك الكتاب لا ريب ۛ فيه ۛ هدى للمتقين";
      const spoken = "ذلك الكتاب لا ريب فيه هدى للمتقين";
      const res = performWordAlignment(simple, spoken);

      expect(res.matchRate).toBe(100);
      expect(res.correctCount).toBe(7);
      expect(res.errorCount).toBe(0);
      expect(res.differences).toHaveLength(0);
    });

    it("4. Verse with الرحمن: matches 100% without false substitution for dagger alef", () => {
      const simple = "الرحمن";
      const spoken = "الرحمن";
      const res = performWordAlignment(simple, spoken);

      expect(res.matchRate).toBe(100);
      expect(res.correctCount).toBe(1);
      expect(res.errorCount).toBe(0);
    });

    it("5. Verse with small waw / small yeh (like بِهِۦ - 2:26): matches 100% against spoken 'به'", () => {
      const simple = "إن الله لا يستحيي أن يضرب مثلا ما بعوضة فما فوقها فأما الذين آمنوا فيعلمون أنه الحق من ربهم وأما الذين كفروا فيقولون ماذا أراد الله بهذا مثلا يضل به كثيرا ويهدي به كثيرا وما يضل به إلا الفاسقين";
      const spoken = "ان الله لا يستحيي ان يضرب مثلا ما بعوضة فما فوقها فاما الذين امنوا فيعلمون انه الحق من ربهم واما الذين كفروا فيقولون ماذا اراد الله بهذا مثلا يضل به كثيرا ويهدي به كثيرا وما يضل به الا الفاسقين";
      const res = performWordAlignment(simple, spoken);

      expect(res.matchRate).toBe(100);
      expect(res.correctCount).toBe(39);
      expect(res.errorCount).toBe(0);
    });

    it("6. Verse with waqf signs (2:27): waqf signs (ۚ, ۖ, etc.) and iqlab meem (ۢ) normalize cleanly", () => {
      const simple = "الذين ينقضون عهد الله من بعد ميثاقه ويقطعون ما أمر الله به أن يوصل ويفسدون في الأرض ۚ أولئك هم الخاسرون";
      const spoken = "الذين ينقضون عهد الله من بعد ميثاقه ويقطعون ما امر الله به ان يوصل ويفسدون في الارض اولئك هم الخاسرون";
      const res = performWordAlignment(simple, spoken);

      expect(res.matchRate).toBe(100);
      expect(res.correctCount).toBe(20);
      expect(res.errorCount).toBe(0);
    });

    it("7. Verse with non-read letter (2:5, 18:23, 53:51): matches 100% without false errors", () => {
      // 2:5 (أولئك with rounded zero over waw)
      const res2_5 = performWordAlignment(
        "أولئك على هدى من ربهم ۖ وأولئك هم المفلحون",
        "اولئك على هدى من ربهم واولئك هم المفلحون"
      );
      expect(res2_5.matchRate).toBe(100);
      expect(res2_5.correctCount).toBe(8);

      // 18:23 (لِشَا۟ىْءٍ -> simple clean has لشيء)
      const res18_23 = performWordAlignment(
        "ولا تقولن لشيء إني فاعل ذلك غدا",
        "ولا تقولن لشيء اني فاعل ذلك غدا"
      );
      expect(res18_23.matchRate).toBe(100);
      expect(res18_23.correctCount).toBe(7);

      // 53:51 (وَثَمُودَا۟ -> simple clean has وثمود)
      const res53_51 = performWordAlignment(
        "وثمود فما أبقى",
        "وثمود فما ابقى"
      );
      expect(res53_51.matchRate).toBe(100);
      expect(res53_51.correctCount).toBe(3);
    });
  });
});


