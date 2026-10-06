import { describe, expect, it } from "vitest";
import { normalizeQuranPage, verseRangeLabel } from "../shared/quran";

describe("verified Quran page data", () => {
  it("normalizes a page response without inventing surah or ayah labels", () => {
    const page = normalizeQuranPage({
      code: 200,
      data: {
        number: 1,
        ayahs: [
          { number: 1, text: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ", numberInSurah: 1, page: 1, surah: { number: 1, name: "سُورَةُ ٱلْفَاتِحَةِ", numberOfAyahs: 7 } },
          { number: 7, text: "صِرَاطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ", numberInSurah: 7, page: 1, surah: { number: 1, name: "سُورَةُ ٱلْفَاتِحَةِ", numberOfAyahs: 7 } },
        ],
      },
    }, 1);

    expect(page.surahNames).toEqual(["سُورَةُ ٱلْفَاتِحَةِ"]);
    expect(verseRangeLabel(page)).toBe("1:1–1:7");
    expect(page.ayahs.map(ayah => ayah.numberInSurah)).toEqual([1, 7]);
  });

  it("fails closed when the source response is not verifiable", () => {
    expect(() => normalizeQuranPage({ code: 500, data: null }, 293)).toThrow("تعذر التحقق من صفحة القرآن");
    expect(() => normalizeQuranPage({ code: 200, data: { number: 293, ayahs: [] } }, 293)).toThrow("لم تصل آيات صحيحة");
  });
});
