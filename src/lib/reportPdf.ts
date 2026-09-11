import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COLORS = {
  primary: [245, 158, 11] as [number, number, number],
  dark: [23, 23, 23] as [number, number, number],
  gray: [100, 116, 139] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  blue: [37, 99, 235] as [number, number, number],
};

interface Section {
  heading: string;
  rows: [string, string][];
}

interface ChartData {
  label: string;
  value: number;
}

interface KPI {
  label: string;
  value: string;
  color?: [number, number, number];
}

// Nettoie le texte : garde l'ASCII, enleve les accents francais proprement
// (Atelier mecanique au lieu de Atelier m?canique)
function sanitize(text: string): string {
  return String(text)
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/·/g, "-")
    .replace(/…/g, "...")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function buildRapportPdf(
  title: string,
  periodLabel: string,
  sections: Section[],
  kpis: KPI[] = [],
  charts: { title: string; data: ChartData[] }[] = []
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // --- EN-TETE ---
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 32, pageWidth, 1.5, "F");

  doc.setTextColor(...COLORS.white);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("FARATEC", 14, 15);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 200);
  doc.text("Suivi des travaux d'atelier", 14, 22);

  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(sanitize(title), pageWidth - 14, 15, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 200);
  doc.text(sanitize(periodLabel), pageWidth - 14, 22, { align: "right" });

  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Genere le ${new Date().toLocaleDateString("fr-FR")} a ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    pageWidth - 14,
    28,
    { align: "right" }
  );

  let cursorY = 44;

  // --- KPIs EN CARTES ---
  if (kpis.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);
    doc.text("Indicateurs cles", 14, cursorY);
    cursorY += 5;

    const kpiPerRow = Math.min(kpis.length, 4);
    const kpiWidth = (pageWidth - 28 - (kpiPerRow - 1) * 3) / kpiPerRow;
    const kpiHeight = 18;

    kpis.forEach((kpi, i) => {
      const col = i % kpiPerRow;
      const row = Math.floor(i / kpiPerRow);
      const x = 14 + col * (kpiWidth + 3);
      const y = cursorY + row * (kpiHeight + 3);

      doc.setFillColor(...COLORS.lightGray);
      doc.roundedRect(x, y, kpiWidth, kpiHeight, 2, 2, "F");

      const color = kpi.color || COLORS.primary;
      doc.setFillColor(...color);
      doc.rect(x, y, 1.2, kpiHeight, "F");

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.gray);
      doc.text(sanitize(kpi.label.toUpperCase()), x + 4, y + 6);

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.dark);
      doc.text(sanitize(kpi.value), x + 4, y + 14);
    });

    const rows = Math.ceil(kpis.length / kpiPerRow);
    cursorY += rows * (kpiHeight + 3) + 4;
  }

  // --- GRAPHIQUES EN BARRES ---
  if (charts.length > 0) {
    charts.forEach((chart) => {
      if (cursorY > pageHeight - 80) {
        doc.addPage();
        cursorY = 20;
      }

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.dark);
      doc.text(sanitize(chart.title), 14, cursorY);
      cursorY += 6;

      const chartHeight = 40;
      const chartWidth = pageWidth - 28 - 30;
      const barSpacing = chartWidth / Math.max(chart.data.length, 1);
      const barWidth = Math.min(barSpacing * 0.6, 12);
      const maxValue = Math.max(...chart.data.map((d) => d.value), 1);

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      doc.line(44, cursorY + chartHeight, 44 + chartWidth, cursorY + chartHeight);

      chart.data.forEach((d, i) => {
        const barHeight = (d.value / maxValue) * chartHeight;
        const x = 44 + i * barSpacing + (barSpacing - barWidth) / 2;
        const y = cursorY + chartHeight - barHeight;

        doc.setFillColor(...COLORS.primary);
        if (barHeight > 0) doc.roundedRect(x, y, barWidth, barHeight, 1, 1, "F");

        doc.setFontSize(6);
        doc.setTextColor(...COLORS.gray);
        doc.text(sanitize(d.label), x + barWidth / 2, cursorY + chartHeight + 3, { align: "center" });

        if (d.value > 0) {
          doc.setFontSize(7);
          doc.setTextColor(...COLORS.dark);
          doc.setFont("helvetica", "bold");
          doc.text(String(d.value), x + barWidth / 2, y - 1.5, { align: "center" });
        }
      });

      cursorY += chartHeight + 10;
    });
  }

  // --- SECTIONS ---
  sections.forEach((section) => {
    if (section.rows.length === 0) return;

    if (cursorY > pageHeight - 40) {
      doc.addPage();
      cursorY = 20;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);
    doc.text(sanitize(section.heading), 14, cursorY);
    cursorY += 4;

    autoTable(doc, {
      startY: cursorY,
      head: [[sanitize(section.rows[0][0]), sanitize(section.rows[0][1])]],
      body: section.rows.slice(1).map((r) => [sanitize(r[0]), sanitize(r[1])]),
      theme: "striped",
      headStyles: {
        fillColor: COLORS.dark,
        textColor: COLORS.primary,
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8, textColor: COLORS.dark },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 8;
  });

  // --- PIED DE PAGE ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLORS.lightGray);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    doc.text("FARATEC - Document interne confidentiel", 14, pageHeight - 7);
    doc.text(`Page ${i} / ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: "right" });
  }

  return doc;
}

// --- EXPORT CSV ---
export function buildCsv(rows: string[][], filename: string) {
  const csvContent = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}