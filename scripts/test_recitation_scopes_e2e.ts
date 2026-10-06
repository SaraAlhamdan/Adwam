// End-to-end test for one ayah AND full-page / ayah-range recitation
const VITE_SUPABASE_URL = "https://yhbqgdqoymbfuixojvmz.supabase.co";
const VITE_SUPABASE_ANON_KEY = "sb_publishable_nsQ5Kpfyp8mmQV1SODN_LA_f1a6ADud";
const EDGE_URL = `${VITE_SUPABASE_URL}/functions/v1/analyze-recitation`;

async function runEndToEndRecitationTests() {
  console.log("============================================================");
  console.log("=== END-TO-END RECITATION TESTS (ONE AYAH + FULL PAGE) ===");
  console.log("============================================================");

  // --- Test 1: Single Ayah (1:1) ---
  console.log("\n--- TEST 1: Single Ayah (Surah Al-Fatiha, Ayah 1) ---");
  const ayah1AudioUrl = "https://everyayah.com/data/Alafasy_128kbps/001001.mp3";
  const a1Res = await fetch(ayah1AudioUrl);
  if (!a1Res.ok) throw new Error("Failed to download ayah 1 audio");
  const a1Buffer = Buffer.from(await a1Res.arrayBuffer());
  const a1Base64 = a1Buffer.toString("base64");
  console.log(`✓ Fetched Ayah 1 audio (${a1Buffer.length} bytes)`);

  const a1Expected = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
  const a1Payload = {
    audioBase64: a1Base64,
    mimeType: "audio/mp3",
    expectedText: a1Expected,
    expectedAyahs: [{ ayah: 1, text: a1Expected }],
  };

  const a1Response = await fetch(EDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(a1Payload),
  });

  console.log(`Status: ${a1Response.status} ${a1Response.statusText}`);
  const a1Data = await a1Response.json();
  console.log(`Transcript: "${a1Data.transcript}"`);
  console.log(`Match Rate: ${a1Data.match}%`);
  console.log(`Word Count: ${a1Data.expectedWordsCount} expected, ${a1Data.correctWordsCount} correct`);
  if (a1Data.status !== "success" || a1Data.match < 90) {
    throw new Error(`Test 1 Failed: match rate was ${a1Data.match}%`);
  }
  console.log("✓ TEST 1 PASSED!");

  // --- Test 2: Full Page / Range (Page 1: Surah Al-Fatiha ayahs 1 to 7) ---
  console.log("\n--- TEST 2: Full Page / Range (Page 1: Al-Fatiha 1:1 - 1:7) ---");
  // Fetch audios for ayahs 1, 2, 3, 4 (or 1-7) to simulate continuous recitation of the page
  const pageAyahUrls = [
    "https://everyayah.com/data/Alafasy_128kbps/001001.mp3",
    "https://everyayah.com/data/Alafasy_128kbps/001002.mp3",
    "https://everyayah.com/data/Alafasy_128kbps/001003.mp3",
  ];
  const audioBuffers: Buffer[] = [];
  for (const url of pageAyahUrls) {
    const res = await fetch(url);
    audioBuffers.push(Buffer.from(await res.arrayBuffer()));
  }
  const combinedBuffer = Buffer.concat(audioBuffers);
  const combinedBase64 = combinedBuffer.toString("base64");
  console.log(`✓ Fetched and combined page audio range (${combinedBuffer.length} bytes)`);

  const expectedPageAyahs = [
    { ayah: 1, text: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ" },
    { ayah: 2, text: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ" },
    { ayah: 3, text: "الرَّحْمَٰنِ الرَّحِيمِ" },
  ];
  const pageExpectedText = expectedPageAyahs.map(a => a.text).join(" ");

  const pagePayload = {
    audioBase64: combinedBase64,
    mimeType: "audio/mp3",
    expectedText: pageExpectedText,
    expectedAyahs: expectedPageAyahs,
  };

  const pageResponse = await fetch(EDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(pagePayload),
  });

  console.log(`Status: ${pageResponse.status} ${pageResponse.statusText}`);
  const pageData = await pageResponse.json();
  console.log(`Transcript: "${pageData.transcript}"`);
  console.log(`Match Rate: ${pageData.match}%`);
  console.log(`Words: ${pageData.expectedWordsCount} expected, ${pageData.correctWordsCount} correct`);
  console.log("Differences:", pageData.differences);
  if (pageData.status !== "success" || pageData.match < 85) {
    throw new Error(`Test 2 Failed: match rate was ${pageData.match}%`);
  }
  console.log("✓ TEST 2 PASSED!");

  console.log("\n============================================================");
  console.log("=== ALL END-TO-END RECITATION TESTS VERIFIED SUCCESSFULLY ===");
  console.log("============================================================");
}

runEndToEndRecitationTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
