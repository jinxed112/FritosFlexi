// public/smartsalary-sync.js
// Bookmarklet FritOS — Sync heures vers SmartSalary GroupCalendar
(function () {
  if (document.getElementById('fritos-sync-panel')) {
    document.getElementById('fritos-sync-panel').remove();
    return;
  }

  var FRITOS_BASE = 'https://fritos-flexi.vercel.app';
  var GROUPCAL_API = 'https://api.partena-professional.be/salary-api/api/v1/PayrollUnits/308091/GroupCalendar';
  var FRITOS_KEY = '';

  try {
    var scripts = document.querySelectorAll('script[src*="smartsalary-sync"]');
    var lastScript = scripts[scripts.length - 1];
    FRITOS_KEY = new URL(lastScript.src).searchParams.get('k') || '';
  } catch (e) {}

  var _partenaToken = null;
  var _orig = window.fetch;

  // En-têtes communs pour les appels à l'API Partena (lecture + écriture)
  function partenaHeaders() {
    return {
      'Authorization': 'Bearer ' + _partenaToken,
      'Content-Type': 'application/json',
      'Accept-Language': 'fr',
      'application': 'SmartSalary',
      'payrollunitid': '308091',
      'demomode': 'false'
    };
  }

  // ── Helpers heures ──
  // Le format Partena des heures est "0.HH:MM:SS" (jours.heures:minutes:secondes).
  function parseTimespan(h) {
    try {
      var after = (h.indexOf('.') >= 0) ? h.split('.')[1] : h;
      var parts = after.split(':');
      var hh = parseInt(parts[0], 10) || 0;
      var mm = parseInt(parts[1], 10) || 0;
      return hh + mm / 60;
    } catch (e) { return 0; }
  }
  function dayHours(day) {
    var h = (day.performances && day.performances[0] && day.performances[0].hours) || '0.00:00:00';
    return parseTimespan(h);
  }
  function workerHours(w) {
    return (w.timesheetMonth || []).reduce(function (acc, d) { return acc + dayHours(d); }, 0);
  }
  function fmtHM(dec) {
    var h = Math.floor(dec + 1e-9);
    var m = Math.round((dec - h) * 60);
    if (m === 60) { h++; m = 0; }
    return h + 'h' + String(m).padStart(2, '0');
  }

  // ── Capture token Partena ──
  function isValidJWT(t) {
    if (!t || t.split('.').length !== 3) return false;
    try {
      var p = JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      var now = Math.floor(Date.now() / 1000);
      if (p.exp && p.exp < now) return false;
      var iss = (p.iss || '').toLowerCase();
      var aud = JSON.stringify(p.aud || '').toLowerCase();
      return iss.includes('partena') || aud.includes('partena') || aud.includes('smartsalary') || iss.includes('logon');
    } catch(e) { return false; }
  }

  function captureToken(t) {
    if (t && isValidJWT(t) && t !== _partenaToken) {
      _partenaToken = t;
      setStatus('✅ Token Partena capturé — cliquez Sync heures', '#22c55e');
      updateBtn();
      return true;
    }
    return false;
  }

  // Hook fetch
  window.fetch = function (url, opts) {
    try {
      var urlStr = (typeof url === 'string') ? url : (url && url.url) ? url.url : '';
      if (urlStr.includes('partena-professional.be') && opts && opts.headers) {
        var h = opts.headers;
        var auth = (h instanceof Headers) ? h.get('authorization') : (h['authorization'] || h['Authorization']);
        if (auth && auth.startsWith('Bearer ')) captureToken(auth.slice(7));
      }
    } catch (e) {}
    return _orig.apply(this, arguments);
  };

  // Hook XHR
  var _XHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    try {
      if ((name || '').toLowerCase() === 'authorization' && (value || '').startsWith('Bearer ')) {
        captureToken(value.slice(7));
      }
    } catch(e) {}
    return _XHRSetHeader.apply(this, arguments);
  };

  // Scan storage au démarrage
  setTimeout(function() {
    if (!_partenaToken) {
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var val = localStorage.getItem(localStorage.key(i));
          if (val && val.startsWith('eyJ') && captureToken(val)) break;
          try {
            var obj = JSON.parse(val);
            for (var f of ['access_token','accessToken','token']) {
              if (obj[f] && captureToken(obj[f])) break;
            }
          } catch(e) {}
        }
      } catch(e) {}
      if (!_partenaToken) setStatus('⚠️ Naviguez dans SmartSalary pour capturer le token', '#f59e0b');
    }
  }, 300);

  // ── Build UI ──
  var panel = document.createElement('div');
  panel.id = 'fritos-sync-panel';
  panel.style.cssText = [
    'position:fixed','top:16px','right:16px','width:360px',
    'background:#1e293b','border:1px solid #334155','border-radius:14px',
    'z-index:2147483647','display:flex','flex-direction:column',
    'box-shadow:0 24px 64px rgba(0,0,0,.6)',
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'overflow:hidden','color:#e2e8f0','font-size:14px'
  ].join(';');

  panel.innerHTML =
    '<div style="padding:14px 16px;background:#0f172a;border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #334155;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<span style="font-size:22px;">⏱</span>' +
        '<div><div style="font-weight:700;font-size:14px;color:#f1f5f9;">FritOS Sync</div>' +
        '<div style="font-size:11px;color:#64748b;">Synchroniser les heures vers Partena</div></div>' +
      '</div>' +
      '<button id="fritos-close" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:22px;line-height:1;padding:0 2px;">×</button>' +
    '</div>' +
    '<div style="padding:12px 16px;background:#0f172a;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
      '<div id="fritos-status" style="font-size:12px;color:#f59e0b;flex:1;">⏳ En attente du token Partena...</div>' +
    '</div>' +
    '<div style="padding:16px;">' +
      '<div style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px;margin-bottom:12px;">' +
        '<div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">Période à synchroniser</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<select id="fritos-month" style="flex:1;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:6px;padding:6px 8px;font-size:13px;"></select>' +
          '<select id="fritos-year" style="width:90px;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:6px;padding:6px 8px;font-size:13px;"></select>' +
        '</div>' +
      '</div>' +
      '<div id="fritos-preview" style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px;margin-bottom:12px;min-height:60px;max-height:280px;overflow-y:auto;">' +
        '<div style="font-size:12px;color:#64748b;text-align:center;">Les prestations apparaîtront ici</div>' +
      '</div>' +
    '</div>' +
    '<div style="padding:10px 12px;border-top:1px solid #334155;background:#0f172a;">' +
      '<button id="fritos-hours-btn" disabled style="width:100%;padding:11px;background:#334155;color:#64748b;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:not-allowed;">⏱ Sync heures vers Partena</button>' +
    '</div>';

  document.body.appendChild(panel);

  document.getElementById('fritos-close').addEventListener('click', function () {
    panel.remove();
    window.fetch = _orig;
  });

  // Remplir les sélecteurs mois/année
  var now = new Date();
  var monthSel = document.getElementById('fritos-month');
  var yearSel = document.getElementById('fritos-year');
  var months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  months.forEach(function(m, i) {
    var opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = m;
    if (i === now.getMonth()) opt.selected = true;
    monthSel.appendChild(opt);
  });
  for (var y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
    var opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === now.getFullYear()) opt.selected = true;
    yearSel.appendChild(opt);
  }

  // Charger preview quand mois/année change
  async function loadPreview() {
    var month = monthSel.value;
    var year = yearSel.value;
    var preview = document.getElementById('fritos-preview');
    preview.innerHTML = '<div style="font-size:12px;color:#64748b;text-align:center;">⏳ Chargement...</div>';
    try {
      var resp = await _orig.call(window, FRITOS_BASE + '/api/smartsalary/prestations?year=' + year + '&month=' + month, {
        headers: { 'x-fritos-auth': FRITOS_KEY }
      });
      var data = await resp.json();
      var workers = data.TimesheetMonthForWorkers || [];
      if (!workers.length) {
        preview.innerHTML = '<div style="font-size:12px;color:#64748b;text-align:center;">Aucune prestation validée pour cette période</div>';
        return;
      }
      var html = '';
      workers.forEach(function(w) {
        var totalDays = w.timesheetMonth.length;
        var totalHours = workerHours(w);
        html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b;">' +
          '<span style="font-size:12px;color:#e2e8f0;">' + w.personId.split('#')[1] + ' · ' + (w.payrollGroupContext === '05' ? '🎓' : '⚡') + '</span>' +
          '<span style="font-size:12px;color:#60a5fa;">' + totalDays + ' jour(s) · ' + fmtHM(totalHours) + '</span>' +
          '</div>';
      });
      preview.innerHTML = '<div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">Prestations à synchroniser :</div>' + html;
      updateBtn();
    } catch(e) {
      preview.innerHTML = '<div style="font-size:12px;color:#ef4444;">Erreur: ' + e.message + '</div>';
    }
  }

  monthSel.addEventListener('change', loadPreview);
  yearSel.addEventListener('change', loadPreview);
  loadPreview();

  function setStatus(msg, color) {
    var el = document.getElementById('fritos-status');
    if (el) { el.textContent = msg; el.style.color = color || '#94a3b8'; }
  }

  function updateBtn() {
    var btn = document.getElementById('fritos-hours-btn');
    if (!btn) return;
    var ready = !!_partenaToken;
    btn.disabled = !ready;
    btn.style.background = ready ? '#3b82f6' : '#334155';
    btn.style.color = ready ? '#fff' : '#64748b';
    btn.style.cursor = ready ? 'pointer' : 'not-allowed';
  }

  // ── Récupère le numéro de relevé (taskNumber) courant par worker ──
  // Le taskNumber change à CHAQUE période de paie côté Partena. On ne le
  // hardcode plus : on appelle le GroupCalendar en lecture (POST) pour la
  // période + les personIds concernés, et on lit
  // result[].generalInfo.period.payClosingGroupInfo.taskNumber par worker.
  // Retourne une map { personId: { taskNumber, status } }.
  async function fetchTaskNumbers(personIds, year, month) {
    var y = parseInt(year, 10);
    var mo = parseInt(month, 10);
    var mm = String(mo).padStart(2, '0');
    var lastDay = new Date(y, mo, 0).getDate();
    var startDate = y + '-' + mm + '-01';
    var endDate = y + '-' + mm + '-' + String(lastDay).padStart(2, '0');

    var r = await _orig.call(window, GROUPCAL_API, {
      method: 'POST',
      headers: partenaHeaders(),
      body: JSON.stringify({
        startDate: startDate,
        endDate: endDate,
        personIds: personIds,
        isIllnessWorkAccidentPeriodsIncluded: true
      })
    });

    if (!r.ok) {
      throw new Error('lecture des relevés — HTTP ' + r.status);
    }

    var data = await r.json();
    var result = (data && data.result) || [];
    var map = {};
    result.forEach(function (w) {
      try {
        var pci = w && w.generalInfo && w.generalInfo.period && w.generalInfo.period.payClosingGroupInfo;
        map[w.personId] = {
          taskNumber: (pci && pci.taskNumber != null) ? String(pci.taskNumber) : null,
          status: w.periodStatus || null
        };
      } catch (e) {
        map[w.personId] = { taskNumber: null, status: null };
      }
    });
    return map;
  }

  // ── PUT d'un lot de workers vers GroupCalendar ──
  // Retourne { http, httpBody, failed } où failed = { workerId: objetRejet }
  // pour les workers que Partena a refusés (result:false).
  async function putGroupCalendar(workersArr) {
    var r = await _orig.call(window, GROUPCAL_API, {
      method: 'PUT',
      headers: partenaHeaders(),
      body: JSON.stringify({ TimesheetMonthForWorkers: workersArr })
    });
    if (!r.ok) {
      var body = '';
      try { body = await r.text(); } catch (e) {}
      return { http: r.status, httpBody: body, failed: {} };
    }
    var data = await r.json();
    var arr = Array.isArray(data) ? data : [];
    var failed = {};
    arr.forEach(function (x) { if (x && x.result === false) failed[x.workerId] = x; });
    return { http: 200, failed: failed };
  }

  // ── Sync heures ──
  document.getElementById('fritos-hours-btn').addEventListener('click', async function () {
    if (!_partenaToken) return;
    var btn = this;
    btn.disabled = true;
    btn.textContent = '⏳ Synchronisation en cours...';
    var month = monthSel.value;
    var year = yearSel.value;

    try {
      var resp = await _orig.call(window, FRITOS_BASE + '/api/smartsalary/prestations?year=' + year + '&month=' + month, {
        headers: { 'x-fritos-auth': FRITOS_KEY }
      });
      var data = await resp.json();
      var workers = data.TimesheetMonthForWorkers || [];

      if (!workers.length) {
        setStatus('⚠️ Aucune prestation validée à synchroniser', '#f59e0b');
        btn.disabled = false;
        btn.textContent = '⏱ Sync heures vers Partena';
        return;
      }

      // ── Étape 1 : récupérer le bon taskNumber du mois pour chaque worker ──
      setStatus('🔎 Lecture des relevés Partena...', '#94a3b8');
      var taskMap;
      try {
        taskMap = await fetchTaskNumbers(workers.map(function (w) { return w.personId; }), year, month);
      } catch (e) {
        setStatus('❌ Impossible de lire les relevés Partena : ' + e.message, '#ef4444');
        btn.disabled = false;
        btn.textContent = '⏱ Sync heures vers Partena';
        return;
      }

      // Compteurs globaux
      var totalSyncedDays = 0;
      var totalUnsyncedHours = 0;   // heures NON comptabilisées (à payer après régularisation)
      var problems = [];            // [{ workerId, hours, days:[{date,hm,code}] , reason }]

      // ── Étape 2 : injecter le taskNumber par worker, écarter ceux sans relevé ouvert ──
      var syncable = [];
      workers.forEach(function (w) {
        var info = taskMap[w.personId];
        if (info && info.taskNumber) {
          w.taskNumber = info.taskNumber; // ← valeur dynamique réelle (ex: "03" en mai)
          syncable.push(w);
        } else {
          var wh = workerHours(w);
          totalUnsyncedHours += wh;
          problems.push({
            workerId: w.workerId,
            hours: wh,
            days: w.timesheetMonth.map(function (d) { return { date: (d.date || '').slice(0, 10), hm: dayHours(d), code: 'relevé non ouvert' }; }),
            reason: (info && info.status) ? ('relevé "' + info.status + '"') : 'relevé introuvable'
          });
        }
      });

      // ── Étape 3 : pousser worker par worker, avec repli jour par jour ──
      // Partena rejette TOUT un worker si un seul de ses jours n'a pas de
      // Dimona / d'occupation. On pousse chaque worker seul ; s'il est rejeté
      // en bloc, on rejoue jour par jour pour faire passer les jours valides
      // et isoler les jours fautifs (avec leurs heures à régulariser).
      for (var i = 0; i < syncable.length; i++) {
        var w = syncable[i];
        setStatus('📤 ' + (i + 1) + '/' + syncable.length + ' — worker #' + w.workerId + ' (relevé ' + w.taskNumber + ')...', '#94a3b8');

        var res = await putGroupCalendar([w]);

        if (res.http !== 200) {
          totalUnsyncedHours += workerHours(w);
          problems.push({ workerId: w.workerId, hours: workerHours(w), days: [], reason: 'erreur HTTP ' + res.http });
          console.error('[FritOS] Worker #' + w.workerId + ' HTTP ' + res.http, res.httpBody || '');
          continue;
        }

        if (!res.failed[w.workerId]) {
          totalSyncedDays += w.timesheetMonth.length;
          console.log('[FritOS] Worker #' + w.workerId + ' OK (' + w.timesheetMonth.length + ' jour(s), relevé ' + w.taskNumber + ')');
          continue;
        }

        // Rejeté en bloc → on isole jour par jour
        console.warn('[FritOS] Worker #' + w.workerId + ' rejeté en bloc → repli jour par jour');
        var badDays = [];
        var workerUnsynced = 0;
        for (var d = 0; d < w.timesheetMonth.length; d++) {
          var day = w.timesheetMonth[d];
          var dh = dayHours(day);
          var single = Object.assign({}, w, { timesheetMonth: [day] });
          var dres = await putGroupCalendar([single]);
          var dayStr = (day.date || '').slice(0, 10);

          if (dres.http === 200 && !dres.failed[w.workerId]) {
            totalSyncedDays++;
          } else {
            var fw = dres.failed && dres.failed[w.workerId];
            var code = (fw && fw.messages && fw.messages[0]) ? fw.messages[0].code : ('HTTP' + dres.http);
            badDays.push({ date: dayStr, hm: dh, code: code });
            workerUnsynced += dh;
            console.warn('[FritOS] Worker #' + w.workerId + ' jour ' + dayStr + ' (' + fmtHM(dh) + ') rejeté', fw || dres.httpBody);
          }
        }

        if (badDays.length) {
          totalUnsyncedHours += workerUnsynced;
          problems.push({ workerId: w.workerId, hours: workerUnsynced, days: badDays, reason: 'jour(s) sans Dimona/occupation' });
        } else {
          console.log('[FritOS] Worker #' + w.workerId + ' OK après repli jour par jour');
        }
      }

      // ── Rapport ──
      if (!problems.length) {
        setStatus('✅ ' + totalSyncedDays + ' jour(s) synchronisé(s) avec succès !', '#22c55e');
        btn.textContent = '✅ Heures synchronisées';
        btn.style.background = '#22c55e';
        return;
      }

      var html = '';
      html += '<div style="font-size:12px;color:#22c55e;margin-bottom:4px;">✅ ' + totalSyncedDays + ' jour(s) synchronisé(s)</div>';
      html += '<div style="font-size:12px;color:#fbbf24;margin-bottom:8px;font-weight:600;">⚠️ ' + fmtHM(totalUnsyncedHours) + ' non comptabilisées (à payer après régularisation Dimona)</div>';
      problems.forEach(function (p) {
        html += '<div style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #1e293b;">';
        html += '<div style="font-size:12px;color:#fca5a5;font-weight:600;">Worker #' + p.workerId + ' — ' + fmtHM(p.hours) + ' (' + p.reason + ')</div>';
        p.days.forEach(function (dd) {
          html += '<div style="font-size:11px;color:#ef4444;padding-left:8px;">• ' + dd.date + ' — ' + fmtHM(dd.hm) + (dd.code ? ' [' + dd.code + ']' : '') + '</div>';
        });
        html += '</div>';
      });
      document.getElementById('fritos-preview').innerHTML = html;

      setStatus('⚠️ ' + totalSyncedDays + ' jour(s) OK — ' + fmtHM(totalUnsyncedHours) + ' à régulariser (détails ci-dessous)', '#f59e0b');
      btn.disabled = false;
      btn.textContent = '⏱ Sync heures vers Partena';
      btn.style.background = '#3b82f6';

    } catch (e) {
      setStatus('❌ Erreur: ' + e.message, '#ef4444');
      btn.disabled = false;
      btn.textContent = '⏱ Sync heures vers Partena';
      btn.style.background = '#3b82f6';
    }
  });

})();
