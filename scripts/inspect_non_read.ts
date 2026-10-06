import { normalizeArabic } from "../shared/quran";

async function inspectNonRead() {
  const tests = [
    { ref: "2:5", desc: "أولئك (waw with rounded zero)" },
    { ref: "2:6", desc: "سواء (alef after waw)" },
    { ref: "18:23", desc: "لشايء / لشيء (alef with rounded zero)" },
    { ref: "53:51", desc: "وثمودا / وثمود (alef with rounded zero)" },
    { ref: "2:26", desc: "آمنوا (alef after waw)" },
    { ref: "3:144", desc: "أفإين / أفإن (ya with rounded zero)" },
    { ref: "18:38", desc: "لكنا (alef with rectangular zero)" },
    { ref: "33:10", desc: "الظنونا (alef with rectangular zero)" },
    { ref: "76:4", desc: "سلاسلا (alef with rounded zero)" },
    { ref: "76:15", desc: "قواريرا (alef with rectangular zero)" },
    { ref: "76:16", desc: "قواريرا / قوارير (alef with rounded zero)" }
  ];

  for (const t of tests) {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${t.ref}/editions/quran-uthmani,quran-simple-clean`);
    const data = await res.json();
    const u = data.data[0].text;
    const s = data.data[1].text;
    console.log(`[${t.ref}] ${t.desc}`);
    console.log(`  Uthmani: ${u.slice(0, 50)}...`);
    console.log(`  Simple : ${s.slice(0, 50)}...`);
    console.log(`  Norm(Simple) : ${normalizeArabic(s).slice(0, 50)}...`);
  }
}

inspectNonRead().catch(console.error);
