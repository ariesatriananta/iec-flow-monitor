# OPE: tahapan implementasi

## Milestone

1. Fondasi: tabel header/detail, API khusus Admin, perhitungan, validasi,
   penomoran, snapshot identitas, dan audit log.
2. UI: menu OPE di bawah Invoice; tab Business Trip dan Meals; daftar,
   form header/detail, pilihan client, dan perubahan status.
3. Dokumen: preview/print dengan kop dan footer Invoice; pengujian integrasi
   penyimpanan, multi-client, historis, dan status.

M1 selesai; migration telah dikonfirmasi berhasil oleh Owner. M2 telah diuji
oleh Owner. M3 menambahkan preview dan print OPE. Business Trip OPE terpisah dari
pengajuan perjalanan dinas HR. OPE tidak memengaruhi nominal termin/invoice,
nilai kontrak, atau progres pembayaran kontrak.

## Database

Migration: `drizzle/0034_real_baron_strucker.sql`. Menambahkan hanya
`ope_documents`, `ope_items`, foreign keys, dan indexes baru.
Tidak dijalankan otomatis saat implementasi.

Relasi client/karyawan memakai `ON DELETE SET NULL`; salinan identitas
tetap tersimpan agar dokumen historis tidak hilang dan penghapusan master
yang sudah ada tetap dapat berjalan. Item dokumen memakai `ON DELETE CASCADE`.

Jalankan migration pada database tujuan sebelum menguji API OPE dengan sesi
Admin. Jangan menjalankan migration lama lagi apabila sudah diterapkan.

### Penomoran bersama Invoice / OPE / Meals

Migration `drizzle/0035_ambiguous_hedge_knight.sql` menambahkan tabel
`document_number_counters` (`year`, `last_seq`, `updated_at`) untuk menjaga
satu urutan per tahun. Nilai awal mengambil nomor terbesar berformat
`I.xxx/ARM/BULAN-ROMAWI/tahun` dari tabel Invoice dan OPE. Nomor OPE lama
berawalan `OPE/BT` atau `OPE/ML` tidak ikut menaikkan counter.

Migration juga menghapus index gabungan lama `ope_documents_sequence_unique`,
karena urutan OPE lama dapat sama dengan urutan baru pada tahun/jenis yang
sama. Nomor dokumen lama tidak diubah. Migration ini belum dijalankan saat
implementasi; Owner menerapkannya sebelum deploy kode penomoran baru.

Pemeriksaan read-only saat implementasi menemukan nomor maksimum tahun 2026
sebesar 42 dari 41 dokumen berformat bersama. Nomor berikutnya diperkirakan
43 jika tidak ada dokumen tambahan sebelum migration. Ini hasil pemeriksaan
saat itu, bukan nomor yang dikunci dalam kode atau migration.

Allocator server digunakan bersama oleh pembuatan Invoice melalui Termin,
API Invoice, dan OPE/Meals. Counter disimpan dalam transaksi yang sama dengan
dokumen sehingga request bersamaan tidak memperoleh nomor sama dan transaksi
gagal tidak meninggalkan alokasi terpisah. Counter mempertahankan urutan
setelah dokumen dihapus. Perubahan tanggal dokumen tidak mengganti nomor
atau `numberYear` OPE yang sudah tersimpan. API edit Invoice juga menolak
permintaan untuk mengganti `seqNo` atau `invoiceNumber`.

UAT setelah migration dan deploy:

1. Catat nomor bersama terbesar pada tahun uji, lalu buat Invoice, Business
   Trip OPE, dan Meals secara bergantian. Ketiganya harus memperoleh urutan
   berlanjut dengan format `I.xxx/ARM/BULAN-ROMAWI/tahun`.
2. Buka dan edit Draft OPE/Meals lama; nomor `OPE/BT/...` atau `OPE/ML/...`
   tetap seperti sebelumnya. Periksa pula nomor pada detail, preview, dan print.
3. Buat dokumen dengan bulan berbeda pada tahun yang sama: urutan tetap
   berlanjut dan bulan Romawi mengikuti tanggal saat dibuat. Tahun berbeda
   memakai counter tahun tersebut. Edit tanggal sesudah simpan mempertahankan
   nomor serta tahun penomoran awal dokumen.
4. Jalankan dua pembuatan secara bersamaan pada database uji; nomor harus
   berbeda. Uji kegagalan transaksi setelah alokasi pada lingkungan uji untuk
   memastikan counter dan dokumen rollback bersama. Verifikasi konkurensi
   dan rollback langsung ke database masih menunggu UAT Owner.
5. Pastikan nominal, pajak, status, dan dokumen historis tetap sesuai data
   sebelumnya. Penggantian nomor Invoice yang sudah ada melalui API ditolak.

## Aturan

- Client baru harus aktif dan memiliki kontrak ACTIVE.
- Dropdown satu baris per client, urut kontrak ACTIVE terbaru (`createdAt`).
- Pilihan historis dibaca dari snapshot, bukan hasil join master saat cetak.
- Business Trip: client di header, employee/hari/tarif di setiap item.
- Meals: tidak memiliki client header; tanggal/client/deskripsi/nominal per item.
- Nominal rupiah bulat positif, minimal satu item; pajak default off.
- Subtotal = sum item; PPN = 11% subtotal jika on; PPh 23 = 2% subtotal jika on.
- Pajak dibulatkan sekali pada subtotal ke rupiah terdekat (half up).
- Total = subtotal + PPN - PPh 23. API menghitung ulang seluruh angka.
- Dokumen baru memakai format Invoice, misalnya `I.042/ARM/XI/2026`.
  Invoice, Business Trip OPE, dan Meals memakai satu urutan bersama per tahun,
  berlanjut antarbulan dan antarjenis dokumen. Tahun/bulan mengikuti tanggal
  dokumen saat pertama disimpan; nomor OPE diterbitkan saat menyimpan Draft
  dan tetap dipertahankan ketika tanggal Draft diedit.
- Nomor OPE/Meals lama (`OPE/BT/2026/0001`, `OPE/ML/2026/0001`) tetap utuh
  dan tidak menjadi dasar urutan Invoice bersama. Nomor yang sudah dialokasikan
  tidak dipakai ulang setelah dokumennya dihapus.
- Status awal DRAFT; DRAFT -> ISSUED/VOID; ISSUED -> PAID/VOID.
  Isi dokumen hanya dapat diedit saat DRAFT.
- Audit ditulis setelah transaksi commit; error audit tidak membatalkan OPE.

## Kontrak API

Semua endpoint memerlukan sesi ADMIN:

- `GET /api/ope?type=MEALS&status=DRAFT&limit=25&offset=0`: daftar paginated.
- `GET /api/ope/client-options`: client berkontrak aktif.
- `GET /api/ope/:id`: header beserta detail terurut.
- `POST /api/ope`: membuat dokumen DRAFT.
- `PUT /api/ope/:id`: mengganti isi DRAFT atau mengubah status.

Payload Business Trip:

```json
{
  "type": "BUSINESS_TRIP",
  "documentDate": "2026-11-10",
  "clientId": "existing-client-id",
  "subject": "Biaya perjalanan audit",
  "usePpn": false,
  "usePph23": false,
  "items": [
    { "employeeId": "existing-employee-id", "days": 2, "rate": 15000000 }
  ]
}
```

Payload Meals:

```json
{
  "type": "MEALS",
  "documentDate": "2026-11-10",
  "subject": "Biaya konsumsi audit",
  "usePpn": true,
  "usePph23": true,
  "items": [
    {
      "expenseDate": "2026-11-09",
      "clientId": "existing-client-id",
      "description": "Konsumsi tim",
      "amount": 1000000
    }
  ]
}
```

Perubahan status: `{ "status": "ISSUED" }`.
Field nomor, snapshot, subtotal, pajak, total tidak diterima sebagai sumber hitung.
Respons API memakai string untuk numeric PostgreSQL; helper
`src/lib/api/ope.ts` mengonversinya menjadi number dan tanggal menjadi Date.

## Verifikasi integrasi setelah migration

Gunakan data client/karyawan yang sudah tersedia pada database uji.

1. Client dengan beberapa kontrak ACTIVE muncul sekali; urutan sesuai tanggal
   pembuatan kontrak ACTIVE terbaru. Client tanpa kontrak ACTIVE tidak muncul.
2. Business Trip 2 hari x Rp15.000.000 menghasilkan Rp30.000.000 tanpa pajak.
3. Meals berisi dua client, nominal Rp600.000 + Rp400.000, kedua pajak on:
   subtotal Rp1.000.000, PPN Rp110.000, PPh Rp20.000, total Rp1.090.000.
4. Kirim angka total palsu; API tetap memakai hasil hitung detail.
5. Input kosong, hari pecahan/negatif, tanggal invalid, atau nominal berlebih ditolak.
6. Issued tidak dapat diedit; Paid/Void tidak dapat dibuka kembali.
7. Dua request pembuatan bersamaan mendapat nomor berbeda. Edit/status bersamaan
   tidak boleh mengubah isi setelah dokumen Issued.
8. STAFF/tanpa sesi tidak dapat menggunakan endpoint OPE.
9. Transaksi gagal tidak meninggalkan header tanpa item; aktivitas sukses masuk audit.
10. Perubahan nama/alamat master tidak mengganti snapshot dokumen lama.

Pengujian integrasi menulis database ini dilakukan setelah migration oleh Owner;
unit test dan pemeriksaan statis tidak membuktikan perilaku live database.

## M2: halaman operasional

Menu **OPE** berada tepat di bawah Invoice, khusus ADMIN. Halaman `/ope`
memiliki tab Business Trip dan Meals, filter status, pagination, serta tombol
muat ulang. Tampilan daftar memakai tabel desktop dan kartu mobile.

- Buat: pilih tab, klik **Buat Business Trip** / **Buat Meals**.
- Pilih client/karyawan dengan dropdown pencarian. Pilihan client mengikuti
  urutan dari API; master karyawan dimuat dengan seluruh halaman pagination.
- Item dapat ditambah/dihapus; minimal satu item. Nominal ditampilkan dengan
  pemisah ribuan Indonesia; jumlah Business Trip dan total dokumen otomatis.
- Kedua pajak default off pada dokumen baru, dan termuat ulang saat edit.
- Menu aksi: **Lihat detail**, **Edit Draft**, **Terbitkan**, **Tandai Paid**,
  atau **Void**, sesuai status dokumen. Perubahan status memerlukan konfirmasi.
- Detail menggunakan snapshot identitas dan angka yang tersimpan di dokumen.
- Saat edit, pilihan historis yang tidak ada di dropdown aktif tetap tersedia
  untuk referensi lama yang belum dihapus. Jika master sudah dihapus dan FK
  kosong, pilih referensi baru sebelum menyimpan ulang Draft.
- Kegagalan simpan mempertahankan input form agar dapat diperbaiki/dicoba ulang.
- M2 tidak menambahkan schema atau migration baru.

Verifikasi M2: type-check, lint file yang berubah, dan `pnpm build` lulus.
Build hanya memunculkan warning lama `<img>` di halaman Letter.
Browser smoke test
dengan API simulasi lulus untuk payload/perhitungan Business Trip, Meals dua
client dan kedua pajak, kegagalan simpan yang mempertahankan input, muat ulang
Draft, penerbitan yang menghilangkan Edit Draft, detail snapshot, dan ukuran
modal mobile. Tidak ada error runtime browser pada skenario tersebut. Seluruh
request API selama browser test di-intercept; tidak menulis data ke database.
Pengujian penyimpanan nyata dan cetak tetap diperlukan pada M3/UAT Owner.

### Uji UI setelah deploy M2

1. Login sebagai ADMIN, buka OPE; pastikan menu berada tepat di bawah Invoice.
2. Buat Business Trip, pilih client dan karyawan, isi 2 hari x Rp15.000.000.
   Pastikan jumlah Rp30.000.000; simpan Draft dan buka lagi lewat Edit Draft.
3. Pada tab Meals, buat dua item untuk client berbeda: Rp600.000 + Rp400.000.
   Aktifkan kedua pajak; pastikan total Rp1.090.000.
4. Simpan, buka detail dan edit; pastikan tanggal, dua client, nominal, catatan,
   serta posisi toggle termuat ulang.
5. Terbitkan melalui menu aksi. Pastikan Edit Draft hilang; lanjutkan Paid
   atau gunakan dokumen uji lain untuk Void. Periksa filter status.
6. Coba form pada layar mobile, pencarian dropdown, dan tambah/hapus item.
7. Login STAFF; menu OPE tidak muncul dan akses langsung `/ope` diarahkan
   ke Dashboard. API tetap memerlukan ADMIN.

## M3: preview dan print

Menu aksi setiap dokumen menyediakan **Preview / Print**. Preview mengambil
detail terbaru dari API dan memakai satu HTML yang sama untuk tampilan serta
print, di dalam iframe terisolasi tanpa script. Klik **Print / Simpan PDF**
setelah kop selesai dimuat untuk membuka dialog cetak browser. Pilih **Save
as PDF** untuk menyimpan PDF. Kegagalan memuat kop menonaktifkan tombol print.

- Business Trip: client/alamat/PIC/NPWP di header dan daftar nama/hari/tarif/jumlah.
- Meals: tanggal/client/deskripsi/nominal pada setiap baris; tidak ada satu
  client yang dijadikan penerima seluruh dokumen.
- Identitas client/karyawan berasal dari snapshot yang disimpan; nominal,
  subtotal, tarif pajak, dan total berasal dari dokumen, tanpa hitung ulang.
- NPWP2 16 digit diprioritaskan dan ditampilkan per empat digit; fallback NPWP
  lama lalu `-`. Meals tidak mencetak satu NPWP di header multi-client.
- PPN tampil biasa; nominal potongan PPh 23 memakai tanda kurung.
  Pajak yang off tidak ditampilkan.
- Draft dan Void memiliki penanda jelas pada dokumen cetak. Preview/print
  tersedia pada semua status dan tidak mengubah status maupun data dokumen.
- Header memakai potongan atas `public/invoice-header.png` yang sudah ada.
  Potongan memakai koordinat SVG dengan rasio tetap, bukan tinggi kotak piksel
  atau background cover, agar kop tidak terpotong saat skala cetak berubah.
  Footer keanggotaan IECnet memakai teks HTML tersendiri, dengan nama firma
  dicetak tebal. Tidak perlu aset gambar baru atau mengubah kop dokumen lain.
  Footer berada di bawah bidang A4 pada preview dan di area bawah setiap
  halaman print, terpisah dari blok pembayaran/tanda tangan.
- Catatan dokumen mempertahankan enter; blok pembayaran sama dengan Invoice.
  Nama penandatangan memakai Settings saat preview dibuka, dengan fallback
  yang sama seperti Invoice. Nama penandatangan belum disnapshot di database.
- Layout A4 dengan ruang khusus footer pada margin bawah print, heading tabel
  berulang pada halaman lanjutan, dan blok total/tanda tangan diusahakan tetap utuh.
- Tidak ada perubahan schema, migration, perhitungan, atau endpoint bisnis M3.

### Uji setelah deploy M3

1. Buka OPE Business Trip -> menu aksi -> Preview / Print. Periksa nomor,
   tanggal, perihal, client/NPWP, nama karyawan, hari, tarif, dan jumlah.
2. Klik Print / Simpan PDF; gunakan ukuran A4 dan skala default/100%.
   Pastikan kop dan footer muncul. Browser headers/footers bawaan dapat
   dimatikan di pengaturan cetak agar URL/jam browser tidak ikut tercetak.
3. Ulangi untuk Meals dua client dengan kedua pajak aktif; cocokkan subtotal,
   PPN, PPh dalam tanda kurung, dan total dengan Detail OPE.
4. Periksa dokumen tanpa pajak, Draft, Void, catatan beberapa baris, serta
   dokumen panjang yang melampaui satu halaman.
5. Periksa preview pada mobile. Kertas A4 dapat digeser horizontal di dalam
   frame; kontrol dan modal tetap mengikuti lebar layar.

Pengujian otomatis renderer/browser memakai fixture dan request API simulasi;
tidak menulis data uji ke database. Cetak pada printer fisik dan PDF dari
dokumen produksi tetap perlu pemeriksaan visual Owner.

Hasil verifikasi M3:

- Type-check dan lint file yang berubah lulus, 14 test aturan/render lulus.
- Browser smoke test lulus: snapshot/NPWP2, Meals multi-client, pajak on/off,
  signer/catatan, escaping teks, aksi print pada iframe yang sama, modal
  mobile, penanda Draft/Void, dan tombol print nonaktif saat kop gagal dimuat.
- PDF Chromium: fixture Business Trip pendek 1 halaman A4; fixture 60 item
  Meals dengan deskripsi panjang 12 halaman. Item terakhir tetap tersedia.
- Pemeriksaan read-only pada 3 dokumen yang tersedia (2 Business Trip,
  1 Meals) tidak menemukan selisih subtotal/detail atau total netto, dan
  snapshot client Business Trip tersedia. Tidak mengubah data tersebut.
- Build production tidak diulang saat server dev Owner sedang aktif untuk
  menghindari dua proses menulis `.next` bersamaan.

### Revisi posisi footer OPE / Meals (12 November 2026)

Footer IECnet diganti dari potongan gambar menjadi teks HTML. Preview
menempatkannya di bawah bidang A4; print mengulang footer pada setiap halaman,
sekitar 10mm dari tepi bawah kertas. Area kosong 18mm disediakan pada setiap
halaman agar footer tidak menimpa isi tabel. Blok pembayaran/tanda tangan
tetap mengikuti alur isi dokumen.

Verifikasi PDF Chromium dan pengukuran koordinat teks: Business Trip pendek
dan Meals pendek masing-masing satu halaman, Meals 45 item/deskripsi panjang
enam halaman. Footer ditemukan pada setiap halaman dengan jarak sekitar
10,5mm dari tepi bawah; tidak bertumpuk dengan teks isi dan item terakhir tetap
tercetak. Aset gambar, invoice biasa, schema, dan data database tidak diubah.

Type-check, lint, dan 15 test aturan/render lulus. Browser smoke preview/print
dengan API simulasi juga lulus; fixture tambahan 60 item panjang menghasilkan
13 halaman, footer hadir pada semuanya tanpa overlap, dan item terakhir utuh.

### Revisi kop saat memilih printer fisik

Kop OPE/Meals, Invoice, dan Kwitansi memakai rasio potongan yang sama melalui
`src/lib/print-letterhead.ts`. Preview Invoice menggunakan komponen
`PrintLetterhead`. Kop tidak lagi bergantung pada background graphics dan
tinggi tetap 180px yang bisa memotong isi saat skala cetak berubah.
Invoice menunggu gambar selesai dimuat sebelum membuka dialog cetak.

Verifikasi browser/PDF pada skala 67%, 100%, dan 125% lulus: kop tetap utuh;
Invoice + Kwitansi tetap dua halaman dan OPE pendek tetap satu halaman.
Browser smoke OPE, type-check, lint, dan 15 test aturan/render lulus.
Driver/printer Epson fisik tidak tersedia pada pengujian otomatis. Saat UAT,
samakan pengaturan cetak: kertas A4, portrait, satu halaman per lembar,
margin default, dan scale100% agar ukuran teks sesuai hasil PDF. Periksa
preview Epson sebelum mencetak. Tidak mengubah nilai, status, atau database.
