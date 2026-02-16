'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Sign the framework contract (contrat-cadre)
 * Generates a signed PDF with signature image + metadata, uploads to Supabase Storage
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

    const W = 595; // A4
    const H = 842;
    const M = 50;
    const TW = W - M * 2;

    // Helper: draw wrapped text, returns new Y position
    function drawWrapped(page: any, text: string, x: number, startY: number, maxW: number, size: number, f: any, color: any): number {
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

    // ---- PAGE 1: Contract ----
    let page = pdf.addPage([W, H]);
    let y = H - M;
    const dark = rgb(0.15, 0.15, 0.15);
    const gray = rgb(0.35, 0.35, 0.35);
    const light = rgb(0.55, 0.55, 0.55);

    page.drawText('CONTRAT-CADRE FLEXI-JOB', { x: M, y, size: 18, font: fontBold, color: dark });
    y -= 22;
    page.drawText('Commission Paritaire 302 — Horeca', { x: M, y, size: 10, font: fontItalic, color: light });
    y -= 35;

    // Employer
    page.drawText('ENTRE', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 18;
    const empLines = [
      'L\'employeur :',
      'S.B.U.R.G.S. SRL (nom commercial : MDjambo)',
      'Lieux d\'exploitation : MDjambo Jurbise et MDjambo Boussu',
      'Représenté par : Michele Djambo, gérant',
    ];
    for (const l of empLines) {
      page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
      y -= 15;
    }
    y -= 10;

    // Worker
    page.drawText('ET', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 18;
    const dob = worker.date_of_birth
      ? new Date(worker.date_of_birth).toLocaleDateString('fr-BE')
      : 'non renseigné';
    const addr = worker.address_street
      ? `${worker.address_street}, ${worker.address_zip || ''} ${worker.address_city || ''}`
      : 'non renseigné';
    const wrkLines = [
      'Le travailleur flexi-job :',
      `Nom : ${worker.last_name || '—'}    Prénom : ${worker.first_name || '—'}`,
      `Date de naissance : ${dob}`,
      `NISS : ${worker.niss || 'non renseigné'}`,
      `Adresse : ${addr}`,
      `Email : ${worker.email}`,
    ];
    for (const l of wrkLines) {
      page.drawText(l, { x: M + 10, y, size: 10, font, color: dark });
      y -= 15;
    }
    y -= 15;

    page.drawText('IL EST CONVENU CE QUI SUIT :', { x: M, y, size: 11, font: fontBold, color: gray });
    y -= 22;

    // Articles
    const articles = [
      { t: 'Article 1 — Objet', b: 'Le présent contrat-cadre est conclu dans le cadre de la réglementation relative aux flexi-jobs (Loi du 16 novembre 2015, modifiée). Il définit les conditions générales dans lesquelles le travailleur pourra effectuer des prestations de travail pour l\'employeur.' },
      { t: 'Article 2 — Fonction et lieux de travail', b: 'Le travailleur exercera la fonction de collaborateur polyvalent en restauration rapide (friterie). Les prestations peuvent avoir lieu dans l\'un ou l\'autre des établissements : MDjambo Jurbise et MDjambo Boussu.' },
      { t: 'Article 3 — Rémunération', b: `Le flexi-salaire horaire est fixé à ${worker.hourly_rate || '12,53'} EUR brut/net (pécule de vacances de 7,67% inclus), conformément au minimum sectoriel CP 302. Ce salaire est exonéré d'impôt et de cotisations sociales personnelles. Prime dimanche/jour férié : 2 EUR/h (max 12 EUR/jour).` },
      { t: 'Article 4 — Horaires et planning', b: 'Les horaires de travail seront communiqués via la plateforme FritOS Flexi. Le travailleur est libre d\'accepter ou de refuser chaque mission proposée. Chaque prestation acceptée fera l\'objet d\'une déclaration Dimona préalable auprès de l\'ONSS.' },
      { t: 'Article 5 — Obligations du travailleur', b: 'Le travailleur s\'engage à : se présenter aux heures convenues, pointer son arrivée et son départ via le système de pointage, respecter les règles d\'hygiène et de sécurité alimentaire, signaler toute indisponibilité dans les meilleurs délais.' },
      { t: 'Article 6 — Plafond fiscal', b: 'Les revenus flexi-job sont exonérés d\'impôt jusqu\'à 18 000 EUR par an (sauf pensionnés, illimité). Au-delà, les revenus sont imposés normalement. Le travailleur est responsable du suivi de son compteur via mycareer.be.' },
      { t: 'Article 7 — Durée et résiliation', b: 'Le présent contrat-cadre est conclu pour une durée indéterminée. Il peut être résilié par l\'une ou l\'autre partie moyennant un préavis écrit.' },
    ];

    for (const art of articles) {
      if (y < 100) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
      page.drawText(art.t, { x: M, y, size: 10, font: fontBold, color: dark });
      y -= 15;
      y = drawWrapped(page, art.b, M + 10, y, TW - 10, 9, font, gray);
      y -= 10;
    }

    // ---- SIGNATURE PAGE ----
    const sigPage = pdf.addPage([W, H]);
    let sy = H - M;

    sigPage.drawText('SIGNATURE ÉLECTRONIQUE', { x: M, y: sy, size: 14, font: fontBold, color: dark });
    sy -= 28;

    sy = drawWrapped(sigPage,
      'Le travailleur déclare avoir pris connaissance de l\'intégralité du présent contrat-cadre et en accepter les termes.',
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

        sigPage.drawText('Signature :', { x: M, y: sy, size: 10, font: fontBold, color: dark });
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

    // Signed URL (10 years)
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
