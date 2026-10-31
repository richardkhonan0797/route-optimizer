import Link from "next/link";
export default function Privacy() {
  return (
    <main className="panel mx-auto my-12 max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Kebijakan privasi Rute Antar</h1>
      <p>
        Aplikasi menyimpan akun admin dengan hash kata sandi, data gudang dan
        toko yang dimasukkan manual, serta snapshot tujuan pengantaran di
        database perusahaan. Cookie sesi terenkripsi digunakan untuk autentikasi
        selama maksimal 8 jam.
      </p>
      <p>
        Saat admin meminta optimasi, koordinat gudang dan tujuan dikirim ke
        openrouteservice (HeiGIT). Nama toko, alamat manual, dan kredensial
        admin tidak dikirim. Pemrosesan oleh HeiGIT mengikuti{" "}
        <a className="underline" href="https://heigit.org/privacy-policy/">
          Kebijakan Privasi HeiGIT
        </a>
        .
      </p>
      <p>
        Urutan kunjungan, jarak, durasi, penyedia, dan waktu perhitungan
        disimpan untuk riwayat operasional. Raw response dan geometri tidak
        disimpan. Tombol navigasi membuka Google Maps dan mengirim koordinat
        tujuan ke Google hanya ketika Anda membuka tautan tersebut. Data
        disimpan sampai dihapus pengelola. Hubungi administrator perusahaan
        untuk akses, koreksi, penghapusan, atau pertanyaan privasi.
      </p>
      <Link className="text-teal-700" href="/">
        Kembali ke aplikasi
      </Link>
    </main>
  );
}
