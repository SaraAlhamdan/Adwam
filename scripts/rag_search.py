#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Adwam Quran RAG Search Engine
Performs fast SQLite FTS5 BM25 search over the verified 638,549 records Quran corpus.
"""

import sys
import os
import json
import sqlite3
import re
from pathlib import Path

# Ensure stdout uses UTF-8 encoding
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# High-frequency generic religious terms to exclude from standalone FTS matching
# This prevents full-table BM25 scans while preserving specific keywords
STOP = {
    'ما', 'ماذا', 'من', 'في', 'عن', 'على', 'الى', 'إلى', 'هو', 'هي', 'هل',
    'ابي', 'أبي', 'اريد', 'أريد', 'اشرح', 'فسر', 'تفسير', 'معنى', 'وش', 'ايش',
    'ال', 'و', 'ثم', 'سورة', 'سوره', 'اية', 'آية', 'ايات', 'آيات', 'كتاب', 'قال', 'الله'
}

AR_DIACRITICS = re.compile(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]')
HTML_TAG = re.compile(r'<[^>]+>')

def normalize_ar(text: str) -> str:
    text = AR_DIACRITICS.sub('', text or '')
    return (text.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
                .replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي').replace('ـ', ''))

def clean_text(text: str) -> str:
    return re.sub(r'\s+', ' ', str(text or '')).strip()

EN_AR_MAP = {
    'kawthar': 'الكوثر', 'fatihah': 'الفاتحة', 'faatiha': 'الفاتحة',
    'baqarah': 'البقرة', 'baqara': 'البقرة', 'imran': 'عمران',
    'nisa': 'النساء', 'nisaa': 'النساء', 'maidah': 'المائدة',
    'anam': 'الأنعام', 'araf': 'الأعراف', 'anfal': 'الأنفال',
    'tawbah': 'التوبة', 'tawba': 'التوبة', 'yunus': 'يونس',
    'hud': 'هود', 'yusuf': 'يوسف', 'rad': 'الرعد',
    'ibrahim': 'إبراهيم', 'hijr': 'الحجر', 'nahl': 'النحل',
    'isra': 'الإسراء', 'kahf': 'الكهف', 'maryam': 'مريم',
    'taha': 'طه', 'anbiya': 'الأنبياء', 'hajj': 'الحج',
    'muminun': 'المؤمنون', 'nur': 'النور', 'furqan': 'الفرقان',
    'yasin': 'يس', 'yaseen': 'يس', 'saffat': 'الصافات',
    'zumar': 'الزمر', 'ghafir': 'غافر', 'fussilat': 'فصلت',
    'shura': 'الشورى', 'zukhruf': 'الزخرف', 'dukhan': 'الدخان',
    'rahman': 'الرحمن', 'waqiah': 'الواقعة', 'hadid': 'الحديد',
    'mulk': 'الملك', 'qalam': 'القلم', 'haqqah': 'الحاقة',
    'nuh': 'نوح', 'jinn': 'الجن', 'muzzammil': 'المزمل',
    'muddathir': 'المدثر', 'qiyamah': 'القيامة', 'insan': 'الإنسان',
    'naba': 'النبأ', 'naziat': 'النازعات', 'abasa': 'عبس',
    'fajr': 'الفجر', 'balad': 'البلد', 'shams': 'الشمس',
    'duha': 'الضحى', 'sharh': 'الشرح', 'tin': 'التين',
    'qadr': 'القدر', 'zalzalah': 'الزلزلة', 'qariah': 'القارعة',
    'asr': 'العصر', 'fil': 'الفيل', 'quraysh': 'قريش',
    'kafirun': 'الكافرون', 'nasr': 'النصر', 'masad': 'المسد',
    'ikhlas': 'الإخلاص', 'falaq': 'الفلق', 'nas': 'الناس', 'naas': 'الناس',
    'tafsir': 'تفسير', 'tafseer': 'تفسير', 'quran': 'قرآن',
}

def query_terms(question: str):
    q = normalize_ar(question)
    toks = re.findall(r'[\u0600-\u06FFA-Za-z0-9]+', q)
    toks = [t for t in toks if len(t) > 1 and t not in STOP]
    out = []
    for t in toks:
        tl = t.lower()
        tl_strip = re.sub(r'^(al|el)[-_]?', '', tl)
        if tl in EN_AR_MAP:
            ar_mapped = normalize_ar(EN_AR_MAP[tl])
            if ar_mapped not in out:
                out.append(ar_mapped)
        elif tl_strip in EN_AR_MAP:
            ar_mapped = normalize_ar(EN_AR_MAP[tl_strip])
            if ar_mapped not in out:
                out.append(ar_mapped)
        if t not in out:
            out.append(t)
    return out[:18]

def get_db_path():
    env_path = os.getenv('QURAN_RAG_DB_PATH')
    if env_path and os.path.exists(env_path):
        return env_path
    # Common default paths in the workspace
    candidates = [
        Path(__file__).parent.parent.parent / 'quran_genai_assistant_final_wafa' / 'quran_genai_assistant_final' / 'vector_db' / 'quran_rag.sqlite3',
        Path(__file__).parent.parent / 'server' / 'rag' / 'quran_rag.sqlite3',
        Path('c:/Users/96650/OneDrive/سطح المكتب/wafa_rag/quran_genai_assistant_final_wafa/quran_genai_assistant_final/vector_db/quran_rag.sqlite3'),
    ]
    for c in candidates:
        if c.exists():
            return str(c.resolve())
    return None

def search_corpus(question: str, surah: int = None, ayah: int = None, limit: int = 8):
    db_path = get_db_path()
    if not db_path:
        return {"error": "DATABASE_NOT_FOUND", "message": "قاعدة بيانات القرآن RAG غير موجودة في المسار المحدد."}

    terms = query_terms(question)

    # If ayah context is provided, enrich search terms if query is too short
    context_prefix = ""
    if surah and ayah:
        context_prefix = f"سورة {surah} آية {ayah}"

    if not terms and not context_prefix:
        return {"hits": []}

    try:
        uri = f"file:{db_path}?mode=ro"
        con = sqlite3.connect(uri, uri=True, timeout=10.0)
    except Exception as e:
        return {"error": "DB_CONNECTION_FAILED", "message": str(e)}

    # Build FTS terms
    fts_terms = [f'"{t}"' for t in terms]
    if not fts_terms and context_prefix:
        fts_terms = [f'"{surah}"', f'"{ayah}"']

    fts_query = " OR ".join(fts_terms)

    try:
        cur = con.cursor()
        # Query FTS5 with BM25 rank, excluding documentation / licenses
        query_sql = """
            SELECT d.id, d.file, d.location, d.text, d.title, d.author, d.url, d.metadata, bm25(docs_fts) AS rank
            FROM docs_fts JOIN docs d ON d.id = docs_fts.rowid
            WHERE docs_fts MATCH ?
              AND d.file NOT LIKE '%.md'
            ORDER BY rank
            LIMIT ?
        """
        rows = cur.execute(query_sql, (fts_query, limit * 3)).fetchall()
    except Exception as e:
        con.close()
        return {"error": "QUERY_ERROR", "message": str(e), "hits": []}

    # Scoring with bonuses for location/surah/ayah matches
    scored = []
    qn = normalize_ar(question)
    for r in rows:
        bonus = 0.0
        loc = normalize_ar(r[2] or '')
        title = normalize_ar(r[4] or '')
        text = r[3] or ''

        # Bonus for terms matching location (surah/ayah) or book title
        for t in terms:
            if t in loc:
                bonus += 2.0
            if t in title:
                bonus += 1.0

        # High bonus if user specified an ayah context and the record matches that ayah
        if surah and ayah:
            if f"{surah}" in loc and f"{ayah}" in loc:
                bonus += 5.0

        rank = float(r[8]) - bonus
        scored.append((rank, r))

    scored.sort(key=lambda x: x[0])

    hits = []
    for _, r in scored[:limit]:
        raw_meta = r[7]
        try:
            meta = json.loads(raw_meta) if raw_meta else {}
        except:
            meta = {}

        # Extract excerpt snippet around matching terms or first 250 chars
        full_text = clean_text(r[3])
        excerpt = full_text[:280] + ("…" if len(full_text) > 280 else "")

        hits.append({
            "id": r[0],
            "file": r[1],
            "location": r[2] or "",
            "text": full_text,
            "excerpt": excerpt,
            "title": r[4] or Path(r[1]).stem,
            "author": r[5] or "غير مذكور",
            "url": r[6] or "",
            "metadata": meta
        })

    con.close()
    return {"hits": hits}

def main():
    if len(sys.argv) > 1:
        # CLI arguments mode: python rag_search.py "question" [surah] [ayah] [limit]
        q = sys.argv[1]
        surah = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
        ayah = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else None
        limit = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 8
    else:
        # JSON stdin mode
        try:
            payload = json.load(sys.stdin)
            q = payload.get('question', '')
            surah = payload.get('surah')
            ayah = payload.get('ayah')
            limit = payload.get('limit', 8)
        except Exception as e:
            print(json.dumps({"error": "INVALID_JSON_INPUT", "message": str(e)}, ensure_ascii=False))
            sys.exit(1)

    result = search_corpus(q, surah, ayah, limit)
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
