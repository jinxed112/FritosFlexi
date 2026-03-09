'use client';

// src/app/dashboard/flexis/smartsalary/bookmarklet/page.tsx

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const FRITOS_BASE = 'https://fritos-flexi.vercel.app';
const PARTENA_API = 'https://api.partena-professional.be/salary-api/api/v1/Employee';

function buildBookmarklet(fritosToken: string): string {
  // The actual bookmarklet code — runs on smartsalary.partena-professional.be
  const code = `(function() {
  if (document.getElementById('fritos-sync-panel')) { document.getElementById('fritos-sync-panel').remove(); return; }

  var FRITOS_TOKEN = '${fritosToken}';
  var _partenaToken = null;

  // Hook fetch to intercept SmartSalary JWT
  var _orig = window.fetch;
  window.fetch = function(url, opts) {
    try {
      if (opts && opts.headers) {
        var h = opts.headers;
        var auth = (h instanceof Headers) ? h.get('authorization') : (h['authorization'] || h['Authorization']);
        if (auth && auth.startsWith('Bearer ')) {
          var t = auth.slice(7);
          var p = JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
          var aud = Array.isArray(p.aud) ? p.aud : [p.aud||''];
          if (aud.some(function(a){return (a||'').toLowerCase().includes('smartsalary');})) {
            _partenaToken = t;
            setStatus('✅ Token Partena capturé', '#22c55e');
            renderWorkers();
          }
        }
      }
    } catch(e) {}
    return _orig.apply(this, arguments);
  };

  // ── UI ──
  var panel = document.createElement('div');
  panel.id = 'fritos-sync-panel';
  panel.style.cssText = 'position:fixed;top:16px;right:16px;width:400px;max-height:85vh;background:#1e293b;border:1px solid #334155;border-radius:14px;z-index:2147483647;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.6);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;overflow:hidden;color:#e2e8f0;';

  panel.innerHTML = '<div style="padding:14px 16px;background:#0f172a;border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #334155;flex-shrink:0;">' +
    '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:20px;">📤</span><div><div style="font-weight:700;font-size:14px;">FritOS Sync</div><div style="font-size:11px;color:#64748b;">SmartSalary → Partena</div></div></div>' +
    '<button onclick="document.getElementById(\'fritos-sync-panel\').remove()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:20px;line-height:1;padding:0;">×</button>' +
    '</div>' +
    '<div id="fritos-status" style="padding:8px 16px;font-size:12px;background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0;color:#94a3b8;">⏳ Chargement des travailleurs...</div>' +
    '<div id="fritos-list" style="overflow-y:auto;flex:1;padding:10px;"></div>' +
    '<div style="padding:10px 12px;border-top:1px solid #334155;background:#0f172a;flex-shrink:0;">' +
    '<button id="fritos-btn" disabled style="width:100%;padding:10px;background:#334155;color:#64748b;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:not-allowed;transition:all .2s;">Synchroniser vers SmartSalary</button>' +
    '</div>';

  document.body.appendChild(panel);

  var workers = [];
  var selected = {};
  var results = {};

  function setStatus(msg, color) {
    var el = document.getElementById('fritos-status');
    if (el) { el.textContent = msg; el.style.color = color||'#94a3b8'; }
  }

  function updateBtn() {
    var btn = document.getElementById('fritos-btn');
    if (!btn) return;
    var n = Object.keys(selected).length;
    var ready = _partenaToken && n > 0;
    btn.disabled = !ready;
    btn.style.background = ready ? '#3b82f6' : '#334155';
    btn.style.color = ready ? 'white' : '#64748b';
    btn.style.cursor = ready ? 'pointer' : 'not-allowed';
    btn.textContent = n > 0 ? 'Synchroniser (' + n + ' travailleur' + (n>1?'s':'') + ')' : (!_partenaToken ? 'En attente du token Partena...' : 'Sélectionnez des travailleurs');
  }

  function mapStudy(l) {
    return {'Enseignement primaire':'1','Enseignement secondaire inférieur':'2','Enseignement secondaire supérieur':'3','Enseignement supérieur non universitaire':'4','Enseignement universitaire':'5'}[l]||'3';
  }

  function buildPayload(w, dateIn, dateOut) {
    var raw = w.address_street || '';
    var m = raw.match(/^(.*?)\\s+(\\d+\\S*)$/);
    var street = m ? m[1].trim() : raw;
    var num = m ? m[2].trim() : '';
    var niss = (w.niss||'').replace(/[.\\-\\s]/g,'');
    var isStudent = w.status === 'student';
    return {
      personId: null,
      identity: {
        lastName: w.last_name, firstName: w.first_name, personId: null, inss: niss,
        nationalityId: '11',
        languageId: {'NL':'2','DE':'3','EN':'4'}[w.language]||'1',
        genderId: w.gender === 'F' ? '2' : '1',
        birthDate: w.date_of_birth ? new Date(w.date_of_birth).toISOString() : null,
        birthCountryId: '150', birthPlace: w.birth_place||'',
        studyLevelId: mapStudy(w.education_level), isDimonaWorker: false,
      },
      contact: {
        homeAddress: { street: street, number: num, city: w.address_city||'', cityId: null, zipCode: w.address_zip||'', countryId: '150', box: '', region: '' },
        personId: null, workPhone: w.phone||'', workEmail: w.email||'', privatePhone: '', privateEmail: '',
      },
      fiscalSituation: { partnerLastName:'', partnerFirstName:'', numberOfChildrenAtCharge:0, numberOfChildrenDisabled:0, workerDisabled:false, personsAtCharge:[], civilStatusId:'1', partnerDisabled:false, civilStatusEntryYear:null },
      bankAccount: { paymentChoice:'4', iban:(w.iban||'').replace(/\\s/g,''), bic:'', agency:'' },
      messagePRC: '',
      contract: {
        payrollUnitId:'308091', payrollGroupId: isStudent ? '05' : '02',
        dateInService: dateIn, categoryId:'03', subCategoryId:'O', regionId: null, activityId:'2',
        isActivePensioner: w.status === 'pensioner',
        activityOfficialJointCommittee:'302.00', activityTechnicalJointCommittee:'302.00.00', activityWorkerClassification:'Y',
        isDimonaRelevant:true, governanceLevel:null,
        contractPeriods:[{ dateInService:dateIn, dateOutService:dateOut, hoursWorked:null, c32CurrentMonth:'', c32NextMonth:'', dimonaRequested:false, dimonaInvoiceRequested:null, reasonOutServiceId:'04', noticeStartingDate:null, noticeNotificationDate:null }],
        department:{ departmentCode:'0000000' }, imposedStartDate:null, endTrialDate:null,
        establishmentUnit:{ validityDate:null, validityEndDate:null, address:null }, establishmentUnitId:'1',
        officialJointCommittee:{}, chosenJointCommittee:{},
        wagePackage:{
          salaryInformation:{ salaryTypeId:'1', amount: parseFloat(w.hourly_rate)||12.78, cafeteriaPlanAmount:0, professionalCategory:'2', effectiveDate:dateIn, officialJointCommittee:'', baremaAutomatic:'', seniorityEntryDate:dateIn, additionalSeniorityMonths:0, additionalSeniorityYears:0, governanceLevel:null, flexiJobAmount:0, baremicSeniorityMonths:0, baremicSeniorityYears:0 },
          contractWageComponents:[], payWageComponents:[], companyVehicles:[],
          transportCosts:[{ icon:'car', label:'other', category:'1', wageComponentIsMissing:false, type:'0', isChecked:true, details:'', distance:0, state:0, price:0 }],
          transportCostIsAutomaticCalculation:'NoAutomaticCalculation',
        },
        dateOutService: dateOut, contractualSeniorityStartDate:null, classRiskId:'001',
        noticeNotificationDate:null, noticeStartingDate:null, scheduleStartDate:null, effectiveDate:null,
        jobTitleHorecaId:null, apprenticeContractNumber:null, contractTypeId:'B',
        scientificResearcherType:null, journalistNumber:null, journalistStartDate:null, journalistEndDate:null,
        jobTitle:'Polyvalent', scheduleId:'0000003', fullTime:false, isOccasional:false, workerType:'OU',
        requestGuaranteeIncome:null, requestMaintenanceOfRights:null, subsidizedMaribel:null,
        subsidizedMaribelHours:null, subsidizedMaribelStart:null, contractNumber:'', isManagement:false,
      }
    };
  }

  function renderList() {
    var el = document.getElementById('fritos-list');
    if (!el) return;
    if (!workers.length) { el.innerHTML = '<p style="color:#64748b;font-size:12px;padding:8px;text-align:center;">Aucun travailleur avec profil complet.</p>'; updateBtn(); return; }
    var today = new Date().toISOString().split('T')[0];
    var end2026 = '2026-12-31';
    el.innerHTML = workers.map(function(w) {
      var sel = selected[w.id];
      var res = results[w.id];
      var borderColor = res ? (res.success ? '#22c55e' : '#ef4444') : (sel ? '#3b82f6' : '#1e3a5f');
      var dateIn = sel ? sel.dateIn : today;
      var dateOut = sel ? sel.dateOut : end2026;
      return '<div style="border:1px solid ' + borderColor + ';border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#0f172a;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
        (res && res.success ? '' : '<input type="checkbox" ' + (sel?'checked':'') + ' onchange="window._fritosToggle(\'' + w.id + '\',\'' + dateIn + '\',\'' + dateOut + '\')" style="width:16px;height:16px;accent-color:#3b82f6;cursor:pointer;flex-shrink:0;">') +
        '<div style="width:30px;height:30px;border-radius:50%;background:#1e3a5f;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#60a5fa;flex-shrink:0;">' + w.first_name[0] + w.last_name[0] + '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + w.first_name + ' ' + w.last_name + '</div>' +
        '<div style="font-size:11px;color:#64748b;">' + (w.status==='student'?'🎓 Étudiant':'⚡ Flexi') + ' · ' + w.hourly_rate + '€/h</div></div>' +
        (res ? (res.success ? '<span style="font-size:20px;">✅</span>' : '<span style="font-size:20px;" title="' + (res.error||'') + '">❌</span>') : '') +
        '</div>' +
        (sel && !res ? '<div style="display:flex;gap:8px;margin-top:8px;padding-left:56px;">' +
          '<div><div style="font-size:10px;color:#64748b;margin-bottom:2px;">Date début</div><input type="date" value="' + dateIn + '" onchange="window._fritosDate(\'' + w.id + '\',\'dateIn\',this.value)" style="font-size:11px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;border-radius:6px;padding:3px 6px;"></div>' +
          '<div><div style="font-size:10px;color:#64748b;margin-bottom:2px;">Date fin</div><input type="date" value="' + dateOut + '" onchange="window._fritosDate(\'' + w.id + '\',\'dateOut\',this.value)" style="font-size:11px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;border-radius:6px;padding:3px 6px;"></div>' +
          '</div>' : '') +
        (res && res.error ? '<div style="margin-top:6px;font-size:10px;color:#ef4444;font-family:monospace;word-break:break-all;background:#1e293b;padding:4px 8px;border-radius:4px;">' + res.error.substring(0,200) + '</div>' : '') +
        '</div>';
    }).join('');
    updateBtn();
  }

  window._fritosToggle = function(id, dateIn, dateOut) {
    if (selected[id]) { delete selected[id]; } else { selected[id] = { dateIn: dateIn, dateOut: dateOut }; }
    renderList();
  };
  window._fritosDate = function(id, field, val) { if (selected[id]) selected[id][field] = val; };

  document.getElementById('fritos-btn').addEventListener('click', async function() {
    if (!_partenaToken || !Object.keys(selected).length) return;
    var btn = this; btn.disabled = true; btn.style.background = '#1e3a5f';

    for (var i = 0; i < workers.length; i++) {
      var w = workers[i];
      var sel = selected[w.id];
      if (!sel || (results[w.id] && results[w.id].success)) continue;

      setStatus('⏳ Création de ' + w.first_name + ' ' + w.last_name + '...', '#94a3b8');
      try {
        var payload = buildPayload(w, new Date(sel.dateIn).toISOString(), new Date(sel.dateOut).toISOString());
        var res = await window.fetch(
          '${PARTENA_API}',
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + _partenaToken,
              'Content-Type': 'application/json',
              'Accept-Language': 'fr',
              'application': 'SmartSalary',
              'payrollunitid': '308091',
              'demomode': 'false',
            },
            body: JSON.stringify(payload)
          }
        );
        var text = await res.text();
        var data; try { data = JSON.parse(text); } catch(e) { data = text; }
        if (res.ok && data && data.result) {
          results[w.id] = { success: true, personId: data.result.personId };
          delete selected[w.id];
        } else {
          var errMsg = typeof data === 'string' ? data : (data && data.message) ? data.message : JSON.stringify(data);
          results[w.id] = { success: false, error: errMsg };
        }
      } catch(e) { results[w.id] = { success: false, error: e.message }; }
      renderList();
    }

    var nOk = Object.values(results).filter(function(r){return r.success;}).length;
    var nFail = Object.values(results).filter(function(r){return !r.success;}).length;
    setStatus('✅ ' + nOk + ' créé(s)' + (nFail ? ' · ❌ ' + nFail + ' erreur(s)' : ''), nFail ? '#f59e0b' : '#22c55e');
    btn.disabled = false; btn.style.background = '#3b82f6';
  });

  // Load workers from FritOS
  (async function() {
    try {
      var res = await window.fetch('${FRITOS_BASE}/api/smartsalary/pending', {
        headers: { 'Authorization': 'Bearer ' + FRITOS_TOKEN }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      workers = data.workers || [];
      setStatus(workers.length + ' travailleur' + (workers.length > 1 ? 's' : '') + ' chargé' + (workers.length > 1 ? 's' : '') + ' · ' + (_partenaToken ? '✅ Token capturé' : 'Effectuez une action dans SmartSalary pour capturer le token...'), _partenaToken ? '#22c55e' : '#f59e0b');
      renderList();
    } catch(e) {
      setStatus('❌ Erreur FritOS: ' + e.message, '#ef4444');
    }
  })();
})();`;

  return `javascript:${encodeURIComponent(code)}`;
}

export default function BookmarkletPage() {
  const [bookmarkletHref, setBookmarkletHref] = useState('#');
  const [tokenStatus, setTokenStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setBookmarkletHref(buildBookmarklet(session.access_token));
        setTokenStatus('ok');
      } else {
        setTokenStatus('error');
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📤</div>
          <h1 className="text-2xl font-bold text-white">FritOS Sync</h1>
          <p className="text-gray-400 mt-1 text-sm">Créez vos travailleurs dans SmartSalary en un clic</p>
        </div>

        {/* Token status */}
        <div className={`rounded-lg p-3 mb-6 text-sm flex items-center gap-2 ${
          tokenStatus === 'ok' ? 'bg-green-950 border border-green-800 text-green-400' :
          tokenStatus === 'error' ? 'bg-red-950 border border-red-800 text-red-400' :
          'bg-gray-800 border border-gray-700 text-gray-400'
        }`}>
          {tokenStatus === 'ok' && <><span>✅</span> Votre session est intégrée dans le bookmarklet</>}
          {tokenStatus === 'error' && <><span>❌</span> Session non trouvée — reconnectez-vous d&apos;abord</>}
          {tokenStatus === 'loading' && <><span>⏳</span> Lecture de la session...</>}
        </div>

        {/* Steps */}
        <div className="space-y-5">
          {/* Step 1 */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">1</div>
              <p className="font-semibold text-white">Installez le bookmarklet</p>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Glissez ce bouton vers votre barre de favoris Chrome <span className="text-gray-500">(Ctrl+Shift+B pour l&apos;afficher)</span>
            </p>
            {tokenStatus === 'ok' ? (
              <a
                href={bookmarkletHref}
                className="inline-block bg-orange-500 hover:bg-orange-400 text-white font-bold px-5 py-3 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors"
                onClick={(e) => e.preventDefault()}
                onDragStart={() => {}}
              >
                📤 FritOS Sync
              </a>
            ) : (
              <div className="inline-block bg-gray-700 text-gray-500 font-bold px-5 py-3 rounded-lg cursor-not-allowed">
                📤 FritOS Sync
              </div>
            )}
            <p className="text-gray-600 text-xs mt-3">
              ⚠️ Le bookmarklet contient votre session. Réinstallez-le si vous vous reconnectez ou après 7 jours.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">2</div>
              <p className="font-semibold text-white">Ouvrez SmartSalary</p>
            </div>
            <p className="text-gray-400 text-sm">
              Rendez-vous sur{' '}
              <a href="https://smartsalary.partena-professional.be" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                smartsalary.partena-professional.be
              </a>{' '}
              et naviguez vers <strong className="text-gray-300">Travailleurs</strong>.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">3</div>
              <p className="font-semibold text-white">Cliquez sur 📤 FritOS Sync</p>
            </div>
            <p className="text-gray-400 text-sm">
              Le panneau charge vos travailleurs FritOS. Sélectionnez ceux à créer, choisissez les dates de contrat, et cliquez Synchroniser. Le token Partena est capturé automatiquement.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-6 bg-blue-950 border border-blue-800 rounded-xl p-4">
          <p className="text-blue-300 text-xs font-semibold mb-2">POURQUOI CETTE APPROCHE ?</p>
          <p className="text-blue-200 text-xs leading-relaxed">
            L&apos;API Partena lie les tokens JWT à la session navigateur. Les appels depuis Vercel (autre IP) sont rejetés. Ce bookmarklet effectue les appels directement depuis votre navigateur sur le domaine SmartSalary — là où le token est valide.
          </p>
        </div>
      </div>
    </div>
  );
}
