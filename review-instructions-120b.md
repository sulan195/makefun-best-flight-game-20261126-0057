# Instruksi review singkat — Ember Isles (best-flight-game-20261126-0057)
Game flight arcade Canvas 2D vanilla JS, 3 misi, dunia seeded. Fokus: (a) kebenaran kode
terhadap kriteria juri (game penerbangan lengkap di screenshot, fun/depth, feel/polish,
look/originality, struktur source per file); (b) bug logika/fisika/misi; (c) kepatuhan kit:
repo PUBLIC, main.ts Node 22 stdlib-only, vendor/makefun-game.ts tak berubah, game/ statis
tanpa network load, 3-4 screenshot ≤256 KiB 1280x720, dossier teks ≤163.840 B, LICENSE MIT,
README 3 badge make.fun. Keluaran: temuan terstruktur (severity, file, lokasi, isu, bukti, saran).
Catatan: klaim tentang URL/query string WAJIB dicek ke file sumber via grep; MAKEFUN_OUTPUT_DIR
adalah kontrak harness, BUKAN path arbitrer — jangan laporkan sebagai masalah.
REVISI 2026-11-27 (siklus 2128, slot 2; verifikasi khusus): skor Ronde 3 TURUN 0,597597 →
0,515826 (peringkat 2333/17578, di luar top-50). Masukan user: gunung melayang + daratan kotak.
Perubahan: render.js — terrainJitter ±9 m/sumbu (fungsi murni koordinat grid, fade 0 di strip
runway), smoothVary = fbm ganti hash2 per-quad, foamEdge polyline 3 segmen ±3 px alpha 0,30
(tepi <22 px dilewati), gunung baseR 320→560 midR 470 + skirt mixRgb 0,4 (baseH<8 → tipe
'rock'), lava trapesium r=120 (±6 m) → r=470 (±18 m) shadeColor(lava,1.0,0.5), sparkles 150;
effects.js — ringFlash 0.85x ringRadius grow 0.12, spark jadi STREAK; shots.js — cover
TAKEOFF (-60,42,60) kamera 19+5.5 pitch -0.08 + clamp minCamY, rings kamera 75+36.
Tes: 36/36 + 13/13 lolos. Verifikasi: (a) jitter tak bisa balik quad (±9 < STEP/2, fade runway
0); (b) skirt tak menimpa runway/ring/laut salah; (c) lava tak bocor keluar kerucut;
(d) foamEdge aman (len 0) & dalam frame; (e) tanpa regresi wiring/combo/storm 1228;
(f) staged shot deterministik.
