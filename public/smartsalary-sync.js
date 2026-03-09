// public/smartsalary-sync.js
// Chargé dynamiquement par le bookmarklet depuis my.partena-professional.be

(function () {
  if (document.getElementById('fritos-sync-panel')) {
    document.getElementById('fritos-sync-panel').remove();
    return;
  }

  // Récupérer le token FritOS depuis l'URL du script
  var FRITOS_TOKEN = '';
  var FRITOS_BASE = 'https://fritos-flexi.vercel.app';
  var PARTENA_API = 'https://api.partena-professional.be/salary-api/api/v1/Employee';

  try {
    var scripts = document.querySelectorAll('script[src*="smartsalary-sync"]');
    var lastScript = scripts[scripts.length - 1];
    var url = new URL(lastScript.src);
    FRITOS_TOKEN = url.searchParams.get('t') || '';
  } catch (e) {}

  var _partenaToken = null;

  // Hook fetch pour intercepter le JWT SmartSalary
  function isValidJWT(t) {
    if (!t || t.split('.').length !== 3) return false;
    try {
      var p = JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      // Must not be expired and must look like a Partena token
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
      setStatus('✅ Token Partena capturé — sélectionnez les travailleurs', '#22c55e');
      updateBtn();
      return true;
    }
    return false;
  }

  function scanStorage() {
    // Scan localStorage
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        var val = localStorage.getItem(key);
        if (!val) continue;
        // Direct JWT
        if (val.startsWith('eyJ') && captureToken(val)) return true;
        // JSON object containing a token field
        try {
          var obj = JSON.parse(val);
          var fields = ['access_token','accessToken','token','id_token','bearer','Authorization'];
          for (var f = 0; f < fields.length; f++) {
            var v = obj[fields[f]];
            if (v && typeof v === 'string' && v.startsWith('eyJ') && captureToken(v)) return true;
          }
          // Nested: obj.body, obj.data, obj.auth
          var nested = ['body','data','auth','session','user'];
          for (var n = 0; n < nested.length; n++) {
            var sub = obj[nested[n]];
            if (sub && typeof sub === 'object') {
              for (var f2 = 0; f2 < fields.length; f2++) {
                var v2 = sub[fields[f2]];
                if (v2 && typeof v2 === 'string' && v2.startsWith('eyJ') && captureToken(v2)) return true;
              }
            }
          }
        } catch(e) {}
      }
    } catch(e) {}

    // Scan sessionStorage
    try {
      for (var j = 0; j < sessionStorage.length; j++) {
        var skey = sessionStorage.key(j);
        var sval = sessionStorage.getItem(skey);
        if (!sval) continue;
        if (sval.startsWith('eyJ') && captureToken(sval)) return true;
        try {
          var sobj = JSON.parse(sval);
          var sfields = ['access_token','accessToken','token','id_token','bearer'];
          for (var sf = 0; sf < sfields.length; sf++) {
            var sv = sobj[sfields[sf]];
            if (sv && typeof sv === 'string' && sv.startsWith('eyJ') && captureToken(sv)) return true;
          }
        } catch(e) {}
      }
    } catch(e) {}

    // Scan cookies
    try {
      var cookies = document.cookie.split(';');
      for (var c = 0; c < cookies.length; c++) {
        var cv = cookies[c].trim().split('=').slice(1).join('=');
        if (cv && cv.startsWith('eyJ') && captureToken(cv)) return true;
        try {
          var decoded = decodeURIComponent(cv);
          if (decoded.startsWith('eyJ') && captureToken(decoded)) return true;
          var cobj = JSON.parse(decoded);
          if (cobj && cobj.access_token && captureToken(cobj.access_token)) return true;
        } catch(e) {}
      }
    } catch(e) {}

    return false;
  }

  // Hook fetch (for future requests)
  var _orig = window.fetch;
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

  // Hook XHR setRequestHeader (wrap on top of Dynatrace agent)
  var _XHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    try {
      if ((name || '').toLowerCase() === 'authorization' && (value || '').startsWith('Bearer ')) {
        captureToken(value.slice(7));
      }
    } catch(e) {}
    return _XHRSetHeader.apply(this, arguments);
  };

  // Scan immediately on load
  setTimeout(function() {
    if (!_partenaToken) {
      var found = scanStorage();
      if (!found) {
        setStatus('⚠️ Token non trouvé dans le storage — cliquez 🔄 puis naviguez dans SmartSalary', '#f59e0b');
      }
    }
  }, 300);

  // ── Build UI ──
  var panel = document.createElement('div');
  panel.id = 'fritos-sync-panel';
  panel.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px', 'width:400px', 'max-height:85vh',
    'background:#1e293b', 'border:1px solid #334155', 'border-radius:14px',
    'z-index:2147483647', 'display:flex', 'flex-direction:column',
    'box-shadow:0 24px 64px rgba(0,0,0,.6)',
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'overflow:hidden', 'color:#e2e8f0', 'font-size:14px'
  ].join(';');

  panel.innerHTML =
    // Header
    '<div style="padding:14px 16px;background:#0f172a;border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #334155;flex-shrink:0;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<span style="font-size:22px;">📤</span>' +
        '<div><div style="font-weight:700;font-size:14px;color:#f1f5f9;">FritOS Sync</div>' +
        '<div style="font-size:11px;color:#64748b;">Créer travailleurs dans SmartSalary</div></div>' +
      '</div>' +
      '<button id="fritos-close" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:22px;line-height:1;padding:0 2px;">×</button>' +
    '</div>' +
    // Status bar
    '<div style="padding:8px 16px;background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
      '<div id="fritos-status" style="font-size:12px;color:#f59e0b;flex:1;">⏳ Chargement des travailleurs FritOS...</div>' +
      '<button id="fritos-trigger" title="Forcer la capture du token" style="background:#1e3a5f;border:1px solid #334155;color:#60a5fa;font-size:11px;padding:3px 8px;border-radius:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">🔄 Capturer token</button>' +
    '</div>' +
    // Worker list
    '<div id="fritos-list" style="overflow-y:auto;flex:1;padding:10px;min-height:60px;"></div>' +
    // Footer
    '<div style="padding:10px 12px;border-top:1px solid #334155;background:#0f172a;flex-shrink:0;">' +
      '<button id="fritos-btn" disabled style="width:100%;padding:10px;background:#334155;color:#64748b;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:not-allowed;">Synchroniser vers SmartSalary</button>' +
    '</div>';

  document.body.appendChild(panel);

  document.getElementById('fritos-close').addEventListener('click', function () {
    panel.remove();
    window.fetch = _orig; // restore fetch
  });

  // Trigger button: click the first worker in the Partena sidebar to force a fetch call
  document.getElementById('fritos-trigger').addEventListener('click', function () {
    setStatus('⏳ Tentative de capture...', '#f59e0b');
    // Try clicking a worker link in the SmartSalary sidebar to trigger an API call
    var links = document.querySelectorAll('a[href*="/worker"], a[href*="/employee"], li[class*="worker"], li[class*="employee"], .worker-list-item, [class*="workerList"] li, [class*="worker-list"] li');
    var clicked = false;
    for (var i = 0; i < links.length; i++) {
      if (links[i] !== document.activeElement) {
        links[i].click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      // Fallback: try navigating to the next worker
      var allLinks = document.querySelectorAll('a');
      for (var j = 0; j < allLinks.length; j++) {
        var href = allLinks[j].href || '';
        if (href.includes('worker') || href.includes('employee') || href.includes('travailleur')) {
          allLinks[j].click();
          clicked = true;
          break;
        }
      }
    }
    if (!clicked) {
      setStatus('⚠️ Cliquez manuellement sur un travailleur dans la liste', '#f59e0b');
    }
  });

  var workers = [];
  var selected = {};
  var results = {};

  function setStatus(msg, color) {
    var el = document.getElementById('fritos-status');
    if (el) { el.textContent = msg; el.style.color = color || '#94a3b8'; }
  }

  function updateBtn() {
    var btn = document.getElementById('fritos-btn');
    if (!btn) return;
    var n = Object.keys(selected).length;
    var ready = !!_partenaToken && n > 0;
    btn.disabled = !ready;
    btn.style.background = ready ? '#3b82f6' : '#334155';
    btn.style.color = ready ? '#fff' : '#64748b';
    btn.style.cursor = ready ? 'pointer' : 'not-allowed';
    if (!_partenaToken) {
      btn.textContent = 'En attente du token Partena...';
    } else if (n === 0) {
      btn.textContent = 'Sélectionnez des travailleurs';
    } else {
      btn.textContent = 'Synchroniser (' + n + ' travailleur' + (n > 1 ? 's' : '') + ')';
    }
  }

  function mapStudy(l) {
    var m = {
      'Enseignement primaire': '1',
      'Enseignement secondaire inférieur': '2',
      'Enseignement secondaire supérieur': '3',
      'Enseignement supérieur non universitaire': '4',
      'Enseignement universitaire': '5'
    };
    return m[l] || '3';
  }

  function buildPayload(w, dateIn, dateOut) {
    var raw = w.address_street || '';
    var m = raw.match(/^(.*?)\s+(\d+\S*)$/);
    var street = m ? m[1].trim() : raw;
    var num = m ? m[2].trim() : '';
    var niss = (w.niss || '').replace(/[.\-\s]/g, '');
    var isStudent = w.status === 'student';
    var langMap = { 'NL': '2', 'DE': '3', 'EN': '4' };
    return {
      identity: {
        lastName: w.last_name, firstName: w.first_name, inss: niss,
        nationalityId: '11',
        languageId: langMap[w.language] || '1',
        genderId: w.gender === 'F' ? '2' : '1',
        birthDate: w.date_of_birth ? new Date(w.date_of_birth).toISOString() : null,
        birthCountryId: '150', birthPlace: w.birth_place || '',
        studyLevelId: mapStudy(w.education_level), isDimonaWorker: false,
      },
      contact: {
        homeAddress: { street: street, number: num, city: w.address_city || '', cityId: null, zipCode: w.address_zip || '', countryId: '150', box: '', region: '' },
        workPhone: w.phone || '', workEmail: w.email || '', privatePhone: '', privateEmail: '',
      },
      fiscalSituation: { partnerLastName: '', partnerFirstName: '', numberOfChildrenAtCharge: 0, numberOfChildrenDisabled: 0, workerDisabled: false, personsAtCharge: [], civilStatusId: '1', partnerDisabled: false, civilStatusEntryYear: null },
      bankAccount: { paymentChoice: '4', iban: (w.iban || '').replace(/\s/g, ''), bic: '', agency: '' },
      messagePRC: '',
      contract: {
        payrollUnitId: '308091', payrollGroupId: isStudent ? '05' : '02',
        dateInService: dateIn, categoryId: '03', subCategoryId: 'O', regionId: null, activityId: '2',
        isActivePensioner: w.status === 'pensioner',
        activityOfficialJointCommittee: '302.00', activityTechnicalJointCommittee: '302.00.00', activityWorkerClassification: 'Y',
        isDimonaRelevant: true, governanceLevel: null,
        contractPeriods: [{ dateInService: dateIn, dateOutService: dateOut, hoursWorked: null, c32CurrentMonth: '', c32NextMonth: '', dimonaRequested: false, dimonaInvoiceRequested: null, reasonOutServiceId: '04', noticeStartingDate: null, noticeNotificationDate: null }],
        department: { departmentCode: '0000000' }, imposedStartDate: null, endTrialDate: null,
        establishmentUnit: { validityDate: null, validityEndDate: null, address: null }, establishmentUnitId: '1',
        officialJointCommittee: {}, chosenJointCommittee: {},
        wagePackage: {
          salaryInformation: { salaryTypeId: '1', amount: parseFloat(w.hourly_rate) || 12.78, cafeteriaPlanAmount: 0, professionalCategory: '2', effectiveDate: dateIn, officialJointCommittee: '', baremaAutomatic: '', seniorityEntryDate: dateIn, additionalSeniorityMonths: 0, additionalSeniorityYears: 0, governanceLevel: null, flexiJobAmount: 0, baremicSeniorityMonths: 0, baremicSeniorityYears: 0 },
          contractWageComponents: [], payWageComponents: [], companyVehicles: [],
          transportCosts: [],
          transportCostIsAutomaticCalculation: 'NoAutomaticCalculation',
        },
        dateOutService: dateOut, contractualSeniorityStartDate: null, classRiskId: '001',
        noticeNotificationDate: null, noticeStartingDate: null, scheduleStartDate: null, effectiveDate: null,
        jobTitleHorecaId: null, apprenticeContractNumber: null, contractTypeId: 'B',
        scientificResearcherType: null, journalistNumber: null, journalistStartDate: null, journalistEndDate: null,
        jobTitle: 'Polyvalent', scheduleId: '0000003', fullTime: false, isOccasional: false, workerType: 'OU',
        requestGuaranteeIncome: null, requestMaintenanceOfRights: null, subsidizedMaribel: null,
        subsidizedMaribelHours: null, subsidizedMaribelStart: null, contractNumber: '', isManagement: false,
      }
    };
  }

  function renderList() {
    var el = document.getElementById('fritos-list');
    if (!el) return;
    if (!workers.length) {
      el.innerHTML = '<p style="color:#64748b;font-size:12px;padding:16px;text-align:center;">Aucun travailleur avec profil complet.</p>';
      updateBtn(); return;
    }
    var today = new Date().toISOString().split('T')[0];
    var endYear = new Date().getFullYear() + '-12-31';
    var html = '';
    workers.forEach(function (w) {
      var sel = selected[w.id];
      var res = results[w.id];
      var border = res ? (res.success ? '#22c55e' : '#ef4444') : (sel ? '#3b82f6' : '#1e3a5f');
      var dateIn = sel ? sel.dateIn : today;
      var dateOut = sel ? sel.dateOut : endYear;
      var initials = (w.first_name[0] || '') + (w.last_name[0] || '');
      var badge = w.status === 'student' ? '🎓 Étudiant' : '⚡ Flexi';
      html += '<div style="border:1px solid ' + border + ';border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#0f172a;">';
      html += '<div style="display:flex;align-items:center;gap:10px;">';
      if (!(res && res.success)) {
        html += '<input type="checkbox" ' + (sel ? 'checked' : '') + ' data-id="' + w.id + '" data-datein="' + dateIn + '" data-dateout="' + dateOut + '" class="fritos-check" style="width:16px;height:16px;accent-color:#3b82f6;cursor:pointer;flex-shrink:0;">';
      }
      html += '<div style="width:30px;height:30px;border-radius:50%;background:#1e3a5f;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#60a5fa;flex-shrink:0;">' + initials + '</div>';
      html += '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + w.first_name + ' ' + w.last_name + '</div>';
      html += '<div style="font-size:11px;color:#64748b;">' + badge + ' · ' + w.hourly_rate + '€/h</div></div>';
      if (res) {
        html += '<span style="font-size:20px;">' + (res.success ? '✅' : '❌') + '</span>';
      }
      html += '</div>';
      if (sel && !res) {
        html += '<div style="display:flex;gap:8px;margin-top:8px;padding-left:56px;">';
        html += '<div><div style="font-size:10px;color:#64748b;margin-bottom:2px;">Date début</div><input type="date" value="' + dateIn + '" data-id="' + w.id + '" data-field="dateIn" class="fritos-date" style="font-size:11px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;border-radius:6px;padding:3px 6px;"></div>';
        html += '<div><div style="font-size:10px;color:#64748b;margin-bottom:2px;">Date fin</div><input type="date" value="' + dateOut + '" data-id="' + w.id + '" data-field="dateOut" class="fritos-date" style="font-size:11px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;border-radius:6px;padding:3px 6px;"></div>';
        html += '</div>';
      }
      if (res && res.error) {
        html += '<div style="margin-top:6px;font-size:10px;color:#ef4444;font-family:monospace;word-break:break-all;white-space:pre-wrap;background:#1e293b;padding:6px 8px;border-radius:4px;max-height:120px;overflow-y:auto;">' + String(res.error).substring(0, 500) + '</div>';
      }
      html += '</div>';
    });
    el.innerHTML = html;

    // Bind checkbox events
    el.querySelectorAll('.fritos-check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = this.dataset.id;
        if (selected[id]) { delete selected[id]; } else { selected[id] = { dateIn: this.dataset.datein, dateOut: this.dataset.dateout }; }
        renderList();
      });
    });

    // Bind date events
    el.querySelectorAll('.fritos-date').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = this.dataset.id;
        var field = this.dataset.field;
        if (selected[id]) selected[id][field] = this.value;
      });
    });

    updateBtn();
  }

  // Sync button
  document.getElementById('fritos-btn').addEventListener('click', async function () {
    if (!_partenaToken || !Object.keys(selected).length) return;
    var btn = this;
    btn.disabled = true;
    btn.style.background = '#1e3a5f';
    btn.textContent = '⏳ Synchronisation en cours...';

    for (var i = 0; i < workers.length; i++) {
      var w = workers[i];
      var sel = selected[w.id];
      if (!sel || (results[w.id] && results[w.id].success)) continue;

      setStatus('⏳ Création de ' + w.first_name + ' ' + w.last_name + '...', '#94a3b8');
      try {
        var payload = buildPayload(w, new Date(sel.dateIn).toISOString(), new Date(sel.dateOut).toISOString());
        console.log('[FritOS] Payload envoyé pour', w.first_name, w.last_name, JSON.stringify(payload, null, 2));
        var res = await _orig.call(window, PARTENA_API, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + _partenaToken,
            'Content-Type': 'application/json',
            'Accept-Language': 'fr',
            'application': 'SmartSalary',
            'payrollunitid': '308091',
            'demomode': 'false',
            'origin': 'https://smartsalary.partena-professional.be',
            'referer': 'https://smartsalary.partena-professional.be/',
          },
          body: JSON.stringify(payload)
        });
        var text = await res.text();
        var data;
        try { data = JSON.parse(text); } catch (e) { data = text; }

        if (res.ok && data && data.result) {
          var personId = data.result.personId || data.result.id || null;
          results[w.id] = { success: true, personId: personId };
          delete selected[w.id];
          console.log('[FritOS] Créé:', w.first_name, w.last_name, '→ personId:', personId);

          // Save personId back to FritOS
          if (personId) {
            try {
              await _orig.call(window, FRITOS_BASE + '/api/smartsalary/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workerId: w.id, personId: personId, fritosToken: FRITOS_TOKEN })
              });
            } catch (e) { console.warn('FritOS confirm failed:', e); }
          }
        } else {
          var errMsg = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
          console.error('[FritOS] Erreur', w.first_name, w.last_name, '| HTTP', res.status, '|', errMsg);
          results[w.id] = { success: false, error: 'HTTP ' + res.status + ' — ' + errMsg };
        }
      } catch (e) {
        console.error('[FritOS] Exception', w.first_name, w.last_name, e);
        results[w.id] = { success: false, error: e.message };
      }
      renderList();
    }

    var nOk = Object.values(results).filter(function (r) { return r.success; }).length;
    var nFail = Object.values(results).filter(function (r) { return !r.success; }).length;
    setStatus(
      '✅ ' + nOk + ' créé(s)' + (nFail ? ' · ❌ ' + nFail + ' erreur(s)' : ''),
      nFail ? '#f59e0b' : '#22c55e'
    );
    btn.disabled = false;
    btn.style.background = '#3b82f6';
    btn.style.color = '#fff';
    btn.textContent = 'Synchroniser';
  });

  // Load workers from FritOS
  (async function () {
    try {
      var res = await _orig.call(window, FRITOS_BASE + '/api/smartsalary/pending', {
        headers: { 'Authorization': 'Bearer ' + FRITOS_TOKEN }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      workers = data.workers || [];
      var msg = workers.length + ' travailleur' + (workers.length > 1 ? 's' : '') + ' chargé' + (workers.length > 1 ? 's' : '');
      msg += _partenaToken ? ' · ✅ Token capturé' : ' · Effectuez une action dans SmartSalary pour capturer le token...';
      setStatus(msg, _partenaToken ? '#22c55e' : '#f59e0b');
      renderList();
    } catch (e) {
      setStatus('❌ Erreur chargement FritOS: ' + e.message, '#ef4444');
    }
  })();
})();
