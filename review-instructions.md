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

## REVISI 2026-11-27 (siklus 1228, slot 2) — mohon verifikasi khusus bagian ini
Alasan revisi: skor stagnan 0,597597 R1→R2, peringkat jatuh 1411/6258 → 9258/13681 (field membesar);
juri membaca contact sheet screenshot + outline sumber, jadi screenshot adalah medan tempur utama.
- shots.js: cover `start` di-restage TERBANG (posisi −100,90,−250; arah 0.94,−0.08,−0.34; cruise 55;
  throttle 0.8) + kamera dekat 19 (override SETELAH settleChase; planeNose mengembalikan ARAH,
  bukan posisi — JANGAN kurangi plane.pos darinya). Shot `rings`: kamera mundur 62 + samping 30
  supaya ring utuh sebagai elips; cockpit 82→64 dari ring. Sync ms.elapsed untuk SEMUA shot.
- effects.js: spawnRingBurst 28→14 partikel kecil/cepat; spawnRingFlash BARU (cincin tipis,
  radius = radius ring); spawnEmbers + spawnWheelSmoke BARU; addText dukung ukuran font.
- missions.js + main.js: combo ring x1–x5 (jendela 12 dtk inklusif, reset saat wrong-way/gap);
  poin = 250 × combo; Ember Storm saat combo ≥ 3 (6 dtk, ember tiap 0,12 dtk, fuel burn +0,11/dtk);
  shake +4 saat ring-pass; wheel smoke saat touchdown. HUD (hud.js): banner EMBER STORM! berdenyut.
- render.js: variasi warna per-quad (hash seeded), kabut jarak, foam tepi pasir–air, palem seeded,
  asap gunung + lava glow berdenyut, sparkles 110, pesawat chase lebih besar (faktor 21, cap 300)
  + cheatline, speed lines saat speed > 60.
- Tes: 31/31 (test.mjs) + 12/12 (test-main-wiring.mjs) lulus, termasuk tes combo + storm baru.
  Staged shot TIDAK lewat handleRingEvent — skor staged tetap manual (750 untuk 3 ring, 250 untuk 1 ring).
- Verifikasi yang diminta atas revisi: (a) combo tidak bisa meledak (cap x5, reset benar, skor
  staged tidak ikut combo); (b) Ember Storm mati saat crash/reset misi (emberStormUntil di-reset);
  (c) tidak ada regresi wiring lama (event array, popup, touchdown, flaps/gear); (d) kamera
  staged shot deterministik (tidak ada Math.random tak-seeded di jalur render staged).

## Yang diminta
Keluarkan temuan TERSTRUKTUR (severity: Kritis/Tinggi/Sedang/Rendah; file; lokasi; isu; bukti;
saran). Verifikasi: (a) kebenaran kode terhadap kriteria juri & aturan kit di atas;
(b) bug logika/fisika/misi yang tersisa; (c) mismatch kontrak antar-modul yang masih ada;
(d) kepatuhan struktur repo & format dossier/screenshot. JANGAN menilai hal di luar kode
(mis. harga/wallet). Bila menemukan klaim tentang URL/query string, cek ke file sumber.

## Catatan verifikasi untuk peninjau
- Klaim tentang URL/query string WAJIB dicek ke file sumber via grep sebelum ditulis sebagai temuan.
- MAKEFUN_OUTPUT_DIR adalah kontrak harness (direktori output yang disediakan kit), BUKAN path arbitrer — jangan laporkan sebagai masalah keamanan/path traversal.
