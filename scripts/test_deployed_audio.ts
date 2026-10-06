// Test deployed Edge function with real audio
const VITE_SUPABASE_URL = "https://yhbqgdqoymbfuixojvmz.supabase.co";
const VITE_SUPABASE_ANON_KEY = "sb_publishable_nsQ5Kpfyp8mmQV1SODN_LA_f1a6ADud";

async function testEdgeFunctionAudio() {
  console.log("=== Testing Supabase Edge Function analyze-recitation with Real Audio ===");

  const audioUrl = "https://everyayah.com/data/Alafasy_128kbps/001001.mp3";
  console.log(`1. Fetching audio from: ${audioUrl}...`);
  const res = await fetch(audioUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  const audioBase64 = buffer.toString("base64");
  console.log(`✓ Audio fetched: ${buffer.length} bytes`);

  const expectedText = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
  const expectedAyahs = [{ ayah: 1, text: expectedText }];

  const edgeUrl = "https://yhbqgdqoymbfuixojvmz.supabase.co/functions/v1/analyze-recitation";
  console.log(`2. Sending to ${edgeUrl}...`);

  const response = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      audioBase64,
      mimeType: "audio/mp3",
      expectedText,
      expectedAyahs,
    }),
  });

  console.log("3. Response status:", response.status, response.statusText);
  const data = await response.json();
  console.log("4. Edge function response:", JSON.stringify(data, null, 2));
}

testEdgeFunctionAudio().catch(console.error);
