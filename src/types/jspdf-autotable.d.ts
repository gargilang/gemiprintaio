declare module "jspdf" {
  interface jsPDF {
    lastAutoTable?: {
      finalY: number;
    };
  }
}

declare module "jspdf-autotable" {
  interface UserOptions {
    startY?: number;
    head?: any[][];
    body?: any[][];
    theme?: "striped" | "grid" | "plain";
    headStyles?: any;
    styles?: any;
    columnStyles?: any;
    alternateRowStyles?: any;
    margin?: any;
  }

  export default function autoTable(doc: any, options: UserOptions): void;
}
