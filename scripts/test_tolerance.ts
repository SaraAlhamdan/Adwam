export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const row: number[] = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= m; i++) {
    let prevDiag = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        row[j] + 1,       // deletion
        row[j - 1] + 1,   // insertion
        prevDiag + cost   // substitution
      );
      prevDiag = temp;
    }
  }

  return row[n];
}

export function isUncertainMatch(expected: string, actual: string): boolean {
  if (!expected || !actual) return false;
  if (expected === actual) return false;
  const dist = levenshteinDistance(expected, actual);
  if (dist <= 1) return true;
  const ratio = 1 - dist / Math.max(expected.length, actual.length);
  return ratio >= 0.8;
}

const tests = [
  { e: "الكتاب", a: "الكتاب", expected: "exact" },
  { e: "الكتاب", a: "لكتاب", expected: "uncertain" }, // dist = 1
  { e: "المتقين", a: "المتقون", expected: "uncertain" }, // dist = 1 (ين -> ون)
  { e: "الرحمن", a: "الرحمان", expected: "uncertain" }, // dist = 1
  { e: "الصلاه", a: "الصلاة", expected: "exact after norm" },
  { e: "المفلحون", a: "الخاسرون", expected: "wrong" }, // completely different
];

console.log("Testing tolerance layer:");
for (const t of tests) {
  const dist = levenshteinDistance(t.e, t.a);
  const ratio = 1 - dist / Math.max(t.e.length, t.a.length);
  const unc = isUncertainMatch(t.e, t.a);
  console.log(`"${t.e}" vs "${t.a}" -> dist: ${dist}, ratio: ${ratio.toFixed(2)}, uncertain: ${unc}`);
}
