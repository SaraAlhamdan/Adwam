export type ReciterId = 'alafasy' | 'muaiqly' | 'husary' | 'minshawy';

export const RECITERS: { id: ReciterId; ar: string; en: string; folder: string }[] = [
  { id: 'alafasy', ar: 'مشاري راشد العفاسي', en: 'Mishary Rashid Alafasy', folder: 'Alafasy_128kbps' },
  { id: 'muaiqly', ar: 'ماهر المعيقلي', en: 'Maher Al-Muaiqly', folder: 'MaherAlMuaiqly128kbps' },
  { id: 'husary', ar: 'محمود خليل الحصري', en: 'Mahmoud Khalil Al-Husary', folder: 'Husary_128kbps' },
  { id: 'minshawy', ar: 'محمد صديق المنشاوي', en: 'Muhammad Siddiq Al-Minshawi', folder: 'Minshawy_Murattal_128kbps' },
];

export const AUDIO_SOURCE = {
  name: 'EveryAyah',
  url: 'https://everyayah.com/recitations_ayat.html',
  note: 'Streamed verse-by-verse for the hackathon prototype; do not redistribute or bundle recordings without a separate rights review.',
} as const;

export function reciterById(id: string | undefined) {
  return RECITERS.find(r => r.id === id) || RECITERS[0];
}

export function ayahAudioUrl(reciterId: string, surah: number, ayah: number) {
  const reciter = reciterById(reciterId);
  const s = String(surah).padStart(3, '0');
  const a = String(ayah).padStart(3, '0');
  return `https://everyayah.com/data/${reciter.folder}/${s}${a}.mp3`;
}
