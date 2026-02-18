'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { verifyPin } from '@/lib/actions/verify-pin';

// ============================================================
// Shared PDF helpers
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

/** Draw a bullet list, returns new Y */
function drawBulletList(
  page: any, items: string[], x: number, startY: number,
  maxW: number, size: number, f: any, color: any
): number {
  let y = startY;
  for (const item of items) {
    page.drawText('-', { x, y, size, font: f, color });
    y = drawWrapped(page, item, x + 12, y, maxW - 12, size, f, color);
    y -= 2;
  }
  return y;
}

/** Ensure enough space on page, add new page if needed */
function ensureSpace(pdf: any, currentY: number, needed: number, W: number, H: number, M: number): { page: any; y: number } {
  if (currentY < needed) {
    const newPage = pdf.addPage([W, H]);
    return { page: newPage, y: H - M };
  }
  return { page: pdf.getPages()[pdf.getPageCount() - 1], y: currentY };
}


// ============================================================
// CONTRAT-CADRE FLEXI-JOB
// Basé sur le modèle officiel Partena CNT 13 — Mis à jour 01.01.2026
// 7 articles conformes au template original
// ============================================================

export async function signFrameworkContract(signatureBase64: string) {
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!worker) return { error: 'Profil introuvable' };
  if (worker.framework_contract_date) return { error: 'Contrat déjà signé' };

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
    const dateISO = now.toISOString().split('T')[0];
    const dateFR = new Date(dateISO).toLocaleDateString('fr-BE', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    // ===== STORE SIGNATURE IMAGE =====
    let signatureUrl: string | null = null;
    if (signatureBase64) {
      try {
        const sigData = signatureBase64.replace(/^data:image\/png;base64,/, '');
        const sigBytes = Buffer.from(sigData, 'base64');
        const sigFileName = `${worker.id}/signature.png`;

        await admin.storage
          .from('contracts')
          .upload(sigFileName, sigBytes, { contentType: 'image/png', upsert: true });

        const { data: sigUrlData } = await admin.storage
          .from('contracts')
          .createSignedUrl(sigFileName, 60 * 60 * 24 * 365 * 10);

        signatureUrl = sigUrlData?.signedUrl || null;
      } catch (e) {
        console.error('Signature upload error:', e);
      }
    }

    // ===== GENERATE PDF =====
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const W = 595; const H = 842; const M = 50; const TW = W - M * 2;
    const dark = rgb(0.15, 0.15, 0.15);
    const gray = rgb(0.35, 0.35, 0.35);
    const light = rgb(0.55, 0.55, 0.55);

    // ---- PAGE 1 ----
    let page = pdf.addPage([W, H]);
    let y = H - M;

    // Title
    page.drawText('Contrat-cadre pour la conclusion', { x: M, y, size: 15, font: fontBold, color: dark });
    y -= 20;
    page.drawText("d'un contrat de travail flexi-job", { x: M, y, size: 15, font: fontBold, color: dark });
    y -= 30;

    // ---- PARTIES ----
    page.drawText('Entre', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 18;
    const empLines = [
      'S.B.U.R.G.S. SRL, employeur',
      'Rue de Mons 2, n° 2',
      'à Jurbise, n° postal 7050',
      'Représenté par Michele Terrana, gérant',
    ];
    for (const l of empLines) {
      page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
      y -= 15;
    }
    y -= 10;

    page.drawText('et', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 18;
    const addr = worker.address_street
      ? `${worker.address_street}, n° ${worker.address_zip || ''}`
      : 'non renseigné';
    const city = worker.address_city || 'non renseigné';
    const zip = worker.address_zip || '';
    const wrkLines = [
      `${worker.first_name} ${worker.last_name}, travailleur`,
      `Rue ${worker.address_street || '.....................'}`,
      `à ${city}, n° postal ${zip}`,
    ];
    for (const l of wrkLines) {
      page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
      y -= 15;
    }
    y -= 15;

    page.drawText('Il est convenu ce qui suit :', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 25;

    // ---- ARTICLES (fidèles au CNT 13 Partena) ----
    const articles = [
      {
        t: 'Article 1',
        b: "Chacune des parties exprime, par le présent contrat-cadre, son intention de conclure un (plusieurs) contrat(s) de travail flexi-job. Le présent contrat-cadre ne contraint pas les parties à conclure effectivement un contrat de travail flexi-job et ne crée aucun droit dans leur chef.",
      },
      {
        t: 'Article 2',
        b: `Le présent contrat-cadre est conclu pour une durée indéterminée à partir du ${dateFR}.`,
      },
      {
        t: 'Article 3',
        b: "L'employeur propose au travailleur un contrat de travail flexi-job via le portail de gestion interne (FritOS Flexi), par notification sur le portail du travailleur, dans un délai de 24 heures avant le début de l'exécution du contrat de travail flexi-job. La proposition précisera la (les) fonction(s), la date de début d'exécution du contrat de travail flexi-job, le nombre d'heures de travail, etc.",
      },
      {
        t: 'Article 4',
        b: "La proposition de contrat de travail flexi-job faite par l'employeur est acceptée ou refusée par le travailleur dans un délai de 24 heures à compter de la réception de la proposition de l'employeur.",
      },
      {
        t: 'Article 5',
        b: "Dans le cadre de l'exécution du contrat de travail flexi-job, le travailleur assumera la (les) fonction(s) suivante(s) : polyvalent en restauration rapide (préparation, service, caisse, nettoyage) au sein des établissements MDjambo situés à Jurbise (Rue de Mons 2, 7050) et Boussu.",
      },
      {
        t: 'Article 6',
        b: `A la date du présent contrat-cadre, le salaire de base convenu est fixé à ${(worker.hourly_rate || 12.53).toFixed(2)} EUR nets de l'heure. Ne sont pas compris dans ce tarif horaire, les indemnités, primes et avantages, quelle que soit leur nature, auxquels le travailleur a droit conformément à une convention collective de travail. Le montant du flexisalaire (salaire de base augmenté des indemnités, primes et avantages) ne comprend pas le montant du flexipécule de vacances. Le montant du flexisalaire est fixé conformément aux dispositions de l'article 5 de la loi du 16 novembre 2015 portant des dispositions diverses en matière sociale.`,
      },
      {
        t: 'Article 7',
        b: "Une occupation dans le cadre d'un flexi-job est uniquement possible lorsque le travailleur salarié a déjà, chez un (ou plusieurs) autre(s) employeur(s), une occupation égale, au minimum, à 4/5e d'un emploi à temps plein d'une personne de référence du secteur dans lequel les prestations à 4/5e sont exécutées, durant le trimestre de référence T-3 et pour autant que, pendant la même période dans le trimestre T, le travailleur salarié : ne soit pas occupé auparavant ou en plus dans le cadre d'un autre contrat de travail avec l'employeur pour lequel il exerce le flexi-job ; ne se trouve pas dans une période couverte par une indemnité de rupture à charge de cet employeur ; ne se trouve pas dans un délai de préavis. La condition d'un emploi à 4/5e au cours du trimestre de référence T-3 n'est pas d'application lorsque le travailleur est un pensionné au trimestre T-2.",
      },
    ];

    for (const art of articles) {
      const sp = ensureSpace(pdf, y, 80, W, H, M);
      page = sp.page; y = sp.y;

      page.drawText(art.t, { x: M, y, size: 10, font: fontBold, color: dark });
      y -= 16;
      y = drawWrapped(page, art.b, M + 10, y, TW - 10, 9, font, gray);
      y -= 12;
    }

    // ---- SIGNATURE PAGE ----
    const sigPage = pdf.addPage([W, H]);
    let sy = H - M;

    sigPage.drawText(`Fait en deux exemplaires signés par les parties à Jurbise le ${dateFR}.`, {
      x: M, y: sy, size: 10, font, color: dark,
    });
    sy -= 35;

    // Two columns: worker left, employer right
    const colW = TW / 2 - 10;

    // Worker signature
    sigPage.drawText('Signature du travailleur', { x: M, y: sy, size: 10, font: fontBold, color: dark });
    sigPage.drawText("Signature de l'employeur", { x: M + colW + 20, y: sy, size: 10, font: fontBold, color: dark });
    sy -= 14;
    sigPage.drawText('(précédée de la mention manuscrite', { x: M, y: sy, size: 8, font: fontItalic, color: light });
    sigPage.drawText('ou de son délégué', { x: M + colW + 20, y: sy, size: 8, font: fontItalic, color: light });
    sy -= 11;
    sigPage.drawText('« lu et approuvé »)', { x: M, y: sy, size: 8, font: fontItalic, color: light });
    sy -= 20;

    // Embed worker signature
    if (signatureBase64) {
      try {
        const sigData = signatureBase64.replace(/^data:image\/png;base64,/, '');
        const sigBytes = Buffer.from(sigData, 'base64');
        const sigImage = await pdf.embedPng(sigBytes);
        const sigDims = sigImage.scale(0.5);
        const sigW = Math.min(sigDims.width, colW - 20);
        const sigH = (sigW / sigDims.width) * sigDims.height;

        // "lu et approuvé" text
        sigPage.drawText('Lu et approuvé', { x: M + 10, y: sy, size: 9, font: fontItalic, color: dark });
        sy -= sigH + 5;

        sigPage.drawImage(sigImage, { x: M + 10, y: sy, width: sigW, height: sigH });

        // Employer side
        sigPage.drawText('Michele Terrana', { x: M + colW + 30, y: sy + sigH - 5, size: 9, font, color: dark });
        sigPage.drawText('Gérant, S.B.U.R.G.S. SRL', { x: M + colW + 30, y: sy + sigH - 18, size: 8, font: fontItalic, color: gray });

        sy -= 15;
      } catch {
        sigPage.drawText('[Erreur chargement signature]', { x: M, y: sy, size: 10, font, color: rgb(0.8, 0.2, 0.2) });
        sy -= 20;
      }
    }

    // Underlines
    sy -= 10;
    sigPage.drawLine({ start: { x: M, y: sy }, end: { x: M + colW, y: sy }, thickness: 0.5, color: gray });
    sigPage.drawLine({ start: { x: M + colW + 20, y: sy }, end: { x: W - M, y: sy }, thickness: 0.5, color: gray });
    sy -= 15;
    sigPage.drawText(`${worker.first_name} ${worker.last_name}`, { x: M, y: sy, size: 9, font, color: dark });
    sigPage.drawText('Michele Terrana', { x: M + colW + 20, y: sy, size: 9, font, color: dark });

    // ---- Digital proof section ----
    sy -= 45;
    sigPage.drawText('Preuve de signature électronique', { x: M, y: sy, size: 9, font: fontBold, color: dark });
    sy -= 15;
    const meta = [
      `Nom : ${worker.first_name} ${worker.last_name}`,
      `Date et heure : ${dateStr}`,
      `Adresse IP : ${ip}`,
      `Email : ${user.email}`,
      `Identifiant : ${user.id}`,
    ];
    for (const m of meta) {
      sigPage.drawText(m, { x: M + 10, y: sy, size: 8, font, color: light });
      sy -= 11;
    }

    // ---- Footer ----
    sy -= 20;
    sigPage.drawText('CNT 13 — Contrat-cadre flexi-job', { x: M, y: sy, size: 7, font: fontItalic, color: light });
    sy -= 10;
    sigPage.drawText('Partena — association sans but lucratif — secrétariat social agréé d\'employeurs par A.M. du 3 mars 1949 sous le n° 300.', {
      x: M, y: sy, size: 6, font: fontItalic, color: light,
    });
    sy -= 9;
    sigPage.drawText('Siège social : Rue Ravenstein, 36 à 1000 Bruxelles. TVA BE 0409.536.968.', {
      x: M, y: sy, size: 6, font: fontItalic, color: light,
    });
    sy -= 9;
    sigPage.drawText('Le SSE Partena ne peut en aucun cas être tenu responsable pour l\'utilisation de ce modèle.', {
      x: M, y: sy, size: 6, font: fontItalic, color: light,
    });

    // Page footers
    const pages = pdf.getPages();
    pages.forEach((p: any, i: number) => {
      p.drawText(`Contrat-cadre — ${worker.first_name} ${worker.last_name} — Page ${i + 1}/${pages.length}`, {
        x: M, y: 25, size: 7, font: fontItalic, color: rgb(0.6, 0.6, 0.6),
      });
      p.drawText('Mis à jour au 1.1.2026', {
        x: W - M - 80, y: 25, size: 7, font: fontItalic, color: rgb(0.6, 0.6, 0.6),
      });
    });

    const pdfBytes = await pdf.save();

    // ===== UPLOAD PDF =====
    const fileName = `${user.id}/contrat-cadre-${dateISO}.pdf`;

    const { error: uploadError } = await admin.storage
      .from('contracts')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { error: `Erreur upload : ${uploadError.message}` };
    }

    const { data: urlData } = await admin.storage
      .from('contracts')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 10);

    const contractUrl = urlData?.signedUrl || fileName;

    // ===== UPDATE WORKER (contract date + signature URL) =====
    const { error: updateError } = await admin
      .from('flexi_workers')
      .update({
        framework_contract_date: dateISO,
        framework_contract_url: contractUrl,
        signature_url: signatureUrl,
      })
      .eq('id', worker.id);

    if (updateError) return { error: `Erreur mise à jour : ${updateError.message}` };

    revalidatePath('/flexi');
    revalidatePath('/flexi/contract');
    revalidatePath('/flexi/account');
    revalidatePath('/dashboard/flexis/workers');

    return { success: true, date: dateISO };
  } catch (err: any) {
    console.error('Contract signing error:', err);
    return { error: `Erreur : ${err.message}` };
  }
}


// ============================================================
// CONTRAT D'OCCUPATION D'ÉTUDIANT
// Basé sur le modèle officiel Partena CNT 6 — Mis à jour 01.01.2026
// 14 articles conformes au template original
// ============================================================

/**
 * Shared PDF generation for student contracts (used by both portail and kiosk)
 */
async function generateStudentContractPDF(
  worker: any,
  location: any,
  data: {
    contractDate: string;
    startTime: string;
    endTime: string;
    hourlyRate: number;
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

  const shiftDateFormatted = new Date(data.contractDate).toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const shiftDateShort = new Date(data.contractDate).toLocaleDateString('fr-BE');

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const W = 595; const H = 842; const M = 50; const TW = W - M * 2;
  const dark = rgb(0.15, 0.15, 0.15);
  const gray = rgb(0.35, 0.35, 0.35);
  const light = rgb(0.55, 0.55, 0.55);
  const red = rgb(0.7, 0.1, 0.1);

  let page = pdf.addPage([W, H]);
  let y = H - M;

  // ---- HEADER ----
  page.drawText("Contrat d'occupation d'étudiant", { x: M, y, size: 15, font: fontBold, color: dark });
  y -= 18;
  y = drawWrapped(page,
    "Le contrat d'occupation d'étudiant est un document social. Il doit être tenu sur le lieu de travail où l'étudiant est occupé et conservé pendant 5 ans à dater du jour qui suit celui de la fin de l'exécution du contrat.",
    M, y, TW, 8, fontItalic, red
  );
  y -= 15;

  // ---- PARTIES ----
  page.drawText('Entre', { x: M, y, size: 11, font: fontBold, color: gray });
  y -= 18;
  for (const l of [
    'S.B.U.R.G.S. SRL, employeur',
    'Rue de Mons, n° 2',
    'à Jurbise, n° postal 7050',
    'Représenté par Michele Terrana, gérant',
  ]) {
    page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
    y -= 15;
  }
  y -= 10;

  page.drawText('et', { x: M, y, size: 11, font: fontBold, color: gray });
  y -= 18;
  const dob = worker.date_of_birth
    ? new Date(worker.date_of_birth).toLocaleDateString('fr-BE')
    : '....................';
  const dobCity = worker.address_city || '....................';
  for (const l of [
    `${worker.first_name} ${worker.last_name}, étudiant(e)`,
    `Né(e) le ${dob} à ${dobCity}`,
    `Domicilié(e) rue ${worker.address_street || '.....................'}, n° ...`,
    `à ${worker.address_city || '.....................'}, n° postal ${worker.address_zip || '.........'}`,
  ]) {
    page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
    y -= 15;
  }
  y -= 15;

  page.drawText('Il est convenu ce qui suit :', { x: M, y, size: 11, font: fontBold, color: gray });
  y -= 22;

  // ---- 14 ARTICLES (fidèles au CNT 6 Partena) ----
  const articles: Array<{ t: string; b: string; note?: string }> = [
    {
      t: 'Article 1',
      b: "L'employeur engage l'étudiant pour remplir la fonction de polyvalent en restauration rapide et les tâches suivantes : préparation des commandes, service au comptoir, encaissement, nettoyage et entretien. Cette liste est indicative mais non limitative ; l'étudiant pourra donc être affecté à d'autres tâches similaires, pour autant que ce changement ne lui cause aucun préjudice matériel ou moral.",
    },
    {
      t: 'Article 2',
      b: `L'engagement est conclu pour une durée déterminée (maximum 12 mois) prenant cours le ${shiftDateFormatted} pour se terminer le ${shiftDateFormatted}.`,
    },
    {
      t: 'Article 3',
      b: "Les 3 premiers jours de travail sont considérés comme période d'essai.",
    },
    {
      t: 'Article 4',
      b: `L'étudiant est engagé pour travailler à : ${location?.name || 'MDjambo'} — ${location?.address || 'adresse de l\'établissement'}.`,
    },
    {
      t: 'Article 5',
      b: `La durée du travail est fixée à ${hours.toFixed(1)} heures et est répartie comme suit : le ${shiftDateFormatted} de ${data.startTime} à ${data.endTime}. Les jours de repos sont mentionnés dans le règlement de travail.`,
    },
    {
      t: 'Article 6',
      b: "La loi du 12 avril 1965 concernant la protection de la rémunération des travailleurs est applicable à ce contrat.",
    },
    {
      t: 'Article 7',
      b: `La rémunération convenue est fixée à ${data.hourlyRate.toFixed(2)} EUR bruts de l'heure.`,
    },
    {
      t: 'Article 8',
      b: `Le paiement de la rémunération sera effectué par banque sur le compte IBAN ${worker.iban || '.... .... .... ....'}${worker.bic ? ' BIC ' + worker.bic : ''}.`,
    },
    {
      t: 'Article 9',
      b: "Néant.",
      note: "(Éventuels avantages supplémentaires)",
    },
    {
      t: 'Article 10',
      b: "Les conditions de travail sont établies sur base des décisions de la commission paritaire n° 302 (Horeca).",
    },
    {
      t: 'Article 11',
      b: "Jusqu'à l'expiration de la période d'essai, l'employeur et l'étudiant pourront mettre fin au présent contrat sans préavis ni indemnité.",
    },
    {
      t: 'Article 12',
      b: "Après la période d'essai, l'employeur et l'étudiant peuvent mettre fin au présent contrat avant l'échéance fixée à l'article 2 moyennant un préavis écrit notifié à l'autre partie. Lorsque la durée de l'engagement ne dépasse pas 1 mois, le délai de préavis à observer par l'employeur est de 3 jours et celui à observer par l'étudiant est de 1 jour. Ces délais sont fixés respectivement à 7 jours et à 3 jours lorsque la durée de l'engagement dépasse 1 mois. Ces délais prennent cours le lundi qui suit la notification du préavis.",
    },
    {
      t: 'Article 13',
      b: "Pour le reste, le contrat est soumis aux dispositions de la loi du 3 juillet 1978 et de ses arrêtés d'application, de la loi du 26 décembre 2013 concernant l'introduction d'un statut unique entre ouvriers et employés, des conventions collectives de travail sectorielles ou interprofessionnelles rendues obligatoires et du règlement de travail.",
    },
    {
      t: 'Article 14',
      b: "L'étudiant reconnaît avoir reçu un exemplaire du présent contrat et une copie du règlement de travail. Il déclare en accepter les clauses et conditions.",
    },
  ];

  for (const art of articles) {
    const sp = ensureSpace(pdf, y, 70, W, H, M);
    page = sp.page; y = sp.y;

    page.drawText(art.t, { x: M, y, size: 10, font: fontBold, color: dark });
    if (art.note) {
      const noteW = font.widthOfTextAtSize(art.t, 10);
      page.drawText(`  ${art.note}`, { x: M + noteW + 5, y, size: 8, font: fontItalic, color: light });
    }
    y -= 15;
    y = drawWrapped(page, art.b, M + 10, y, TW - 10, 9, font, gray);
    y -= 8;
  }

  // ---- SIGNATURE SECTION ----
  const sp1 = ensureSpace(pdf, y, 200, W, H, M);
  page = sp1.page; y = sp1.y;

  y -= 10;
  page.drawText(`Fait en deux exemplaires signés par les parties à Jurbise, le ${shiftDateShort}.`, {
    x: M, y, size: 10, font, color: dark,
  });
  y -= 25;

  const colW = TW / 2 - 10;

  page.drawText("Signature de l'étudiant", { x: M, y, size: 10, font: fontBold, color: dark });
  page.drawText("Signature de l'employeur", { x: M + colW + 20, y, size: 10, font: fontBold, color: dark });
  y -= 12;
  page.drawText('(précédée de la mention manuscrite', { x: M, y, size: 7, font: fontItalic, color: light });
  page.drawText('ou de son délégué', { x: M + colW + 20, y, size: 7, font: fontItalic, color: light });
  y -= 10;
  page.drawText('« lu et approuvé »)', { x: M, y, size: 7, font: fontItalic, color: light });
  y -= 18;

  // Embed signature from framework contract if available
  let sigEmbedded = false;
  if (worker.signature_url) {
    try {
      const sigResponse = await fetch(worker.signature_url);
      if (sigResponse.ok) {
        const sigBytes = new Uint8Array(await sigResponse.arrayBuffer());
        const sigImage = await pdf.embedPng(sigBytes);
        const sigDims = sigImage.scale(0.4);
        const sigW = Math.min(sigDims.width, colW - 30);
        const sigH = (sigW / sigDims.width) * sigDims.height;

        page.drawText('Lu et approuvé', { x: M + 10, y: y, size: 8, font: fontItalic, color: dark });
        y -= sigH + 5;
        page.drawImage(sigImage, { x: M + 10, y, width: sigW, height: sigH });

        // Employer side
        page.drawText('Michele Terrana', { x: M + colW + 30, y: y + sigH - 5, size: 9, font, color: dark });
        page.drawText('Gérant', { x: M + colW + 30, y: y + sigH - 18, size: 8, font: fontItalic, color: gray });

        y -= 10;
        sigEmbedded = true;
      }
    } catch (e) {
      console.error('Failed to embed signature:', e);
    }
  }

  if (!sigEmbedded) {
    page.drawText('(Signature électronique — voir preuve ci-dessous)', { x: M + 10, y, size: 8, font: fontItalic, color: light });
    page.drawText('Michele Terrana, Gérant', { x: M + colW + 30, y, size: 9, font, color: dark });
    y -= 15;
  }

  // Underlines
  y -= 5;
  page.drawLine({ start: { x: M, y }, end: { x: M + colW, y }, thickness: 0.5, color: gray });
  page.drawLine({ start: { x: M + colW + 20, y }, end: { x: W - M, y }, thickness: 0.5, color: gray });
  y -= 15;
  page.drawText(`${worker.first_name} ${worker.last_name}`, { x: M, y, size: 9, font, color: dark });
  page.drawText('Michele Terrana', { x: M + colW + 20, y, size: 9, font, color: dark });

  // ---- INFORMATIONS DIVERSES (obligatoire CNT 6) ----
  const sp2 = ensureSpace(pdf, y, 160, W, H, M);
  page = sp2.page; y = sp2.y;

  y -= 25;
  page.drawText('Informations diverses', { x: M, y, size: 10, font: fontBold, color: dark });
  y -= 16;

  const infos = [
    'La boîte de secours à la disposition du personnel se trouve : en cuisine de chaque établissement MDjambo.',
    'Les premiers secours sont assurés par : Michele Terrana ou le responsable de service présent sur place.',
    'Le service externe pour la prévention et la protection au travail auquel l\'employeur est affilié est situé à : (à compléter par l\'employeur).',
    'La direction du contrôle des lois sociales (inspection) du district dans lequel l\'étudiant est occupé est située à : Rue du Miroir 8, 7000 Mons — tél. (02) 233.46.70.',
  ];
  for (const info of infos) {
    y = drawWrapped(page, '- ' + info, M + 5, y, TW - 10, 8, font, gray);
    y -= 6;
  }

  // ---- DIGITAL PROOF ----
  const sp3 = ensureSpace(pdf, y, 100, W, H, M);
  page = sp3.page; y = sp3.y;

  y -= 15;
  page.drawText('Preuve de signature électronique', { x: M, y, size: 9, font: fontBold, color: dark });
  y -= 14;

  const proofLines = [
    `Horodatage : ${signatureInfo.dateStr}`,
    `Adresse IP : ${signatureInfo.ip}`,
    `Méthode : Validation par ${signatureInfo.method === 'kiosque' ? 'PIN sur kiosque' : 'session authentifiée sur portail'}`,
    signatureInfo.geoLat ? `Géolocalisation : ${signatureInfo.geoLat.toFixed(6)}, ${signatureInfo.geoLng?.toFixed(6)}` : null,
    signatureInfo.email ? `Email : ${signatureInfo.email}` : null,
    signatureInfo.userId ? `Identifiant : ${signatureInfo.userId}` : null,
    signatureInfo.workerId ? `Worker ID : ${signatureInfo.workerId}` : null,
  ].filter(Boolean) as string[];

  for (const m of proofLines) {
    page.drawText(m, { x: M + 10, y, size: 8, font, color: light });
    y -= 11;
  }

  // ---- CNT 6 FOOTER ----
  y -= 15;
  page.drawText('CNT 6 — Étudiant', { x: M, y, size: 7, font: fontItalic, color: light });
  const fRight = 'Mis à jour au 01.01.2026';
  page.drawText(fRight, { x: W - M - font.widthOfTextAtSize(fRight, 7), y, size: 7, font: fontItalic, color: light });
  y -= 10;
  page.drawText('Partena — association sans but lucratif — secrétariat social agréé d\'employeurs par A.M. du 3 mars 1949 sous le n° 300.', {
    x: M, y, size: 6, font: fontItalic, color: light,
  });
  y -= 9;
  page.drawText('Siège social : Rue Ravenstein, 36 à 1000 Bruxelles. TVA BE 0409.536.968.', {
    x: M, y, size: 6, font: fontItalic, color: light,
  });
  y -= 9;
  page.drawText('Le SSE Partena ne peut en aucun cas être tenu responsable pour l\'utilisation de ce modèle.', {
    x: M, y, size: 6, font: fontItalic, color: light,
  });

  // Page footers
  const allPages = pdf.getPages();
  allPages.forEach((p: any, i: number) => {
    p.drawText(`Contrat étudiant — ${worker.first_name} ${worker.last_name} — ${shiftDateShort} — Page ${i + 1}/${allPages.length}`, {
      x: M, y: 25, size: 7, font: fontItalic, color: rgb(0.6, 0.6, 0.6),
    });
  });

  return pdf.save();
}


// ============================================================
// PORTAIL — Check + Sign student contract (authenticated)
// ============================================================

export async function checkStudentContract(shiftId: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { needed: false };

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id, status')
    .eq('user_id', user.id)
    .single();

  if (!worker || worker.status !== 'student') return { needed: false };

  const { data: shift } = await supabase
    .from('shifts')
    .select(`id, date, start_time, end_time, location_id, locations(id, name, address)`)
    .eq('id', shiftId)
    .single();

  if (!shift) return { needed: false };

  const { data: existing } = await supabase
    .from('student_contracts')
    .select('id')
    .eq('shift_id', shiftId)
    .maybeSingle();

  if (existing) return { needed: false, alreadySigned: true };

  const loc = (shift as any).locations;
  return {
    needed: true,
    contractData: {
      shiftId: shift.id,
      workerId: worker.id,
      locationId: shift.location_id,
      locationName: loc?.name || 'MDjambo',
      shiftDate: shift.date,
      startTime: shift.start_time?.slice(0, 5),
      endTime: shift.end_time?.slice(0, 5),
      hourlyRate: 12.53,
    },
  };
}

export async function signStudentContract(data: {
  shiftId: string;
  workerId: string;
  locationId: string;
  contractDate: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  geoLat?: number;
  geoLng?: number;
  userAgent?: string;
}) {
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  // Check not already signed
  const { data: existing } = await supabase
    .from('student_contracts')
    .select('id')
    .eq('shift_id', data.shiftId)
    .maybeSingle();

  if (existing) return { success: true, alreadySigned: true };

  // Get worker info (including signature_url)
  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('*')
    .eq('id', data.workerId)
    .single();

  if (!worker) return { error: 'Travailleur introuvable' };

  const { data: location } = await supabase
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

    const pdfBytes = await generateStudentContractPDF(worker, location, data, {
      dateStr,
      ip,
      method: 'portail',
      userId: user.id,
      email: user.email || undefined,
      geoLat: data.geoLat,
      geoLng: data.geoLng,
    });

    // Upload PDF
    const fileName = `${user.id}/contrat-etudiant-${data.contractDate}.pdf`;
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

    // Insert contract record
    const { data: contract, error } = await supabase
      .from('student_contracts')
      .insert({
        shift_id: data.shiftId,
        worker_id: data.workerId,
        location_id: data.locationId,
        contract_date: data.contractDate,
        start_time: data.startTime,
        end_time: data.endTime,
        hourly_rate: data.hourlyRate,
        signed_at: now.toISOString(),
        signed_ip: ip,
        signed_user_agent: data.userAgent,
        geo_lat: data.geoLat,
        geo_lng: data.geoLng,
        contract_pdf_url: pdfUrl,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath('/flexi/missions');
    return { success: true, contractId: contract.id };

  } catch (err: any) {
    console.error('Student contract error:', err);
    return { error: `Erreur : ${err.message}` };
  }
}


// ============================================================
// Get student contracts (for flexi portal)
// ============================================================

export async function getStudentContracts(workerId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('student_contracts')
    .select(`*, locations(name), shifts(date, start_time, end_time)`)
    .eq('worker_id', workerId)
    .order('contract_date', { ascending: false });

  if (error) return { error: error.message };
  return { data };
}


// ============================================================
// Get worker contracts as manager
// ============================================================

export async function getWorkerContractsAsManager(workerId: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const role = user.user_metadata?.role;
  if (role !== 'manager') return { error: 'Accès refusé' };

  const admin = createAdminClient();

  const { data: worker } = await admin
    .from('flexi_workers')
    .select('id, first_name, last_name, framework_contract_date, framework_contract_url')
    .eq('id', workerId)
    .single();

  const { data: studentContracts, error } = await admin
    .from('student_contracts')
    .select(`*, locations(name), shifts(date, start_time, end_time)`)
    .eq('worker_id', workerId)
    .order('contract_date', { ascending: false });

  if (error) return { error: error.message };

  return {
    frameworkContract: worker,
    studentContracts: studentContracts || [],
  };
}


// ============================================================
// KIOSK VERSIONS — No auth, PIN-verified, rate-limited
// ============================================================

export async function kioskCheckStudentContract(
  shiftId: string,
  workerId: string,
  pin: string,
) {
  const pinResult = await verifyPin(workerId, pin);
  if (!pinResult.success) {
    return { needed: false, error: pinResult.error, locked: 'locked' in pinResult && pinResult.locked };
  }

  const admin = createAdminClient();

  const { data: shift } = await admin
    .from('shifts')
    .select(`
      id, date, start_time, end_time, location_id,
      flexi_workers!inner(id, first_name, last_name, status, hourly_rate),
      locations!inner(id, name)
    `)
    .eq('id', shiftId)
    .single();

  if (!shift) return { needed: false };

  const w = (shift as any).flexi_workers;
  const loc = (shift as any).locations;

  if (w.status !== 'student') return { needed: false };

  const { data: existing } = await admin
    .from('student_contracts')
    .select('id')
    .eq('shift_id', shiftId)
    .maybeSingle();

  if (existing) return { needed: false, alreadySigned: true };

  return {
    needed: true,
    contractData: {
      shiftId: shift.id,
      workerId: w.id,
      locationId: shift.location_id,
      workerName: `${w.first_name} ${w.last_name}`,
      hourlyRate: w.hourly_rate || 12.53,
      shiftDate: shift.date,
      startTime: shift.start_time?.slice(0, 5),
      endTime: shift.end_time?.slice(0, 5),
      locationName: loc.name,
    },
  };
}

export async function kioskSignStudentContract(data: {
  shiftId: string;
  workerId: string;
  locationId: string;
  contractDate: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  pin: string;
  geoLat?: number;
  geoLng?: number;
  userAgent?: string;
}) {
  const pinResult = await verifyPin(data.workerId, data.pin);
  if (!pinResult.success) return { success: false, error: pinResult.error };

  const admin = createAdminClient();

  // Check not already signed
  const { data: existing } = await admin
    .from('student_contracts')
    .select('id')
    .eq('shift_id', data.shiftId)
    .maybeSingle();

  if (existing) return { success: true, alreadySigned: true };

  // Load full worker data SERVER-SIDE (including signature_url)
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

    const pdfBytes = await generateStudentContractPDF(worker, location, data, {
      dateStr,
      ip,
      method: 'kiosque',
      workerId: data.workerId,
      geoLat: data.geoLat,
      geoLng: data.geoLng,
    });

    // Upload PDF
    const fileName = `${data.workerId}/contrat-etudiant-${data.contractDate}.pdf`;
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

    // Insert contract record
    const { data: contract, error } = await admin
      .from('student_contracts')
      .insert({
        shift_id: data.shiftId,
        worker_id: data.workerId,
        location_id: data.locationId,
        contract_date: data.contractDate,
        start_time: data.startTime,
        end_time: data.endTime,
        hourly_rate: data.hourlyRate,
        signed_at: now.toISOString(),
        signed_ip: ip,
        signed_user_agent: data.userAgent,
        geo_lat: data.geoLat,
        geo_lng: data.geoLng,
        contract_pdf_url: pdfUrl,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath('/flexi/missions');
    return { success: true, contractId: contract.id };

  } catch (err: any) {
    console.error('Kiosk student contract error:', err);
    return { success: false, error: `Erreur : ${err.message}` };
  }
}
