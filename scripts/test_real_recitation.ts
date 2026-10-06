// Script to test real recitation flow end-to-end
import fs from "fs";

async function runTest() {
  console.log("=== Testing Real Recitation Audio Pipeline ===");

  // 1. Download real Quran recitation audio for Al-Fatiha Ayah 1
  const audioUrl = "https://everyayah.com/data/Alafasy_128kbps/001001.mp3";
  console.log(`1. Fetching real recording from: ${audioUrl}...`);

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to fetch audio: ${audioRes.statusText}`);
  }

  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  console.log(`✓ Real audio fetched successfully: ${audioBuffer.length} bytes (MP3)`);

  const audioBase64 = audioBuffer.toString("base64");
  const expectedText = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
  const expectedAyahs = [{ ayah: 1, text: expectedText }];

  console.log(`2. Sending audio to recitation analyzer endpoint...`);
  console.log(`   Expected verse: "${expectedText}"`);

  const analyzeRes = await fetch("http://localhost:3000/api/recitation/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      mimeType: "audio/mp3",
      expectedText,
      expectedAyahs,
    }),
  });

  console.log(`3. Response status: ${analyzeRes.status} ${analyzeRes.statusText}`);
  const payload = await analyzeRes.json();
  console.log("   Payload:", JSON.stringify(payload, null, 2));

  // 4. Test with empty / silent recording
  console.log("\n4. Testing with empty recording (zero bytes)...");
  const emptyRes = await fetch("http://localhost:3000/api/recitation/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64: "",
      mimeType: "audio/webm",
      expectedText,
      expectedAyahs,
    }),
  });
  console.log(`   Status: ${emptyRes.status} (Expected 400)`);
  const emptyPayload = await emptyRes.json();
  console.log("   Payload:", emptyPayload);
  
  console.log("\n=== Test Pipeline Complete ===");
}

runTest().catch(console.error);
