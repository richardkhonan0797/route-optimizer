import Link from "next/link";
export default function Terms() {
  return (
    <main className="panel mx-auto my-12 max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Ketentuan penggunaan Rute Antar</h1>
      <p>
        Aplikasi internal untuk perencanaan pengantaran. Admin bertanggung jawab
        atas akurasi koordinat dan pemeriksaan kelayakan perjalanan. Estimasi
        bukan jaminan waktu tiba, tidak mencakup bongkar, istirahat, dan
        kemacetan real-time. Patuhi aturan lalu lintas dan kondisi jalan.
      </p>
      <p>
        Optimasi menggunakan openrouteservice dengan atribusi HeiGIT dan
        OpenStreetMap. Hasil ORS berlisensi CC BY 4.0. Tautan navigasi Google
        Maps tunduk pada{" "}
        <a
          className="underline"
          href="https://maps.google.com/help/terms_maps/"
        >
          Ketentuan Layanan Google Maps
        </a>
        . Jangan menyalin atau menyimpan konten Google di luar izin yang
        berlaku. Pengelola perusahaan mengatur akses, dukungan, dan penyimpanan
        data operasional.
      </p>
      <Link className="text-teal-700" href="/">
        Kembali ke aplikasi
      </Link>
    </main>
  );
}
