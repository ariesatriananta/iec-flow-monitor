# Pengajuan Lembur

## Milestone

1. M1: schema/migration, pengaturan approval, API, validasi, dan histori atomik.
2. M2: menu Lembur, Pengajuan Saya, antrean approver, Semua Pengajuan Admin,
   form responsif serta detail/timeline.
3. M3: notifikasi, routing notifikasi, audit log ringkas dan export Excel Admin.
4. M4: pengujian integrasi seluruh alur, regresi modul HR dan UAT Owner.

M1 menyediakan fondasi/API; M2 menambahkan halaman pengajuan dan approval.
Notifikasi, audit log dan export masih menunggu M3. Pengaturan
Approval Lembur tersedia di Settings -> Approval Flow. Fitur ini tidak
menghitung uang lembur dan tidak mengubah payroll, absensi, atau workflow HR lama.

## Keputusan bisnis

- Satu pengajuan = satu sesi lembur untuk satu client.
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
serta dua kolom nullable approver lembur pada `settings_approval_flow`.
Migration tidak dijalankan oleh agent. Jalankan pada database tujuan sebelum
deploy M1. Kolom settings lama tetap utuh. Kedua approver boleh kosong untuk
menjaga form modul lama tetap dapat disimpan; pengajuan baru memerlukan pair lengkap.

Payload Settings lama yang tidak menyertakan field lembur mempertahankan nilai
lembur yang sudah tersimpan. Payload baru boleh mengosongkan keduanya, tetapi
tidak boleh mengisi hanya satu atau memilih orang yang sama.

Employee yang menjadi pengaju/approver di histori lembur dilindungi dari hard
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

1. Simpan Settings HR lama tanpa field lembur; config lembur tidak terhapus.
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
8. Approve/batal/klik ganda bersamaan hanya menghasilkan satu perubahan dan satu event.
9. Perubahan config setelah submit tidak mengubah penugasan lama.
10. Staff asing tidak bisa membaca detail/daftar di luar kewenangannya.
11. Kegagalan transaksi tidak meninggalkan request tanpa event atau status tanpa histori.
12. Hard delete employee berhistori lembur ditolak dengan pesan jelas; client
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

Halaman `/overtime` tersedia dari menu Human Resources -> Lembur untuk Admin
dan Staff. Pengaturan dua approver tetap di Settings -> Approval Flow.

UI tidak menyediakan edit, Draft, nominal uang lembur, atau bypass approval Admin.
Identitas pemohon berasal dari akun yang login. Keputusan dan durasi final tetap
divalidasi oleh API M1, bukan bergantung pada tampilan/tombol frontend.

### UAT Owner M2

1. Login sebagai Staff yang terhubung employee aktif, buka menu Lembur.
2. Ajukan lembur: pilih client, tanggal, jam mulai/selesai, keterangan; periksa
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
- Unit test aturan lembur M1: 13 test tetap lulus.
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
