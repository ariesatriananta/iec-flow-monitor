# Surat Pengantar Konsolidasian

## Keputusan dan milestone

- Tipe internal: `SURAT_PENGANTAR_KONSOLIDASIAN` pada halaman Letter yang sama.
- Tanggal Surat dan Tanggal Opini terpisah; penomoran mengikuti Tanggal Surat WIB.
- Nomor `L.001/CON/AP.2137/XI/2026`, urutan CON sendiri per tahun, tidak reset bulanan.
- Client dari master client aktif; No Opini diisi manual, Notes opsional.
- Subject otomatis `Surat Pengantar Konsolidasian`.
- Tidak ada preview/print; perilaku seperti Surat Umum.

1. M1: schema/migration, data/API, validasi dan counter penomoran independen.
2. M2: pilihan tipe, form/edit/detail/filter/export Letter menggunakan pola repo,
   lalu pengujian UI dan API lengkap. Tidak membuat standar layout baru.

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

## Batas M1 dan handover

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
- 24 unit test lembur existing tetap lulus.
- `pnpm exec tsc --noEmit`: lulus setelah seluruh perubahan terintegrasi.
- Next lint file implementasi lulus dengan warning `<img>` lama pada halaman
  Letters; tidak mengubah renderer/print lama dalam M1.
- Migration 0037 tidak dijalankan ke database Owner. UI lengkap dan pengujian
  HTTP/browser tipe baru masuk M2. Build produksi belum dijalankan untuk M1.
