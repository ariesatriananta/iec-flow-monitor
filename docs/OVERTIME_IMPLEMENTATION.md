# Pengajuan Overtime

## Milestone

1. M1: schema/migration, pengaturan approval, API, validasi, dan histori atomik.
2. M2: menu Overtime, Pengajuan Saya, antrean approver, Semua Pengajuan Admin,
   form responsif serta detail/timeline.
3. M3: notifikasi, routing notifikasi, audit log ringkas dan export Excel Admin.
4. M4: pengujian integrasi seluruh alur, regresi modul HR dan UAT Owner.

M1 menyediakan fondasi/API; M2 menambahkan halaman pengajuan dan approval.
M3 menambahkan notifikasi, audit log ringkas dan export Excel khusus Admin. Pengaturan
Approval Overtime tersedia di Settings -> Approval Flow. Fitur ini tidak
menghitung uang Overtime dan tidak mengubah payroll, absensi, atau workflow HR lama.

## Keputusan bisnis

- Satu pengajuan = satu sesi Overtime untuk satu client.
- Pemohon selalu dari employee akun login; tidak bisa mengajukan untuk orang lain.
- Tanggal lampau maupun mendatang diperbolehkan; waktu menggunakan WIB.
- Pilihan client aktif dengan kontrak ACTIVE, deduplikasi dan urut kontrak terbaru.
- Jam mulai HH:mm 00:00-23:59; jam selesai HH:mm atau 24:00.
- Selesai hari berikutnya harus dinyatakan eksplisit. Akhir 24:00 berarti
  tengah malam setelah tanggal awal, tidak menambahkan dua hari.
- Durasi dihitung server, 1-1440 menit. Waktu bertumpuk karyawan yang sama
  pada status pending/approved ditolak lintas client/tanggal; berdampingan boleh.
- Self-approval diperbolehkan; pengaju tetap harus melakukan aksi pada levelnya.
- Approver L1 dan L2 harus berbeda dan aktif dengan akun login aktif.
- Tidak ada Draft/edit; kesalahan diperbaiki lewat batal pending lalu ajukan ulang.
- Status: SUBMITTED -> WAITING_LEVEL_2 -> APPROVED. Penolakan pada masing-masing
  level wajib alasan. Pengaju hanya bisa membatalkan selama pending.
- Approver dan nama employee/client disnapshot saat submit; Settings baru hanya
  memengaruhi pengajuan baru. Admin tidak otomatis berwenang memberi approval.
- Jika approver tidak aktif lagi: pengaju batal pending, Admin perbaiki Settings,
  lalu pengaju kirim ulang. Tidak ada pengalihan level secara otomatis.

## Migration M1

`drizzle/0036_crazy_nuke.sql`: menambah tabel `overtime_requests`, indexes,
serta dua kolom nullable approver Overtime pada `settings_approval_flow`.
Migration tidak dijalankan oleh agent. Jalankan pada database tujuan sebelum
deploy M1. Kolom settings lama tetap utuh. Kedua approver boleh kosong untuk
menjaga form modul lama tetap dapat disimpan; pengajuan baru memerlukan pair lengkap.

Payload Settings lama yang tidak menyertakan field Overtime mempertahankan nilai
Overtime yang sudah tersimpan. Payload baru boleh mengosongkan keduanya, tetapi
tidak boleh mengisi hanya satu atau memilih orang yang sama.

Employee yang menjadi pengaju/approver di histori Overtime dilindungi dari hard
delete; gunakan nonaktif untuk mempertahankan histori. Client boleh dihapus:
referensi dikosongkan dan nama snapshot tetap tersimpan.

## API M1

Semua endpoint memerlukan sesi aktif. Admin boleh membaca seluruh pengajuan;
Staff hanya miliknya atau pengajuan dengan penugasan approver snapshot dirinya.

- `GET /api/overtime?scope=mine`: pengajuan sendiri (default).
- Scope `approval`: pending pada level user; `related`: histori penugasan
  approver; `all`: hanya Admin.
- Filter: status, fromDate/toDate (tanggal sesi mulai), clientId, employeeId;
  pagination limit 1-100 dan offset. Filter tidak memperluas hak akses.
- `GET /api/overtime/client-options`: id/nama/kode client, urutan kontrak aktif terbaru.
- `GET /api/overtime/:id`: detail, permissions dan workflowEvents.
- `POST /api/overtime`: submit langsung SUBMITTED.
- `PATCH /api/overtime/:id`: aksi APPROVE, REJECT, CANCEL.

Contoh submit:

```json
{
  "clientId": "existing-client-id",
  "overtimeDate": "2026-11-12",
  "startTime": "22:00",
  "endTime": "02:00",
  "endsNextDay": true,
  "description": "Penyelesaian laporan audit"
}
```

Durasi contoh 240 menit; mulai 12 November 22:00 WIB, selesai 13 November
02:00 WIB. Client, employee dan approver harus menggunakan data nyata yang valid.

```json
{ "action": "REJECT", "note": "Alasan penolakan" }
```

Helper frontend siap di `src/lib/api/overtime.ts`, type `src/types/overtime.ts`.
Tanggal sesi tetap string YYYY-MM-DD; timestamp diubah menjadi Date.

## Pengujian setelah migration

Gunakan database uji. Tidak perlu membuat data fixture di production.

1. Simpan Settings HR lama tanpa field Overtime; config Overtime tidak terhapus.
2. Simpan dua approver berbeda; pair kosong boleh, setengah pair/orang sama/
   karyawan nonaktif/akun nonaktif ditolak.
3. User terhubung employee mengajukan sesi biasa, lampau, mendatang dan lintas hari.
   18:00-21:30 = 210 menit, 22:00-02:00 besok = 240 menit, 23:00-24:00 = 60 menit.
4. Pastikan field employee/status/durasi dari client tidak bisa menentukan data server.
5. Pengajuan bertumpuk ditolak; sesi berdampingan diterima. Dua submit bersamaan
   pada waktu sama hanya satu yang tersimpan.
6. Approver L2 tidak bisa mendahului L1; Admin yang bukan approver tidak bisa approve.
   Self-approval L1/L2 harus berhasil hanya pada level yang sedang aktif.
7. Alasan reject wajib; status final tidak bisa diproses ulang. Batal hanya pemilik pending.
8. Approval ganda pada level yang sama hanya menghasilkan satu perubahan/event.
   Approve L1 vs batal dapat sah berurutan (L1 -> menunggu L2 -> batal), karena
   pengaju masih boleh membatalkan pada kedua status pending. Histori tidak hilang.
9. Perubahan config setelah submit tidak mengubah penugasan lama.
10. Staff asing tidak bisa membaca detail/daftar di luar kewenangannya.
11. Kegagalan transaksi tidak meninggalkan request tanpa event atau status tanpa histori.
12. Hard delete employee berhistori Overtime ditolak dengan pesan jelas; client
    terhapus tidak menghilangkan nama client dari histori.

Uji integrasi menulis database dilakukan Owner setelah migration. Unit test dan
smoke tanpa sesi tidak membuktikan transaksi atau approval pada database live.

## Hasil verifikasi M1

- `pnpm exec tsc --noEmit`: lulus.
- Next lint seluruh file implementasi yang berubah: lulus tanpa warning/error.
- `pnpm exec tsx --test src/lib/overtime/validation.test.ts`: 13 test lulus.
- Smoke HTTP tanpa sesi untuk list, client-options, detail, submit dan decision:
  semuanya mengembalikan 401, tanpa mutasi database.
- `git diff --check`: lulus.
- Build production belum dijalankan karena dev server memakai direktori `.next`
  yang sama; hindari build bersamaan dengan dev server.
- Migration dan pengujian transaksi/approval pada database belum dijalankan.

## M2 - UI pengajuan dan persetujuan

Halaman `/overtime` tersedia dari menu Human Resources -> Overtime untuk Admin
dan Staff. Pengaturan dua approver tetap di Settings -> Approval Flow.

UI tidak menyediakan edit, Draft, nominal uang Overtime, atau bypass approval Admin.
Identitas pemohon berasal dari akun yang login. Keputusan dan durasi final tetap
divalidasi oleh API M1, bukan bergantung pada tampilan/tombol frontend.

### UAT Owner M2

1. Login sebagai Staff yang terhubung employee aktif, buka menu Overtime.
2. Ajukan Overtime: pilih client, tanggal, jam mulai/selesai, keterangan; periksa
   durasi otomatis sebelum konfirmasi. Contoh 18:00-21:30 = 3 jam 30 menit.
3. Coba lintas hari 22:00-02:00 dengan pilihan hari berikutnya: 4 jam.
   Coba 23:00-24:00: 1 jam. Pastikan tidak menjadi dua hari.
4. Pastikan tanggal kosong, keterangan kosong, jam terbalik tanpa hari berikutnya,
   durasi nol/lebih dari 24 jam dan sesi bertumpuk ditolak dengan pesan jelas.
5. Buka detail: tanggal, client, waktu WIB, durasi, approver dan histori harus cocok.
6. Login L1, buka Perlu Persetujuan Saya lalu setujui. Pengajuan lanjut ke L2,
   tidak langsung final. L2 menyetujui untuk menyelesaikan alur.
7. Coba Tolak tanpa alasan (harus gagal), kemudian dengan alasan.
   Riwayat harus menunjukkan alasan dan aktor yang memproses.
8. Batalkan pengajuan pending dari akun pengaju, lalu ajukan ulang jika perlu.
   Pengajuan final tidak menawarkan tombol approve/tolak/batal lagi.
9. Staff biasa tidak melihat pilihan Semua Pengajuan; Admin melihat pilihan tersebut
   tetapi tidak otomatis mendapat tombol persetujuan jika bukan approver.
10. Coba filter status/tanggal, halaman berikut/sebelum dan refresh.
11. Uji di HP: pilihan daftar bisa diakses, form/detail bisa discroll, tombol aksi
    tetap terjangkau dan daftar tampil sebagai kartu seperti halaman HR lain.

Migration 0036 telah dijalankan oleh Owner sesuai konfirmasi percakapan M2.
Agent tidak menjalankan migration atau menulis pengajuan pada database.

### Hasil verifikasi M2

- TypeScript dan focused Next lint file UI/layout yang diubah: lulus.
- Unit test aturan Overtime M1: 13 test tetap lulus.
- Browser Chrome dengan seluruh API diintersep/mock: lulus untuk Staff dan Admin.
  Cakupan: pencarian client, preview WIB dari browser zona waktu berbeda,
  lintas hari, 24:00, konfirmasi kirim, konflik submit tanpa kehilangan isi form,
  retry, deep-link detail, reject wajib alasan, approval L1 lalu L2,
  konflik keputusan, guard klik ganda, batal pending, timeline dan status final.
- Filter status/tanggal terbalik, pagination, pergantian scope serta error/retry
  daftar diuji melalui API mock. Scope `all` hanya ditampilkan untuk Admin.
- Tampilan diperiksa pada desktop dan HP; lebar 320/390/768/1440 tidak menyebabkan
  overflow halaman. Desktop memakai tabel; HP memakai kartu daftar.
- Header bersama mendapat penyesuaian CSS responsif saja: judul/nama ditruncate,
  search ditampilkan mulai layar XL, dan jarak ikon dirapatkan pada layar kecil.
  Handler autentikasi, notifikasi, navigasi dan logic bisnis tidak diubah.
- Tidak ada migration tambahan M2, data fixture database atau mutasi database
  selama pengujian. Alur transaksi database sungguhan tetap menunggu UAT Owner.
- Build production tidak dijalankan bersamaan dengan dev server.

### Penyesuaian standar UI repo

Mengikuti Leave Management dan Business Trip: wrapper `grid gap-6`, satu Card
Daftar Pengajuan dengan toolbar pada CardHeader, pilihan scope/status melalui
Select (bukan tab), menu aksi titik tiga, kartu pada mobile dan pagination Prev/Next.
Tidak ada hero terpisah atau pembatas lebar halaman khusus. Badge memakai token
warna aplikasi. Dialog form 640px dan detail 680px mengikuti pola modul cuti.
Perubahan ini hanya presentasi; API, validasi, scope akses dan workflow tetap sama.

## M3 - Notifikasi, audit dan export Excel

Tidak ada migration baru. Memakai tabel `notifications`, `workflow_events` dan
`audit_logs` yang sudah tersedia. Data/pengajuan lama tidak dibackfill notifikasi
atau audit; integrasi berlaku pada aksi setelah kode M3 aktif.

### Notifikasi

- Submit: approver Level 1 dari snapshot pengajuan (termasuk self-approval).
- Approve L1: approver Level 2 dan informasi progres untuk pengaju. Jika pengaju
  juga L2, hanya satu notifikasi yang meminta keputusan L2.
- Approve final/reject: pengaju. Alasan keputusan tetap dibaca dari detail.
- Batal saat menunggu L1: L1. Batal saat menunggu L2: L1 dan L2.
  Pengaju tidak mendapat notifikasi atas pembatalannya sendiri.
- Hanya akun aktif yang terkait employee tujuan, deduplikasi per user,
  tidak broadcast ke Admin atau approver di luar snapshot.
- Insert notifikasi berada dalam transaksi request + workflow event. Kegagalan
  insert membatalkan transaksi, bukan meninggalkan status tanpa notifikasi.
- Klik lonceng membuka `/overtime?entityId=...&notif=...`, termasuk pergantian
  detail ketika sudah berada pada halaman Overtime. Otorisasi detail tetap di API.
- Tidak menambah polling, email atau push notification; mengikuti lonceng repo.

### Audit ringkas

Module `OVERTIME` tersedia pada filter Audit Logs (Admin saja). Action:
`CREATE`, `APPROVE_L1`, `APPROVE_L2`, `REJECT`, `CANCEL`, `EXPORT`.
Mutasi dicatat setelah commit. Mengikuti helper best-effort: kegagalan audit
tidak menggagalkan aksi yang sudah sukses. Detail generik hanya metadata
pengajuan/perubahan status, bukan seluruh payload, keterangan atau alasan reject.
Histori keputusan dan catatan lengkap tetap berada pada workflow events.

### Export Excel

- Tombol Export Excel di toolbar yang sama, khusus Admin. Endpoint
  `GET /api/overtime/export` juga memeriksa Admin, bukan hanya menyembunyikan UI.
- Scope dan filter sama dengan daftar: `mine`, `approval`, `related`, `all`,
  status, fromDate/toDate, clientId/employeeId. Default scope tetap `mine`.
  Pilih Semua Pengajuan bila ingin laporan seluruh karyawan.
- Menggunakan predicate scope/filter yang sama dengan list; pagination
  `limit`/`offset` diabaikan. Tidak diam-diam memotong data.
- Mengambil request dan histori dalam satu snapshot transaksi read-only agar
  keputusan tidak tercampur dengan perubahan status di tengah pembacaan.
- Sheet Overtime: identitas, tanggal, client snapshot, waktu WIB, lintas hari,
  durasi menit dan Jam:Menit, status, keterangan, dua approver snapshot,
  keputusan/waktu/catatan masing-masing level, pembatalan dan waktu pengajuan.
- Sheet Filter: scope, filter, waktu export WIB dan jumlah pengajuan.
- Teks dari user disimpan sebagai cell string, bukan formula. Durasi menit
  bertipe angka. Bukan perhitungan payroll atau upah.
- Data kosong menampilkan pesan. Lebih dari 50.000 hasil ditolak dengan permintaan
  mempersempit filter untuk membatasi penggunaan memori; bukan export parsial.
- Export sukses dicatat sebagai audit `EXPORT` dengan filter dan jumlah hasil.

### Verifikasi M3

- TypeScript dan focused Next lint lulus.
- 24 unit test lulus (validasi M1, rencana/penerima notifikasi, scope query,
  pembatasan Staff export sebelum akses DB, workbook 41 baris, tipe cell,
  snapshot/keputusan/WIB serta routing notifikasi HR lama dan Overtime).
- Chrome dengan API mock: Admin mengunduh 41 baris saat berada di halaman kedua,
  scope/status ikut terkirim tanpa pagination; nama file dan isi XLSX valid,
  error export tampil; Staff tidak melihat tombol export.
- Klik notifikasi dua pengajuan dari halaman yang sama berhasil membuka detail
  yang sesuai untuk Admin dan Staff. Mark-read dan filter audit OVERTIME diuji
  dengan API mock. Endpoint export tanpa sesi mengembalikan 401.
- Tidak menjalankan migration, membuat fixture atau mutasi pada database nyata.
  Pengiriman notifikasi dan pencatatan audit aktual menunggu UAT Owner/M4.
- Build produksi tidak dijalankan bersamaan dengan dev server yang aktif.

### UAT Owner M3

1. Staff mengajukan sesi; login L1 lalu buka lonceng: notifikasi mengarah ke
   detail pengajuan. L2 tidak mendapat permintaan keputusan sebelum L1 menyetujui.
2. L1 menyetujui; cek notifikasi L2 dan progres pengaju. L2 menyetujui/reject;
   cek notifikasi final ke pengaju. Ulangi dengan self-approval sesuai setting.
3. Batalkan sesi pending L1/L2, cek approver terkait menerima informasi batal.
4. Ganti Settings sesudah submit: target notifikasi tetap approver snapshot lama.
5. Admin buka Audit Logs, filter OVERTIME. Cocokkan actor/action/entity/status;
   alasan reject lengkap hanya pada detail pengajuan, bukan audit generik.
6. Admin pilih Semua Pengajuan dan filter tanggal/status, pindah halaman kedua,
   Export Excel. Jumlah semua hasil filter (bukan 20 baris) harus cocok. Cek
   keputusan/catatan tiap level, durasi, tanggal WIB dan sheet Filter.
7. Staff tidak melihat export; akses langsung `/api/overtime/export` ditolak 403
   untuk akun Staff aktif. Tanpa sesi harus 401.
8. Pastikan navigasi notifikasi cuti/perjalanan/reimbursement tetap bekerja.

## M4 - Verifikasi integrasi dan regresi

Status: pengujian otomatis selesai; tidak ditemukan bug penghalang pada skenario
yang diuji. Ini bukan jaminan bebas semua bug atau pengganti UAT pengguna nyata.
Tidak ada perubahan aturan bisnis, schema, atau migration tambahan pada M4.

### Lingkungan pengujian aman

- PostgreSQL 18 dijalankan sebagai instance sementara pada port localhost acak,
  dengan direktori data baru di TEMP. Tidak menggunakan/membaca file `.env`.
- `DATABASE_URL` diganti hanya di proses pengujian, menunjuk ke instance yang
  dibuat oleh script. Tidak menerima URL database existing sebagai target.
- Seluruh 37 migration dijalankan pada cluster kosong tersebut, bukan database
  aplikasi Owner atau production. Fixture dan simulasi kegagalan hanya di sana.
- Build production dilakukan pada salinan source di TEMP tanpa `.env`, dengan
  output `.next` terpisah. Dev server/worktree asli tidak dihentikan atau diubah.
- API HTTP diuji menggunakan build production terisolasi dan cluster fixture
  yang sama, lalu server/cluster test dihentikan. Artefak TEMP tetap disimpan.

### Hasil

- 24 unit test: lulus.
- 22 skenario PostgreSQL/HTTP integration: lulus (18 service/database + 4 HTTP).
- TypeScript dan lint script: lulus. Build production: exit 0.
  Ada warning lama `<img>` di halaman Letters dan Browserslist yang usang;
  bukan error build dan tidak diubah dalam task Overtime.
- Browser mock Admin/Staff: download semua hasil filter, visibilitas tombol,
  dua klik notifikasi dari halaman sama, mark-read dan filter audit tetap lulus.
- Tidak mengubah data/struktur database milik Owner.

Cakupan transaksi nyata:

- Submit -> L1 -> L2, histori, penerima notifikasi, dan audit sesuai keputusan.
- Approval/penolakan hanya pada level aktif, alasan wajib, final tidak bisa
  diproses ulang, self-approval tidak melewati level.
- Dua submit bersamaan untuk employee sama/client berbeda pada waktu bertumpuk:
  hanya satu lolos. Approval ganda juga hanya satu yang lolos pada level tersebut.
- Approve L1 dan batal bersamaan menghasilkan urutan serial yang sah dan final
  CANCELLED, tanpa lost update. Tidak membatasi hak batal di WAITING_LEVEL_2.
- Lintas hari, interval berdampingan, overlap tanggal berikutnya dan 24:00.
- Perubahan Settings tidak mengganti approver snapshot lama; inactive approver
  ditolak; inactive employee masih bisa membatalkan pending untuk pemulihan.
- Notifikasi gagal: submit/status/event rollback. Audit gagal setelah commit:
  request/event/notifikasi tetap sukses, sesuai kebijakan best-effort.
- Staff asing tidak dapat membaca detail, menggunakan scope all, export atau
  audit. Session dengan klaim role/employee lama tetap memakai data akun DB.
- Tidak bisa menandai notifikasi milik akun lain; hard delete employee berhistori
  ditolak. Client terhapus tidak menghapus nama snapshot pada histori.
- Export DB/HTTP meliputi 25 hasil meski list dibatasi 20/parameter pagination
  diberikan; tipe XLSX/filter/validasi tanggal dan audit export benar.
- Payload Settings versi lama mempertahankan konfigurasi approver Overtime;
  pasangan approver yang sama ditolak.
- Fingerprint tabel kontrak, termin, invoice, surat, OPE, absensi, cuti, dinas,
  reimbursement di fixture tidak berubah oleh rangkaian aksi Overtime.

### Menjalankan ulang

```powershell
pnpm test:overtime
pnpm test:overtime:integration
```

Script integration: `scripts/test-overtime-integration.ts`. Memerlukan binary
`initdb`, `pg_ctl`, `postgres` PostgreSQL lokal. Default Windows:
`C:/Program Files/PostgreSQL/18/bin`; bila berbeda, isi `PG_TEST_BIN` menunjuk
folder bin. Linux memakai PATH dan harus dijalankan sebagai user non-root.
Script membuat cluster baru dan menghentikannya pada akhir pengujian; artefak
data/log TEMP disimpan agar dapat diperiksa jika test gagal.

Mode default menjalankan 18 skenario database/service. Untuk 4 skenario HTTP
tambahan, isi `OVERTIME_TEST_BUILD_DIR` dengan path salinan source di TEMP yang
sudah memiliki build production. Path wajib tepat di bawah TEMP dengan prefix
`iecnet-overtime-build-` (bukan folder repo atau server yang sedang digunakan).
Salinan tersebut tidak boleh memuat `.env`; script menyalakan server production
terpisah dengan koneksi cluster test, bukan server dev Owner.

### Handover / UAT akhir Owner

1. Pastikan migration 0036 sudah diterapkan dan dua approver aktif terisi.
2. Dengan akun nyata, coba satu pengajuan -> L1 -> L2 dan cek lonceng + timeline.
3. Coba satu penolakan dan satu pembatalan, lalu cocokkan Audit Logs OVERTIME.
4. Admin export periode yang sama dan cocokkan jumlah/status/durasi dengan daftar.
5. Setelah UAT, deploy sesuai prosedur Owner. Agent tidak menjalankan deployment.
