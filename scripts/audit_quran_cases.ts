import { normalizeArabic } from "../shared/quran";

async function fetchVerse(ref: string) {
  const res = await fetch(`https://api.alquran.cloud/v1/ayah/${ref}/editions/quran-uthmani,quran-simple-clean`);
  const data = await res.json();
  let u = data.data[0].text;
  let s = data.data[1].text;
  if (ref.endsWith(":1") && !ref.startsWith("1:")) {
    u = u.replace(/^بِسْمِ\s+ٱللَّهِ\s+ٱلرَّحْمَٰنِ\s+ٱلرَّحِيمِ\s*/, "");
    s = s.replace(/^بسم\s+الله\s+الرحمن\s+الرحيم\s*/, "");
  }
  return { ref, uthmani: u, simple: s };
}

async function runAudit() {
  const verses = [
    "1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7",
    "2:1",
    "2:2",
    "55:1", // الرحمن
    "2:26", // verse with waqf, small yeh/waw, etc.
    "2:27", // verse with به / يقطعون
    "2:5",  // verse with أولئك
    "53:51", // ثمودا۟
    "18:23"  // لشا۟ىء
  ];

  for (const v of verses) {
    const data = await fetchVerse(v);
    console.log(`=== ${v} ===`);
    console.log(`Uthmani: ${data.uthmani}`);
    console.log(`Simple : ${data.simple}`);
    console.log(`Norm(Simple) : ${normalizeArabic(data.simple)}`);
    console.log(`Norm(Uthmani): ${normalizeArabic(data.uthmani)}`);
    console.log("");
  }
}

runAudit().catch(console.error);
