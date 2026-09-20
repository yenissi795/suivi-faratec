import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoFaratec from "../assets/logo-faratec.png";

const COLORS = {
  primary: [245, 158, 11] as [number, number, number],
  dark: [23, 23, 23] as [number, number, number],
  gray: [100, 116, 139] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  darkRed: [192, 0, 0] as [number, number, number], // #C00000 Excel
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

// --- HELPERS LOGO ---
async function loadLogoBase64(): Promise<string | null> {
  try {
    const response = await fetch(logoFaratec);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function getImageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.includes("image/png")) return "PNG";
  if (dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg")) return "JPEG";
  return "PNG";
}

// --- DESSINER L'EN-TÊTE STANDARD (logo gauche + titre centre + logo droite) ---
function drawHeader(
  doc: jsPDF,
  logoBase64: string | null,
  title: string,
  subtitle: string | null,
  pageWidth: number,
  headerHeight: number = 30
): void {
  // Fond sombre
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, headerHeight, "F");
  // Ligne doree
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, headerHeight, pageWidth, 1.2, "F");

  const logoSize = 20;
  const logoY = (headerHeight - logoSize) / 2;

  // Logo gauche
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, getImageFormat(logoBase64), 8, logoY, logoSize, logoSize);
    } catch (e) {
      // Ignore les erreurs d'image
    }
  }

  // Logo droite
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, getImageFormat(logoBase64), pageWidth - 8 - logoSize, logoY, logoSize, logoSize);
    } catch (e) {
      // Ignore les erreurs d'image
    }
  }

  // Titre centre
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(sanitize(title), pageWidth / 2, headerHeight / 2 - 2, { align: "center" });

  // Sous-titre
  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 200, 200);
    doc.text(sanitize(subtitle), pageWidth / 2, headerHeight / 2 + 5, { align: "center" });
  }
}

// --- DESSINER LE PIED DE PAGE ---
function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number, label: string = "FARATEC - Document confidentiel") {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLORS.lightGray);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    doc.text(label, 14, pageHeight - 7);
    doc.text(`Page ${i} / ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: "right" });
  }
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

  const logoBase64 = await loadLogoBase64();

  // --- EN-TETE ---
  drawHeader(doc, logoBase64, title, periodLabel, pageWidth, 30);

  // Date de generation
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);
  doc.text(
    `Genere le ${new Date().toLocaleDateString("fr-FR")} a ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    pageWidth - 14,
    36,
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
    doc.setTextColor(...COLORS.darkRed);
    doc.text(sanitize(section.heading), 14, cursorY);
    cursorY += 4;

    autoTable(doc, {
      startY: cursorY,
      head: [[sanitize(section.rows[0][0]), sanitize(section.rows[0][1])]],
      body: section.rows.slice(1).map((r) => [sanitize(r[0]), sanitize(r[1])]),
      theme: "grid",
      headStyles: {
        fillColor: COLORS.dark,
        textColor: COLORS.primary,
        fontStyle: "bold",
        fontSize: 8,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.dark,
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 8;
  });

  // --- PIED DE PAGE ---
  drawFooter(doc, pageWidth, pageHeight);

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

// =========================================================
// FICHE DE COÛT PDF
// =========================================================
interface LigneCoutPdf {
  description: string;
  reference?: string | null;
  quantite: number;
  prix_unitaire: number;
  operateur_name?: string | null;
  heures?: number | null;
}

interface SectionCout {
  label: string;
  lignes: LigneCoutPdf[];
  total: number;
}

interface FicheCoutData {
  code_faratec: string;
  client_name: string;
  type_equipement: string;
  marque?: string | null;
  puissance_kw?: number | null;
  sections: SectionCout[];
  totalHT: number;
}

export async function buildFicheCoutPdf(data: FicheCoutData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const logoBase64 = await loadLogoBase64();

  // --- EN-TETE ---
  drawHeader(doc, logoBase64, "FICHE DE COUT", `${data.code_faratec || ""} - ${data.client_name || ""}`, pageWidth, 30);

  // Date generation
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);
  doc.text(
    `Genere le ${new Date().toLocaleDateString("fr-FR")} a ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    pageWidth - 14,
    36,
    { align: "right" }
  );

  let cursorY = 44;

  // --- BLOC INFOS ÉQUIPEMENT ---
  doc.setFillColor(...COLORS.lightGray);
  doc.roundedRect(14, cursorY, pageWidth - 28, 24, 2, 2, "F");
  doc.setFillColor(...COLORS.primary);
  doc.rect(14, cursorY, 1.5, 24, "F");

  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Dossier :", 18, cursorY + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(sanitize(data.code_faratec || "—"), 40, cursorY + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Client :", 18, cursorY + 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(sanitize(data.client_name || "—"), 40, cursorY + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);
  let techText = sanitize(data.type_equipement || "");
  if (data.marque) techText += ` - ${sanitize(data.marque)}`;
  if (data.puissance_kw) techText += ` - ${data.puissance_kw} kW`;
  doc.text(techText, pageWidth - 18, cursorY + 16, { align: "right" });

  cursorY += 30;

  // --- SECTIONS DE COÛT ---
  data.sections.forEach((section) => {
    if (section.lignes.length === 0) return;

    const estimatedHeight = 20 + (section.lignes.length * 8) + 20;
    if (cursorY + estimatedHeight > pageHeight - 30) {
      doc.addPage();
      cursorY = 20;
    }

    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(14, cursorY, pageWidth - 28, 7, 1, 1, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(sanitize(section.label.toUpperCase()), 18, cursorY + 5);
    cursorY += 10;

    const isMainOeuvre = section.label.toLowerCase().includes("oeuvre") || section.label.toLowerCase().includes("œuvre");

    const tableHead = isMainOeuvre
      ? [["Operation", "Operateur", "Heures", "P.U HT", "Total HT"]]
      : [["Reference", "Description", "Qte", "P.U HT", "Total HT"]];

    const tableBody = section.lignes.map((l) => {
      const total = l.quantite * l.prix_unitaire;
      if (isMainOeuvre) {
        return [
          sanitize(l.description || ""),
          sanitize(l.operateur_name || "—"),
          l.heures ? String(l.heures) : "—",
          l.prix_unitaire.toFixed(2) + " DH",
          total.toFixed(2) + " DH",
        ];
      }
      return [
        sanitize(l.reference || "—"),
        sanitize(l.description || ""),
        String(l.quantite),
        l.prix_unitaire.toFixed(2) + " DH",
        total.toFixed(2) + " DH",
      ];
    });

    autoTable(doc, {
      startY: cursorY,
      head: tableHead,
      body: tableBody,
      theme: "grid",
      headStyles: {
        fillColor: COLORS.dark,
        textColor: COLORS.primary,
        fontStyle: "bold",
        fontSize: 8,
        halign: "left",
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.dark,
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 2;

    doc.setFillColor(254, 243, 199);
    doc.rect(14, cursorY, pageWidth - 28, 7, "F");
    doc.setTextColor(...COLORS.dark);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Total ${sanitize(section.label)}`, pageWidth - 60, cursorY + 5, { align: "right" });
    doc.setTextColor(180, 83, 9);
    doc.text(`${section.total.toFixed(2)} DH`, pageWidth - 18, cursorY + 5, { align: "right" });

    cursorY += 12;
  });

  // --- TOTAL GÉNÉRAL ---
  if (cursorY > pageHeight - 30) {
    doc.addPage();
    cursorY = 20;
  }

  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(14, cursorY, pageWidth - 28, 14, 2, 2, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL PRIX HT", 20, cursorY + 9);
  doc.setFontSize(16);
  doc.text(`${data.totalHT.toFixed(2)} DH`, pageWidth - 20, cursorY + 10, { align: "right" });

  // --- PIED DE PAGE ---
  drawFooter(doc, pageWidth, pageHeight);

  return doc;
}

// =========================================================
// PDF LISTE ÉQUIPEMENTS PAR CLIENT
// =========================================================
interface ClientEquipement {
  code_faratec: string | null;
  type_equipement: string;
  marque: string | null;
  puissance_kw: number | null;
  ndi_da_ns: string | null;
  mle_reference: string | null;
  tension: string | null;
  vitesse: string | null;
  urgence: string | null;
  statut: string;
  pourcentage_global: number;
  created_at: string;
  date_livraison_reelle: string | null;
}

interface ClientPdfData {
  client_name: string;
  periode_label: string;
  equipements: ClientEquipement[];
  contexte_statut?: string;
}

export async function buildClientEquipementsPdf(data: ClientPdfData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const logoBase64 = await loadLogoBase64();

  // --- EN-TETE ---
  const headerTitle = `ETAT DES EQUIPEMENTS - ${data.client_name}`;
  drawHeader(doc, logoBase64, headerTitle, data.periode_label, pageWidth, 30);

  // Date generation
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);
  doc.text(
    `Genere le ${new Date().toLocaleDateString("fr-FR")} a ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    pageWidth - 14,
    36,
    { align: "right" }
  );

  let cursorY = 44;

  // --- RÉSUMÉ ---
  const total = data.equipements.length;
  const enCours = data.equipements.filter((e) => e.statut !== "livre").length;
  const livres = data.equipements.filter((e) => e.statut === "livre").length;

  doc.setFillColor(...COLORS.lightGray);
  doc.roundedRect(14, cursorY, pageWidth - 28, 14, 2, 2, "F");
  doc.setFillColor(...COLORS.primary);
  doc.rect(14, cursorY, 1.5, 14, "F");

  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`${total} equipement${total > 1 ? "s" : ""}`, 20, cursorY + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);
  doc.text(`${enCours} en cours  -  ${livres} livre${livres > 1 ? "s" : ""}`, pageWidth - 20, cursorY + 9, { align: "right" });

  cursorY += 20;

  // --- TABLEAU ---
  const tableHead = [[
    "Code Faratec",
    "Type",
    "Marque",
    "Puis.",
    "NDI/DA/NS",
    "MLE",
    "Tension",
    "Vitesse",
    "Urg.",
    "Statut",
    "Taux d'avancement",
    "Entree",
    "Livre le",
  ]];

  const tableBody = data.equipements.map((e) => [
    sanitize(e.code_faratec || "—"),
    sanitize(e.type_equipement || "—"),
    sanitize(e.marque || "—"),
    e.puissance_kw ? `${e.puissance_kw}kW` : "—",
    sanitize(e.ndi_da_ns || "—"),
    sanitize(e.mle_reference || "—"),
    sanitize(e.tension || "—"),
    sanitize(e.vitesse || "—"),
    e.urgence === "urgent" ? "URGENT" : "—",
    e.statut === "livre" ? "Livre" : (e.pourcentage_global >= 100 ? "Pret a livrer" : (e.pourcentage_global > 0 ? "En cours" : "En attente")),
    `${e.pourcentage_global}%`,
    new Date(e.created_at).toLocaleDateString("fr-FR"),
    e.date_livraison_reelle ? new Date(e.date_livraison_reelle).toLocaleDateString("fr-FR") : "—",
  ]);

  autoTable(doc, {
    startY: cursorY,
    head: tableHead,
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: COLORS.dark,
      textColor: COLORS.primary,
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: COLORS.dark,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: "bold" },
      8: { halign: "center" },
      9: { halign: "center" },
      10: { halign: "right" },
      11: { halign: "center" },
      12: { halign: "center" },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.row.raw[8] === "URGENT") {
        data.cell.styles.textColor = [220, 38, 38];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // --- PIED DE PAGE ---
  drawFooter(doc, pageWidth, pageHeight);

  return doc;
}