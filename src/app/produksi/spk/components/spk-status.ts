// Helper warna badge status & prioritas SPK.
// Status memakai sumber kebenaran terpusat di status-produksi.ts agar nilai
// baru (maklon, status macet) ikut berwarna tanpa duplikasi.
import { warnaStatus } from "@/lib/produksi/status-produksi";

export function getStatusColor(status: string): string {
  return warnaStatus(status);
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case "KILAT":
      return "bg-red-600 text-white";
    case "NORMAL":
      return "bg-blue-500 text-white";
    default:
      return "bg-gray-400 text-white";
  }
}
