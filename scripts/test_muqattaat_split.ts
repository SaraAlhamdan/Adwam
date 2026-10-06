// Test decomposition of Uthmani muqatta'at words into letter units
const examples = [
  { ref: "2:1", uthmani: "الٓمٓ", simple: "الم" },
  { ref: "7:1", uthmani: "الٓمٓصٓ", simple: "المص" },
  { ref: "19:1", uthmani: "كٓهيعٓصٓ", simple: "كهيعص" },
  { ref: "20:1", uthmani: "طه", simple: "طه" },
  { ref: "26:1", uthmani: "طسٓمٓ", simple: "طسم" },
  { ref: "27:1", uthmani: "طسٓ", simple: "طس" },
  { ref: "36:1", uthmani: "يسٓ", simple: "يس" },
  { ref: "38:1", uthmani: "صٓ", simple: "ص" },
  { ref: "40:1", uthmani: "حمٓ", simple: "حم" },
  { ref: "42:1", uthmani: "حمٓ", simple: "حم" },
  { ref: "42:2", uthmani: "عٓسٓقٓ", simple: "عسق" },
  { ref: "50:1", uthmani: "قٓ", simple: "ق" },
  { ref: "68:1", uthmani: "نٓ", simple: "ن" },
  { ref: "10:1", uthmani: "الٓر", simple: "الر" },
  { ref: "13:1", uthmani: "الٓمٓر", simple: "المر" }
];

function splitUthmaniMuqattaatLetters(word: string): string[] {
  // Matches a base Arabic letter followed by zero or more combining marks (e.g. maddah U+0653)
  const regex = /[\u0621-\u064A][\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]*/g;
  const matches = word.match(regex);
  return matches || [word];
}

for (const ex of examples) {
  const units = splitUthmaniMuqattaatLetters(ex.uthmani);
  console.log(`${ex.ref} (${ex.uthmani}): [${units.join(", ")}] -> count: ${units.length}, simple len: ${ex.simple.length}`);
}
