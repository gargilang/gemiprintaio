// Helper warna badge status & prioritas SPK. Diekstrak (Fase 6 B6).

export function getStatusColor(status: string): string {
  switch (status) {
    case "MENUNGGU":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "PROSES":
      return "bg-blue-100 text-blue-800 dark:text-blue-200 border-blue-300";
    case "SELESAI":
      return "bg-green-100 text-green-800 border-green-300";
    case "DIBATALKAN":
      return "bg-red-100 text-red-800 border-red-300";
    case "PRINTING":
      return "bg-purple-100 text-purple-800 border-purple-300";
    case "FINISHING":
      return "bg-orange-100 text-orange-800 border-orange-300";
    default:
      return "bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-100 border-gray-300";
  }
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
