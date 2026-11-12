# Surat Pengantar Konsolidasian

## Keputusan dan milestone

- Tipe internal: `SURAT_PENGANTAR_KONSOLIDASIAN` pada halaman Letter yang sama.
- Tanggal Surat dan Tanggal Opini terpisah; penomoran mengikuti Tanggal Surat WIB.
- Nomor `L.001/CON/AP.2137/XI/2026`, urutan CON sendiri per tahun, tidak reset bulanan.
- Client dari master client aktif; No Opini diisi manual, Notes opsional.
- Subject otomatis `Surat Pengantar Konsolidasian`.
- Tidak ada preview/print; perilaku seperti Surat Umum.

1. M1 selesai: schema/migration, data/API, validasi dan counter penomoran independen.
2. M2 selesai: pilihan tipe, form/edit/detail/filter/export Letter menggunakan pola
   repo dan pengujian UI/API. Tidak membuat standar layout baru.

## M1

Migration `drizzle/0037_dusty_zarda.sql` menambah:

- `letters.opinion_date`: date nullable, dikembalikan sebagai `YYYY-MM-DD`.
- `letters.opinion_number`: text nullable.
- `consolidated_letter_counters`: year PK, last_seq, updated_at.

Tidak mengubah isi surat lama. Kolom baru nullable agar HRGA/Umum/Surat Tugas
tetap valid. Migration disiapkan saja, tidak dijalankan ke database Owner.
Terapkan migration sebelum menjalankan/deploy kode yang membaca kolom baru.

Client, tanggal surat, status dan Notes memakai kolom existing. Tidak mengubah
penomoran invoice/OPE/Meals atau memakai counter dokumen finansial.

### API

Endpoint Admin existing tetap digunakan:

- GET `/api/letters`, GET `/api/letters/:id`: data opini ikut dikembalikan.
- POST `/api/letters`: tipe baru diarahkan ke service CON, tipe lama tetap ke
  alur existing. Client harus aktif, tanggal valid dan nomor opini tidak kosong.
- PUT `/api/letters/:id`: mendukung partial update data CON dalam transaksi.
- DELETE dan void mengikuti Letter existing. Counter tidak dihapus/dikurangi.
- Audit tetap module LETTER dan helper best-effort existing, setelah commit.

Contoh create (Subject/status tidak wajib dikirim untuk CON):

```json
{
  "letterType": "SURAT_PENGANTAR_KONSOLIDASIAN",
  "clientId": "existing-active-client-id",
  "letterDate": "2026-11-12",
  "opinionDate": "2026-11-10",
  "opinionNumber": "OP.001/2026",
  "notes": "Catatan opsional"
}
```

Tanggal Surat menerima tanggal kalender atau ISO timestamp dari form existing.
Tanggal Opini hanya tanggal kalender, tidak dikonversi ke timestamp/UTC.
Nomor opini berupa teks manual, tidak dianggap sebagai nomor surat otomatis
dan tidak diberi unique constraint tambahan.

### Penomoran dan edit

- Alokasi counter dikunci per tahun dalam transaksi yang sama dengan simpan.
- Mempertimbangkan maksimum urutan CON yang sudah ada (untuk data impor),
  serta nilai counter agar nomor committed tidak digunakan ulang setelah delete.
- HRGA tetap memakai pool HRGA; Umum dan Surat Tugas tetap berbagi pool lama.
  CON dikecualikan dari perhitungan pool lama, baik create maupun edit.
- Prefix mengikuti Settings saat create, fallback `AP.2137` seperti surat lain.
- Edit Notes/No Opini/Tanggal Opini atau kirim tanggal surat yang sama:
  nomor dan urutan tetap, meskipun prefix Settings sudah berubah.
- Tanggal Surat berganti bulan pada tahun sama: urutan tetap, bulan Romawi
  diperbarui. Berganti tahun: ambil urutan baru di tahun tujuan. Counter tahun
  asal tidak dikurangi. Prefix nomor existing tetap dipertahankan.
- Nomor/seq tidak bisa dimanipulasi manual. Konversi tipe lama ke CON atau
  CON ke tipe lain ditolak; buat surat baru.
- Client existing yang belakangan nonaktif tetap bisa dipertahankan saat edit;
  mengganti client wajib memilih client aktif.

## Batas M1 dan handover (catatan tahap sebelumnya)

UI belum menambahkan opsi membuat tipe baru; masuk M2. Satu label tipe ditambah
agar type checking dan pembacaan record CON tidak menghasilkan label kosong.
Tidak ada tombol print baru dan tidak ada template yang dibuat.

Sesudah Owner menerapkan 0037, lanjut M2: gunakan subject otomatis di payload,
opinionDate sebagai string kalender, field client/opini wajib dan Notes opsional.
Tampilkan tanggal/no opini di detail dan export tanpa mengubah surat lama.

## Perintah verifikasi

```powershell
pnpm test:letters
pnpm test:letters:integration
pnpm exec tsc --noEmit
```

Integration memakai PostgreSQL sementara di TEMP dengan port acak, tidak
membaca `.env` atau menghubungi database Owner. Butuh PostgreSQL bin lokal
(default Windows PostgreSQL 18; `PG_TEST_BIN` dapat menunjuk lokasi lain).

## Hasil verifikasi M1

- 14 unit test CON + regresi format/kelompok nomor surat lama: lulus.
- 11 kelompok integration PostgreSQL pada cluster sementara: lulus. Seluruh
  38 migration berhasil diterapkan pada cluster kosong milik test saja.
- Delapan create bersamaan mendapat nomor unik berurutan; reset tahunan,
  tidak reset bulanan, VOID, hard delete tanpa penggunaan ulang, rollback saat
  insert gagal, prefix snapshot dan perubahan tanggal/klien diuji.
- Surat lama tetap nullable pada field opini dan datanya tidak berubah;
  counter invoice/OPE serta tabel bisnis di fixture tidak berubah.
- 24 unit test Overtime existing tetap lulus.
- `pnpm exec tsc --noEmit`: lulus setelah seluruh perubahan terintegrasi.
- Next lint file implementasi lulus dengan warning `<img>` lama pada halaman
  Letters; tidak mengubah renderer/print lama dalam M1.
- Migration 0037 tidak dijalankan ke database Owner. UI lengkap dan pengujian
  HTTP/browser tipe baru masuk M2. Build produksi belum dijalankan untuk M1.

## M2 - Integrasi halaman Letter

Owner mengonfirmasi migration 0037 sudah diterapkan sebelum M2. Agent tidak
menjalankan migration pada database Owner dan tidak membuat surat uji di sana.
Tidak ada migration tambahan pada M2.

- Tipe/filter Surat Pengantar Konsolidasian ditambah pada dropdown existing.
- Form tambah/edit tetap memakai modal Letter yang sama: client aktif wajib,
  Tanggal Surat terpisah, kalender Tanggal Opini wajib, No Opini manual wajib,
  dan Notes opsional. Subject otomatis, tidak menjadi isian tambahan.
- Nilai opini dimuat saat edit dan direset saat form baru/pergantian tipe.
  Payload field opini hanya dikirim untuk CON, bukan surat HRGA/Umum/Tugas.
- Tanggal Opini disimpan sebagai string kalender, tidak melewati konversi UTC.
  Client existing yang nonaktif tetap tampil ketika mengedit surat CON terkait.
- Detail menampilkan Tanggal Opini dan No Opini. Pencarian CON mencakup No Opini
  dan client; export menambah kolom opini, kosong untuk tipe lama.
- Tidak ada tombol print/preview CON. Print Surat Tugas dan layout halaman lama
  tidak diubah. Submit memakai guard klik ganda; error API ditampilkan dengan
  isian form tetap utuh agar bisa diperbaiki.

### Verifikasi M2

- TypeScript dan focused Next lint lulus; warning `<img>` Surat Tugas existing
  tetap ada, bukan error. Build production terisolasi di TEMP: exit 0.
- 14 unit test lulus.
- 14 kelompok PostgreSQL integration lulus (11 service/database + 3 HTTP dari
  build production). Semua koneksi menuju cluster fixture baru yang terpisah.
- HTTP membuktikan Admin-only, invalid field ditolak, create/read/full edit CON
  mempertahankan nomor saat edit biasa, opini tetap date-only, void dan larangan
  konversi tipe. Urutan CON sengaja dibuat tinggi di fixture: Umum/Tugas/HRGA
  tetap mengambil urutan masing-masing, termasuk edit dan detail tim Surat Tugas.
- Chrome API mock: create wajib client/opini, subject otomatis, submit ganda hanya
  satu request; detail/edit kalender tidak bergeser di zona America/Los_Angeles;
  client existing nonaktif tetap termuat; error server mempertahankan isian;
  pergantian ke Umum tidak membawa field opini.
- Filter/pencarian/export Excel sesuai data opini dan filter aktif; menu print
  tidak ada untuk CON dan tetap ada pada Surat Tugas. Lebar 390/768/1440 diuji
  tanpa overflow halaman, modal dapat discroll, tidak ada browser page error.

### UAT Owner

1. Letter -> Buat Surat -> pilih Surat Pengantar Konsolidasian.
2. Pilih client dan Tanggal Surat; isi Tanggal Opini, No Opini, Notes bila perlu.
   Subject tidak perlu diisi. Simpan dan periksa nomor `L.xxx/CON/...`.
3. View Detail: cocokkan kedua tanggal, nomor opini, client dan Notes.
4. Edit No Opini/Notes saja: nomor surat harus tetap. Tutup dan buka lagi untuk
   memastikan nilainya tersimpan, bukan hanya berubah di browser.
5. Pilih filter tipe baru, cari No Opini, export Excel dan periksa kolom opini.
6. Pastikan menu Print tidak ada untuk CON, sedangkan Surat Tugas tetap tersedia.
7. Buat tipe lama jika diperlukan di database uji; format nomor dan isian lama
   harus tetap seperti sebelumnya. Jangan membuat fixture di production.

Pengujian HTTP opsional pada script integration memakai `CON_TEST_BUILD_DIR`
yang menunjuk salinan source tanpa `.env` di TEMP dengan build production.
Untuk keamanan, path dibatasi langsung di bawah TEMP dengan prefix
`iecnet-overtime-build-` (mengikuti utilitas salinan build pengujian sebelumnya).
Tanpa variabel ini, script menjalankan 11 kelompok database/service saja.
