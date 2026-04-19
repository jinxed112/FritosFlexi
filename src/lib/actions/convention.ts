'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { verifyPin } from '@/lib/actions/verify-pin';

// ============================================================
// Shared PDF helpers (dupliqués de contract.ts pour isolation)
// ============================================================

function drawWrapped(
  page: any, text: string, x: number, startY: number,
  maxW: number, size: number, f: any, color: any
): number {
  let y = startY;
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (f.widthOfTextAtSize(test, size) > maxW) {
      page.drawText(line, { x, y, size, font: f, color });
      y -= size + 4;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y, size, font: f, color });
    y -= size + 4;
  }
  return y;
}

function ensureSpace(
  pdf: any, currentY: number, needed: number, W: number, H: number, M: number
): { page: any; y: number } {
  if (currentY < needed) {
    const newPage = pdf.addPage([W, H]);
    return { page: newPage, y: H - M };
  }
  return { page: pdf.getPages()[pdf.getPageCount() - 1], y: currentY };
}


// ============================================================
// CONVENTION DE PRESTATION DE SERVICES — INDÉPENDANT
// Basé sur convention_independant_mdjambo_v2.docx
// ============================================================

async function generateConventionPDF(
  worker: any,
  location: any,
  data: {
    conventionDate: string;
    startTime: string;
    endTime: string;
    hourlyRate: number;
    amountHtva: number;
    vatRate: number;
    vatAmount: number;
    amountTtc: number;
  },
  signatureInfo: {
    dateStr: string;
    ip: string;
    method: 'portail' | 'kiosque';
    userId?: string;
    email?: string;
    workerId?: string;
    geoLat?: number;
    geoLng?: number;
  }
): Promise<Uint8Array> {
  const [sh, sm] = data.startTime.split(':').map(Number);
  const [eh, em] = data.endTime.split(':').map(Number);
  const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;

  const dateFormatted = new Date(data.conventionDate).toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const dateShort = new Date(data.conventionDate).toLocaleDateString('fr-BE');

  const pdf = await PDFDocument.create();
  const font      = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold  = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const W = 595; const H = 842; const M = 50; const TW = W - M * 2;
  const dark  = rgb(0.15, 0.15, 0.15);
  const gray  = rgb(0.35, 0.35, 0.35);
  const light = rgb(0.55, 0.55, 0.55);
  const orange = rgb(0.9, 0.4, 0.0);

  let page = pdf.addPage([W, H]);
  let y = H - M;

  // ---- TITRE ----
  page.drawText('CONVENTION DE PRESTATION DE SERVICES', {
    x: M, y, size: 14, font: fontBold, color: dark,
  });
  y -= 16;
  page.drawText('Travailleur indépendant', {
    x: M, y, size: 11, font: fontItalic, color: gray,
  });
  y -= 30;

  // ---- ARTICLE 1 — PARTIES ----
  page.drawText('ARTICLE 1 — PARTIES', { x: M, y, size: 10, font: fontBold, color: dark });
  y -= 16;
  page.drawText('Le présent contrat est conclu entre :', { x: M, y, size: 9, font, color: gray });
  y -= 18;

  // Donneur d'ordre
  page.drawText('Le Donneur d\'ordre :', { x: M, y, size: 10, font: fontBold, color: dark });
  y -= 14;
  const employerLines = [
    ['Dénomination sociale', 'S.B.U.R.G.S. SRL (MDjambo)'],
    ['Numéro BCE',           'BE 1009.237.290'],
    ['Numéro TVA',           'BE 1009.237.290'],
    ['Adresse',              'Rue de Ghlin 2, 7050 Jurbise — Belgique'],
    ['Représenté par',       'Michele Terrana, Administrateur'],
  ];
  for (const [label, value] of employerLines) {
    page.drawText(`${label} :`, { x: M + 10, y, size: 9, font: fontBold, color: gray });
    page.drawText(value, { x: M + 130, y, size: 9, font, color: dark });
    y -= 13;
  }
  y -= 10;

  // Prestataire
  page.drawText('Le Prestataire :', { x: M, y, size: 10, font: fontBold, color: dark });
  y -= 14;
  const vatLabel = worker.vat_applicable
    ? worker.vat_number || '.....................'
    : `${worker.vat_number || '.....................'} (franchise TVA)`;
  const prestataireLines = [
    ['Nom & Prénom',          `${worker.first_name} ${worker.last_name}`],
    ['Numéro BCE/KBO',        worker.vat_number || '___________________________'],
    ['Numéro TVA',            vatLabel],
    ['Adresse',               worker.address_street
      ? `${worker.address_street}, ${worker.address_zip || ''} ${worker.address_city || ''}`
      : '___________________________'],
    ['IBAN',                  worker.iban || '___________________________'],
  ];
  for (const [label, value] of prestataireLines) {
    page.drawText(`${label} :`, { x: M + 10, y, size: 9, font: fontBold, color: gray });
    page.drawText(value, { x: M + 130, y, size: 9, font, color: dark });
    y -= 13;
  }
  y -= 16;

  // ---- ARTICLES 2 à 9 ----
  const articles = [
    {
      title: 'ARTICLE 2 — OBJET DE LA PRESTATION',
      body: `Le Prestataire est mandaté pour réaliser la prestation suivante, en qualité d'indépendant et sans aucun lien de subordination : aide en cuisine et friture au sein de l'établissement MDjambo (friterie). Le Prestataire intervient avec son savoir-faire propre. Il organise son travail de manière autonome et n'est soumis à aucune instruction hiérarchique de la part du Donneur d'ordre.`,
    },
    {
      title: "ARTICLE 3 — LIEU ET PÉRIODE D'EXÉCUTION",
      body: null, // traitement spécial ci-dessous
    },
    {
      title: 'ARTICLE 4 — RÉMUNÉRATION ET MODALITÉS DE PAIEMENT',
      body: null, // traitement spécial ci-dessous
    },
    {
      title: "ARTICLE 5 — NATURE INDÉPENDANTE DE LA RELATION — ART. 337/2 CDE",
      body: null, // liste à puces
    },
    {
      title: 'ARTICLE 6 — RESPONSABILITÉ ET ASSURANCES',
      body: "Le Prestataire est seul responsable des dommages causés à des tiers dans le cadre de l'exécution de sa mission. Il déclare disposer des assurances nécessaires à l'exercice de son activité indépendante (responsabilité civile professionnelle). Le Donneur d'ordre ne peut être tenu responsable des accidents, incidents ou dommages survenant du fait du Prestataire.",
    },
    {
      title: 'ARTICLE 7 — ANNULATION',
      body: "En cas d'annulation de la prestation par l'une ou l'autre des parties avant le début de l'exécution, aucune indemnité n'est due, sauf accord contraire écrit entre les parties. En cas d'exécution partielle dûment constatée, le Prestataire sera rémunéré au prorata des heures effectivement prestées.",
    },
    {
      title: 'ARTICLE 8 — DONNÉES PERSONNELLES',
      body: "Les données personnelles collectées dans le cadre du présent contrat sont traitées exclusivement aux fins de gestion administrative et comptable, conformément au Règlement (UE) 2016/679 (RGPD) et à la loi belge du 30 juillet 2018. Elles ne seront pas transmises à des tiers sans accord préalable, sauf obligation légale.",
    },
    {
      title: 'ARTICLE 9 — DROIT APPLICABLE ET JURIDICTION',
      body: "Le présent contrat est soumis au droit belge. Tout litige relatif à son interprétation ou son exécution sera porté devant les tribunaux compétents de l'arrondissement judiciaire de Mons.",
    },
  ];

  for (const art of articles) {
    const sp = ensureSpace(pdf, y, 80, W, H, M);
    page = sp.page; y = sp.y;

    page.drawText(art.title, { x: M, y, size: 10, font: fontBold, color: dark });
    y -= 15;

    if (art.title.includes('ARTICLE 3')) {
      // Lieu et période
      const loc3Lines = [
        `Lieu : ${location?.name || 'MDjambo'} — ${location?.address || ''}`,
        `Date : ${dateFormatted}`,
        `Horaires : de ${data.startTime} h à ${data.endTime} h (${hours.toFixed(1)} heures)`,
      ];
      for (const l of loc3Lines) {
        page.drawText(l, { x: M + 10, y, size: 9, font, color: dark });
        y -= 13;
      }
      y -= 6;

    } else if (art.title.includes('ARTICLE 4')) {
      // Rémunération
      const htva = data.amountHtva.toFixed(2);
      const ttc  = data.amountTtc.toFixed(2);
      const vatLine = worker.vat_applicable
        ? `TVA ${data.vatRate}% : ${data.vatAmount.toFixed(2)} EUR — Total TTC : ${ttc} EUR`
        : 'Franchise TVA art. 56bis CIR — pas de TVA applicable';

      page.drawText(`Montant convenu : ${htva} EUR HTVA`, { x: M + 10, y, size: 9, font: fontBold, color: dark });
      y -= 13;
      page.drawText(vatLine, { x: M + 10, y, size: 9, font, color: gray });
      y -= 13;
      y = drawWrapped(page,
        `Le paiement sera effectué par virement bancaire sur le compte IBAN ${worker.iban || '...'} du Prestataire, dans un délai de 30 jours calendrier à dater de la réception de la facture, conformément à la loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales.`,
        M + 10, y, TW - 10, 9, font, gray
      );
      y -= 6;
      y = drawWrapped(page,
        "Le Prestataire s'engage à émettre une facture conforme incluant : sa dénomination, son numéro BCE, son numéro de TVA le cas échéant (ou mention de franchise TVA art. 56bis CIR), la date et la nature de la prestation, le montant HTVA et la TVA applicable. Aucun paiement en espèces ne sera effectué sans justificatif comptable.",
        M + 10, y, TW - 10, 9, font, gray
      );
      y -= 6;

    } else if (art.title.includes('ARTICLE 5')) {
      // Liste à puces art. 337/2 CDE
      y = drawWrapped(page,
        "Conformément à l'article 337/2 du Code de droit économique (CDE), les parties déclarent expressément que :",
        M + 10, y, TW - 10, 9, font, gray
      );
      y -= 6;
      const bullets = [
        "Volonté des parties : les parties ont librement et expressément choisi le statut d'indépendant. Aucun contrat de travail n'a été conclu ni envisagé.",
        "Liberté d'organisation du temps de travail : le Prestataire est libre d'organiser son temps de travail. Les horaires figurant à l'article 3 sont convenus d'un commun accord, non imposés unilatéralement.",
        "Liberté d'organisation du travail : le Prestataire exécute sa mission selon ses propres méthodes et avec son savoir-faire propre, sans recevoir d'instructions sur la manière de l'accomplir.",
        "Absence de contrôle hiérarchique : le Prestataire n'est pas soumis à l'autorité du Donneur d'ordre. Aucun lien de subordination n'existe entre les parties.",
      ];
      for (const b of bullets) {
        const sp2 = ensureSpace(pdf, y, 40, W, H, M);
        page = sp2.page; y = sp2.y;
        page.drawText('-', { x: M + 10, y, size: 9, font, color: gray });
        y = drawWrapped(page, b, M + 22, y, TW - 22, 9, font, gray);
        y -= 4;
      }
      y -= 4;
      y = drawWrapped(page,
        `Le Prestataire déclare en outre : être dûment enregistré à la BCE et affilié à une caisse d'assurances sociales (INASTI) ; être seul responsable du paiement de ses cotisations sociales et de ses obligations fiscales ; être libre d'accepter des missions similaires auprès d'autres clients.`,
        M + 10, y, TW - 10, 9, font, gray
      );
      y -= 6;

    } else if (art.body) {
      y = drawWrapped(page, art.body, M + 10, y, TW - 10, 9, font, gray);
      y -= 8;
    }
  }

  // ---- SIGNATURES ----
  const spSig = ensureSpace(pdf, y, 220, W, H, M);
  page = spSig.page; y = spSig.y;

  y -= 10;
  page.drawText(`Fait en deux exemplaires originaux, à ${location?.name?.includes('Boussu') ? 'Boussu' : 'Jurbise'}, le ${dateShort}.`, {
    x: M, y, size: 10, font, color: dark,
  });
  y -= 8;
  page.drawText('Chaque partie reconnaît avoir reçu un exemplaire signé.', {
    x: M, y, size: 8, font: fontItalic, color: light,
  });
  y -= 25;

  const colW = TW / 2 - 10;

  page.drawText('Pour le Donneur d\'ordre', { x: M, y, size: 10, font: fontBold, color: dark });
  page.drawText('Pour le Prestataire', { x: M + colW + 20, y, size: 10, font: fontBold, color: dark });
  y -= 14;

  // Essayer d'embarquer la signature du worker depuis son framework contract
  let sigEmbedded = false;
  if (worker.signature_url) {
    try {
      const sigResponse = await fetch(worker.signature_url);
      if (sigResponse.ok) {
        const sigBytes = new Uint8Array(await sigResponse.arrayBuffer());
        const sigImage = await pdf.embedPng(sigBytes);
        const sigDims  = sigImage.scale(0.4);
        const sigW = Math.min(sigDims.width, colW - 30);
        const sigH = (sigW / sigDims.width) * sigDims.height;

        // Employeur à gauche
        page.drawText('Michele Terrana', { x: M + 10, y, size: 9, font, color: dark });
        page.drawText('Administrateur, S.B.U.R.G.S. SRL', { x: M + 10, y: y - 12, size: 8, font: fontItalic, color: gray });

        // Prestataire à droite avec signature
        page.drawText('Lu et approuvé', { x: M + colW + 30, y, size: 8, font: fontItalic, color: dark });
        y -= sigH + 5;
        page.drawImage(sigImage, { x: M + colW + 30, y, width: sigW, height: sigH });
        y -= 10;
        sigEmbedded = true;
      }
    } catch (e) {
      console.error('Failed to embed signature:', e);
    }
  }

  if (!sigEmbedded) {
    page.drawText('Michele Terrana, Administrateur', { x: M + 10, y, size: 9, font, color: dark });
    page.drawText('(Signature électronique — voir preuve ci-dessous)', { x: M + colW + 20, y, size: 8, font: fontItalic, color: light });
    y -= 15;
  }

  // Lignes de signature
  y -= 5;
  page.drawLine({ start: { x: M, y }, end: { x: M + colW, y }, thickness: 0.5, color: gray });
  page.drawLine({ start: { x: M + colW + 20, y }, end: { x: W - M, y }, thickness: 0.5, color: gray });
  y -= 13;
  page.drawText('Michele Terrana', { x: M, y, size: 9, font, color: dark });
  page.drawText(`${worker.first_name} ${worker.last_name}`, { x: M + colW + 20, y, size: 9, font, color: dark });

  // ---- AVERTISSEMENT ----
  const spWarn = ensureSpace(pdf, y, 80, W, H, M);
  page = spWarn.page; y = spWarn.y;
  y -= 20;
  page.drawRectangle({
    x: M, y: y - 40, width: TW, height: 48,
    color: rgb(1, 0.97, 0.9),
    borderColor: orange,
    borderWidth: 0.5,
  });
  y -= 8;
  page.drawText('⚠ AVERTISSEMENT', { x: M + 8, y, size: 8, font: fontBold, color: orange });
  y -= 12;
  y = drawWrapped(page,
    "La présente convention ne dispense pas d'une vérification préalable du statut réel du prestataire. En cas de requalification en contrat de travail par l'ONSS ou un tribunal (lien de subordination avéré), le Donneur d'ordre pourrait être redevable des cotisations sociales patronales et ouvrières, majorées d'amendes.",
    M + 8, y, TW - 16, 7, fontItalic, orange
  );

  // ---- PREUVE ÉLECTRONIQUE ----
  const spProof = ensureSpace(pdf, y, 100, W, H, M);
  page = spProof.page; y = spProof.y;
  y -= 20;
  page.drawText('Preuve de signature électronique', { x: M, y, size: 9, font: fontBold, color: dark });
  y -= 14;
  const proofLines = [
    `Horodatage : ${signatureInfo.dateStr}`,
    `Adresse IP : ${signatureInfo.ip}`,
    `Méthode : Validation par ${signatureInfo.method === 'kiosque' ? 'PIN sur kiosque' : 'session authentifiée sur portail'}`,
    signatureInfo.geoLat ? `Géolocalisation : ${signatureInfo.geoLat.toFixed(6)}, ${signatureInfo.geoLng?.toFixed(6)}` : null,
    signatureInfo.email  ? `Email : ${signatureInfo.email}` : null,
    signatureInfo.userId ? `Identifiant : ${signatureInfo.userId}` : null,
    signatureInfo.workerId ? `Worker ID : ${signatureInfo.workerId}` : null,
  ].filter(Boolean) as string[];

  for (const m of proofLines) {
    page.drawText(m, { x: M + 10, y, size: 8, font, color: light });
    y -= 11;
  }

  // ---- FOOTER sur toutes les pages ----
  const allPages = pdf.getPages();
  allPages.forEach((p: any, i: number) => {
    p.drawText(`Convention de prestation — ${worker.first_name} ${worker.last_name} — ${dateShort} — Page ${i + 1}/${allPages.length}`, {
      x: M, y: 25, size: 7, font: fontItalic, color: rgb(0.6, 0.6, 0.6),
    });
    p.drawText('S.B.U.R.G.S. SRL (MDjambo) — BE 1009.237.290', {
      x: W - M - 160, y: 25, size: 7, font: fontItalic, color: rgb(0.6, 0.6, 0.6),
    });
  });

  return pdf.save();
}


// ============================================================
// CHECK — Vérifier si une convention est nécessaire au pointage
// ============================================================

/**
 * Portail authentifié : vérifier si l'indépendant doit signer une convention
 */
export async function checkIndependentConvention(shiftId: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { needed: false };

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id, status, hourly_rate, vat_applicable, vat_rate, vat_number')
    .eq('user_id', user.id)
    .single();

  if (!worker || worker.status !== 'independent') return { needed: false };

  const { data: shift } = await supabase
    .from('shifts')
    .select('id, date, start_time, end_time, location_id, locations(id, name, address)')
    .eq('id', shiftId)
    .single();

  if (!shift) return { needed: false };

  // Vérifier si convention déjà générée pour ce shift
  const { data: existing } = await supabase
    .from('independent_conventions')
    .select('id, convention_pdf_url')
    .eq('shift_id', shiftId)
    .maybeSingle();

  if (existing) return { needed: false, alreadySigned: true, pdfUrl: existing.convention_pdf_url };

  const loc = (shift as any).locations;
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  const hourlyRate = worker.hourly_rate || 18;
  const amountHtva = Math.round(hours * hourlyRate * 100) / 100;
  const vatRate    = worker.vat_applicable ? (worker.vat_rate || 21) : 0;
  const vatAmount  = Math.round(amountHtva * vatRate / 100 * 100) / 100;
  const amountTtc  = Math.round((amountHtva + vatAmount) * 100) / 100;

  return {
    needed: true,
    conventionData: {
      shiftId: shift.id,
      workerId: worker.id,
      locationId: shift.location_id,
      locationName: loc?.name || 'MDjambo',
      conventionDate: shift.date,
      startTime: shift.start_time?.slice(0, 5),
      endTime: shift.end_time?.slice(0, 5),
      hourlyRate,
      amountHtva,
      vatRate,
      vatAmount,
      amountTtc,
      vatApplicable: worker.vat_applicable,
      vatNumber: worker.vat_number,
    },
  };
}

/**
 * Kiosque PIN : vérifier si convention nécessaire
 */
export async function kioskCheckIndependentConvention(shiftId: string, workerId: string, pin: string) {
  const pinResult = await verifyPin(workerId, pin);
  if (!pinResult.success) {
    return { needed: false, error: pinResult.error, locked: 'locked' in pinResult && pinResult.locked };
  }

  const admin = createAdminClient();

  const { data: shift } = await admin
    .from('shifts')
    .select(`
      id, date, start_time, end_time, location_id,
      flexi_workers!inner(id, first_name, last_name, status, hourly_rate, vat_applicable, vat_rate, vat_number),
      locations!inner(id, name, address)
    `)
    .eq('id', shiftId)
    .single();

  if (!shift) return { needed: false };

  const w   = (shift as any).flexi_workers;
  const loc = (shift as any).locations;

  if (w.status !== 'independent') return { needed: false };

  const { data: existing } = await admin
    .from('independent_conventions')
    .select('id')
    .eq('shift_id', shiftId)
    .maybeSingle();

  if (existing) return { needed: false, alreadySigned: true };

  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  const hours      = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  const hourlyRate = w.hourly_rate || 18;
  const amountHtva = Math.round(hours * hourlyRate * 100) / 100;
  const vatRate    = w.vat_applicable ? (w.vat_rate || 21) : 0;
  const vatAmount  = Math.round(amountHtva * vatRate / 100 * 100) / 100;
  const amountTtc  = Math.round((amountHtva + vatAmount) * 100) / 100;

  return {
    needed: true,
    conventionData: {
      shiftId: shift.id,
      workerId: w.id,
      locationId: shift.location_id,
      locationName: loc.name,
      conventionDate: shift.date,
      startTime: shift.start_time?.slice(0, 5),
      endTime: shift.end_time?.slice(0, 5),
      hourlyRate,
      amountHtva,
      vatRate,
      vatAmount,
      amountTtc,
      vatApplicable: w.vat_applicable,
      vatNumber: w.vat_number,
    },
  };
}


// ============================================================
// SIGN — Générer et stocker la convention PDF
// ============================================================

/**
 * Portail authentifié : générer la convention au pointage
 */
export async function signIndependentConvention(data: {
  shiftId: string;
  workerId: string;
  locationId: string;
  conventionDate: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  amountHtva: number;
  vatRate: number;
  vatAmount: number;
  amountTtc: number;
  geoLat?: number;
  geoLng?: number;
  userAgent?: string;
}) {
  const supabase = createClient();
  const admin    = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  // Vérifier si déjà générée
  const { data: existing } = await supabase
    .from('independent_conventions')
    .select('id, convention_pdf_url')
    .eq('shift_id', data.shiftId)
    .maybeSingle();

  if (existing) return { success: true, alreadySigned: true, pdfUrl: existing.convention_pdf_url };

  const { data: worker } = await admin
    .from('flexi_workers')
    .select('*')
    .eq('id', data.workerId)
    .single();

  if (!worker) return { error: 'Travailleur introuvable' };

  const { data: location } = await admin
    .from('locations')
    .select('*')
    .eq('id', data.locationId)
    .single();

  try {
    const headersList = headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
      || headersList.get('x-real-ip')
      || 'unknown';

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-BE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const pdfBytes = await generateConventionPDF(worker, location, data, {
      dateStr,
      ip,
      method: 'portail',
      userId: user.id,
      email: user.email || undefined,
      workerId: data.workerId,
      geoLat: data.geoLat,
      geoLng: data.geoLng,
    });

    // Upload PDF dans le bucket 'contracts' (même bucket que les contrats étudiants)
    const fileName = `${data.workerId}/convention-independant-${data.conventionDate}.pdf`;
    const { error: uploadError } = await admin.storage
      .from('contracts')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true });

    let pdfUrl: string | null = null;
    if (!uploadError) {
      const { data: urlData } = await admin.storage
        .from('contracts')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 5);
      pdfUrl = urlData?.signedUrl || null;
    }

    // Insérer le record
    const { data: convention, error } = await supabase
      .from('independent_conventions')
      .insert({
        shift_id:          data.shiftId,
        worker_id:         data.workerId,
        location_id:       data.locationId,
        convention_date:   data.conventionDate,
        start_time:        data.startTime,
        end_time:          data.endTime,
        hourly_rate:       data.hourlyRate,
        amount_htva:       data.amountHtva,
        vat_rate:          data.vatRate,
        vat_amount:        data.vatAmount,
        amount_ttc:        data.amountTtc,
        signed_at:         now.toISOString(),
        signed_ip:         ip,
        signed_user_agent: data.userAgent,
        geo_lat:           data.geoLat,
        geo_lng:           data.geoLng,
        convention_pdf_url: pdfUrl,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath('/flexi/paie');
    revalidatePath('/flexi/clock');
    return { success: true, conventionId: convention.id, pdfUrl };

  } catch (err: any) {
    console.error('Convention error:', err);
    return { error: `Erreur : ${err.message}` };
  }
}

/**
 * Kiosque PIN : générer la convention au pointage
 */
export async function kioskSignIndependentConvention(data: {
  shiftId: string;
  workerId: string;
  locationId: string;
  conventionDate: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  amountHtva: number;
  vatRate: number;
  vatAmount: number;
  amountTtc: number;
  pin: string;
  geoLat?: number;
  geoLng?: number;
  userAgent?: string;
}) {
  const pinResult = await verifyPin(data.workerId, data.pin);
  if (!pinResult.success) return { success: false, error: pinResult.error };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('independent_conventions')
    .select('id')
    .eq('shift_id', data.shiftId)
    .maybeSingle();

  if (existing) return { success: true, alreadySigned: true };

  const { data: worker } = await admin
    .from('flexi_workers')
    .select('*')
    .eq('id', data.workerId)
    .single();

  if (!worker) return { success: false, error: 'Travailleur introuvable' };

  const { data: location } = await admin
    .from('locations')
    .select('*')
    .eq('id', data.locationId)
    .single();

  try {
    const headersList = headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
      || headersList.get('x-real-ip')
      || 'unknown';

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-BE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const pdfBytes = await generateConventionPDF(worker, location, data, {
      dateStr,
      ip,
      method: 'kiosque',
      workerId: data.workerId,
      geoLat: data.geoLat,
      geoLng: data.geoLng,
    });

    const fileName = `${data.workerId}/convention-independant-${data.conventionDate}.pdf`;
    const { error: uploadError } = await admin.storage
      .from('contracts')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true });

    let pdfUrl: string | null = null;
    if (!uploadError) {
      const { data: urlData } = await admin.storage
        .from('contracts')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 5);
      pdfUrl = urlData?.signedUrl || null;
    }

    const { data: convention, error } = await admin
      .from('independent_conventions')
      .insert({
        shift_id:          data.shiftId,
        worker_id:         data.workerId,
        location_id:       data.locationId,
        convention_date:   data.conventionDate,
        start_time:        data.startTime,
        end_time:          data.endTime,
        hourly_rate:       data.hourlyRate,
        amount_htva:       data.amountHtva,
        vat_rate:          data.vatRate,
        vat_amount:        data.vatAmount,
        amount_ttc:        data.amountTtc,
        signed_at:         now.toISOString(),
        signed_ip:         ip,
        signed_user_agent: data.userAgent,
        geo_lat:           data.geoLat,
        geo_lng:           data.geoLng,
        convention_pdf_url: pdfUrl,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    return { success: true, conventionId: convention.id, pdfUrl };

  } catch (err: any) {
    console.error('Kiosk convention error:', err);
    return { success: false, error: `Erreur : ${err.message}` };
  }
}


// ============================================================
// GET — Récupérer les conventions (portail worker)
// ============================================================

export async function getIndependentConventions(workerId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('independent_conventions')
    .select('*, locations(name), shifts(date, start_time, end_time)')
    .eq('worker_id', workerId)
    .order('convention_date', { ascending: false });

  if (error) return { error: error.message };
  return { data };
}

/**
 * Manager : récupérer les conventions d'un worker
 */
export async function getWorkerConventionsAsManager(workerId: string) {
  const supabase = createClient();
  const admin    = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'manager') return { error: 'Accès refusé' };

  const { data, error } = await admin
    .from('independent_conventions')
    .select('*, locations(name), shifts(date, start_time, end_time)')
    .eq('worker_id', workerId)
    .order('convention_date', { ascending: false });

  if (error) return { error: error.message };
  return { data: data || [] };
}
