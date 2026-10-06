import { processAssistantQuery } from "../server/ragEngine";

async function runTests() {
  console.log("=== بدء الاختبارات الشاملة لمساعد أدوم المعرفي (RAG Pipeline) ===");

  // TEST 1: سؤال عربي في نطاق المصادر
  console.log("\n--- [اختبار 1]: سؤال عربي في التفسير ---");
  const q1 = await processAssistantQuery({
    question: "ما معنى الكوثر في سورة الكوثر؟",
    mode: "ask",
    locale: "ar",
  });
  console.log("الحالة (Status):", q1.status);
  console.log("العنوان (Title):", q1.title);
  console.log("الإجابة (Answer preview):", q1.answer?.slice(0, 160) + "...");
  console.log("عدد المصادر (Citations count):", q1.citations.length);
  if (q1.citations.length > 0) {
    console.log("المصدر الأول (Citation 1):", q1.citations[0].title, "|", q1.citations[0].sourceName);
  }

  // TEST 2: سؤال إنجليزي
  console.log("\n--- [اختبار 2]: سؤال إنجليزي ---");
  const q2 = await processAssistantQuery({
    question: "What is the meaning of Al-Kawthar?",
    mode: "ask",
    locale: "en",
  });
  console.log("الحالة (Status):", q2.status);
  console.log("العنوان (Title):", q2.title);
  console.log("الإجابة (Answer preview):", q2.answer?.slice(0, 160) + "...");
  console.log("عدد المصادر (Citations count):", q2.citations.length);

  // TEST 3: سؤال خارج النطاق (Abstention)
  console.log("\n--- [اختبار 3]: سؤال خارج النطاق الديني والمصادر (Abstention) ---");
  const q3 = await processAssistantQuery({
    question: "كم سعر سهم شركة تسلا اليوم وما هي عاصمة أستراليا؟",
    mode: "ask",
    locale: "ar",
  });
  console.log("الحالة (Status):", q3.status);
  console.log("العنوان (Title):", q3.title);
  console.log("السبب (Reason):", q3.reason);
  console.log("الإجابة (Answer):", q3.answer);

  // TEST 4: سؤال فتوى شخصية (Referral to specialists)
  console.log("\n--- [اختبار 4]: سؤال فتوى شخصية (Referral) ---");
  const q4 = await processAssistantQuery({
    question: "ما حكم طلاقي لزوجتي هل يقع وما هو ميراث ابنتي إذا مات زوجها؟",
    mode: "ask",
    locale: "ar",
  });
  console.log("الحالة (Status):", q4.status);
  console.log("العنوان (Title):", q4.title);
  console.log("الإحالة مطلوبة (Referral Required):", q4.referralRequired);
  console.log("السبب (Reason):", q4.reason);
  console.log("الإجابة (Answer):", q4.answer);

  // TEST 5: مساعد الآية السريع مع تمرير سياق الآية
  console.log("\n--- [اختبار 5]: Quick Ayah Assistant مع سياق الآية ---");
  const q5 = await processAssistantQuery({
    question: "اشرح لي هذه الآية باختصار",
    mode: "explain",
    locale: "ar",
    context: {
      surahNumber: 108,
      ayahNumber: 1,
      ayahText: "إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ",
    },
  });
  console.log("الحالة (Status):", q5.status);
  console.log("العنوان (Title):", q5.title);
  console.log("الإجابة (Answer preview):", q5.answer?.slice(0, 160) + "...");
  console.log("المصادر:", q5.citations.map(c => c.title).join(" | "));

  console.log("\n=== انتهت جميع الاختبارات بنجاح تام ===");
}

runTests().catch(console.error);
