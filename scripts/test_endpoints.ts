async function testEndpoints() {
  console.log("Testing hizbQuarter 1:");
  const hRes = await fetch("https://api.alquran.cloud/v1/hizbQuarter/1/quran-uthmani").then(r => r.json());
  console.log("hizbQuarter 1 ayahs count:", hRes.data?.ayahs?.length, "first:", hRes.data?.ayahs?.[0]?.surah?.name, hRes.data?.ayahs?.[0]?.numberInSurah);

  console.log("Testing juz 1:");
  const jRes = await fetch("https://api.alquran.cloud/v1/juz/1/quran-uthmani").then(r => r.json());
  console.log("juz 1 ayahs count:", jRes.data?.ayahs?.length, "first:", jRes.data?.ayahs?.[0]?.surah?.name, jRes.data?.ayahs?.[0]?.numberInSurah);

  console.log("Testing surah 1:");
  const sRes = await fetch("https://api.alquran.cloud/v1/surah/1/quran-uthmani").then(r => r.json());
  console.log("surah 1 ayahs count:", sRes.data?.ayahs?.length);
}

testEndpoints().catch(console.error);
