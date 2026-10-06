import { normalizeArabic } from "../shared/quran";

async function fetchVerse(ref: string) {
  const res = await fetch(`https://api.alquran.cloud/v1/ayah/${ref}/editions/quran-uthmani,quran-simple-clean`);
  const data = await res.json();
  let u = data.data[0].text;
  let s = data.data[1].text;
  return { ref, uthmani: u, simple: s };
}

async function testCases() {
  const refs = [
    "18:38", // لكنا هو الله ربي
    "33:10", // وتظنون بالله الظنونا
    "33:66", // وأطعنا الرسولا
    "33:67", // فأضلونا السبيلا
    "76:4",  // سلاسلا
    "76:15", // قواريرَا
    "76:16", // قواريرَا من فضة
    "2:258", // قال أنا أحيي وأميت
    "7:103", // ملإيه
    "10:83", // ملإيهم
    "27:21", // أو لأذبحنه
  ];

  for (const ref of refs) {
    const { uthmani, simple } = await fetchVerse(ref);
    console.log(`Ref: ${ref}`);
    console.log(`  Uthmani: ${uthmani}`);
    console.log(`  Simple : ${simple}`);
    console.log(`  Norm(Simple): ${normalizeArabic(simple)}`);
  }
}

testCases().catch(console.error);
