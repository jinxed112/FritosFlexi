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
      '<div id="fritos-preview" style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px;margin-bottom:12px;min-height:60px;">' +
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
        var totalHours = w.timesheetMonth.reduce(function(acc, d) {
          var h = d.performances[0] && d.performances[0].hours || '0.00:00:00';
          var parts = h.split(':');
          return acc + parseInt(parts[0].split('.')[1] || parts[0]) + parseInt(parts[1]) / 60;
        }, 0);
        html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b;">' +
          '<span style="font-size:12px;color:#e2e8f0;">' + w.personId.split('#')[1] + ' · ' + (w.payrollGroupContext === '05' ? '🎓' : '⚡') + '</span>' +
          '<span style="font-size:12px;color:#60a5fa;">' + totalDays + ' jour(s) · ' + totalHours.toFixed(1) + 'h</span>' +
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

      // Grouper par payrollGroupContext
      var groups = {};
      workers.forEach(function(w) {
        var g = w.payrollGroupContext;
        if (!groups[g]) groups[g] = [];
        groups[g].push(w);
      });

      var allOk = true;
      for (var g in groups) {
        setStatus('📤 Envoi groupe ' + g + ' (' + groups[g].length + ' worker(s))...', '#94a3b8');
        var payload = { TimesheetMonthForWorkers: groups[g] };
        console.log('[FritOS] PUT GroupCalendar groupe ' + g, JSON.stringify(payload, null, 2));

        var r = await _orig.call(window, GROUPCAL_API, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + _partenaToken,
            'Content-Type': 'application/json',
            'Accept-Language': 'fr',
            'application': 'SmartSalary',
            'payrollunitid': '308091',
            'demomode': 'false',
            'origin': 'https://smartsalary.partena-professional.be',
            'referer': 'https://smartsalary.partena-professional.be/'
          },
          body: JSON.stringify(payload)
        });

        if (!r.ok) {
          var errText = await r.text();
          console.error('[FritOS] GroupCalendar groupe ' + g + ' HTTP ' + r.status, errText);
          setStatus('❌ Erreur groupe ' + g + ' : HTTP ' + r.status, '#ef4444');
          allOk = false;
        } else {
          console.log('[FritOS] GroupCalendar groupe ' + g + ' OK');
        }
      }

      if (allOk) {
        var total = workers.reduce(function(acc, w) { return acc + w.timesheetMonth.length; }, 0);
        setStatus('✅ ' + total + ' jour(s) synchronisé(s) avec succès !', '#22c55e');
        btn.textContent = '✅ Heures synchronisées';
        btn.style.background = '#22c55e';
      } else {
        btn.disabled = false;
        btn.textContent = '⏱ Sync heures vers Partena';
        btn.style.background = '#3b82f6';
      }
    } catch (e) {
      setStatus('❌ Erreur: ' + e.message, '#ef4444');
      btn.disabled = false;
      btn.textContent = '⏱ Sync heures vers Partena';
      btn.style.background = '#3b82f6';
    }
  });

})();
