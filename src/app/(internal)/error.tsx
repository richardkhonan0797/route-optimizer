"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="panel">
      <h1 className="text-xl font-bold">Data belum dapat dimuat</h1>
      <p className="my-4">Periksa koneksi atau konfigurasi aplikasi.</p>
      <button onClick={reset}>Coba lagi</button>
    </div>
  );
}
