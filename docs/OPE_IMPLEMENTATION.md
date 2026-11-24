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

## Transport: perluasan Meals (M1)

Rencana perluasan memakai tab gabungan **Meals & Transport**. Jenis tersimpan
tetap berbeda: `MEALS` dan `TRANSPORT`; Business Trip tetap `BUSINESS_TRIP`.
Kolom `ope_documents.type` sudah bertipe text, sehingga tidak perlu migration,
kolom tambahan, atau backfill. Data Meals lama tetap `MEALS`.

### Cakupan M1: fondasi API

- Tipe aplikasi dan validasi menerima Transport dengan detail yang sama seperti
  Meals: tanggal, client per baris, deskripsi, nominal; satu dokumen dapat
  berisi beberapa client. Default PPN/PPh23 dan batas nominal tetap sama.
- Service penyimpanan memakai cabang detail non-Business Trip yang sudah ada.
  Snapshot client, transaksi, kalkulasi, dan allocator nomor tidak diganti.
- `GET /api/ope?group=MEALS_TRANSPORT` mengambil kedua jenis dalam satu daftar.
  `type=MEALS` tetap hanya Meals; `type=TRANSPORT` hanya Transport. `type` dan
  `group` tidak boleh dikirim bersama (400), agar filter tidak ambigu.
- Search client per baris mencakup Meals dan Transport menggunakan EXISTS,
  tanpa menggandakan dokumen ketika beberapa item cocok. Filter status,
  Non-Void, jumlah hasil, dan pagination memakai kondisi yang sama.
- Hak akses tetap Admin, edit isi hanya Draft, jenis tidak dapat diganti setelah
  tersimpan. Status tetap Draft -> Issued -> Paid atau Void; tidak ada approval.
- Nomor tetap dari counter bersama Invoice/OPE per tahun. Tidak ada counter
  baru khusus Transport. Audit create/update otomatis merekam type Transport.

M1 hanya menambahkan mapping label Transport pada halaman agar type-check tetap
lulus. Tab gabungan, pilihan jenis di form, badge, dan judul print Transport
belum tersedia pada M1; semua itu adalah M2. Jangan buat dokumen Transport di
production atau deploy M1 terpisah: renderer lama masih menamai non-Business
Trip sebagai Meals. Deploy utuh setelah M2 dan regresi M3 selesai.

### Cara verifikasi M1 tanpa menulis database

1. Jalankan `pnpm exec tsx --test src/lib/ope/*.test.ts` untuk validasi,
   kalkulasi, filter/search SQL, helper API, dan regresi renderer existing.
2. Jalankan `pnpm exec tsc --noEmit --incremental false`.
3. Opsional, pada aplikasi development dengan sesi Admin, buka:
   `/api/ope?group=MEALS_TRANSPORT&status=NON_VOID&limit=25&offset=0`.
   Hasil berupa `{ items, total, limit, offset }`; sebelum ada Transport hasil
   kelompok ini berisi Meals existing saja. Endpoint ini hanya membaca data.
4. Bandingkan `/api/ope?type=MEALS` (tetap hanya Meals) dan
   `/api/ope?type=TRANSPORT` (kosong jika belum ada Transport).
5. `/api/ope?type=MEALS&group=MEALS_TRANSPORT` harus ditolak dengan HTTP 400.

Pengujian roundtrip penyimpanan Transport, nomor bersamaan, UI, dan print
nyata dijadwalkan pada M3; unit test tidak menggantikan pengujian tersebut.
Tidak menjalankan migration, seed, atau mutasi database untuk M1.

Hasil verifikasi M1: 28/28 tes OPE lulus, type-check tanpa emit lulus,
lint seluruh file TypeScript yang berubah tanpa warning/error, dan
`git diff --check` lulus. Build produksi dan UAT UI/print masuk M3.

Berikutnya M2 (Frontend Developer): tab Meals & Transport, pilihan jenis saat
create (default Meals), jenis readonly saat edit, badge daftar desktop/mobile,
detail dan preview/print dengan judul `OPE - TRANSPORT`. Setelah itu M3
(Backend Architect) untuk regresi lintas API, penomoran, UI dan dokumen.

## Transport M2: UI dan dokumen

- Halaman OPE tetap dua tab: Business Trip dan **Meals & Transport**.
  Tab gabungan memanggil `group=MEALS_TRANSPORT`, tanpa mengirim `type`.
  Search, Non-Void, total hasil, dan pagination tetap melalui API.
- Tombol Buat pada tab gabungan membuka form dengan default Meals. Field
  **Jenis dokumen** menawarkan Meals / Transport dan memperbarui judul modal
  tanpa menghapus isian header/detail. Setiap membuka form baru kembali Meals.
- Saat edit, jenis memakai nilai tersimpan dan readonly. Draft Transport
  memakai field tanggal, client per baris, deskripsi, nominal, dan pajak yang
  sama seperti Meals; tidak ada form atau rumus duplikat.
- Daftar desktop mempunyai kolom Jenis; kartu mobile menampilkan badge
  Meals/Transport. Detail dan modal preview memakai jenis dokumen tersimpan.
- Preview/print Transport memakai renderer Meals yang sama dengan judul
  `OPE - TRANSPORT`, termasuk judul HTML dan label aksesibilitas rincian.
  Kop, footer, tabel, angka pajak, tanda tangan, dan sumber snapshot tetap.
- Tidak ada perubahan schema/database maupun allocator nomor.

### Uji manual M2 di development

1. Buka OPE -> Meals & Transport. Meals existing tetap tampil dengan badge
   Meals; default status masih Non-Void.
2. Klik Buat Meals & Transport. Default jenis Meals. Isi beberapa detail lalu
   ganti ke Transport; judul menjadi Buat OPE Transport dan isian tetap ada.
3. Buat satu Draft Transport di database uji milik Owner dengan beberapa client.
   Pastikan badge Transport, detail benar, dan hasil search client per baris
   menampilkan dokumen tersebut. Jangan membuat fixture di production.
4. Buka Edit Draft Transport: jenis readonly Transport; isi lain tetap dapat
   diedit. Tutup lalu buat dokumen baru: jenis kembali Meals.
5. Preview dan Print/Save as PDF: judul OPE - TRANSPORT, detail client per baris,
   pajak, total, kop/footer sama seperti Meals. Meals lama tetap OPE - MEALS.
6. Periksa tampilan daftar mobile, status Void melalui filter, dan Business Trip
   untuk memastikan tidak berubah.

M2 tidak menjalankan simpan/update dokumen ke database. Uji roundtrip DB,
konkurensi nomor, browser interaktif, PDF, dan build produksi menjadi cakupan
M3 (Backend Architect); setelah M3 barulah rilis backend/UI/renderer bersama.

Verifikasi M2: 30/30 tes OPE lulus, type-check tanpa emit lulus, lint file
UI/renderer yang berubah tanpa warning/error, dan diff-check lulus. Smoke
render statis form baru Meals, edit Transport readonly, dan Business Trip
lulus; ini bukan pengujian browser interaktif. Tes renderer membandingkan
HTML Meals/Transport identik kecuali judul/label jenis, serta memeriksa
multi-client, pajak, kop/footer, dan escaping teks Transport.

## Transport M3: regresi dan kesiapan rilis

M3 selesai pada lingkungan uji terisolasi, tanpa membaca `.env` dan tanpa
menulis database development/production milik Owner. Tidak ditemukan defect
logic produksi pada skenario yang dijalankan; perubahan M3 berupa script tes,
perintah package, dan dokumentasi.

### Hasil verifikasi

- `pnpm test:ope`: 36 tes unit OPE/penomoran lulus.
- `pnpm test:ope:integration`: 17 skenario PostgreSQL nyata lulus. Script
  membuat cluster sementara baru, mengganti inherited DATABASE_URL sebelum
  import service, menjalankan 38 migration hanya pada cluster itu, lalu
  menghentikannya setelah selesai. Tidak memerlukan migration database Owner.
- Dengan `OPE_TEST_APP_DIR` menunjuk salinan build terisolasi, suite integrasi
  juga menjalankan 4 kelompok HTTP: total 21 skenario lulus. Mencakup auth
  anonymous/Staff, create/read/edit Transport dan audit, bentuk respons daftar,
  validasi payload, filter, dan larangan edit dokumen non-Draft.
- Database nyata menguji multi-client, snapshot setelah master berubah,
  empat kombinasi pajak, jenis immutable, terminal status, group/type,
  Non-Void, literal wildcard, dedup search client item, total/pagination,
  urutan Invoice/Meals/Business Trip/Transport, enam request paralel,
  rollback header/detail/counter, pergantian tahun WIB, dan nomor Meals lama.
- `pnpm test:ope:browser`: 11 skenario browser lulus memakai API simulasi
  (bukan bukti roundtrip DB). Tab gabungan/default Non-Void, selector/retained
  fields, payload multi-client, search, Void, edit readonly, reset default,
  preview, Meals lama, Business Trip, dan mobile tanpa horizontal overflow.
- PDF Transport berhasil dibuat dengan Edge Chromium. Pemeriksaan teks dan
  koordinat: satu halaman A4, judul Transport, kedua client, total netto
  Rp163.500, serta footer berjarak sekitar 10,5mm dari tepi bawah. Angka ini
  adalah fixture uji (subtotal Rp150.000 + PPN Rp16.500 - PPh Rp3.000).
- Type-check, lint script baru, dan diff-check lulus. Build produksi lulus
  di salinan TEMP tanpa `.env` dengan URL database dummy. Warning existing
  `<img>` halaman Surat dan Browserslist lama bukan error build.

### Menjalankan ulang

```powershell
pnpm test:ope
pnpm test:ope:integration
```

Integration membutuhkan PostgreSQL binaries (default Windows PG18 di
`C:/Program Files/PostgreSQL/18/bin`; override `PG_TEST_BIN` jika berbeda).
Script selalu membuat cluster baru; jangan mengubahnya untuk memakai DB Owner.
Opsional HTTP: set `OPE_TEST_APP_DIR` ke salinan TEMP build dengan prefix
`iecnet-transport-build-`, bukan workspace development aktif, sebelum menjalankan
integration. Script memulai/menghentikan server sendiri dengan DB sementara.

Browser membutuhkan Playwright yang sudah tersedia dan browser Chromium:
set `OPE_TEST_PLAYWRIGHT` ke file entry Playwright (jika tidak terpasang lokal),
`OPE_TEST_CHROME` ke executable Chrome/Edge, dan `OPE_TEST_BASE_URL` ke server
localhost terisolasi yang memakai DATABASE_URL dummy. Server harus memakai
`SESSION_SECRET=transport-isolated-test-only` atau nilai test yang sama dengan
script. Lalu jalankan `pnpm test:ope:browser`. Semua API diintersep; request
tak dikenal membuat tes gagal. PDF/screenshot disimpan ke direktori TEMP
yang dicetak script. Playwright tidak ditambahkan ke dependency produksi.

### Handoff Owner

Siap untuk UAT Owner dan deploy backend/UI/renderer sekaligus, tanpa migration.
Belum deploy/commit otomatis. Uji singkat setelah deploy: buat Transport,
cek nomor bersama, reload dan edit Draft, cek search client item, preview/print,
serta buka Meals lama dan Business Trip. Printer Epson fisik dan data nyata
production belum diuji; verifikasi A4/scale/margin printer saat UAT Owner.
