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

// ============================================================
// CONTRAT-CADRE FLEXI-JOB (Modèle Partena CNT 13)
// ============================================================

/**
 * Sign the framework contract (contrat-cadre flexi-job)
 * Based on Partena CNT 13 template, updated 01.01.2026
 */
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

    // ===== GENERATE PDF =====
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const W = 595; const H = 842; const M = 50; const TW = W - M * 2;
    const dark = rgb(0.15, 0.15, 0.15);
    const gray = rgb(0.35, 0.35, 0.35);
    const light = rgb(0.55, 0.55, 0.55);

    // ---- PAGE 1: Contract ----
    let page = pdf.addPage([W, H]);
    let y = H - M;

    page.drawText('CONTRAT-CADRE POUR LA CONCLUSION', { x: M, y, size: 15, font: fontBold, color: dark });
    y -= 20;
    page.drawText("D'UN CONTRAT DE TRAVAIL FLEXI-JOB", { x: M, y, size: 15, font: fontBold, color: dark });
    y -= 18;
    page.drawText('Commission Paritaire 302 — Horeca', { x: M, y, size: 10, font: fontItalic, color: light });
    y -= 30;

    // Employer
    page.drawText('Entre', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 18;
    const empLines = [
      'S.B.U.R.G.S. SRL, employeur',
      'Rue de Mons 2, 7050 Jurbise',
      'BCE : 1009.237.290 — ONSS : 1009.237.290',
      'Représenté par Michele Terrana, gérant',
    ];
    for (const l of empLines) {
      page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
      y -= 15;
    }
    y -= 10;

    // Worker
    page.drawText('et', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 18;
    const dob = worker.date_of_birth
      ? new Date(worker.date_of_birth).toLocaleDateString('fr-BE')
      : 'non renseigné';
    const addr = worker.address_street
      ? `${worker.address_street}, ${worker.address_zip || ''} ${worker.address_city || ''}`
      : 'non renseigné';
    const wrkLines = [
      `${worker.first_name} ${worker.last_name}, travailleur`,
      `Adresse : ${addr}`,
      `Né(e) le : ${dob}`,
      `NISS : ${worker.niss || 'non renseigné'}`,
    ];
    for (const l of wrkLines) {
      page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
      y -= 15;
    }
    y -= 15;

    page.drawText('Il est convenu ce qui suit :', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 22;

    // Articles conformes au modèle Partena CNT 13
    const articles = [
      {
        t: 'Article 1 — Objet',
        b: "Chacune des parties exprime, par le présent contrat-cadre, son intention de conclure un ou plusieurs contrat(s) de travail flexi-job. Le présent contrat-cadre ne contraint pas les parties à conclure effectivement un contrat de travail flexi-job et ne crée aucun droit dans leur chef.",
      },
      {
        t: 'Article 2 — Durée',
        b: `Le présent contrat-cadre est conclu pour une durée indéterminée à partir du ${new Date(dateISO).toLocaleDateString('fr-BE')}.`,
      },
      {
        t: 'Article 3 — Proposition de contrat',
        b: "L'employeur propose au travailleur un contrat de travail flexi-job via le portail FritOS Flexi (fritos-flexi.vercel.app), par notification sur le portail du travailleur, dans un délai minimum de 24 heures avant le début de l'exécution du contrat de travail flexi-job. La proposition précisera la date, le lieu (Jurbise ou Boussu), l'horaire et la fonction.",
      },
      {
        t: 'Article 4 — Acceptation ou refus',
        b: "La proposition de contrat de travail flexi-job faite par l'employeur est acceptée ou refusée par le travailleur via le portail FritOS Flexi dans un délai de 24 heures à compter de la réception de la proposition. L'acceptation sur le portail vaut accord du travailleur.",
      },
      {
        t: 'Article 5 — Fonction',
        b: "Dans le cadre de l'exécution du contrat de travail flexi-job, le travailleur assumera la fonction de polyvalent en restauration rapide (préparation, service, caisse, nettoyage) au sein des établissements MDjambo Jurbise (Rue de Mons 2, 7050 Jurbise) et MDjambo Boussu (adresse Boussu).",
      },
      {
        t: 'Article 6 — Rémunération',
        b: `A la date du présent contrat-cadre, le salaire de base convenu est fixé à ${worker.hourly_rate || '12,53'} EUR nets de l'heure (minimum horeca CP 302, pécule de vacances 7,67% inclus). Ce montant sera adapté conformément aux indexations légales. Ne sont pas compris les éventuelles primes dimanche/jour férié (+2 EUR/h, max 12 EUR/jour). Le montant du flexisalaire est fixé conformément aux dispositions de l'article 5 de la loi du 16 novembre 2015.`,
      },
      {
        t: 'Article 7 — Conditions légales',
        b: "Le travailleur déclare satisfaire aux conditions légales pour exercer un flexi-job. Une occupation dans le cadre d'un flexi-job est uniquement possible lorsque le travailleur salarié a déjà, chez un ou plusieurs autre(s) employeur(s), une occupation égale au minimum à 4/5e d'un emploi à temps plein durant le trimestre de référence T-3. Cette condition n'est pas d'application pour les pensionnés.",
      },
    ];

    for (const art of articles) {
      if (y < 100) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
      const targetPage = pdf.getPages()[pdf.getPageCount() - 1];
      targetPage.drawText(art.t, { x: M, y, size: 10, font: fontBold, color: dark });
      y -= 15;
      y = drawWrapped(targetPage, art.b, M + 10, y, TW - 10, 9, font, gray);
      y -= 10;
    }

    // ---- SIGNATURE PAGE ----
    const sigPage = pdf.addPage([W, H]);
    let sy = H - M;

    sigPage.drawText('SIGNATURE ÉLECTRONIQUE', { x: M, y: sy, size: 14, font: fontBold, color: dark });
    sy -= 28;

    sy = drawWrapped(sigPage,
      "Fait en deux exemplaires. Le travailleur déclare avoir pris connaissance de l'intégralité du présent contrat-cadre et en accepter les termes.",
      M, sy, TW, 10, font, gray
    );
    sy -= 25;

    // Embed signature
    if (signatureBase64) {
      try {
        const sigData = signatureBase64.replace(/^data:image\/png;base64,/, '');
        const sigBytes = Buffer.from(sigData, 'base64');
        const sigImage = await pdf.embedPng(sigBytes);
        const sigDims = sigImage.scale(0.5);
        const sigW = Math.min(sigDims.width, 280);
        const sigH = (sigW / sigDims.width) * sigDims.height;

        sigPage.drawText('Signature du travailleur :', { x: M, y: sy, size: 10, font: fontBold, color: dark });
        sy -= 8;

        sigPage.drawRectangle({
          x: M, y: sy - sigH - 15, width: sigW + 20, height: sigH + 20,
          borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1, color: rgb(0.98, 0.98, 0.98),
        });
        sigPage.drawImage(sigImage, { x: M + 10, y: sy - sigH - 5, width: sigW, height: sigH });
        sy -= sigH + 35;
      } catch {
        sigPage.drawText('[Erreur chargement signature]', { x: M, y: sy, size: 10, font, color: rgb(0.8, 0.2, 0.2) });
        sy -= 20;
      }
    }

    sy -= 15;
    sigPage.drawText('Informations de signature :', { x: M, y: sy, size: 10, font: fontBold, color: dark });
    sy -= 18;

    const meta = [
      `Nom complet : ${worker.first_name} ${worker.last_name}`,
      `NISS : ${worker.niss || 'non renseigné'}`,
      `Date et heure : ${dateStr}`,
      `Adresse IP : ${ip}`,
      `Identifiant unique : ${user.id}`,
      `Email : ${user.email}`,
    ];
    for (const m of meta) {
      sigPage.drawText(m, { x: M + 10, y: sy, size: 9, font, color: light });
      sy -= 14;
    }

    sy -= 25;
    sigPage.drawText('Ce document constitue la preuve de signature électronique du contrat-cadre', {
      x: M, y: sy, size: 8, font: fontItalic, color: light,
    });
    sy -= 11;
    sigPage.drawText('flexi-job entre S.B.U.R.G.S. SRL et le travailleur identifié ci-dessus.', {
      x: M, y: sy, size: 8, font: fontItalic, color: light,
    });
    sy -= 11;
    sigPage.drawText('Modèle conforme au CNT 13 — Partena Professional — Mis à jour au 01.01.2026', {
      x: M, y: sy, size: 7, font: fontItalic, color: light,
    });

    // Footer all pages
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      p.drawText(`Contrat-cadre — ${worker.first_name} ${worker.last_name} — Page ${i + 1}/${pages.length}`, {
        x: M, y: 25, size: 7, font: fontItalic, color: rgb(0.6, 0.6, 0.6),
      });
      p.drawText(`Généré le ${dateStr}`, {
        x: W - M - 100, y: 25, size: 7, font: fontItalic, color: rgb(0.6, 0.6, 0.6),
      });
    });

    const pdfBytes = await pdf.save();

    // ===== UPLOAD =====
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

    // ===== UPDATE WORKER =====
    const { error: updateError } = await admin
      .from('flexi_workers')
      .update({
        framework_contract_date: dateISO,
        framework_contract_url: contractUrl,
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
// CONTRAT ÉTUDIANT JOURNALIER (Modèle Partena CNT 6)
// ============================================================

/**
 * Check if a student needs to sign a daily contract before clocking in
 */
export async function checkStudentContract(shiftId: string) {
  const supabase = createClient();

  const { data: shift } = await supabase
    .from('shifts')
    .select(`
      id, date, start_time, end_time, location_id,
      flexi_workers!inner(id, first_name, last_name, status, niss,
        date_of_birth, address_street, address_city, address_zip,
        hourly_rate, iban),
      locations!inner(id, name, address)
    `)
    .eq('id', shiftId)
    .single();

  if (!shift) return { needed: false };

  // Only students need daily contracts
  if (shift.flexi_workers.status !== 'student') {
    return { needed: false };
  }

  // Check if already signed
  const { data: existing } = await supabase
    .from('student_contracts')
    .select('id')
    .eq('shift_id', shiftId)
    .maybeSingle();

  if (existing) {
    return { needed: false, alreadySigned: true };
  }

  const w = shift.flexi_workers;
  return {
    needed: true,
    contractData: {
      shiftId: shift.id,
      workerId: w.id,
      locationId: shift.location_id,
      workerName: `${w.first_name} ${w.last_name}`,
      workerDob: w.date_of_birth,
      workerNiss: w.niss,
      workerAddress: [w.address_street, w.address_zip, w.address_city].filter(Boolean).join(', '),
      workerIban: w.iban || '',
      hourlyRate: w.hourly_rate || 12.53,
      shiftDate: shift.date,
      startTime: shift.start_time?.slice(0, 5),
      endTime: shift.end_time?.slice(0, 5),
      locationName: shift.locations.name,
      locationAddress: shift.locations.address,
    },
  };
}

/**
 * Sign student contract + generate PDF proof
 * Based on Partena CNT 6 template, updated 01.01.2026
 */
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

  // Get worker info for PDF
  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('*')
    .eq('id', data.workerId)
    .single();

  if (!worker) return { error: 'Travailleur introuvable' };

  // Get location
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

    // Calculate hours
    const [sh, sm] = data.startTime.split(':').map(Number);
    const [eh, em] = data.endTime.split(':').map(Number);
    const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;

    const shiftDateFormatted = new Date(data.contractDate).toLocaleDateString('fr-BE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    // ===== GENERATE PDF =====
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

    // Header
    page.drawText("CONTRAT D'OCCUPATION D'ÉTUDIANT", { x: M, y, size: 15, font: fontBold, color: dark });
    y -= 18;
    page.drawText('Commission Paritaire 302 — Horeca', { x: M, y, size: 10, font: fontItalic, color: light });
    y -= 15;
    page.drawText('Document social — à conserver 5 ans', { x: M, y, size: 9, font: fontItalic, color: red });
    y -= 30;

    // Employer
    page.drawText('Entre', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 18;
    for (const l of [
      'S.B.U.R.G.S. SRL, employeur',
      'Rue de Mons 2, 7050 Jurbise',
      'BCE : 1009.237.290',
      'Représenté par Michele Terrana, gérant',
    ]) {
      page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
      y -= 15;
    }
    y -= 10;

    // Student
    page.drawText('et', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 18;
    const dob = worker.date_of_birth
      ? new Date(worker.date_of_birth).toLocaleDateString('fr-BE')
      : 'non renseigné';
    const addr = worker.address_street
      ? `${worker.address_street}, ${worker.address_zip || ''} ${worker.address_city || ''}`
      : 'non renseigné';
    for (const l of [
      `${worker.first_name} ${worker.last_name}, étudiant(e)`,
      `Né(e) le ${dob}`,
      `Domicilié(e) : ${addr}`,
      `NISS : ${worker.niss || 'non renseigné'}`,
    ]) {
      page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
      y -= 15;
    }
    y -= 15;

    page.drawText('Il est convenu ce qui suit :', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 22;

    // Articles conformes au modèle Partena CNT 6
    const articles = [
      {
        t: 'Article 1 — Fonction',
        b: `L'employeur engage l'étudiant pour remplir la fonction de polyvalent en restauration rapide et les tâches suivantes : préparation des commandes, service au comptoir, encaissement, nettoyage et entretien. Cette liste est indicative mais non limitative.`,
      },
      {
        t: 'Article 2 — Durée',
        b: `L'engagement est conclu pour une durée déterminée prenant cours le ${shiftDateFormatted} pour se terminer le ${shiftDateFormatted} (contrat journalier).`,
      },
      {
        t: 'Article 3 — Période d\'essai',
        b: 'Les 3 premiers jours de travail sont considérés comme période d\'essai.',
      },
      {
        t: 'Article 4 — Lieu de travail',
        b: `L'étudiant est engagé pour travailler à ${location?.name || 'MDjambo'} — ${location?.address || 'adresse de l\'établissement'}.`,
      },
      {
        t: 'Article 5 — Horaire de travail',
        b: `La durée du travail pour cette prestation est fixée de ${data.startTime} à ${data.endTime}, soit ${hours.toFixed(1)} heures. Les jours de repos sont mentionnés dans le règlement de travail.`,
      },
      {
        t: 'Article 6 — Rémunération',
        b: `La rémunération convenue est fixée à ${data.hourlyRate.toFixed(2)} EUR bruts de l'heure. La loi du 12 avril 1965 concernant la protection de la rémunération est applicable.`,
      },
      {
        t: 'Article 7 — Paiement',
        b: `Le paiement de la rémunération sera effectué par virement bancaire sur le compte IBAN ${worker.iban || '[à compléter]'}.`,
      },
      {
        t: 'Article 8 — Commission paritaire',
        b: 'Les conditions de travail sont établies sur base des décisions de la commission paritaire n° 302 (Horeca).',
      },
      {
        t: 'Article 9 — Préavis',
        b: "Jusqu'à l'expiration de la période d'essai, les parties peuvent mettre fin au contrat sans préavis ni indemnité. Après la période d'essai, un préavis de 3 jours (employeur) ou 1 jour (étudiant) est requis si l'engagement ne dépasse pas 1 mois.",
      },
      {
        t: 'Article 10 — Dispositions légales',
        b: "Le contrat est soumis aux dispositions de la loi du 3 juillet 1978 relative aux contrats de travail, de la loi du 26 décembre 2013 et des conventions collectives de travail applicables. L'étudiant reconnaît avoir reçu un exemplaire du présent contrat et une copie du règlement de travail.",
      },
    ];

    for (const art of articles) {
      if (y < 80) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
      const targetPage = pdf.getPages()[pdf.getPageCount() - 1];
      targetPage.drawText(art.t, { x: M, y, size: 10, font: fontBold, color: dark });
      y -= 15;
      y = drawWrapped(targetPage, art.b, M + 10, y, TW - 10, 9, font, gray);
      y -= 8;
    }

    // Legal info section
    if (y < 120) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
    const infoPage = pdf.getPages()[pdf.getPageCount() - 1];
    y -= 10;
    infoPage.drawText('Informations légales', { x: M, y, size: 10, font: fontBold, color: dark });
    y -= 15;
    for (const l of [
      'Boîte de secours : Cuisine de chaque établissement MDjambo',
      'Premiers secours : Michele Terrana ou responsable de service présent',
      'Direction du contrôle des lois sociales : Rue du Miroir 8, 7000 Mons — tél. (02) 233.46.70',
    ]) {
      infoPage.drawText(l, { x: M + 10, y, size: 8, font, color: gray });
      y -= 12;
    }

    // Signature section
    y -= 20;
    infoPage.drawText('Fait en deux exemplaires.', { x: M, y, size: 10, font: fontBold, color: dark });
    y -= 20;

    infoPage.drawText("L'employeur :", { x: M, y, size: 10, font: fontBold, color: dark });
    infoPage.drawText("L'étudiant(e) :", { x: M + TW / 2 + 10, y, size: 10, font: fontBold, color: dark });
    y -= 15;
    infoPage.drawText('Michele Terrana', { x: M, y, size: 9, font, color: dark });
    infoPage.drawText(`${worker.first_name} ${worker.last_name}`, { x: M + TW / 2 + 10, y, size: 9, font, color: dark });
    y -= 15;
    infoPage.drawText(`Date : ${shiftDateFormatted}`, { x: M, y, size: 9, font, color: dark });
    infoPage.drawText(`Validé digitalement le ${dateStr}`, { x: M + TW / 2 + 10, y, size: 9, font: fontItalic, color: light });
    y -= 25;

    // Digital signature metadata
    infoPage.drawText('Preuve de signature digitale :', { x: M, y, size: 9, font: fontBold, color: dark });
    y -= 14;
    for (const m of [
      `Horodatage : ${dateStr}`,
      `Adresse IP : ${ip}`,
      `Géolocalisation : ${data.geoLat?.toFixed(6) || 'N/A'}, ${data.geoLng?.toFixed(6) || 'N/A'}`,
      `Identifiant : ${user.id}`,
      `Email : ${user.email}`,
    ]) {
      infoPage.drawText(m, { x: M + 10, y, size: 8, font, color: light });
      y -= 11;
    }

    y -= 15;
    infoPage.drawText("L'acceptation via le portail FritOS Flexi vaut signature électronique (Règlement eIDAS art. 3.10).", {
      x: M, y, size: 7, font: fontItalic, color: light,
    });
    y -= 10;
    infoPage.drawText('Modèle conforme au CNT 6 — Partena Professional — Mis à jour au 01.01.2026', {
      x: M, y, size: 7, font: fontItalic, color: light,
    });

    // Footer all pages
    const allPages = pdf.getPages();
    allPages.forEach((p, i) => {
      p.drawText(`Contrat étudiant — ${worker.first_name} ${worker.last_name} — ${shiftDateFormatted} — Page ${i + 1}/${allPages.length}`, {
        x: M, y: 25, size: 7, font: fontItalic, color: rgb(0.6, 0.6, 0.6),
      });
    });

    const pdfBytes = await pdf.save();

    // Upload PDF
    const fileName = `${user.id}/contrat-etudiant-${data.contractDate}.pdf`;
    const { error: uploadError } = await admin.storage
      .from('contracts')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true });

    let pdfUrl: string | null = null;
    if (!uploadError) {
      const { data: urlData } = await admin.storage
        .from('contracts')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 5); // 5 years
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

/**
 * Get all signed student contracts for a worker
 */
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
// KIOSK VERSIONS — No auth required, PIN-verified, rate-limited
// ============================================================


/**
 * KIOSK version — Check if a student needs to sign a daily contract
 * SECURE: Requires PIN verification, returns only safe display data
 * (no NISS, IBAN, address sent to client)
 */
export async function kioskCheckStudentContract(
  shiftId: string,
  workerId: string,
  pin: string,
) {
  // Verify PIN first — no data leaks without valid PIN
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

  // Only students need daily contracts
  if (w.status !== 'student') {
    return { needed: false };
  }

  // Check if already signed
  const { data: existing } = await admin
    .from('student_contracts')
    .select('id')
    .eq('shift_id', shiftId)
    .maybeSingle();

  if (existing) {
    return { needed: false, alreadySigned: true };
  }

  // Return ONLY safe display data — no NISS, IBAN, address
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

/**
 * KIOSK version — Sign student contract without auth session
 * SECURE: Uses verifyPin with rate limiting
 * Loads ALL sensitive data server-side for PDF (never sent to client)
 */
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
  // Verify PIN with rate limiting
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

  // Load full worker data SERVER-SIDE (never exposed to client)
  const { data: worker } = await admin
    .from('flexi_workers')
    .select('*')
    .eq('id', data.workerId)
    .single();

  if (!worker) return { success: false, error: 'Travailleur introuvable' };

  // Load location
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

    const [sh, sm] = data.startTime.split(':').map(Number);
    const [eh, em] = data.endTime.split(':').map(Number);
    const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;

    const shiftDateFormatted = new Date(data.contractDate).toLocaleDateString('fr-BE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    // ===== GENERATE PDF =====
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

    page.drawText("CONTRAT D'OCCUPATION D'ÉTUDIANT", { x: M, y, size: 15, font: fontBold, color: dark });
    y -= 18;
    page.drawText('Commission Paritaire 302 — Horeca', { x: M, y, size: 10, font: fontItalic, color: light });
    y -= 15;
    page.drawText('Document social — à conserver 5 ans', { x: M, y, size: 9, font: fontItalic, color: red });
    y -= 30;

    page.drawText('Entre', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 18;
    for (const l of [
      'S.B.U.R.G.S. SRL, employeur',
      'Rue de Mons 2, 7050 Jurbise',
      'BCE : 1009.237.290',
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
      : 'non renseigné';
    const addr = worker.address_street
      ? `${worker.address_street}, ${worker.address_zip || ''} ${worker.address_city || ''}`
      : 'non renseigné';
    for (const l of [
      `${worker.first_name} ${worker.last_name}, étudiant(e)`,
      `Né(e) le ${dob}`,
      `Domicilié(e) : ${addr}`,
      `NISS : ${worker.niss || 'non renseigné'}`,
    ]) {
      page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
      y -= 15;
    }
    y -= 15;

    page.drawText('Il est convenu ce qui suit :', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 22;

    const articles = [
      {
        t: 'Article 1 — Fonction',
        b: "L'employeur engage l'étudiant pour remplir la fonction de polyvalent en restauration rapide et les tâches suivantes : préparation des commandes, service au comptoir, encaissement, nettoyage et entretien.",
      },
      {
        t: 'Article 2 — Durée',
        b: `L'engagement est conclu pour une durée déterminée prenant cours le ${shiftDateFormatted} pour se terminer le ${shiftDateFormatted} (contrat journalier).`,
      },
      {
        t: "Article 3 — Période d'essai",
        b: "Les 3 premiers jours de travail sont considérés comme période d'essai.",
      },
      {
        t: 'Article 4 — Lieu de travail',
        b: `L'étudiant est engagé pour travailler à ${location?.name || 'MDjambo'} — ${location?.address || "adresse de l'établissement"}.`,
      },
      {
        t: 'Article 5 — Horaire de travail',
        b: `La durée du travail pour cette prestation est fixée de ${data.startTime} à ${data.endTime}, soit ${hours.toFixed(1)} heures.`,
      },
      {
        t: 'Article 6 — Rémunération',
        b: `La rémunération convenue est fixée à ${data.hourlyRate.toFixed(2)} EUR bruts de l'heure.`,
      },
      {
        t: 'Article 7 — Paiement',
        b: `Le paiement de la rémunération sera effectué par virement bancaire sur le compte IBAN ${worker.iban || '[à compléter]'}.`,
      },
      {
        t: 'Article 8 — Commission paritaire',
        b: 'Les conditions de travail sont établies sur base des décisions de la commission paritaire n° 302 (Horeca).',
      },
      {
        t: 'Article 9 — Préavis',
        b: "Après la période d'essai, un préavis de 3 jours (employeur) ou 1 jour (étudiant) est requis si l'engagement ne dépasse pas 1 mois.",
      },
      {
        t: 'Article 10 — Dispositions légales',
        b: "Le contrat est soumis aux dispositions de la loi du 3 juillet 1978 relative aux contrats de travail et de la loi du 26 décembre 2013.",
      },
    ];

    for (const art of articles) {
      if (y < 80) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
      const targetPage = pdf.getPages()[pdf.getPageCount() - 1];
      targetPage.drawText(art.t, { x: M, y, size: 10, font: fontBold, color: dark });
      y -= 15;
      y = drawWrapped(targetPage, art.b, M + 10, y, TW - 10, 9, font, gray);
      y -= 8;
    }

    // Legal info section
    if (y < 120) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
    const infoPage = pdf.getPages()[pdf.getPageCount() - 1];
    y -= 10;
    infoPage.drawText('Informations légales', { x: M, y, size: 10, font: fontBold, color: dark });
    y -= 15;
    for (const l of [
      'Boîte de secours : Cuisine de chaque établissement MDjambo',
      'Premiers secours : Michele Terrana ou responsable de service présent',
      'Direction du contrôle des lois sociales : Rue du Miroir 8, 7000 Mons — tél. (02) 233.46.70',
    ]) {
      infoPage.drawText(l, { x: M + 10, y, size: 8, font, color: gray });
      y -= 12;
    }

    // Signature section
    y -= 20;
    infoPage.drawText('Fait en deux exemplaires.', { x: M, y, size: 10, font: fontBold, color: dark });
    y -= 20;

    infoPage.drawText("L'employeur :", { x: M, y, size: 10, font: fontBold, color: dark });
    infoPage.drawText("L'étudiant(e) :", { x: M + TW / 2 + 10, y, size: 10, font: fontBold, color: dark });
    y -= 15;
    infoPage.drawText('Michele Terrana', { x: M, y, size: 9, font, color: dark });
    infoPage.drawText(`${worker.first_name} ${worker.last_name}`, { x: M + TW / 2 + 10, y, size: 9, font, color: dark });
    y -= 15;
    infoPage.drawText(`Date : ${shiftDateFormatted}`, { x: M, y, size: 9, font, color: dark });
    infoPage.drawText(`Validé digitalement le ${dateStr}`, { x: M + TW / 2 + 10, y, size: 9, font: fontItalic, color: light });
    y -= 25;

    // Digital proof
    infoPage.drawText('Preuve de signature digitale :', { x: M, y, size: 9, font: fontBold, color: dark });
    y -= 14;
    for (const m of [
      `Horodatage : ${dateStr}`,
      `Adresse IP : ${ip}`,
      `Géolocalisation : ${data.geoLat?.toFixed(6) || 'N/A'}, ${data.geoLng?.toFixed(6) || 'N/A'}`,
      `Méthode : Validation par PIN kiosque`,
      `Worker ID : ${data.workerId}`,
    ]) {
      infoPage.drawText(m, { x: M + 10, y, size: 8, font, color: light });
      y -= 11;
    }

    y -= 15;
    infoPage.drawText("L'acceptation via le kiosque FritOS Flexi vaut signature électronique (Règlement eIDAS art. 3.10).", {
      x: M, y, size: 7, font: fontItalic, color: light,
    });
    y -= 10;
    infoPage.drawText('Modèle conforme au CNT 6 — Partena Professional — Mis à jour au 01.01.2026', {
      x: M, y, size: 7, font: fontItalic, color: light,
    });

    // Footer all pages
    const allPages = pdf.getPages();
    allPages.forEach((p, i) => {
      p.drawText(`Contrat étudiant — ${worker.first_name} ${worker.last_name} — ${shiftDateFormatted} — Page ${i + 1}/${allPages.length}`, {
        x: M, y: 25, size: 7, font: fontItalic, color: rgb(0.6, 0.6, 0.6),
      });
    });

    const pdfBytes = await pdf.save();

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
