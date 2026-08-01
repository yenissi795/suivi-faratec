import { jsPDF } from "jspdf";
import logoImg from "../assets/logo-faratec.png";

interface Section {
  heading: string;
  rows: [string, string][];
}

async function loadImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function buildRapportPdf(title: string, periodLabel: string, sections: Section[]): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // --- En-tête avec logo FARATEC ---
  try {
    const logoDataUrl = await loadImageAsDataUrl(logoImg);
    doc.addImage(logoDataUrl, "PNG", 15, y, 20, 20);
  } catch {
    // Si le logo ne charge pas, on continue sans bloquer la génération du PDF
  }

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Suivi-FARATEC", pageWidth / 2, y + 8, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(title, pageWidth / 2, y + 15, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(periodLabel, pageWidth / 2, y + 21, { align: "center" });
  doc.setTextColor(0);

  y += 32;
  doc.setDrawColor(245, 158, 11); // amber-500
  doc.setLineWidth(1);
  doc.line(15, y, pageWidth - 15, y);
  y += 8;

  // --- Sections ---
  sections.forEach((section) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(section.heading, 15, y);
    y += 6;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(15, y, pageWidth - 15, y);
    y += 5;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);

    if (section.rows.length === 0) {
      doc.setTextColor(150);
      doc.text("Aucune donnée pour cette section.", 15, y);
      doc.setTextColor(50);
      y += 6;
    } else {
      section.rows.forEach(([label, value]) => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(label, 15, y);
        doc.text(value, pageWidth - 15, y, { align: "right" });
        y += 6;
      });
    }
    y += 4;
  });

  // --- Pied de page ---
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Généré le ${new Date().toLocaleString("fr-FR")} — Page ${i}/${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  return doc;
}
