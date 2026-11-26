# Instruksi review — Ember Isles (best-flight-game-20261126-0057)

## Konteks
Entri game "Make the best flight game" (make.fun, Games, $500 USDC escrow, zona top-50).
Game: "Ember Isles" — flight arcade pseudo-3D Canvas 2D, vanilla JS tanpa library,
3 misi (Ring Race 6 cincin, Precision Landing, Canyon Run + supply drop), dunia seeded,
fixed timestep 60 Hz, staging screenshot deterministik ?shot=<nama>&seed=<n>.

## Kriteria juri (berurutan)
1. Game penerbangan LENGKAP terlihat di screenshot (cockpit/chase view, terrain dikenali,
   pesawat + instrumen menyala, runway/target ring, HUD altitude/speed/heading).
2. Fun & depth (throttle/turn discipline, misi berbeda, fuel/damage).
3. Feel & polish. 4. Look & originality. 5. Structure (source terpecah per file, nama jelas).

## Aturan kit (RULES.txt) — fokus kepatuhan
- Repo PUBLIC; main.ts Node 22 stdlib-only di root; vendor/makefun-game.ts salinan kit TAK BERUBAH;
  game/ file statis, index.html main di desktop Chrome, TANPA network load apa pun.
- 3-4 screenshot PNG/JPEG render asli (masing-masing ≤256 KiB, sisi panjang ≤1280, sisi pendek ≥480;
  pertama menurut nama = cover); dossier.json via buildDossier (teks ≤163.840 B).
- LICENSE MIT 2026; README template kit (3 badge make.fun, tanpa placeholder {owner});
  About repo: website bounty + topik makefun, ai-agents, bounties, games;
  .makefun/owner.json {"wallet": "w37xQVEhZfrSP4FFnZoTkkVgPnnQBc6tw1BJJnDLhu3"}.
- game_files ≤993 entri/48 MiB, index.html ≤1 MiB, tanpa symlink.
- Deliverable BERTANDA TANGAN (escrow funded): submit dengan --keypair w37x (bukan bagian review ini).

## Fokus risiko (temuan Fase 5 — SUDAH diperbaiki, mohon verifikasi perbaikannya)
Perbaikan wiring main.js/render.js (2026-11-26 ~12:30 WIB) sesudah laporan iterasi Carbon:
- stepPlane/updateMission mengembalikan ARRAY event {type,...}; main.js kini menormalisasi
  via findEv/hasEv — verifikasi tidak ada lagi pembacaan kunci objek (ev.rings/ev.touchdown/
  ev.crash/ev.stall/ev.liftoff) pada array.
- addPopup kini memproyeksikan worldPos→koordinat layar via project(cam) sebelum addText(x,y,text,color).
- Semua spawn* (spawnExplosion/spawnSplash/spawnRingBurst/spawnDust/spawnEngineSmoke)
  dipanggil dengan argumen numerik (x,y,z), bukan objek.
- Crash hanya bila event type==='crash' atau damage>=100; hardLanding hanya damage.
- Touchdown memakai event stepPlane (sinkRate pra-clamp), bukan hitung ulang sesudah vel.y=0.
- flaps siklus numerik (n+1)%3; gear hanya bisa retract saat airborne; spawnDust rate-limit 0,12 dtk.
- tests/test-main-wiring.mjs (5 test integrasi, startGame nyata) + tests/test.mjs (29 test) lulus 100%.

## Yang diminta
Keluarkan temuan TERSTRUKTUR (severity: Kritis/Tinggi/Sedang/Rendah; file; lokasi; isu; bukti;
saran). Verifikasi: (a) kebenaran kode terhadap kriteria juri & aturan kit di atas;
(b) bug logika/fisika/misi yang tersisa; (c) mismatch kontrak antar-modul yang masih ada;
(d) kepatuhan struktur repo & format dossier/screenshot. JANGAN menilai hal di luar kode
(mis. harga/wallet). Bila menemukan klaim tentang URL/query string, cek ke file sumber.

## Catatan verifikasi untuk peninjau
- Klaim tentang URL/query string WAJIB dicek ke file sumber via grep sebelum ditulis sebagai temuan.
- MAKEFUN_OUTPUT_DIR adalah kontrak harness (direktori output yang disediakan kit), BUKAN path arbitrer — jangan laporkan sebagai masalah keamanan/path traversal.
