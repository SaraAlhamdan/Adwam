async function check() {
  const ayahs = [
    '2:1', '3:1', '7:1', '10:1', '11:1', '12:1', '13:1', '14:1', '15:1',
    '19:1', '20:1', '26:1', '27:1', '28:1', '29:1', '30:1', '31:1', '32:1',
    '36:1', '38:1', '40:1', '41:1', '42:1', '42:2', '43:1', '44:1', '45:1',
    '46:1', '50:1', '68:1'
  ];
  for (const a of ayahs) {
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/ayah/${a}/editions/quran-uthmani,quran-simple-clean`);
      const data = await res.json();
      const uText = data.data?.[0]?.text?.replace(/^بِسْمِ\s+ٱللَّهِ\s+ٱلرَّحْمَٰنِ\s+ٱلرَّحِيمِ\s*/, '');
      const sText = data.data?.[1]?.text?.replace(/^بسم\s+الله\s+الرحمن\s+الرحيم\s*/, '');
      console.log(`${a.padEnd(5)} | Uthmani: ${uText.padEnd(12)} | Simple: ${sText}`);
    } catch (e) {
      console.error(`Error for ${a}:`, e);
    }
  }
}

check();
