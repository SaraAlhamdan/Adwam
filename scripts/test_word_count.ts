function stripQuranSymbols(text: string): string {
  return (text || "").replace(/[\u06D6-\u06ED]/g, "");
}

function extractAyahWords(text: string): string[] {
  return stripQuranSymbols(text).trim().split(/\s+/).filter(Boolean);
}

async function checkPage(p: number) {
  const [uRes, sRes] = await Promise.all([
    fetch(`https://api.alquran.cloud/v1/page/${p}/quran-uthmani`).then(r => r.json()),
    fetch(`https://api.alquran.cloud/v1/page/${p}/quran-simple-clean`).then(r => r.json())
  ]);
  const uAyahs = uRes.data.ayahs;
  const sAyahs = sRes.data.ayahs;
  let allMatch = true;
  for (let i = 0; i < uAyahs.length; i++) {
    const uWords = extractAyahWords(uAyahs[i].text);
    const sWords = extractAyahWords(sAyahs[i].text);
    if (uWords.length !== sWords.length) {
      allMatch = false;
      console.log(`Mismatch in Ayah ${uAyahs[i].surah.number}:${uAyahs[i].numberInSurah} - Uthmani: ${uWords.length} words, Simple: ${sWords.length} words`);
      console.log("U:", uWords);
      console.log("S:", sWords);
    }
  }
  console.log(`Page ${p}: ${allMatch ? "ALL AYAH WORD COUNTS MATCH (100%)" : "HAD MISMATCHES"}`);
}

async function main() {
  await checkPage(1);
  await checkPage(2);
}

main().catch(console.error);
