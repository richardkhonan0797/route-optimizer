# Rute Antar

Panduan deployment Vercel: [DEPLOYMENT.md](DEPLOYMENT.md).



MVP aplikasi internal distribusi Indonesia: satu gudang, satu kendaraan, 1–25 toko unik, perjalanan berangkat dan kembali ke gudang. Next.js App Router + TypeScript, Tailwind CSS + komponen Button shadcn/ui (Radix), PostgreSQL + Prisma, Zod, iron-session dan bcryptjs. Tidak memakai AI, OR-Tools, geocoding, atau peta interaktif.



## Menjalankan dengan Docker



1. Pasang Docker Desktop/Engine dan aktifkan daemon. Salin `.env.example` ke `.env`.

2. Isi `SESSION_SECRET` dengan nilai acak minimal 32 karakter. Buat dengan `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Jangan commit secret.

3. Isi `ADMIN_USERNAME`, `ADMIN_PASSWORD` (minimal 12 karakter, maksimal 72 byte), dan ganti `POSTGRES_PASSWORD`. Gunakan password database URL-safe atau encode jika menyusun `DATABASE_URL` sendiri.

4. Opsional untuk awal: isi `ORS_API_KEY`. Tanpa key, CRUD tetap berjalan dan optimasi memberi petunjuk konfigurasi, bukan rute palsu.

5. Jalankan `docker compose up --build -d`. Service `setup` menerapkan migration dan membuat/memperbarui admin sebelum app berjalan.

6. Buka http://localhost:3000, login, atur gudang, tambah toko, lalu **Susun pengantaran**.



Port aplikasi dan database hanya terikat ke loopback. Untuk penggunaan bersama, pasang reverse proxy HTTPS dan ubah `APP_URL` ke origin HTTPS yang persis digunakan browser. Cookie `Secure` aktif ketika `APP_URL` memakai HTTPS. Jangan mengekspos PostgreSQL ke internet. Jalur `/terms` dan `/privacy` harus dapat diakses publik untuk informasi penggunaan dan privasi; halaman data tetap memerlukan login. Sesuaikan identitas/kontak pengelola pada kedua halaman sebelum deployment perusahaan.



Perintah operasional:



```sh

docker compose logs app setup

docker compose run --rm setup

docker compose down

```



`setup` memperbarui password dari environment dan membatalkan sesi lama setiap dijalankan. Tidak ada registrasi publik. Volume `database` menyimpan data; `docker compose down -v` menghapusnya, jangan gunakan pada data yang dibutuhkan. Backup database perusahaan secara teratur.



## Pengembangan lokal



Gunakan Node.js **24 LTS** dan npm. Lockfile menentukan versi dependensi yang diuji. Prisma 6 dipilih untuk konfigurasi PostgreSQL sederhana yang kompatibel.



```sh

npm ci

docker compose up -d db

npx prisma generate

npx prisma migrate deploy

npm run admin:create

npm run dev

```



Next.js dan Prisma membaca `.env`; script admin memakai `node --env-file-if-exists=.env` agar juga berjalan dengan environment Compose tanpa file secret di image. Untuk lokal, `DATABASE_URL` menunjuk `localhost:5432`; Compose menggantinya dengan hostname `db` di jaringan container. Jika port 5432 terpakai, ubah `DB_PORT` dan port pada `DATABASE_URL` lokal bersamaan. Jangan gunakan username/password contoh untuk deployment.



Build dan development memakai Webpack resmi Next.js karena worker CSS Turbopack gagal pada lingkungan Windows pengembangan. `npm start` menjalankan output standalone dan menyalin aset statis secara lokal. Docker memakai output standalone yang sama.



## openrouteservice (HeiGIT)



Daftar di https://account.heigit.org untuk Standard API key gratis. Periksa kuota Optimization pada dashboard akun. Tidak membutuhkan Google API key atau billing Google.



Simpan key hanya di `ORS_API_KEY` di server, tanpa prefix `NEXT_PUBLIC`. Restart aplikasi setelah mengubah environment. Jangan menaruh key di URL, browser, log, atau source control.



Server memanggil `POST https://api.heigit.org/vroom/v0` dengan satu kendaraan `driving-car`, awal/akhir gudang, dan 1–25 job toko. Koordinat memakai `[longitude, latitude]`. Opsi `g: true` meminta jarak; geometri dibuang. Semua job harus terlayani tepat sekali. Tidak ada fallback Google atau garis lurus.



Timeout 20 detik, tanpa retry otomatis. Batas aplikasi tetap 5 permintaan ORS/menit dan 100/24 jam; setiap tahap dan percobaan gagal ikut dihitung. Kuota penyedia juga berlaku. Estimasi tidak termasuk bongkar, istirahat, atau lalu lintas real-time. Semua barang dianggap muat dan toko menerima kapan saja.



## Penyimpanan hasil dan upgrade



Urutan, jarak, durasi, penyedia, dan waktu hitung disimpan atomik. Riwayat/reload tidak memanggil API. Raw response dan geometri tidak disimpan. Hasil ORS diberi atribusi openrouteservice/HeiGIT dan OpenStreetMap serta tautan CC BY 4.0.



Jalankan `npx prisma generate` lalu `npx prisma migrate deploy` sebelum memulai versi baru (Compose menjalankan migration melalui setup). Migration menambahkan kolom nullable dan menandai hasil lama `GOOGLE_LEGACY`; tidak menghapus data atau mengarang estimasi. Hitung ulang secara eksplisit untuk menggantinya dengan ORS. Hapus konfigurasi lama `GOOGLE_MAPS_API_KEY` dan `GOOGLE_ROUTES_ORDER_STORAGE_APPROVED` dari environment deployment.



Tombol navigasi tetap membuka Google Maps satu tujuan; tidak memakai Google API key. Kebijakan Google berlaku ketika pengguna membuka layanan tersebut.



Sebelum produksi, periksa kuota dashboard, ketentuan HeiGIT, dan uji rute pulang pergi dengan koordinat operasional. Validasi kelayakan jalan bersama pengemudi; profil mobil bukan pembatasan dimensi truk.



## Konsistensi, keamanan, dan asumsi



- Satu admin tetap, password bcrypt cost 12, sesi iron-session terenkripsi 8 jam dengan HttpOnly/SameSite=Lax. Pergantian password mengubah versi sesi. Auth diperiksa pada setiap endpoint dan layout halaman internal.

- Semua mutasi memeriksa Origin terhadap `APP_URL`; input divalidasi Zod di server. Error eksternal tidak diteruskan mentah.

- Gudang menggunakan ID tunggal `main`; migration menegakkan singleton dan rentang koordinat. Toko menggunakan soft delete. Constraint unik menolak duplikasi toko dan input order per rencana.

- Pembuatan rencana dan penyimpanan urutan menggunakan transaksi. Lease optimasi 60 detik mencegah request bersamaan; token dan revision menolak hasil terlambat. Tidak ada transaksi database yang terbuka selama request ORS.

- Kegagalan hitung ulang tidak menghapus urutan tersimpan atau hasil sebelumnya di halaman. Hasil sukses baru hanya diterapkan sesudah respons ORS divalidasi.

- Rencana bersifat snapshot yang tidak diedit in-place. Mengubah pilihan/tanggal setelah hasil akan membuat rencana baru dan menghilangkan hasil lama dari editor. Perubahan master gudang/toko hanya berlaku untuk snapshot baru, termasuk saat rencana lama dihitung ulang.

- Toko aktif dicari dengan pagination 20 item, ID sebagai tie-breaker. Riwayat diurutkan tanggal terbaru dan ID. Index B-tree untuk daftar/filter; index trigram untuk pencarian substring nama di PostgreSQL.

- Tidak ada API dipanggil saat mengetik atau memilih toko. Hanya endpoint optimasi yang memanggil ORS. Tombol navigasi masing-masing menuju satu tujuan.

- Respons ORS yang gagal pada percobaan pertama meninggalkan draft, sehingga tidak perlu membuat draft baru hanya untuk mencoba lagi.

- Request JSON dibatasi 16 KiB saat stream dibaca; reverse proxy produksi sebaiknya membatasi body dan timeout koneksi juga.



## Pengujian



```sh

npm run lint

npm run typecheck

npm test

npm run build

```



Test rutin memakai mock ORS, tidak menggunakan kuota atau key sungguhan. Mencakup koordinat 0/batas/kosong, 1–25 toko unik, permutasi indeks, payload ORS dan error, proteksi endpoint/Origin, serta kegagalan optimasi dan lease bersamaan. Production build tidak membutuhkan database aktif atau API key.



Test PostgreSQL tambahan tersedia melalui `npm run test:db`, setelah `RUN_DB_TESTS=true` diatur di environment shell. Gunakan database lokal khusus pengujian, bukan produksi. Test membuat dua toko sementara, memeriksa snapshot dan constraint unik, menjalankan optimasi dengan mock fetch, memastikan kegagalan hitung ulang mempertahankan urutan, kemudian membersihkan data uji. Test ini menggunakan limiter aplikasi sehingga ikut menghitung empat permintaan tahap lokal.



Setelah aplikasi berjalan, `npm run test:http` menggunakan kredensial admin dari environment untuk memverifikasi login/session, penolakan akses anonim, endpoint data, header no-store, proteksi Origin, dan logout. Tidak menulis data bisnis atau memanggil ORS; percobaan login ikut memakai limiter.



Audit npm pada 15 Oktober 2026 melaporkan 8 temuan high turunan `braces` dan `deepmerge-ts` (stack exhaustion pada input rekursif). `npm audit --omit=dev` tetap melaporkan 3 temuan pada Prisma CLI/config karena relasi peer dependensi. Paket tersebut dipakai tooling build/setup, tidak menerima input pengguna aplikasi; hasil trace standalone yang diperiksa tidak menyertakan Prisma CLI/config, `deepmerge-ts`, atau `braces`. Perbaikan otomatis menyarankan downgrade major tooling yang tidak sesuai; versi tidak diturunkan tanpa verifikasi kompatibilitas. Jalankan ulang `npm audit` sebelum deployment dan perbarui bila upstream kompatibel tersedia.



Struktur utama: `src/app` untuk halaman dan route handlers; `src/components` untuk UI; `src/lib` untuk validasi, database, sesi, rate limit, dan ORS; `prisma` untuk schema/migration; `tests` untuk pengujian terarah. Tidak ada repository pattern atau dependency injection framework.


## Pengantaran urgent

Saat menyusun rencana, tandai **Urgent** pada tujuan terpilih. Prioritas tersimpan per tujuan dalam snapshot rencana, bukan pada master toko. Semua tujuan urgent dikunjungi sebelum tujuan biasa. Menghapus tujuan menghapus penandanya; perubahan prioritas setelah hasil tersimpan membuat rencana baru melalui **Ubah pilihan / buat rencana baru**. Label juga tersedia saat membuka riwayat dan menyalin urutan.

Rute dimulai dari toko terdekat berdasarkan jarak berkendara dari gudang; jika ada urgent, pilihan pertama dibatasi ke toko urgent. ORS Matrix (`POST https://api.heigit.org/openrouteservice/v2/matrix/driving-car`) menghitung jarak dan durasi. Jarak seri diputuskan berdasarkan durasi, lalu urutan input tersimpan. Sisa urgent dioptimasi lebih dulu, kemudian tujuan biasa dan kembali ke gudang. Total mencakup perjalanan ke toko pertama dan seluruh tahap berikutnya. Satu toko memakai matriks pergi dan pulang terpisah karena arah perjalanan dapat berbeda. Setiap perhitungan memakai dua sampai tiga permintaan. Pendekatan ini menjamin toko terdekat yang memenuhi prioritas dikunjungi pertama, tetapi tidak menjamin total perjalanan terpendek. Belum ada tenggat jam tiba atau perubahan tujuan saat kendaraan berjalan.

Batas 5 permintaan/menit dan 100/24 jam dihitung per tahap ORS, termasuk percobaan gagal. Tiap permintaan memiliki timeout 20 detik tanpa retry otomatis, dengan batas keseluruhan perhitungan 50 detik sebelum lease 60 detik kedaluwarsa. Permintaan matriks juga memakai limiter yang sama. Hasil matriks tidak lengkap atau tujuan tidak terjangkau ditolak tanpa fallback garis lurus. Kegagalan mana pun tidak menyimpan hasil parsial dan tidak mengubah hasil lama. Rute lama tetap tersimpan sampai pengguna memilih Hitung Ulang. Urutan, estimasi, dan prioritas tetap tersedia setelah reload tanpa panggilan ORS tambahan.

API pembuatan rencana menerima `urgentStoreIds` opsional (default `[]`), berisi ID unik yang termasuk `storeIds`. Respons tujuan menambahkan `isUrgent`. Migration `20261030000000_urgent_stops` mengisi tujuan lama dengan `false`; jalankan `npm run db:generate` dan `npm run db:migrate` sebelum menggunakan versi ini.

Verifikasi manual layanan nyata (memakai dua request ORS, tanpa menulis database): `node --env-file=.env --import tsx scripts/urgent-ors-smoke.ts`. Pengujian rutin tetap menggunakan mock. Pengujian database harus memakai database khusus pengujian melalui `DATABASE_URL` dan `RUN_DB_TESTS=true`.
