/**
 * PetFeeder — app.js
 * Lógica principal com Firebase Realtime Database
 */

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, set, push, update, remove, onValue, get, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ── ESTADO ──────────────────────────────────────────────── */
const S = {
  user:      null,
  uid:       null,
  pets:      {},
  petId:     null,
  horarios:  {},
  historico: [],
  telemetria: {},
  filtroStatus:  'all',
  filtroPeriodo: 'all',
  dateFrom: null,
  dateTo:   null,
  listeners: [],
};

/* ── AUTENTICAÇÃO ─────────────────────────────────────────── */
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'login.html'; return; }
  S.user = user; S.uid = user.uid;
  document.getElementById('nav-logout-name')?.remove();

  await loadUserData();
  initNav();
  initModals();
  initFeedPage();
  initHistoryPage();
  goTo('home');
  startListeners();
});

async function loadUserData() {
  const petsSnap = await get(ref(db, `users/${S.uid}/pets`));
  S.pets = petsSnap.val() || {};

  const petAtivoSnap = await get(ref(db, `users/${S.uid}/petAtivo`));
  S.petId = petAtivoSnap.val() || Object.keys(S.pets)[0] || null;

  updatePetUI();
}

/* ── TOAST ───────────────────────────────────────────────── */
function toast(msg, tipo = '', dur = 3200) {
  const c = document.getElementById('toast-container');
  const icons = { ok: '✅', err: '❌', warn: '⚠️', '': 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast${tipo ? ` t--${tipo}` : ''}`;
  el.innerHTML = `<span>${icons[tipo] || 'ℹ️'}</span><span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => {
    el.classList.add('t--hide');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, dur);
}

/* ── NAVEGAÇÃO ───────────────────────────────────────────── */
function goTo(pageId) {
  document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.hidden = true; });
  const pg = document.getElementById(`page-${pageId}`);
  if (pg) { pg.classList.add('active'); pg.hidden = false; }
  document.querySelectorAll('.nav-btn, .bot-btn[data-page]').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pageId);
  });
  if (pageId === 'home')    refreshHome();
  if (pageId === 'feed')    loadHorarios();
  if (pageId === 'history') loadHistorico();
}

function initNav() {
  document.querySelectorAll('[data-page]').forEach(b => {
    b.addEventListener('click', () => goTo(b.dataset.page));
  });
  document.getElementById('nav-logo')?.addEventListener('click', () => goTo('home'));

  const doLogout = async () => {
    S.listeners.forEach(u => u());
    await signOut(auth);
    window.location.href = 'login.html';
  };
  document.getElementById('btn-logout')?.addEventListener('click', doLogout);
  document.getElementById('bot-logout')?.addEventListener('click', doLogout);
}

/* ── MODAIS ──────────────────────────────────────────────── */
function openModal(id)  { const m = document.getElementById(id); if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; } }
function closeModal(id) { const m = document.getElementById(id); if (m) { m.hidden = true;  document.body.style.overflow = ''; } }

function initModals() {
  document.getElementById('modal-pet-close')?.addEventListener('click', () => closeModal('modal-pet'));
  document.getElementById('modal-new-pet-close')?.addEventListener('click', () => closeModal('modal-new-pet'));
  ['modal-pet', 'modal-new-pet'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => { if (e.target.id === id) closeModal(id); });
  });

  ['pet-chip', 'dash-pet-btn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => { buildPetList(); openModal('modal-pet'); });
  });
  document.getElementById('btn-add-pet')?.addEventListener('click', () => { closeModal('modal-pet'); openModal('modal-new-pet'); });

  // Cores e tipo no modal novo pet
  document.querySelectorAll('#np-colors .color-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#np-colors .color-dot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.querySelectorAll('#np-tipo .tipo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#np-tipo .tipo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('btn-save-pet')?.addEventListener('click', async () => {
    const nome  = document.getElementById('np-nome').value.trim();
    const tipo  = document.querySelector('#np-tipo .tipo-btn.active')?.dataset.tipo || 'cachorro';
    const peso  = parseFloat(document.getElementById('np-peso').value) || null;
    const idade = parseInt(document.getElementById('np-idade').value) || null;
    const cor   = document.querySelector('#np-colors .color-dot.active')?.dataset.color || '#2563eb';
    if (!nome) { toast('Informe o nome do pet', 'warn'); return; }

    const btn = document.getElementById('btn-save-pet');
    btn.disabled = true;
    try {
      const petId = Date.now().toString();
      await set(ref(db, `users/${S.uid}/pets/${petId}`), { nome, tipo, peso, idade, cor, criadoEm: new Date().toISOString() });
      S.pets[petId] = { nome, tipo, peso, idade, cor };
      if (!S.petId) { S.petId = petId; await set(ref(db, `users/${S.uid}/petAtivo`), petId); }
      updatePetUI();
      closeModal('modal-new-pet');
      toast(`${nome} adicionado!`, 'ok');
      ['np-nome','np-peso','np-idade'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    } catch { toast('Erro ao salvar pet', 'err'); }
    finally { btn.disabled = false; }
  });
}

/* ── PET ─────────────────────────────────────────────────── */
function petInicial(pet) { return pet?.nome?.charAt(0).toUpperCase() || '?'; }
function petEmoji(tipo)  { return tipo === 'gato' ? '🐈' : tipo === 'outro' ? '🐾' : '🐕'; }

function updatePetUI() {
  const pet = S.pets[S.petId];
  if (!pet) return;
  document.getElementById('nav-pet-av').textContent   = petInicial(pet);
  document.getElementById('nav-pet-name').textContent = pet.nome;
  document.getElementById('dash-pet-av').textContent  = petEmoji(pet.tipo);
  document.getElementById('dash-pet-name').textContent= pet.nome;
  document.getElementById('home-pet-name').textContent= pet.nome;
}

function buildPetList() {
  const ul = document.getElementById('pet-list');
  ul.innerHTML = '';
  if (!Object.keys(S.pets).length) {
    ul.innerHTML = '<li style="color:var(--text-3);text-align:center;padding:1rem">Nenhum pet cadastrado.</li>';
    return;
  }
  Object.entries(S.pets).forEach(([id, pet]) => {
    const active = id === S.petId;
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="pet-item${active ? ' active' : ''}" role="button" tabindex="0">
        <div class="pet-item__info">
          <div class="pet-av" style="background:${pet.cor || '#2563eb'}">${petInicial(pet)}</div>
          <div>
            <div class="pet-name">${petEmoji(pet.tipo)} ${pet.nome}</div>
            <div class="pet-meta">${pet.peso ? pet.peso + 'kg' : ''}${pet.peso && pet.idade ? ' · ' : ''}${pet.idade ? pet.idade + ' anos' : ''}</div>
          </div>
        </div>
        ${active ? '<i class="ph ph-check-circle" style="color:var(--blue)"></i>' : ''}
      </div>`;
    li.querySelector('.pet-item').addEventListener('click', async () => {
      S.petId = id;
      await set(ref(db, `users/${S.uid}/petAtivo`), id);
      updatePetUI(); closeModal('modal-pet');
      startListeners();
    });
    ul.appendChild(li);
  });
}

/* ── LISTENERS FIREBASE (tempo real) ─────────────────────── */
function startListeners() {
  // Cancela listeners anteriores
  S.listeners.forEach(u => u()); S.listeners = [];
  if (!S.petId) return;

  // Telemetria (peso, reservatório, status)
  const telRef = ref(db, `dosador/telemetria`);
  const unsubTel = onValue(telRef, snap => {
    S.telemetria = snap.val() || {};
    updateTelemetriaUI();
  });
  S.listeners.push(unsubTel);

  // Heartbeat (online/offline)
  const hbRef = ref(db, `dosador/telemetria/ultimo_heartbeat`);
  const unsubHb = onValue(hbRef, snap => {
    const ts = snap.val();
    if (!ts) { setStatus('offline'); return; }
    const diff = Date.now() - ts;
    setStatus(diff < 65000 ? 'online' : 'offline');
  });
  S.listeners.push(unsubHb);

  // Horários
  const horRef = ref(db, `users/${S.uid}/pets/${S.petId}/horarios`);
  const unsubHor = onValue(horRef, snap => {
    S.horarios = snap.val() || {};
    renderHorarios();
    updateNextFeed();
  });
  S.listeners.push(unsubHor);

  // Histórico (últimos 50)
  const histRef = ref(db, `users/${S.uid}/pets/${S.petId}/historico`);
  const unsubHist = onValue(histRef, snap => {
    const raw = snap.val() || {};
    S.historico = Object.entries(raw)
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 50);
    renderHistorico();
    updateLastEvent();
    renderKPIs();
  });
  S.listeners.push(unsubHist);
}

function setStatus(estado) {
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-label');
  if (!dot || !lbl) return;
  dot.className = `status-dot ${estado}`;
  lbl.textContent = estado === 'online' ? 'Dispositivo online' : estado === 'offline' ? 'Dispositivo offline' : 'Conectando...';
}

function updateTelemetriaUI() {
  const t = S.telemetria;

  // Peso ao vivo
  const peso = typeof t.peso_atual === 'number' ? t.peso_atual.toFixed(1) : '—';
  document.getElementById('live-weight').textContent = peso;

  // Reservatório
  const resEl  = document.getElementById('reservoir-badge');
  const resTxt = document.getElementById('reservoir-txt');
  const resMap = {
    'CHEIO':      { cls: 'full',   txt: 'Reservatório cheio',          ico: 'ph-check-circle' },
    'NIVEL_BAIXO':{ cls: 'low',    txt: 'Nível baixo — reabastecer',   ico: 'ph-warning' },
    'VAZIO':      { cls: 'empty',  txt: 'Alerta: reservatório vazio',  ico: 'ph-x-circle' },
  };
  const res = resMap[t.status_reservatorio] || { cls: 'unknwn', txt: '—', ico: 'ph-circle' };
  resEl.className = `reservoir-badge ${res.cls}`;
  resTxt.textContent = res.txt;

  // Status equipamento
  const stEl  = document.getElementById('equip-status-badge');
  const stTxt = document.getElementById('equip-status-txt');
  const stMap = {
    'OCIOSO':           { cls: 'idle',       ico: 'ph-check-circle' },
    'DISPENSANDO':      { cls: 'dispensing', ico: 'ph-spinner' },
    'ERRO_VAZIO':       { cls: 'error',      ico: 'ph-x-circle' },
    'ERRO_OBSTRUCAO':   { cls: 'error',      ico: 'ph-x-circle' },
  };
  const st = stMap[t.status_equipamento] || { cls: 'idle', ico: 'ph-check-circle' };
  if (stEl) {
    stEl.className = `equip-status ${st.cls}`;
    stEl.innerHTML = `<i class="ph ${st.ico}"></i> <span id="equip-status-txt">${t.status_equipamento || 'OCIOSO'}</span>`;
  }

  // Banner de erro
  const errBanner = document.getElementById('error-banner');
  if (t.status_equipamento === 'ERRO_VAZIO' || t.status_equipamento === 'ERRO_OBSTRUCAO') {
    document.getElementById('error-title').textContent = t.status_equipamento === 'ERRO_VAZIO'
      ? 'Reservatório vazio' : 'Obstrução mecânica detectada';
    document.getElementById('error-msg').textContent = t.status_equipamento === 'ERRO_VAZIO'
      ? 'O silo ficou sem ração durante a dosagem. Reabasteça o reservatório e clique em Resetar.'
      : 'O fuso não conseguiu transportar a ração. Verifique se há obstáculos e clique em Resetar.';
    errBanner.hidden = false;
  } else {
    errBanner.hidden = true;
  }

  // Botão de alimentar — desabilita se não estiver ocioso
  const ocioso = !t.status_equipamento || t.status_equipamento === 'OCIOSO';
  ['btn-home-feed','btn-feed'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.disabled = !ocioso; b.title = ocioso ? '' : 'Aguarde o dispositivo ficar ocioso'; }
  });
}

/* ── HOME ─────────────────────────────────────────────────── */
function refreshHome() {
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Bom dia! ☀️' : hr < 18 ? 'Boa tarde! 🌤️' : 'Boa noite! 🌙';
  document.getElementById('dash-greeting').textContent = greet;
  const pet = S.pets[S.petId];
  document.getElementById('dash-sub').textContent = pet ? `Monitorando: ${pet.nome}` : 'Selecione um pet';
  updateNextFeed();
  updateLastEvent();
  updateTelemetriaUI();
}

function updateNextFeed() {
  const ativos = Object.values(S.horarios).filter(h => h.ativo !== false);
  if (!ativos.length) { document.getElementById('c-next').textContent = '--:--'; return; }
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const future = ativos
    .map(h => { const [hr, mn] = h.hora.split(':').map(Number); return hr * 60 + mn; })
    .filter(t => t > nowMin).sort((a, b) => a - b);
  const next = future.length ? future[0] : Math.min(...ativos.map(h => { const [hr, mn] = h.hora.split(':').map(Number); return hr * 60 + mn; }));
  document.getElementById('c-next').textContent =
    `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}

function updateLastEvent() {
  const last = S.historico[0];
  if (!last) return;
  const cons = last.consumido === true || last.consumido === 'true';
  document.getElementById('c-last').textContent = last.horaInicio || '—';
  document.getElementById('c-last-grams').textContent = `${last.gramas || '—'}g · ${cons ? 'Consumido' : 'Não consumido'}`;

  const evEl = document.getElementById('last-event');
  if (evEl) {
    evEl.innerHTML = `<strong>${last.dataInicio} às ${last.horaInicio}</strong> — ${last.gramas || '—'}g liberados · ${cons ? '✅ Consumido' : '❌ Não consumido'}`;
  }
}

/* ── ALIMENTAR ───────────────────────────────────────────── */
async function doFeed(gramas) {
  if (!S.petId) { toast('Selecione um pet primeiro!', 'warn'); return; }
  if (!gramas || gramas < 5 || gramas > 500) { toast('Quantidade inválida (5–500g)', 'warn'); return; }

  const ocioso = !S.telemetria.status_equipamento || S.telemetria.status_equipamento === 'OCIOSO';
  if (!ocioso) { toast('Dispositivo ocupado. Aguarde.', 'warn'); return; }

  ['btn-home-feed','btn-feed'].forEach(id => {
    const b = document.getElementById(id); if (b) { b.disabled = true; }
  });

  try {
    // Escreve comando no Firebase — ESP32 lê e executa
    await set(ref(db, `dosador/comandos`), {
      tipo:      'manual',
      gramas:    gramas,
      petId:     S.petId,
      userId:    S.uid,
      timestamp: Date.now(),
    });
    toast(`Comando enviado! ${gramas}g liberados.`, 'ok');
  } catch { toast('Erro ao enviar comando', 'err'); }
  finally {
    setTimeout(() => {
      ['btn-home-feed','btn-feed'].forEach(id => {
        const b = document.getElementById(id); if (b) b.disabled = false;
      });
    }, 3000);
  }
}

function initFeedPage() {
  document.getElementById('btn-home-feed')?.addEventListener('click', () => {
    const qty = parseInt(document.getElementById('home-qty').value);
    doFeed(qty);
  });
  document.getElementById('btn-feed')?.addEventListener('click', () => {
    const qty = parseInt(document.getElementById('feed-qty').value);
    doFeed(qty);
  });
  document.getElementById('btn-reset-error')?.addEventListener('click', async () => {
    await set(ref(db, `dosador/telemetria/status_equipamento`), 'OCIOSO');
    toast('Status resetado', 'ok');
  });

  document.querySelectorAll('#sched-days .day-btn').forEach(b => {
    b.addEventListener('click', () => {
      b.classList.toggle('active');
    });
  });

  document.getElementById('btn-add-sched')?.addEventListener('click', async () => {
    if (!S.petId) { toast('Selecione um pet!', 'warn'); return; }
    const hora   = document.getElementById('sched-time').value;
    const gramas = parseInt(document.getElementById('sched-qty').value);
    const dias   = [...document.querySelectorAll('#sched-days .day-btn.active')].map(b => b.dataset.day);
    if (!hora)                         { toast('Informe o horário', 'warn'); return; }
    if (!gramas || gramas < 5 || gramas > 500) { toast('Quantidade inválida', 'warn'); return; }
    if (!dias.length)                  { toast('Selecione ao menos um dia', 'warn'); return; }

    const existing = Object.values(S.horarios).find(h => h.hora === hora);
    if (existing) { toast(`Já existe um horário às ${hora}`, 'warn'); return; }

    try {
      await push(ref(db, `users/${S.uid}/pets/${S.petId}/horarios`), {
        hora, gramas, dias, ativo: true,
      });
      toast(`Horário ${hora} salvo!`, 'ok');
      document.getElementById('sched-time').value = '';
      document.getElementById('sched-qty').value  = '';
    } catch { toast('Erro ao salvar horário', 'err'); }
  });
}

function loadHorarios() {
  renderHorarios();
}

function renderHorarios() {
  const list  = document.getElementById('sched-list');
  const empty = document.getElementById('sched-empty');
  if (!list) return;
  list.innerHTML = '';
  const items = Object.entries(S.horarios).sort((a, b) => a[1].hora?.localeCompare(b[1].hora));
  if (!items.length) { empty.hidden = false; return; }
  empty.hidden = true;
  items.forEach(([key, h]) => {
    const dias = Array.isArray(h.dias) ? h.dias : [];
    const daysLabel = dias.length === 7 ? 'Todos os dias' : dias.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
    const ativo = h.ativo !== false;
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="sched-item">
        <div>
          <div class="sched-item__time">${h.hora || '--:--'}</div>
          <div class="sched-item__meta">${h.gramas}g · ${daysLabel}</div>
        </div>
        <div class="sched-item__ctrl">
          <label class="toggle">
            <input type="checkbox" ${ativo ? 'checked' : ''}>
            <span class="toggle-track"></span>
          </label>
          <button class="btn btn--ghost btn--sm" data-del="${key}"><i class="ph ph-trash"></i></button>
        </div>
      </div>`;
    li.querySelector('input[type=checkbox]').addEventListener('change', async function () {
      await update(ref(db, `users/${S.uid}/pets/${S.petId}/horarios/${key}`), { ativo: this.checked });
      toast(`Horário ${h.hora} ${this.checked ? 'ativado' : 'desativado'}`, this.checked ? 'ok' : 'warn');
    });
    li.querySelector('[data-del]').addEventListener('click', async () => {
      await remove(ref(db, `users/${S.uid}/pets/${S.petId}/horarios/${key}`));
      toast('Horário removido', 'warn');
    });
    list.appendChild(li);
  });
}

/* ── HISTÓRICO ───────────────────────────────────────────── */
function loadHistorico() {
  renderHistorico();
  renderKPIs();
}

function parseDataHist(item) {
  if (!item.dataInicio) return null;
  const parts = String(item.dataInicio).split('/');
  if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
  return new Date(item.dataInicio);
}

function applyFilters() {
  let data = [...S.historico];
  if (S.filtroStatus !== 'all') {
    data = data.filter(c => {
      const cons = c.consumido === true || c.consumido === 'true';
      if (S.filtroStatus === 'consumido')     return cons;
      if (S.filtroStatus === 'nao_consumido') return !cons;
      return true;
    });
  }
  const today = new Date(); today.setHours(0,0,0,0);
  if (S.filtroPeriodo === 'today') {
    data = data.filter(c => { const d = parseDataHist(c); if (!d) return false; d.setHours(0,0,0,0); return d.getTime() === today.getTime(); });
  } else if (S.filtroPeriodo === '7days') {
    const limit = new Date(today); limit.setDate(today.getDate() - 6);
    data = data.filter(c => { const d = parseDataHist(c); return d && d >= limit; });
  } else if (S.filtroPeriodo === 'month') {
    data = data.filter(c => { const d = parseDataHist(c); if (!d) return false; return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); });
  } else if (S.filtroPeriodo === 'custom' && S.dateFrom && S.dateTo) {
    const from = new Date(S.dateFrom + 'T00:00:00');
    const to   = new Date(S.dateTo   + 'T23:59:59');
    data = data.filter(c => { const d = parseDataHist(c); return d && d >= from && d <= to; });
  }
  return data;
}

function renderHistorico() {
  const data  = applyFilters();
  const tbody = document.getElementById('history-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:2rem">Nenhum registro encontrado.</td></tr>`;
    return;
  }
  data.forEach(item => {
    const cons = item.consumido === true || item.consumido === 'true';
    const tr   = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.dataInicio || '—'}</td>
      <td><strong>${item.horaInicio || '—'}</strong></td>
      <td><strong>${item.gramas || '—'}g</strong></td>
      <td><span class="badge ${cons ? 'badge--ok' : 'badge--no'}">${cons ? '✔ Sim' : '✘ Não'}</span></td>
      <td>${item.duracaoMin ? item.duracaoMin + ' min' : '—'}</td>
      <td><span class="badge ${item.tipo === 'auto' ? 'badge--auto' : 'badge--man'}">${item.tipo === 'auto' ? 'Auto' : 'Manual'}</span></td>`;
    tbody.appendChild(tr);
  });
}

function renderKPIs() {
  const data      = applyFilters();
  const consumidos = data.filter(c => c.consumido === true || c.consumido === 'true');
  const totalG    = data.reduce((s, c) => s + (parseFloat(c.gramas) || 0), 0);
  const rej       = data.length ? Math.round(((data.length - consumidos.length) / data.length) * 100) : 0;
  const tempos    = consumidos.map(c => parseFloat(c.duracaoMin)).filter(Boolean);
  const avgTempo  = tempos.length ? (tempos.reduce((a,b) => a+b,0)/tempos.length).toFixed(1) : '—';
  const avgDaily  = data.length ? Math.round(totalG / 7) : 0;

  document.getElementById('kpi-total').textContent    = data.length;
  document.getElementById('kpi-consumed').textContent = consumidos.length;
  document.getElementById('kpi-grams').textContent    = `${Math.round(totalG)}g`;
  document.getElementById('kpi-avg').textContent      = `${avgDaily}g`;
  document.getElementById('kpi-time').textContent     = avgTempo;
  document.getElementById('kpi-rej').textContent      = `${rej}%`;
}

function initHistoryPage() {
  document.querySelectorAll('.filter-btn[data-filter]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-filter]').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); S.filtroStatus = b.dataset.filter;
      renderHistorico(); renderKPIs();
    });
  });
  document.querySelectorAll('.filter-btn[data-period]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-period]').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); S.filtroPeriodo = b.dataset.period;
      const cp = document.getElementById('custom-period');
      if (cp) cp.hidden = S.filtroPeriodo !== 'custom';
      if (S.filtroPeriodo !== 'custom') { renderHistorico(); renderKPIs(); }
    });
  });
  document.getElementById('btn-apply-period')?.addEventListener('click', () => {
    S.dateFrom = document.getElementById('date-from').value;
    S.dateTo   = document.getElementById('date-to').value;
    if (!S.dateFrom || !S.dateTo) { toast('Selecione as duas datas', 'warn'); return; }
    if (S.dateFrom > S.dateTo)    { toast('Data inicial maior que a final', 'warn'); return; }
    renderHistorico(); renderKPIs();
  });

  document.getElementById('btn-excel')?.addEventListener('click', exportExcel);
  document.getElementById('btn-pdf')?.addEventListener('click', exportPDF);
}

/* ── EXPORTAÇÃO ──────────────────────────────────────────── */
function exportExcel() {
  const data = applyFilters();
  if (!data.length) { toast('Sem dados para exportar', 'warn'); return; }
  if (!window.XLSX) { toast('Biblioteca não carregada', 'err'); return; }
  const pet = S.pets[S.petId];
  const rows = data.map(c => ({
    'Data':        c.dataInicio  || '',
    'Hora Início': c.horaInicio  || '',
    'Gramas':      c.gramas      || 0,
    'Consumido':   (c.consumido === true || c.consumido === 'true') ? 'Sim' : 'Não',
    'Duração(min)':c.duracaoMin  || 0,
    'Tipo':        c.tipo === 'auto' ? 'Automático' : 'Manual',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, pet?.nome || 'Pet');
  XLSX.writeFile(wb, `PetFeeder_${pet?.nome || 'Pet'}_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`);
  toast('Excel gerado!', 'ok');
}

function exportPDF() {
  if (!window.jspdf) { toast('Biblioteca jsPDF não carregada', 'err'); return; }
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF();
  const pet  = S.pets[S.petId];
  const data = applyFilters();
  const cons = data.filter(c => c.consumido === true || c.consumido === 'true');
  const totalG = data.reduce((s,c) => s+(parseFloat(c.gramas)||0),0);
  const rej  = data.length ? Math.round(((data.length-cons.length)/data.length)*100) : 0;

  doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(37,99,235);
  doc.text('PetFeeder — Relatório de Alimentação', 14, 20);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(71,85,105);
  doc.text(`Pet: ${pet?.nome || '—'} · Usuário: ${S.user?.displayName || S.user?.email || '—'}`, 14, 28);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 34);

  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(15,23,42);
  doc.text('Resumo:', 14, 44);
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  [`Total de ciclos: ${data.length}`, `Consumidos: ${cons.length}`, `Total liberado: ${Math.round(totalG)}g`, `Taxa de rejeição: ${rej}%`]
    .forEach((t,i) => doc.text(t, 14, 52+i*7));

  doc.setFont('helvetica','bold'); doc.setFontSize(10);
  doc.text('Histórico:', 14, 82);
  const cols = ['Data','Início','Qtd.','Consumido','Duração','Tipo'];
  const colW = [28,20,18,26,22,24];
  let y = 90;
  doc.setFillColor(248,250,252); doc.rect(14, y-4, 182, 8, 'F');
  doc.setFontSize(7); doc.setTextColor(100,116,139);
  let x = 14; cols.forEach((c,i) => { doc.text(c, x+1, y); x += colW[i]; });
  doc.setFont('helvetica','normal'); doc.setTextColor(15,23,42);
  data.slice(0,20).forEach((item,idx) => {
    y += 7; if (y > 270) { doc.addPage(); y = 20; }
    if (idx%2===1) { doc.setFillColor(248,250,252); doc.rect(14,y-4,182,7,'F'); }
    const ok  = item.consumido === true || item.consumido === 'true';
    const row = [item.dataInicio||'',item.horaInicio||'',`${item.gramas||0}g`,ok?'Sim':'Não',item.duracaoMin?`${item.duracaoMin}min`:'—',item.tipo==='auto'?'Auto':'Manual'];
    x = 14; row.forEach((v,i) => { doc.text(String(v),x+1,y); x+=colW[i]; });
  });
  for (let p=1; p<=doc.getNumberOfPages(); p++) {
    doc.setPage(p); doc.setFontSize(7); doc.setTextColor(148,163,184);
    doc.text('PetFeeder — TCC Engenharia de Automação UNIP', 14, 287);
    doc.text(`Pág. ${p}/${doc.getNumberOfPages()}`, 190, 287, { align:'right' });
  }
  doc.save(`PetFeeder_${pet?.nome||'Pet'}_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.pdf`);
  toast('PDF gerado!', 'ok');
}
