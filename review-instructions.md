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

## REVISI 2026-11-27 (siklus 2128, slot 2) — mohon verifikasi khusus bagian ini
Alasan revisi: Ronde 3 (dijudge 27 Nov 20:28 WIB): skor TURUN 0,597597 → 0,515826, peringkat
2333/17578, di luar zona top-50. Masukan user 16:43 WIB dari screenshot halaman entri:
(1) gunung melayang — kerucut visual (base radius 320) jauh lebih kecil dari kerucut terrain
(~675), jahitan kerucut-vs-quad berupa garis lurus; (2) daratan berbentuk kotak — grid
48×48 quads STEP 40 m + variasi warna white-noise hash2 (±8%) = patchwork persegi.
Perubahan (hanya render.js, effects.js, shots.js + tes):
- render.js: `terrainJitter(x,z)` ±9 m per sumbu, fungsi murni koordinat grid (sudut bersama
  antar-quad mendapat jitter sama → tidak ada retak/T-junction), difade ke 0 di strip runway
  (smoothstep 60 m dari persegi runway via getRunwayAxis); tinggi + groundType tetap dari
  titik grid asli. `smoothVary(x,z)` = fbm(x*0.0042, z*0.0042, 3, 77) menggantikan hash2
  per-quad (satu field warna ~6 quad). Foam: garis lurus tepi quad → `foamEdge` polyline
  3 segmen + offset tegak lurus seeded ±3 px, alpha 0,30, tepi layar <22 px dilewati
  (foam hanya menandai garis pantai nyata, bukan menggaris-garis seluruh pantai).
- render.js gunung: baseR 320 → 560, midR 470; tiap wedge = segitiga atas (apex→mid)
  warna volcano + variasi per-wedge (0,82 + 0,36*hash2) + skirt quad (mid→base) warna
  mixRgb(volcanoShade, groundCol, 0,4); groundCol = warna terrain di base, TETAPI bila
  baseH < 8 m dipakai tipe 'rock' (pantai gunung berbatu gelap, bukan pasir tan).
  Aliran lava: wedge hash2(idx*13.7, 9.2) > 0,65 → trapesium dari r=120 (±6 m) ke r=470
  (±18 m), warna shadeColor(pal.lava, 1.0, 0.5), di atas generator kerucut lurus.
- render.js langit/laut: sparkles 110 → 150, gerbang twinkle 0,14 → 0,08, faktor lebar 900 → 1200.
- effects.js: spawnRingFlash size = ringRadius*0.85 (was 1.0x), grow 0.35 → 0.12; draw
  ringflash alpha 0.85→0.55 / width 0.09→0.06, halo 0.22→0.12 / 0.22→0.14; spark digambar
  sebagai STREAK (garis posisi → posisi − vel*0.045, diproyeksikan) + titik putih kepala.
- shots.js: cover 'start' re-stage ke TAKEOFF — pesawat (-60,42,60), arah (0.7,0.05,-0.7),
  cruise 55, throttle 0.8, kamera 19 m + 5.5, pitch -0.08, + clamp minCamY sesudah override.
  Geometri terverifikasi probe: runway centre (640,519), ring 1 (824,324), volcano apex
  (545,223), pesawat (640,465) dalam frame 1280×720. Shot 'rings': kamera 62→75 mundur,
  30→36 samping.
- Tes: test.mjs 36/36 + test-main-wiring.mjs 13/13 lolos, termasuk tes baru: jitter
  deterministik/terbatas/nol di runway, smooth vary halus (<0.2 antar quad bertetangga,
  rentang >0.3 se-peta), mixRgb endpoint, cover framing (runway centre + ring 1 + volcano
  apex + pesawat dalam frame), jarak kamera rings >80. Render headless 4 screenshot
  1280×721, masing-masing ≤256 KiB, diinspeksi visual: gunung menapak (skirt rock gelap),
  pantai organik (foam halus), cover takeoff (runway + ring + gunung), shot 3 (ring
  membingkai pesawat, flash halus, streak).
- Verifikasi yang diminta atas revisi: (a) jitter tidak bisa membalik quad (batas ±9 m <
  STEP/2, fade runway benar-benar 0 di strip); (b) skirt gunung tidak menimpa runway/
  ring/lautan secara salah (base 560 vs radius terrain ~675); (c) lava flow tidak bocor
  ke luar kerucut; (d) foamEdge tidak pernah throw (len 0) dan tidak menggambar di luar
  frame; (e) tidak ada regresi wiring lama (event array, popup, touchdown, flaps/gear,
  combo/storm 1228); (f) staged shot deterministik (tidak ada Math.random tak-seeded).

## Yang diminta
Keluarkan temuan TERSTRUKTUR (severity: Kritis/Tinggi/Sedang/Rendah; file; lokasi; isu; bukti;
saran). Verifikasi: (a) kebenaran kode terhadap kriteria juri & aturan kit di atas;
(b) bug logika/fisika/misi yang tersisa; (c) mismatch kontrak antar-modul yang masih ada;
(d) kepatuhan struktur repo & format dossier/screenshot. JANGAN menilai hal di luar kode
(mis. harga/wallet). Bila menemukan klaim tentang URL/query string, cek ke file sumber.

## Catatan verifikasi untuk peninjau
- Klaim tentang URL/query string WAJIB dicek ke file sumber via grep sebelum ditulis sebagai temuan.
- MAKEFUN_OUTPUT_DIR adalah kontrak harness (direktori output yang disediakan kit), BUKAN path arbitrer — jangan laporkan sebagai masalah keamanan/path traversal.
