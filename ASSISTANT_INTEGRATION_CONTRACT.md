# Adwam Assistant — RAG Integration Contract

الواجهة أصبحت جاهزة لاستقبال RAG حقيقي دون إعادة تصميم. المطلوب من خدمة وفاء أن تطبق هذا العقد أو adapter مكافئًا.

## Request
```ts
{
  question: string,             // max 1200 chars after normalization
  mode: "ask" | "explain" | "similar" | "memorize",
  locale: "ar" | "en",
  context?: {
    surahNumber: number,
    ayahNumber: number,
    ayahText?: string
  }
}
```

## Response
```ts
{
  status: "success" | "abstain" | "referral" | "error",
  title: string,
  answer?: string,
  confidence?: "high" | "medium" | "low",
  citations: Array<{
    title: string,
    sourceName: string,
    url?: string,
    excerpt?: string
  }>,
  referralRequired?: boolean,
  reason?: "insufficient_source" | "personal_fatwa" | "out_of_scope" | "service_unavailable"
}
```

## قواعد غير قابلة للتفاوض
1. أي تفسير/معلومة شرعية تُعرض للمستخدم يجب أن تكون قابلة للتتبع إلى مصدر حقيقي.
2. لا يُعرض vector score أو prompt داخلي أو raw retrieval payload للمستخدم.
3. `abstain` عند عدم كفاية المصدر أفضل من توليد جواب غير مسند.
4. السؤال الذي يحتاج فتوى شخصية أو حكمًا خاصًا يرجع `referral` ولا يستقل النموذج بالإجابة.
5. نص المصدر/المقتطف يظل مميزًا عن تبسيط أدوم.
6. نصائح الحفظ يمكن أن تكون تعليمية مولدة بشرط عدم تسميتها تفسيرًا.
7. لا ترسل للخدمة اسم المستخدم أو بريده أو جواله؛ أرسل السؤال وسياق الآية فقط عند الحاجة.
8. المفاتيح ومكالمات المزود تكون server-side.

## حالات اختبار الربط
- سؤال تفسير وله مصدر → `success` + citation صالح.
- سؤال تفسير ولا يوجد مصدر كافٍ → `abstain`.
- سؤال عن متشابهات ولا توجد نتيجة موثقة → `abstain` لا تخمين.
- سؤال فتوى شخصية → `referral`.
- انقطاع provider → `error` برسالة آمنة.
- سؤال عام بدون ayah context → يسمح به؛ الخدمة تقرر النطاق والمصادر ولا تفرض الواجهة آية مصطنعة.
