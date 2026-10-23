(() => {
  "use strict";
  const API_URL =
    "https://script.google.com/macros/s/AKfycbxmDpjFpqip3r0AoAPKRoaY41OXPGbomUDnKU_q5NkldOIkPMcEDcJobKspNil7v1C9/exec";

  // ============================== STATE ==============================
  let s = {
    page: "dashboard",
    step: 1,
    photo: "",
    records: [],
    loading: false,
    busy: { list: false, users: false, audit: false, status: false, nav: false },
    session_token: "",
    user: null,
    users: [],
    user_filter: { query: "", role: "", active: "" },
    audit: [],
    audit_filter: "",
    status: null,
    edit_user: null,
    form: { name: "", notes: "" },
    geo: { status: "idle", lat: null, lng: null, accuracy: 0, error: "" },
    online: navigator.onLine,
    deletingRecipient: "",
  };

  // ============================== HELPERS ==============================
  const $ = (q) => document.querySelector(q),
    $$ = (q) => [...document.querySelectorAll(q)],
    esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      ),
    uuid = () =>
      crypto.randomUUID
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 3) | 8).toString(16);
          }),
    random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function fmtDateTime(v) {
    const d = new Date(v);
    return isNaN(d) ? "-" : d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function fmtDate(v) {
    const d = new Date(v);
    return isNaN(d) ? "—" : d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  }
  function timeAgo(v) {
    const d = new Date(v);
    if (isNaN(d)) return "-";
    const diff = Date.now() - d.getTime(),
      m = Math.floor(diff / 60000);
    if (m < 1) return "baru saja";
    if (m < 60) return `${m} menit lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    const day = Math.floor(h / 24);
    if (day < 7) return `${day} hari lalu`;
    return fmtDate(d);
  }
  function fmtCountdown(ms) {
    if (!ms || ms <= Date.now()) return "kedaluwarsa";
    const m = Math.floor((ms - Date.now()) / 60000),
      h = Math.floor(m / 60);
    return h > 0 ? `± ${h} jam ${m % 60} menit lagi` : `± ${m} menit lagi`;
  }
  function countUp() {
    $$("[data-count]").forEach((el) => {
      const target = Number(el.dataset.count || 0);
      if (el.dataset.counted === "1") return;
      el.dataset.counted = "1";
      const dur = 750,
        t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick);
        else el.textContent = String(target);
      };
      requestAnimationFrame(tick);
    });
  }

  // ============================== TOAST & MODAL ==============================
  let toastTimer = null;
  function toast(message, type = "info") {
    const e = $("#toast");
    if (!e) return;
    const icons = { success: "✓", error: "✕", info: "ℹ" };
    e.innerHTML = "";
    const icon = document.createElement("span");
    icon.className = `toast-icon ${type}`;
    icon.textContent = icons[type] || icons.info;
    const text = document.createElement("span");
    text.textContent = String(message);
    e.append(icon, text);
    e.classList.remove("show", "success", "error", "info");
    void e.offsetWidth;
    e.classList.add("show", type);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => e.classList.remove("show"), 4000);
  }

  function confirmDialog({
    title = "Konfirmasi",
    message = "",
    okLabel = "Ya, lanjutkan",
    cancelLabel = "Batal",
    danger = false,
  } = {}) {
    return new Promise((resolve) => {
      const root = document.createElement("div");
      root.className = "modal-backdrop";
      root.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-icon ${danger ? "danger" : ""}">${danger ? "!" : "?"}</div><h3>${esc(title)}</h3><p class="muted">${esc(message)}</p><div class="actions"><button type="button" class="secondary" data-act="cancel">${esc(cancelLabel)}</button><button type="button" class="${danger ? "danger" : "primary"}" data-act="ok">${esc(okLabel)}</button></div></div>`;
      const done = (v) => {
        root.classList.add("closing");
        setTimeout(() => root.remove(), 200);
        resolve(v);
      };
      root.addEventListener("click", (e) => {
        if (e.target === root) return done(false);
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "ok") done(true);
        if (act === "cancel") done(false);
      });
      document.body.appendChild(root);
      root.querySelector('[data-act="ok"]').focus();
    });
  }

  // ============================== API ==============================
  const demoUsers = [
    { user_id: "demo-user", username: "demo", display_name: "Pengguna Demo", role: "SUPER_ADMIN", active: true },
    { user_id: "demo-2", username: "budi", display_name: "Budi Santoso", role: "ADMIN", active: true },
    { user_id: "demo-3", username: "sari", display_name: "Sari Melati", role: "ADMIN", active: false },
  ];
  function demoApi(action, p = {}) {
    const demoUser = demoUsers[0];
    if (action === "login") {
      if (!String(p.username || "").trim()) throw Error("Username wajib diisi.");
      return { ok: true, session_token: "demo-" + uuid(), expires: Date.now() + 6 * 3600e3, user: demoUser };
    }
    if (action === "users") return { ok: true, data: [...demoUsers] };
    if (action === "save_user") {
      const uname = String(p.username || "").trim().toLowerCase();
      const dname = String(p.display_name || "").trim();
      if (!/^[a-z0-9._-]{3,40}$/.test(uname) || !dname) throw Error("Data pengguna tidak valid.");
      if (demoUsers.some((u) => u.username === uname && String(u.user_id) !== String(p.user_id || ""))) throw Error("Username sudah digunakan.");
      if (p.user_id) {
        const u = demoUsers.find((x) => String(x.user_id) === String(p.user_id));
        if (u) {
          u.display_name = dname;
          u.role = String(p.role || u.role).toUpperCase();
          u.active = p.active !== false;
        }
      } else {
        demoUsers.push({ user_id: uuid(), username: uname, display_name: dname, role: "ADMIN", active: p.active !== false });
      }
      return { ok: true };
    }
    if (action === "list") return { ok: true, data: s.records };
    if (action === "delete_recipient") {
      const recipient = s.records.find((x) => String(x.recipient_id) === String(p.recipient_id));
      if (recipient) s.records = s.records.filter((x) => String(x.recipient_id) !== String(p.recipient_id));
      return { ok: true, demo: true };
    }
    if (action === "create")
      return {
        ok: true,
        demo: true,
        data: { transaction_id: uuid(), timestamp_server: new Date().toISOString(), drive_file_id: "" },
      };
    if (action === "audit_logs")
      return {
        ok: true,
        data: [
          { log_id: uuid(), timestamp_server: new Date().toISOString(), action: "CREATE", entity_type: "TRANSACTION", entity_id: uuid(), actor_username: "demo" },
          { log_id: uuid(), timestamp_server: new Date(Date.now() - 3600e3).toISOString(), action: "LOGIN", entity_type: "SESSION", entity_id: "-", actor_username: "demo" },
        ],
      };
    if (action === "status")
      return {
        ok: true,
        now: new Date().toISOString(),
        spreadsheet_id: "MODE-DEMO (backend belum terhubung)",
        session_expires: Date.now() + 6 * 3600e3,
        user: demoUser,
        counts: { users: demoUsers.length, transactions: s.records.length },
      };
    return { ok: true };
  }

  async function api(action, p = {}, { timeout = 45000 } = {}) {
    if (!API_URL) return demoApi(action, p);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let r, d;
    try {
      r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, session_token: s.session_token, ...p }),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      throw Error(
        e.name === "AbortError"
          ? "Koneksi timeout. Periksa internet Anda lalu coba lagi."
          : "Koneksi gagal. Periksa internet Anda lalu coba lagi.",
      );
    }
    clearTimeout(timer);
    try {
      d = await r.json();
    } catch (e) {
      throw Error(`Respon server tidak valid (HTTP ${r.status}). Pastikan deployment Apps Script aktif dan akses web app diizinkan.`);
    }
    if (!d.ok) {
      const error = Error(d.error || "Permintaan gagal.");
      error.code = d.code || "API_ERROR";
      throw error;
    }
    return d;
  }

  // ============================== SESSION ==============================
  const SESSION_KEY = "thr_session";
  function normalizeUser(user) {
    return user ? { ...user, role: String(user.role || "").trim().toUpperCase() } : null;
  }
  function persistSession() {
    if (!s.session_token || !s.user) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ session_token: s.session_token, user: normalizeUser(s.user) }));
  }
  function restoreSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (!saved?.session_token || !saved.user) return false;
      s.session_token = saved.session_token;
      s.user = normalizeUser(saved.user);
      s.page = s.user.role === "SUPER_ADMIN" ? "users" : "dashboard";
      return true;
    } catch (_) {
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
  }
  function clearSession(message) {
    s.session_token = "";
    s.user = null;
    s.users = [];
    s.records = [];
    s.audit = [];
    s.status = null;
    s.edit_user = null;
    s.page = "dashboard";
    localStorage.removeItem(SESSION_KEY);
    if (message) toast(message, "info");
    render();
  }
  function isSessionError(error) {
    const code = String(error?.code || "").toUpperCase();
    const message = String(error?.message || error || "");
    return (
      ["SESSION_INVALID", "SESSION_EXPIRED", "SESSION_REQUIRED", "INVALID_SESSION"].includes(code) ||
      /sesi (?:tidak valid|sudah kedaluwarsa|login diperlukan)|akun tidak aktif/i.test(message)
    );
  }

  // ============================== GPS ==============================
  function hasValidLocation() {
    const g = s.geo;
    return g.status === "ok" && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lng)) && Number(g.lat) >= -90 && Number(g.lat) <= 90 && Number(g.lng) >= -180 && Number(g.lng) <= 180;
  }
  function requestLocation() {
    s.geo = { status: "locating", lat: null, lng: null, accuracy: 0, error: "" };
    updateGeoChip();
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        s.geo = { status: "fail", lat: null, lng: null, accuracy: 0, error: "Perangkat tidak mendukung GPS." };
        updateGeoChip();
        return resolve(s.geo);
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          s.geo = { status: "ok", lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0), error: "" };
          updateGeoChip();
          resolve(s.geo);
        },
        (err) => {
          const msg =
            err.code === 1
              ? "Izin lokasi ditolak. Aktifkan izin lokasi pada browser bila ingin mencatat koordinat."
              : err.code === 2
                ? "Lokasi tidak tersedia di perangkat ini."
                : "Waktu pengambilan lokasi habis.";
          s.geo = { status: "fail", lat: null, lng: null, accuracy: 0, error: msg };
          updateGeoChip();
          resolve(s.geo);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
      );
    });
  }
  function geoChipHtml() {
    const g = s.geo;
    if (g.status === "locating")
      return `<span class="geo-chip locating"><span class="spinner"></span> Mengambil lokasi GPS…</span>`;
    if (g.status === "ok" && hasValidLocation())
      return `<span class="geo-chip ok">📍 Lokasi terkunci · akurasi ±${g.accuracy} m</span>`;
    return `<span class="geo-chip fail">${esc(g.error || "Kunci lokasi terlebih dahulu sebelum menyimpan.")} <button type="button" class="link-btn" id="geo-retry">Coba lagi</button></span>`;
  }
  function updateGeoChip() {
    const chip = $("#geo-chip");
    if (!chip) return;
    chip.innerHTML = geoChipHtml();
    const saveButton = $("#save");
    if (saveButton && !s.loading) {
      const ready = hasValidLocation();
      saveButton.disabled = !ready;
      saveButton.textContent = ready ? "✓ Simpan Sekarang" : "🔒 Kunci lokasi terlebih dahulu";
    }
    const retry = $("#geo-retry");
    if (retry) retry.onclick = () => requestLocation();
  }

  // ============================== FOTO ==============================
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(Error("Gagal membaca file foto."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(Error("File bukan gambar yang valid."));
        img.onload = () => {
          const MAX = 1600;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            const ratio = Math.min(MAX / width, MAX / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  // ============================== FIREFLIES ==============================
  function createFireflies(root) {
    if (!root) return;
    root.replaceChildren();
    for (let i = 0; i < 18; i += 1) {
      const dot = document.createElement("span");
      dot.className = "firefly";
      const size = random(3, 7);
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.setProperty("--duration", `${random(35, 65)}s`);
      dot.style.setProperty("--delay", `${random(0, 3)}s`);
      for (let n = 1; n <= 5; n += 1) {
        dot.style.setProperty(`--x${n}`, `${random(0, 100)}vw`);
        dot.style.setProperty(`--y${n}`, `${random(0, 100)}vh`);
      }
      root.appendChild(dot);
    }
  }

  // ============================== HALAMAN: LOGIN ==============================
  function renderLogin() {
    const root = document.createElement("main");
    root.className = "login login-page";
    root.innerHTML = `<div class="aurora" aria-hidden="true"></div><div class="fireflies" aria-hidden="true"></div><form id="login-form" class="card login-card"><div class="brand"><span class="brand-mark">T</span>THR <b>Management</b></div><p class="company-name">Pabrik Tahu Wiwitan Barat</p><h1>Selamat datang 👋</h1><p class="muted">Masukkan username untuk melanjutkan.</p>${
      !API_URL ? '<p class="demo-hint">MODE DEMO — backend belum terhubung</p>' : ""
    }<label class="field">Username<input id="login-username" autocomplete="username" required placeholder="cth. admin"></label><button class="primary btn-block" type="submit"><span class="btn-label">Masuk</span></button><p class="login-foot">Sesi aman berlaku 6 jam · bukti tersimpan privat di Google Drive</p></form>`;
    createFireflies(root.querySelector(".fireflies"));
    return root.outerHTML;
  }
  function login() {
    return renderLogin();
  }
  // ============================== HALAMAN: DASHBOARD ==============================
  function dashboard() {
    const r = s.records;
    const recent = r.slice(0, 5);
    return `<section><div class="welcome"><div><p class="eyebrow">RINGKASAN</p><h2>Halo, ${esc(s.user.display_name)} 👋</h2><p class="muted">Pantau dokumentasi penyerahan THR barang secara terpusat.</p></div><div class="welcome-actions"><button class="primary" data-page="input">＋ Catat THR</button><button class="secondary" data-page="history">Lihat Daftar</button></div></div><div class="stats"><div class="stat"><span>Total catatan</span><strong data-count="${r.length}">0</strong></div><div class="stat"><span>Penerima unik</span><strong data-count="${new Set(r.map((x) => x.recipient_name_snapshot)).size}">0</strong></div><div class="stat"><span>Terakhir diperbarui</span><strong class="stat-date">${r[0] ? fmtDate(r[0].timestamp_server) : "—"}</strong></div></div><div class="card"><h3>Aktivitas terbaru</h3><div class="gold-line"></div>${recent.length ? recent.map((x, i) => `<div class="mini-row" style="animation-delay:${i * 60}ms"><div class="cell-main"><b>${esc(x.recipient_name_snapshot)}</b><span class="cell-sub">${esc(x.officer_name_snapshot || "-")} · ${timeAgo(x.timestamp_server)}</span></div><span class="badge ${String(x.status).toUpperCase() === "ACTIVE" ? "ok" : "del"}">${esc(x.status || "ACTIVE")}</span></div>`).join("") : '<div class="empty"><div class="empty-icon">📭</div>Belum ada penyerahan.<br>Mulai dengan mengambil foto bukti.</div>'}</div></section>`;
  }

  // ============================== HALAMAN: RIWAYAT ==============================
  function rows(rs) {
    return rs.length
      ? rs
          .map((x, i) => {
            const proof = x.drive_file_id
              ? `<a class="row-link" href="https://drive.google.com/file/d/${esc(x.drive_file_id)}/view" target="_blank" rel="noopener" title="Lihat foto bukti di Drive">🖼 Bukti</a>`
              : "";
            const maps = x.maps_url
              ? `<a class="row-link" href="${esc(x.maps_url)}" target="_blank" rel="noopener" title="Buka lokasi di Google Maps">📍 Maps</a>`
              : "";
            return `<div class="row trx-row" style="animation-delay:${Math.min(i, 12) * 40}ms"><div class="cell-main"><b>${esc(x.recipient_name_snapshot)}</b>${x.notes ? `<span class="cell-sub">${esc(x.notes)}</span>` : ""}</div><span>${esc(x.officer_name_snapshot || "-")}</span><span>${fmtDateTime(x.timestamp_server)}</span><span class="badge ${String(x.status).toUpperCase() === "ACTIVE" ? "ok" : "del"}">${esc(x.status || "ACTIVE")}</span><div class="row-actions">${proof}${maps}${s.user && ["ADMIN", "SUPER_ADMIN"].includes(s.user.role) && x.recipient_id ? `<button class="icon-btn del-recipient" data-id="${esc(x.recipient_id)}" title="Hapus penerima" ${String(s.deletingRecipient) === String(x.recipient_id) ? "disabled" : ""}>${String(s.deletingRecipient) === String(x.recipient_id) ? "…" : "👤🗑"}</button>` : ""}<button class="icon-btn del-trx" data-id="${esc(x.transaction_id)}" title="Hapus catatan">🗑</button></div></div>`;
          })
          .join("")
      : '<div class="empty"><div class="empty-icon">🗂</div>Belum ada data penerimaan.</div>';
  }
  function history() {
    return `<section><div class="toolbar"><div><p class="eyebrow">RIWAYAT</p><h2>Daftar penerima</h2><p class="muted">${s.busy.list ? "Memperbarui data…" : `${s.records.length} catatan tersimpan`}</p></div><input class="search" id="search" placeholder="🔍 Cari nama, petugas, atau catatan"></div><div class="table" id="rows">${rows(s.records)}</div></section>`;
  }

  // ============================== HALAMAN: CATAT THR ==============================
  function input() {
    const f = s.form;
    let b = "";
    if (s.step === 1)
      b = `<div class="card camera-box">${s.photoBusy ? `<div class="skeleton photo-skeleton"></div><p class="muted center">Memproses & mengoptimalkan foto…</p>` : `<label><strong>${s.photo ? "Foto siap" : "Ambil foto bukti"}</strong><span class="muted">Kamera HP atau galeri · foto otomatis dioptimalkan</span><input id="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label><button type="button" class="primary btn-block" id="photo-trigger">${s.photo ? "📸 Ambil Ulang Foto" : "📸 Ambil Foto"}</button>${s.photo ? `<img class="preview pop-in" src="${s.photo}" alt="Preview foto"><button class="primary" id="next-photo">Lanjutkan →</button>` : '<div class="empty-icon big">📸</div>'}`}</div>`;
    if (s.step === 2)
      b = `<div class="card">${s.photo ? `<img class="thumb pop-in" src="${s.photo}" alt="Thumbnail foto">` : ""}<label class="field">Nama penerima<input id="name" maxlength="120" value="${esc(f.name)}" required placeholder="cth. Bapak Ahmad"></label><label class="field">Catatan opsional<textarea id="notes" maxlength="500" placeholder="cth. THR berupa sembako 1 paket">${esc(f.notes)}</textarea></label><div class="info-chip">👤 Petugas: <b>${esc(s.user.display_name)}</b> <span class="muted">(otomatis dari akun Anda)</span></div><div class="actions"><button class="secondary" id="back-photo">← Kembali</button><button class="primary" id="next-data">Lanjutkan →</button></div></div>`;
    if (s.step === 3)
      b = `<div class="card confirm-card"><img class="preview pop-in" src="${s.photo}" alt="Foto bukti"><div class="summary"><div class="summary-row"><span>Penerima</span><b>${esc(f.name)}</b></div><div class="summary-row"><span>Petugas</span><b>${esc(s.user.display_name)}</b></div></div><div id="geo-chip">${geoChipHtml()}</div><div class="actions"><button class="secondary" id="back-data">← Kembali</button><button class="primary" id="save" ${s.loading || !hasValidLocation() ? "disabled" : ""}>${s.loading ? "Menyimpan…" : hasValidLocation() ? "✓ Simpan Sekarang" : "🔒 Kunci lokasi terlebih dahulu"}</button></div></div>`;
    return `<section><h2>Catat penyerahan THR</h2><p class="muted">Ikuti langkah foto, data penerima, dan konfirmasi.</p><div class="steps"><span class="step ${s.step === 1 ? "on" : "done"}"><i>1</i> Foto</span><span class="step ${s.step === 2 ? "on" : s.step > 2 ? "done" : ""}"><i>2</i> Data</span><span class="step ${s.step === 3 ? "on" : ""}"><i>3</i> Simpan</span></div>${b}</section>`;
  }

  // ============================== HALAMAN: PENGGUNA ==============================
  function skeleton(n = 3) {
    return Array.from({ length: n }, () => '<div class="skeleton-row"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton short"></div></div>').join("");
  }
  function userRowsHtml() {
    const f = s.user_filter;
    const list = [...s.users]
      .filter((u) => (!f.query || `${u.username} ${u.display_name}`.toLowerCase().includes(f.query)) && (!f.role || u.role === f.role) && (f.active === "" || String(u.active) === f.active))
      .sort((a, b) => String(a.username).localeCompare(String(b.username)));
    if (!list.length) return '<div class="empty"><div class="empty-icon">👥</div>Tidak ada pengguna yang cocok.</div>';
    return list
      .map(
        (u, i) =>
          `<div class="row user-row" style="animation-delay:${Math.min(i, 12) * 40}ms"><span class="cell-num">${i + 1}</span><div class="cell-main"><b>${esc(u.username)}</b><span class="cell-sub">${esc(u.display_name)}</span></div><span><span class="badge ${u.role === "SUPER_ADMIN" ? "gold" : "info"}">${esc(u.role)}</span></span><span><span class="badge ${u.active ? "ok" : "off"}">${u.active ? "Aktif" : "Nonaktif"}</span></span><button class="secondary edit-user" data-id="${esc(u.user_id)}">✎ Edit</button></div>`,
      )
      .join("");
  }
  function usersPage() {
    if (!s.user || s.user.role !== "SUPER_ADMIN") return `<section><h2>Akses ditolak</h2><p class="muted">Halaman ini hanya untuk SUPER_ADMIN.</p></section>`;
    const f = s.user_filter;
    if (s.busy.users && !s.users.length)
      return `<section><div class="toolbar"><div><p class="eyebrow">ADMINISTRATION</p><h2>Manajemen Pengguna</h2></div></div><div class="card">${skeleton(4)}</div></section>`;
    return `<section><div class="toolbar"><div><p class="eyebrow">ADMINISTRATION</p><h2>Manajemen Pengguna</h2><p class="muted">${esc(s.user.username)} · ${esc(s.user.display_name)}${s.busy.users ? " · memperbarui…" : ""}</p></div><button class="primary" id="add-user">＋ Tambah Pengguna</button></div><div class="stats"><div class="stat"><span>Total akun</span><strong data-count="${s.users.length}">0</strong></div><div class="stat"><span>Aktif</span><strong data-count="${s.users.filter((u) => u.active).length}">0</strong></div><div class="stat"><span>Nonaktif</span><strong data-count="${s.users.filter((u) => !u.active).length}">0</strong></div></div><div class="toolbar filters"><input class="search" id="user-search" placeholder="🔍 Cari username atau nama" value="${esc(f.query)}"><select id="user-role"><option value="">Semua role</option>${["ADMIN", "SUPER_ADMIN"].map((r) => `<option value="${r}" ${f.role === r ? "selected" : ""}>${r}</option>`).join("")}</select><select id="user-active"><option value="">Semua status</option><option value="true" ${f.active === "true" ? "selected" : ""}>Aktif</option><option value="false" ${f.active === "false" ? "selected" : ""}>Nonaktif</option></select></div><div class="table user-table"><div class="row user-row user-head"><span>No.</span><span>Pengguna</span><span>Role</span><span>Status</span><span>Aksi</span></div><div id="user-rows">${userRowsHtml()}</div></div></section>`;
  }
  function userForm(u = {}) {
    const edit = Boolean(u.user_id);
    const self = edit && String(u.user_id) === String(s.user?.user_id);
    return `<section><div class="card form-card"><button class="icon-btn back" id="cancel-user" title="Kembali">←</button><p class="eyebrow">${edit ? "EDIT AKUN" : "AKUN BARU"}</p><h2>${edit ? `Edit pengguna ${esc(u.username)}` : "Tambah akun"}</h2><p class="muted">${edit ? "Perbarui data akun pengguna." : "Akun baru otomatis berrole ADMIN dan aktif."}</p><form id="user-form"><label class="field">Username<input id="u-username" required pattern="[a-z0-9._-]{3,40}" minlength="3" maxlength="40" value="${esc(u.username || "")}" ${edit ? "readonly" : ""} placeholder="a-z, 0-9, titik, garis bawah">${edit ? "" : '<span class="field-hint">Username tidak dapat diubah setelah dibuat.</span>'}</label><label class="field">Nama pengguna<input id="u-name" required maxlength="120" value="${esc(u.display_name || "")}" placeholder="cth. Budi Santoso"></label>${edit ? `<label class="field">Role<select id="u-role"><option value="ADMIN" ${u.role !== "SUPER_ADMIN" ? "selected" : ""}>ADMIN</option><option value="SUPER_ADMIN" ${u.role === "SUPER_ADMIN" ? "selected" : ""}>SUPER_ADMIN</option></select></label><label class="field">Status<select id="u-active"><option value="true" ${u.active !== false ? "selected" : ""}>Aktif</option><option value="false" ${u.active === false ? "selected" : ""}>Nonaktif</option></select></label>${self ? '<div class="info-chip warn">⚠ Anda mengedit akun sendiri — perubahan role/status akan mengakhiri sesi.</div>' : ""}` : ""}<div class="actions"><button type="button" class="secondary" id="cancel-user-btn">Batal</button><button type="submit" class="primary" ${s.loading ? "disabled" : ""}>${s.loading ? "Menyimpan…" : "Simpan"}</button></div></form></div></section>`;
  }

  // ============================== HALAMAN: AUDIT ==============================
  function auditRowsHtml() {
    const list = s.audit_filter ? s.audit.filter((x) => x.action === s.audit_filter || x.entity_type === s.audit_filter) : s.audit;
    if (!list.length) return '<div class="empty"><div class="empty-icon">🕰</div>Belum ada aktivitas tercatat.</div>';
    const icon = (a) => ({ CREATE: "＋", UPDATE: "✎", DELETE: "🗑", LOGIN: "→" }[String(a).toUpperCase()] || "•");
    const cls = (a) => (String(a).toUpperCase().startsWith("CREATE") ? "ok" : String(a).toUpperCase().startsWith("DELETE") ? "off" : "gold");
    return list
      .map(
        (x, i) =>
          `<div class="row audit-row" style="animation-delay:${Math.min(i, 12) * 40}ms"><span class="badge ${cls(x.action)} act">${icon(x.action)} ${esc(x.action || "-")}</span><div class="cell-main"><b>${esc(x.entity_type || "-")}</b><span class="cell-sub mono">${esc(String(x.entity_id || "-").slice(0, 18))}</span></div><span>${esc(x.actor_username || "-")}</span><span title="${esc(fmtDateTime(x.timestamp_server))}">${timeAgo(x.timestamp_server)}</span></div>`,
      )
      .join("");
  }
  function auditPage() {
    if (s.busy.audit && !s.audit.length)
      return `<section><div class="toolbar"><div><p class="eyebrow">KEAMANAN</p><h2>Audit Log</h2></div></div><div class="card">${skeleton(5)}</div></section>`;
    return `<section><div class="toolbar"><div><p class="eyebrow">KEAMANAN</p><h2>Audit Log</h2><p class="muted">300 aktivitas terakhir dari seluruh pengguna${s.busy.audit ? " · memperbarui…" : ""}</p></div><button class="secondary" id="audit-refresh">⟳ Refresh</button></div><div class="toolbar filters"><select id="audit-filter"><option value="">Semua aksi</option>${["CREATE", "UPDATE", "DELETE", "LOGIN"].map((a) => `<option value="${a}" ${s.audit_filter === a ? "selected" : ""}>${a}</option>`).join("")}</select></div><div class="table"><div class="row audit-row user-head"><span>Aksi</span><span>Objek</span><span>Aktor</span><span>Waktu</span></div><div id="audit-rows">${auditRowsHtml()}</div></div></section>`;
  }

  // ============================== HALAMAN: PENGATURAN ==============================
  function settingsPage() {
    if (s.busy.status && !s.status)
      return `<section><div class="toolbar"><div><p class="eyebrow">SISTEM</p><h2>Pengaturan</h2></div></div><div class="card">${skeleton(3)}</div></section>`;
    const st = s.status;
    return `<section><div class="toolbar"><div><p class="eyebrow">SISTEM</p><h2>Pengaturan & Status</h2><p class="muted">Kesehatan koneksi backend dan informasi sesi.</p></div><button class="secondary" id="status-refresh">⟳ Periksa Koneksi</button></div>${
      !st
        ? '<div class="card empty"><div class="empty-icon">📡</div>Status belum termuat. Klik "Periksa Koneksi".</div>'
        : `<div class="settings-grid"><div class="card stat-card"><h3>Koneksi Backend</h3><div class="kv"><span>Status</span><b class="badge ok">● Terhubung${API_URL ? "" : " (Demo)"}</b></div><div class="kv"><span>Waktu server</span><b>${esc(fmtDateTime(st.now))}</b></div><div class="kv"><span>Endpoint</span><b class="small">${API_URL ? "Apps Script /exec" : "Mode demo lokal"}</b></div></div><div class="card stat-card"><h3>Sesi Anda</h3><div class="kv"><span>Pengguna</span><b>${esc(st.user?.display_name || s.user.display_name)}</b></div><div class="kv"><span>Role</span><b>${esc(st.user?.role || s.user.role)}</b></div><div class="kv"><span>Sesi berakhir</span><b>${st.session_expires ? `${esc(fmtDateTime(st.session_expires))} <span class="muted">(${esc(fmtCountdown(st.session_expires))})</span>` : "-"}</b></div></div><div class="card stat-card"><h3>Penyimpanan</h3><div class="kv"><span>Spreadsheet</span><b class="mono small">${esc(String(st.spreadsheet_id || "-").slice(0, 24))}</b></div><div class="kv"><span>Jumlah akun</span><b>${st.counts?.users ?? "-"}</b></div><div class="kv"><span>Transaksi aktif</span><b>${st.counts?.transactions ?? "-"}</b></div></div><div class="card stat-card"><h3>Tentang</h3><div class="kv"><span>Aplikasi</span><b>THR Management v3</b></div><div class="kv"><span>Bukti foto</span><b>Google Drive (privat)</b></div><div class="kv"><span>Zona waktu</span><b>Asia/Jakarta</b></div></div></div><div class="card danger-zone"><h3>Keluar</h3><p class="muted">Akhiri sesi di perangkat ini.</p><button class="danger" id="settings-logout">Keluar sekarang</button></div>`
    }</section>`;
  }

  // ============================== SHELL ==============================
  function shell() {
    return `<div id="progress" class="${Object.values(s.busy).some(Boolean) || s.loading ? "on" : ""}"></div><div id="backdrop" class="backdrop"></div><div class="layout"><aside class="sidebar" id="sidebar"><div class="brand"><span class="brand-mark">T</span>THR <b>Management</b></div><p class="company-name">Pabrik Tahu Wiwitan Barat</p><div class="side-label">WORKSPACE</div>${[
      ["dashboard", "Dashboard", "▦"],
      ["input", "Catat THR", "＋"],
      ["history", "Daftar Penerima", "▤"],
      ...(s.user?.role === "SUPER_ADMIN" ? [["users", "Manajemen Pengguna", "♙"]] : []),
      ["audit", "Audit Log", "◷"],
      ["settings", "Pengaturan", "⚙"],
    ]
      .map((x) => `<button class="nav ${s.page === x[0] ? "active" : ""}" data-page="${x[0]}">${x[2]} <span>${x[1]}</span></button>`)
      .join("")}<button class="nav logout" id="logout">↪ <span>Keluar</span></button><div class="side-note">🔒 Bukti penyerahan tersimpan privat di Google Drive.</div></aside><main class="main"><header class="topbar"><button class="icon-btn burger" id="hamburger" aria-label="Buka menu">☰</button><div><div class="eyebrow">DOKUMENTASI PENYERAHAN BARANG</div><h1>THR Management</h1><p class="header-company">Pabrik Tahu Wiwitan Barat</p></div><span class="net ${s.online ? "on" : "off"}">${s.online ? "● Online" : "● Offline"}</span><button class="primary topbar-cta" data-page="input">＋ Catat THR</button></header><div id="view"></div><footer>THR Management · THR berupa barang, bukan pembayaran</footer></main></div>`;
  }

  // ============================== LOADER DATA ==============================
  function setBusyUI() {
    const el = $("#progress");
    if (el) el.classList.toggle("on", Object.values(s.busy).some(Boolean) || s.loading);
  }
  async function load() {
    s.busy.list = true;
    setBusyUI();
    try {
      s.records = (await api("list")).data || [];
    } catch (e) {
      if (isSessionError(e)) return clearSession("Sesi berakhir. Silakan masuk kembali.");
      toast(e.message, "error");
    } finally {
      s.busy.list = false;
      setBusyUI();
    }
  }
  async function loadUsers() {
    if (!s.user || s.user.role !== "SUPER_ADMIN") return;
    s.busy.users = true;
    setBusyUI();
    try {
      s.users = (await api("users")).data || [];
    } catch (e) {
      if (isSessionError(e)) return clearSession("Sesi berakhir. Silakan masuk kembali.");
      toast(e.message, "error");
    } finally {
      s.busy.users = false;
      setBusyUI();
    }
  }
  async function loadAudit() {
    s.busy.audit = true;
    setBusyUI();
    try {
      s.audit = (await api("audit_logs")).data || [];
    } catch (e) {
      if (isSessionError(e)) return clearSession("Sesi berakhir. Silakan masuk kembali.");
      toast(e.message, "error");
    } finally {
      s.busy.audit = false;
      setBusyUI();
    }
  }
  async function loadStatus() {
    s.busy.status = true;
    setBusyUI();
    try {
      s.status = await api("status");
    } catch (e) {
      if (isSessionError(e)) return clearSession("Sesi berakhir. Silakan masuk kembali.");
      s.status = null;
      toast(e.message, "error");
    } finally {
      s.busy.status = false;
      setBusyUI();
    }
  }

  // ============================== AKSI ==============================
  async function doLogout() {
    const ok = await confirmDialog({ title: "Keluar dari aplikasi?", message: "Sesi di perangkat ini akan diakhiri.", okLabel: "Keluar", danger: true });
    if (!ok) return;
    await api("logout").catch(() => {});
    clearSession();
    toast("Anda telah keluar.", "success");
  }
  async function saveUser(e) {
    e.preventDefault();
    if (s.loading || !s.user || s.user.role !== "SUPER_ADMIN") return;
    const editUser = s.edit_user;
    const edit = Boolean(editUser);
    const payload = {
      user_id: editUser?.user_id,
      username: $("#u-username").value.trim().toLowerCase(),
      display_name: $("#u-name").value.trim(),
      role: edit ? $("#u-role").value : "ADMIN",
      active: edit ? $("#u-active").value === "true" : true,
    };
    if (!/^[a-z0-9._-]{3,40}$/.test(payload.username) || !payload.display_name) {
      toast("Username (3-40 karakter: a-z, 0-9, . _ -) dan nama pengguna wajib diisi.", "error");
      return;
    }
    const selfEdit = edit && String(editUser.user_id) === String(s.user.user_id);
    const roleChanged = selfEdit && (payload.role !== editUser.role || payload.active !== editUser.active);
    const ok = await confirmDialog({
      title: edit ? "Simpan perubahan?" : "Buat pengguna baru?",
      message: edit ? `Akun ${payload.username} akan diperbarui.` : `Akun ${payload.username} akan dibuat sebagai ADMIN aktif.`,
      okLabel: "Simpan",
    });
    if (!ok) return;
    if (roleChanged) {
      const ok2 = await confirmDialog({ title: "Peran akun Anda berubah", message: "Setelah disimpan, sesi ini akan diakhiri dan Anda perlu masuk kembali.", okLabel: "Lanjutkan", danger: true });
      if (!ok2) return;
    }
    s.loading = true;
    const submitBtn = $("#user-form")?.querySelector("button.primary");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Menyimpan…";
    }
    setBusyUI();
    try {
      await api("save_user", payload);
      s.edit_user = null;
      await loadUsers();
      if (roleChanged) {
        s.loading = false;
        return clearSession("Peran akun berubah. Silakan masuk kembali.");
      }
      toast("Pengguna berhasil disimpan.", "success");
      s.loading = false;
      render();
    } catch (x) {
      s.loading = false;
      setBusyUI();
      if (isSessionError(x)) return clearSession("Sesi berakhir. Silakan masuk kembali.");
      toast(x.message, "error");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Simpan";
      }
    }
  }
  async function deleteRecipient(id) {
    if (s.deletingRecipient) return;
    const rec = s.records.find((x) => String(x.recipient_id) === String(id));
    const ok = await confirmDialog({
      title: "Hapus penerima?",
      message: `Penerima "${rec?.recipient_name_snapshot || "ini"}" akan dinonaktifkan. Transaksi dan foto bukti tetap tersimpan.`,
      okLabel: "Ya, hapus penerima",
      danger: true,
    });
    if (!ok) return;
    s.deletingRecipient = id;
    render();
    try {
      await api("delete_recipient", { recipient_id: id });
      await load();
      s.deletingRecipient = "";
      toast("Penerima berhasil dinonaktifkan.", "success");
      render();
    } catch (e) {
      s.deletingRecipient = "";
      if (isSessionError(e)) return clearSession("Sesi berakhir. Silakan masuk kembali.");
      toast(e.message, "error");
      render();
    }
  }
  async function deleteTransaction(id) {
    const rec = s.records.find((x) => String(x.transaction_id) === String(id));
    const ok = await confirmDialog({
      title: "Hapus catatan?",
      message: `Catatan penyerahan untuk "${rec?.recipient_name_snapshot || "penerima ini"}" akan ditandai DELETED dan hilang dari daftar.`,
      okLabel: "Ya, hapus",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("delete", { transaction_id: id });
      s.records = s.records.filter((x) => String(x.transaction_id) !== String(id));
      toast("Catatan berhasil dihapus.", "success");
      render();
    } catch (e) {
      if (isSessionError(e)) return clearSession("Sesi berakhir. Silakan masuk kembali.");
      toast(e.message, "error");
    }
  }
  async function save() {
    if (s.loading || !hasValidLocation()) {
      if (!s.loading) toast("Kunci lokasi terlebih dahulu sebelum menyimpan.", "error");
      return;
    }
    s.loading = true;
    const btn = $("#save");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Menyimpan…";
    }
    setBusyUI();
    try {
      const r = await api(
        "create",
        {
          idempotency_key: uuid(),
          recipient_name: s.form.name,
          notes: s.form.notes,
          photo: { dataUrl: s.photo },
          latitude: String(s.geo.lat),
          longitude: String(s.geo.lng),
        },
        { timeout: 90000 },
      );
      s.records.unshift({
        transaction_id: r.data.transaction_id,
        recipient_name_snapshot: s.form.name,
        officer_name_snapshot: s.user.username,
        timestamp_server: r.data.timestamp_server || new Date().toISOString(),
        status: "ACTIVE",
        notes: s.form.notes,
        drive_file_id: r.data.drive_file_id || "",
        maps_url: `https://www.google.com/maps?q=${s.geo.lat},${s.geo.lng}`,
      });
      s.page = "history";
      s.step = 1;
      s.photo = "";
      s.photoBusy = false;
      s.form = { name: "", notes: "" };
      s.geo = { status: "idle", lat: null, lng: null, accuracy: 0, error: "" };
      s.loading = false;
      toast(r.demo ? "Mode demo: data belum tersimpan ke Google Sheets." : "Data dan foto berhasil disimpan.", "success");
      render();
    } catch (e) {
      s.loading = false;
      setBusyUI();
      if (isSessionError(e)) return clearSession("Sesi berakhir. Silakan masuk kembali.");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "✓ Simpan Sekarang";
      }
      toast(e.message, "error");
    }
  }

  // ============================== RENDER & BIND ==============================
  function renderUserForm() {
    const u = s.edit_user || {};
    $("#view").innerHTML = userForm(u);
    bind();
    setBusyUI();
  }
  function closeSidebar() {
    $("#sidebar")?.classList.remove("open");
    $("#backdrop")?.classList.remove("show");
  }
  function render() {
    if (!s.session_token || !s.user) {
      document.querySelector("#app").innerHTML = login();
      bind();
      return;
    }
    if (s.page === "users" && s.user.role !== "SUPER_ADMIN") s.page = "dashboard";
    document.querySelector("#app").innerHTML = shell();
    const v = $("#view");
    v.innerHTML =
      s.page === "dashboard"
        ? dashboard()
        : s.page === "input"
          ? input()
          : s.page === "history"
            ? history()
            : s.page === "users"
              ? usersPage()
              : s.page === "audit"
                ? auditPage()
                : settingsPage();
    bind();
    countUp();
    setBusyUI();
  }
  function bindEditButtons() {
    $$(".edit-user").forEach(
      (b) =>
        (b.onclick = () => {
          s.edit_user = s.users.find((u) => String(u.user_id) === String(b.dataset.id));
          if (s.edit_user) renderUserForm();
        }),
    );
  }
  function bind() {
    $$("[data-page]").forEach((b) => {
      if (b.id === "logout") return;
      b.onclick = async () => {
        if (s.busy.nav) return closeSidebar();
        const target = b.dataset.page;
        if (target === s.page) return closeSidebar();
        s.busy.nav = true;
        s.page = target;
        closeSidebar();
        render();
        try {
          if (s.page === "dashboard" || s.page === "history") await load();
          if (s.page === "users") await loadUsers();
          if (s.page === "audit") await loadAudit();
          if (s.page === "settings") await loadStatus();
        } finally {
          s.busy.nav = false;
          render();
        }
      };
    });
    if ($("#logout")) $("#logout").onclick = doLogout;
    if ($("#settings-logout")) $("#settings-logout").onclick = doLogout;
    if ($("#hamburger"))
      $("#hamburger").onclick = () => {
        $("#sidebar").classList.toggle("open");
        $("#backdrop").classList.toggle("show");
      };
    if ($("#backdrop")) $("#backdrop").onclick = closeSidebar;
    if ($("#login-form"))
      $("#login-form").onsubmit = async (e) => {
        e.preventDefault();
        const btn = $("#login-form .primary");
        const label = btn.querySelector(".btn-label");
        btn.disabled = true;
        label.textContent = "Memeriksa…";
        try {
          const d = await api("login", { username: $("#login-username").value.trim() });
          const role = String(d.user?.role || "").trim().toUpperCase();
          s.session_token = d.session_token;
          s.user = normalizeUser(d.user);
          s.page = role === "SUPER_ADMIN" ? "users" : "dashboard";
          persistSession();
          toast(`Selamat datang, ${s.user.display_name}!`, "success");
          if (role === "SUPER_ADMIN") await loadUsers();
          render();
        } catch (x) {
          btn.disabled = false;
          label.textContent = "Masuk";
          $("#login-form").classList.add("shake");
          setTimeout(() => $("#login-form")?.classList.remove("shake"), 550);
          toast(x.message, "error");
        }
      };
    if ($("#add-user")) $("#add-user").onclick = () => { s.edit_user = null; renderUserForm(); };
    bindEditButtons();
    ["user-search", "user-role", "user-active"].forEach((id) => {
      const el = $("#" + id);
      if (!el) return;
      el.oninput = () => {
        s.user_filter.query = ($("#user-search")?.value || "").toLowerCase();
        s.user_filter.role = $("#user-role")?.value || "";
        s.user_filter.active = $("#user-active")?.value || "";
        const wrap = $("#user-rows");
        if (wrap) wrap.innerHTML = userRowsHtml();
        bindEditButtons();
      };
    });
    if ($("#user-form")) $("#user-form").onsubmit = saveUser;
    if ($("#cancel-user")) $("#cancel-user").onclick = () => { s.edit_user = null; render(); };
    if ($("#cancel-user-btn")) $("#cancel-user-btn").onclick = () => { s.edit_user = null; render(); };
    if ($("#audit-refresh"))
      $("#audit-refresh").onclick = async () => {
        await loadAudit();
        render();
      };
    if ($("#audit-filter"))
      $("#audit-filter").oninput = () => {
        s.audit_filter = $("#audit-filter").value;
        const wrap = $("#audit-rows");
        if (wrap) wrap.innerHTML = auditRowsHtml();
      };
    if ($("#status-refresh"))
      $("#status-refresh").onclick = async () => {
        await loadStatus();
        render();
      };
    if ($("#search")) {
      let t = null;
      $("#search").oninput = (e) => {
        clearTimeout(t);
        t = setTimeout(() => {
          const q = e.target.value.toLowerCase();
          const wrap = $("#rows");
          if (wrap)
            wrap.innerHTML = rows(
              s.records.filter((x) => `${x.recipient_name_snapshot} ${x.officer_name_snapshot} ${x.notes || ""}`.toLowerCase().includes(q)),
            );
        }, 120);
      };
    }
    $$(".del-recipient").forEach((b) => (b.onclick = () => deleteRecipient(b.dataset.id)));
    $$(".del-trx").forEach((b) => (b.onclick = () => deleteTransaction(b.dataset.id)));
    const p = $("#photo");
    if ($("#photo-trigger") && p) $("#photo-trigger").onclick = () => p.click();
    if (p)
      p.onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
          toast("Foto harus JPG, PNG, atau WebP.", "error");
          return;
        }
        s.photoBusy = true;
        render();
        try {
          s.photo = await compressImage(f);
          if (f.size > 400 * 1024) toast("Foto dioptimalkan otomatis agar hemat kuota.", "info");
        } catch (err) {
          toast(err.message, "error");
        }
        s.photoBusy = false;
        render();
      };
    if ($("#next-photo")) $("#next-photo").onclick = () => { s.step = 2; render(); };
    if ($("#back-photo")) $("#back-photo").onclick = () => { s.step = 1; render(); };
    if ($("#next-data"))
      $("#next-data").onclick = () => {
        s.form = { name: $("#name").value.trim(), notes: $("#notes").value.trim() };
        if (!s.form.name) {
          toast("Nama penerima wajib diisi.", "error");
          return;
        }
        s.step = 3;
        render();
        requestLocation();
      };
    if ($("#back-data")) $("#back-data").onclick = () => { s.step = 2; render(); };
    if ($("#save")) $("#save").onclick = save;
    if ($("#geo-retry")) $("#geo-retry").onclick = () => requestLocation();
  }

  // ============================== INIT ==============================
  function removeSplash() {
    const sp = document.getElementById("splash");
    if (sp) {
      sp.classList.add("hide");
      setTimeout(() => sp.remove(), 700);
    }
  }
  async function restoreAndValidateSession() {
    removeSplash();
    if (!restoreSession()) return render();
    try {
      if (s.user.role === "SUPER_ADMIN") {
        s.busy.users = true;
        render();
        await loadUsers();
      } else {
        s.busy.list = true;
        render();
        await load();
      }
    } catch (error) {
      if (isSessionError(error)) return clearSession("Sesi berakhir. Silakan masuk kembali.");
    }
    render();
  }
  window.addEventListener("online", () => {
    s.online = true;
    const n = $(".net");
    if (n) {
      n.className = "net on";
      n.textContent = "● Online";
    }
    toast("Kembali online.", "success");
  });
  window.addEventListener("offline", () => {
    s.online = false;
    const n = $(".net");
    if (n) {
      n.className = "net off";
      n.textContent = "● Offline";
    }
    toast("Anda sedang offline — perubahan tidak akan tersimpan.", "error");
  });
  restoreAndValidateSession();
})();
