// main.js — simplified CSV-driven single table renderer

// Set your published Google Sheet CSV URL (optional). If empty we use fallback sample data.
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQvWULapiVzfWP2xf3zkbMeS8NXwx7DeRWq2_w0eiEmFo1C9Hk7U1hAruMsI6pTtqFvyv7t5k_MHOn9/pub?output=csv';

// Minimal fallback sample (keys match expected CSV headers)
const FALLBACK_BUILDINGS = [];

function formatCurrencyFt(n) {
  if (n === undefined || n === null || n === '') return '';
  const num = Number(String(n).replace(/\s+/g,'').replace(/,/g,'.'));
  if (isNaN(num)) return String(n);
  return num.toLocaleString('hu-HU') + ' Ft';
}

function formatNumber2(n) {
  if (n === undefined || n === null || n === '') return '';
  const num = Number(String(n).replace(/\s+/g,'').replace(/,/g,'.'));
  if (isNaN(num)) return String(n);
  return num.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = (vals[i] !== undefined) ? vals[i].trim() : '');
    return obj;
  });
  return { headers, rows };
}

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeRow(raw, headers) {
  // return object with normalized keys for easy access
  const out = {};
  headers.forEach(h => {
    const lk = h.toString().toLowerCase();
    const val = raw[h];
    if (lk.includes('emelet')) out.emelet = Number((val||'').toString().replace(/\D+/g,'')) || 0;
    else if (lk.includes('elér') || lk.includes('eler')) {
      const s = (val||'').toString().trim().toUpperCase();
      // normalize common words
      if (s === 'IGEN' || s === 'I' || s === 'TRUE' ) out.elerheto = 'I';
      else if (s === 'NEM' || s === 'N' || s === 'FALSE') out.elerheto = 'N';
      else out.elerheto = s.charAt(0) || '';
    } else if (lk.includes('m2') || lk.includes('négy')) out[h] = Number(String(val).replace(/\s+/g,'').replace(/,/g,'.')) || 0;
    else if (lk.includes('ár') || lk.includes('ar') || lk.includes('ft')) out[h] = val;
    else out[h] = val;
  });
  if (out.emelet === undefined) out.emelet = 0;
  return out;
}

function renderSingleTable(rows, headers) {
  const table = document.getElementById('lakas-table');
  if (!table) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';

  // visible headers: include all except Elérhető
  // keep original indices so we can format by original column positions (5th and 6th columns -> indices 4 and 5)
  const visibleHeaders = headers
    .map((h, i) => ({ h, i }))
    .filter(obj => {
      const lk = obj.h.toString().toLowerCase();
      return !(lk.includes('elér') || lk.includes('eler'));
    });

  // build header row (use CSV header texts)
  thead.innerHTML = '<tr>' + visibleHeaders.map(obj => `<th>${obj.h}</th>`).join('') + '</tr>';

  // normalize rows and sort by emelet ascending then by Lakás
  const normalized = rows.map(r => normalizeRow(r, headers));
  // to allow sorting by emelet, but keep original row mapping for values
  const combined = rows.map((r, i) => ({ raw: r, norm: normalized[i], idx: i }));
  combined.sort((a,b) => {
    const e = (a.norm.emelet - b.norm.emelet) || 0;
    if (e !== 0) return e;
    // fallback: sort by first visible header string
    const key = visibleHeaders[0];
    const av = (a.raw[key] || '').toString();
    const bv = (b.raw[key] || '').toString();
    return av.localeCompare(bv, 'hu');
  });

  if (combined.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.setAttribute('colspan', String(visibleHeaders.length || 1));
    td.textContent = 'Nincs elérhető adat.';
    td.style.fontStyle = 'italic';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

    combined.forEach(item => {
      const row = item.raw;
      const norm = item.norm;
      const tr = document.createElement('tr');
      tr.classList.add('data-row');
      // set availability classes based on normalized value (I/N)
      if (norm.elerheto === 'I') tr.classList.add('available');
      else if (norm.elerheto === 'N') tr.classList.add('unavailable');

      // build cells using visibleHeaders which contains original indices
      tr.innerHTML = visibleHeaders.map(obj => {
        const h = obj.h;
        const origIdx = obj.i; // 0-based index in original CSV
        const lk = h.toString().toLowerCase();
        const rawVal = row[h];

        // handle missing values: show '-' when empty
        const isEmpty = rawVal === undefined || rawVal === null || String(rawVal).trim() === '';

        // Emelet special display
        if (lk.includes('emelet')) {
          const v = Number((rawVal||'').toString().replace(/\D+/g,'')) || norm.emelet || 0;
          return `<td>${v === 0 ? 'FSZ' : v === 1 ? 'I.' : v === 2 ? 'II.' : v}</td>`;
        }

        // m2-like columns: format with 2 decimals
        if (lk.includes('m2') || lk.includes('négy')) {
          return `<td>${isEmpty ? '-' : formatNumber2(rawVal)}</td>`;
        }

        // Columns 5 and 6 in CSV (indices 4 and 5) must be displayed as millions with 2 decimals
        if (origIdx === 4 || origIdx === 5) {
          if (isEmpty) return `<td>-</td>`;
          const num = Number(String(rawVal).replace(/\s+/g,'').replace(/,/g,'.')) || 0;
          return `<td>${(num / 1000000).toFixed(2)}</td>`;
        }

        // generic: show '-' for empty, otherwise raw value
        return `<td>${isEmpty ? '-' : rawVal}</td>`;
      }).join('');

      tbody.appendChild(tr);
  });
  // no details rows — nothing to attach
}

async function loadAndRender() {
  try {
    if (CSV_URL) {
      const res = await fetch(CSV_URL);
      if (!res.ok) throw new Error('CSV fetch failed');
      const text = await res.text();
      const parsed = parseCSV(text);
      renderSingleTable(parsed.rows, parsed.headers);
      window.__LILIOM_BUILDINGS = parsed.rows;
      return;
    }
  } catch (err) {
    console.warn('CSV load failed, using fallback', err);
  }
  // fallback
  const defaultHeaders = ['Lakás','m2','Erkély m2','Kert m2','Szerk.kész ár','Kulcsrakész ár','Emelet','Elérhető'];
  renderSingleTable(FALLBACK_BUILDINGS, defaultHeaders);
  window.__LILIOM_BUILDINGS = FALLBACK_BUILDINGS;
}


function initNavScroll() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;
  const threshold = 48;
  function onScroll() {
    if (window.scrollY > threshold) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function initHamburger() {
  const nav = document.querySelector('.site-nav');
  const toggle = nav ? nav.querySelector('.menu-toggle') : null;
  const list = nav ? nav.querySelector('.nav-list') : null;
  if (!nav || !toggle || !list) return;

  function setOpen(open) {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!nav.classList.contains('open'));
  });

  // close when clicking a nav link
  list.addEventListener('click', function (e) {
    const a = e.target.closest('a');
    if (a) setOpen(false);
  });

  // close when clicking outside
  document.addEventListener('click', function (e) {
    if (!nav.contains(e.target)) setOpen(false);
  });

  // allow escape to close
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  loadAndRender();
  initNavScroll();
  initHamburger();

  // If menu links should smooth-jump and update current state, we can add handlers here.
  // The CSS already enables smooth scroll; ensure links behave correctly.
});

// expose fallback data for debugging in console (will be overwritten if CSV loads)
window.__LILIOM_BUILDINGS = FALLBACK_BUILDINGS;

