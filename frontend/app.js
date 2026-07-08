/* stake.HTH.foundation — shared frontend helpers + dashboard logic. */
const CFG = window.HTH_STAKE_CONFIG;

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const kid of kids) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  return n;
};
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
const dur = (s) => {
  if (!s) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((s % 3600) / 60)}m`;
};

async function api(path) {
  const r = await fetch(CFG.API_BASE + path, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.json().catch(() => ({}))).error || r.statusText}`);
  return r.json();
}

/* ---- copy-to-clipboard for any <pre data-copy> ---- */
function wireCopy(root = document) {
  root.querySelectorAll('pre.out').forEach((pre) => {
    if (pre.querySelector('.copy')) return;
    const btn = el('button', { class: 'copy ghost' }, 'Copy');
    btn.onclick = () => {
      navigator.clipboard.writeText(pre.dataset.copy || pre.textContent.replace('Copy', '').trim());
      btn.textContent = 'Copied!'; setTimeout(() => (btn.textContent = 'Copy'), 1500);
    };
    pre.append(btn);
  });
}

/* ---- dashboard (index.html) ---- */
async function loadDashboard() {
  const statsEl = $('#stats'), tableEl = $('#mn-table'), errEl = $('#dash-err');
  try {
    const net = await api('/api/network');
    const mn = net.masternodes || {};
    const cards = [
      ['Block height', fmt(net.blocks)],
      ['Masternodes', `${fmt(mn.enabled ?? mn.total)} <small>/ ${fmt(mn.total)} total</small>`],
      ['Collateral', `${fmt(CFG.COLLATERAL)} <small>${CFG.TICKER}</small>`],
      ['Peer connections', fmt(net.connections)],
      ['Chain sync', net.mnsync?.done ? '<span class="badge ok">synced</span>' : `<span class="badge warn">${net.mnsync?.status || 'syncing'}</span>`],
      ['ChainLocks', net.chainlocksSpork === 0 || net.chainlocksSpork === '0' ? '<span class="badge ok">active</span>' : (net.chainlocksSpork == null ? '—' : '<span class="badge warn">off</span>')],
    ];
    statsEl.innerHTML = '';
    for (const [label, value] of cards) {
      statsEl.append(el('div', { class: 'stat' }, el('div', { class: 'label' }, label), el('div', { class: 'value', html: String(value) })));
    }
  } catch (e) {
    errEl.textContent = `Network stats unavailable: ${e.message}`;
    errEl.style.display = 'block';
  }

  try {
    const { masternodes = [] } = await api('/api/masternodes');
    masternodes.sort((a, b) => (b.activeSeconds || 0) - (a.activeSeconds || 0));
    const tbody = $('tbody', tableEl);
    tbody.innerHTML = '';
    if (!masternodes.length) { tbody.append(el('tr', {}, el('td', { colspan: '4', class: 'muted' }, 'No masternodes returned by the node yet.'))); }
    for (const m of masternodes.slice(0, 500)) {
      const ok = /ENABLED/i.test(m.status || '');
      tbody.append(el('tr', {},
        el('td', { class: 'mono' }, (m.address || m.outpoint || '').slice(0, 36)),
        el('td', {}, el('span', { class: 'badge ' + (ok ? 'ok' : 'bad') }, m.status || '?')),
        el('td', {}, dur(m.activeSeconds)),
        el('td', { class: 'mono' }, m.payee || '—'),
      ));
    }
  } catch (e) {
    $('#list-err').textContent = `Masternode list unavailable: ${e.message}`;
    $('#list-err').style.display = 'block';
  }
}

/* ---- lookup (index.html) ---- */
async function lookupMn(ev) {
  ev.preventDefault();
  const key = $('#lookup-key').value.trim();
  const out = $('#lookup-out');
  if (!key) return;
  out.style.display = 'block';
  out.textContent = 'Searching…';
  try {
    const m = await api('/api/masternode/' + encodeURIComponent(key));
    out.innerHTML = `<div class="mono">${JSON.stringify(m, null, 2)}</div>`;
  } catch (e) { out.textContent = e.message; }
}

document.addEventListener('DOMContentLoaded', () => {
  wireCopy();
  if (document.body.dataset.page === 'dashboard') {
    loadDashboard();
    setInterval(loadDashboard, 30000);
    const f = $('#lookup-form'); if (f) f.addEventListener('submit', lookupMn);
  }
});
