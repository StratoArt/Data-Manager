# OPT media workflow (Hama, Penyakit, Gulma)

## Canonical storage

- Photos: `assets/opt-media/photos/`
- Reference charts / life-cycle illustrations: `assets/opt-media/reference/`
- Records: `data/opt/hama.json`, `data/opt/penyakit.json`, `data/opt/gulma.json`

Each OPT record keeps its existing stable `id`. Images belong in the record's `images` array; each image may use `image_type`, `stage`, `local_path`, `remote_url`, `source_url`, `source_name`, `license`, `author`, `attribution`, and `notes`. Do not change OPT IDs or crop/product relation files when replacing an image.

## Adding or replacing user-supplied photos

1. Match the photo to the existing OPT ID, not just its common name. Keep a distinct filename for each organism/stage/symptom (for example `spodoptera-exigua-larva-02.webp`).
2. Copy the original user-provided image into `assets/opt-media/photos/` (or `reference/` for diagrams). Prefer WebP for photos; keep a readable original outside the app if archival quality is needed.
3. Add/update an entry in that record's `images` array. Set `local_path` to the canonical path, set `remote_url` to an empty string, and record attribution accurately. For user-supplied photos, use an attribution such as `Foto pengguna — Crop Expert` only when the user has provided that image. Do not claim a source/license that has not been verified.
4. To replace a main photo, update the existing image entry where possible. To add another view, append a new image entry. Do not remove other stages unless the user explicitly asks.
5. Run `node scripts/audit-opt-media.mjs`. Fix any missing local asset or duplicate ID before publishing.
6. Commit the media file and JSON record together. Data Manager remains canonical; PestiApps reads it through the Data Center adapter and must not become a separate source of truth.

## Publish langsung dari Data Manager (v0.6)

Buka record Hama/Penyakit/Gulma → panel **Foto & media**. Foto yang dipilih dikompres ke WebP di browser, lalu **Publish ke GitHub** membuat SATU commit berisi file gambar + `data/opt/*.json` yang sudah diperbarui. Nama file otomatis unik (`<id>-<tahap>.webp`, `-02` bila bentrok), path memakai `assets/opt-media/…`.

Setup sekali: tombol **GitHub** (kanan atas) → isi owner/repo/branch dan token fine-grained yang hanya punya akses ke repo Data-Manager dengan izin **Contents: Read and write**. Token tersimpan di sessionStorage (hilang saat tab ditutup) kecuali kamu centang "ingat token".

Aturan penting:

- Data dibaca ulang dari branch saat publish, jadi perubahan orang lain tidak tertimpa; bila ada commit yang masuk di tengah jalan, publish diulang otomatis.
- Record harus sudah ada di repo. Record baru yang hanya ada di draft belum bisa diberi foto.
- Ganti/Hapus: file lama dihapus hanya bila tidak dipakai entri lain di ketiga dataset OPT.
- "Tautkan file yang sudah ada" memakai file di `assets/opt-media/` yang belum dipakai record mana pun (ditandai ●).
- Jika branch dilindungi (wajib PR), publish ke `main` ditolak GitHub; ubah branch di pengaturan atau lepas proteksinya.
- PestiApps membaca lewat raw.githubusercontent.com yang di-cache GitHub ± 5 menit.
- Edit teks record masih berupa draft lokal (Export JSON); hanya foto OPT yang di-commit langsung.

Jalankan `node tests/github-sync.test.mjs` dan `node scripts/audit-opt-media.mjs` sebelum merilis.

## Editor detail & icon (v0.7)

Klik record **Tanaman / Hama / Penyakit / Gulma** → editor detail. Semua perubahan disimpan dengan **Simpan ke GitHub** sebagai satu commit (butuh token, lihat bagian "Publish langsung").

- **Detail:** nama ilmiah/umum, kategori, deskripsi, tanaman inang, gejala, tahap perkembangan, petunjuk identifikasi, kondisi mendukung, catatan. Hanya field yang diubah yang ditulis; field lain di record tidak disentuh.
- **Icon:** pilih dari daftar (`assets/icons/index.json`) atau unggah sendiri (SVG/PNG/WebP/JPG; raster dikecilkan ke 256 px WebP). Icon unggahan disimpan di `assets/icons/custom/` dan field `icon` berisi `custom/<file>`. Jalankan `node scripts/build-icon-index.mjs` bila menambah file icon manual.
- **Bahan aktif terkait:** daftar nama + catatan, disimpan di `active_ingredients` pada record OPT (status `manual`). PestiApps menampilkannya sebagai "Input manual" di detail OPT.
- **Produk yang bisa digunakan:** cari di Database Pestisida lalu Tambah/Lepas. Ini mengubah `linked_opt_ids` pada produk dan `data/relations/product_opt.json` dalam commit yang sama. PestiApps membaca `linked_opt_ids`.
- **Record baru:** tombol + Tambah di halaman Hama/Penyakit/Gulma/Tanaman (id dibuat dari nama; foto bisa ditambahkan setelah record tersimpan).
- Editor ini membaca data terbaru dari branch saat menyimpan, jadi tidak menimpa perubahan lain. Menghapus record belum didukung dari editor ini.
- PestiApps butuh versi 0.27.0+ untuk menampilkan icon kustom dan bahan aktif manual.
