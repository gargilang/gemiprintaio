// Alias kompatibilitas: endpoint lama /api/customers diarahkan ke /api/pelanggan.
// Dipertahankan supaya Flutter mobile dan client lama yang belum migrasi
// tetap berfungsi. Hapus setelah semua consumer pakai /api/pelanggan.
export { GET, POST, PUT, DELETE } from "@/app/api/pelanggan/route";
