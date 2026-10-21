(() => {
  "use strict";
  const API_URL =
    "https://script.google.com/macros/s/AKfycbxmDpjFpqip3r0AoAPKRoaY41OXPGbomUDnKU_q5NkldOIkPMcEDcJobKspNil7v1C9/exec";
  let s = {
    page: "dashboard",
    step: 1,
    photo: "",
    records: [],
    loading: false,
    session_token: "",
    user: null,
    users: [],
    user_filter: { query: "", role: "", active: "" },
    form: { name: "", item: "", officer: "", notes: "" },
  };
  const $ = (q) => document.querySelector(q),
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
    toast = (m) => {
      const e = $("#toast");
      e.textContent = m;
      e.classList.add("show");
      setTimeout(() => e.classList.remove("show"), 3500);
    };
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
    s.page = "dashboard";
    localStorage.removeItem(SESSION_KEY);
    if (message) toast(message);
    render();
  }
  function isSessionError(error) {
    const code = String(error?.code || "").toUpperCase();
    const message = String(error?.message || error || "");
    return ["SESSION_INVALID", "SESSION_EXPIRED", "INVALID_SESSION", "SESSION_REQUIRED"].includes(code) || /sesi (?:tidak valid|sudah kedaluwarsa|login diperlukan)/i.test(message);
  }
  async function api(action, p = {}) {
    if (!API_URL)
      return action === "list"
        ? { ok: true, data: s.records }
        : action === "create"
          ? {
              ok: true,
              demo: true,
              data: {
                transaction_id: crypto.randomUUID(),
                timestamp_server: new Date().toISOString(),
              },
            }
          : { ok: true };
    const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, session_token: s.session_token, ...p }),
      }),
      d = await r.json();
    if (!d.ok) {
      const error = Error(d.error || "Permintaan gagal.");
      error.code = d.code || "API_ERROR";
      throw error;
    }
    return d;
  }
  const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
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
  function renderLogin() {
    const root = document.createElement("main");
    root.className = "login login-page";
    root.innerHTML = `<div class="fireflies" aria-hidden="true"></div><form id="login-form" class="card login-card"><div class="brand"><span class="brand-mark">T</span>THR <b>Management</b></div><h1>Masuk</h1><p class="muted">Masukkan username untuk masuk.</p><label class="field">Username<input id="login-username" autocomplete="username" required></label><button class="primary" type="submit">Masuk</button></form>`;
    createFireflies(root.querySelector(".fireflies"));
    return root.outerHTML;
  }
  function login() {
    return renderLogin();
  }
  function usersPage() {
    if (!s.user || s.user.role !== "SUPER_ADMIN") return simple("Akses ditolak", "Halaman ini hanya dapat dibuka oleh SUPER_ADMIN.");
    const f = s.user_filter;
    if (s.loading) return `<section><div class="toolbar"><div><p class="eyebrow">ADMINISTRATION</p><h2>Dashboard Super Admin</h2><p class="muted">Memuat daftar akun…</p></div></div><div class="card empty loading-state">Memuat pengguna…</div></section>`;
    const list = s.users.filter((u) => (!f.query || `${u.username} ${u.display_name}`.toLowerCase().includes(f.query)) && (!f.role || u.role === f.role) && (f.active === "" || String(u.active) === f.active));
    const rowsHtml = list.map((u, i) => `<div class="row user-row"><span>${i + 1}</span><b>${esc(u.username)}</b><span>${esc(u.display_name)}</span><span>${esc(u.role)}</span><span class="badge">${u.active ? "ACTIVE" : "INACTIVE"}</span><button class="secondary edit-user" data-id="${esc(u.user_id)}">Edit</button></div>`).join("");
    return `<section><div class="toolbar"><div><p class="eyebrow">ADMINISTRATION</p><h2>Dashboard Super Admin</h2><p class="muted">${esc(s.user.username)} · ${esc(s.user.display_name)}</p></div><button class="primary" id="add-user">＋ Tambah Pengguna</button></div><div class="stats"><div class="stat"><span>Total akun</span><strong>${s.users.length}</strong></div><div class="stat"><span>Aktif</span><strong>${s.users.filter((u) => u.active).length}</strong></div><div class="stat"><span>Nonaktif</span><strong>${s.users.filter((u) => !u.active).length}</strong></div></div><div class="toolbar"><input class="search" id="user-search" placeholder="Cari username atau nama" value="${esc(f.query)}"><select id="user-role"><option value="">Semua role</option>${["ADMIN", "SUPER_ADMIN"].map((r) => `<option value="${r}" ${f.role === r ? "selected" : ""}>${r}</option>`).join("")}</select><select id="user-active"><option value="">Semua status</option><option value="true" ${f.active === "true" ? "selected" : ""}>Aktif</option><option value="false" ${f.active === "false" ? "selected" : ""}>Nonaktif</option></select></div><div class="table user-table"><div class="row user-row user-head"><span>No.</span><span>Username</span><span>Nama pengguna</span><span>Role</span><span>Status</span><span>Aksi</span></div>${rowsHtml || '<div class="empty">Belum ada pengguna.</div>'}</div></section>`;
  }
  function userForm(u = {}) {
    const edit = Boolean(u.user_id);
    return `<section><div class="card"><p class="eyebrow">${edit ? "EDIT AKUN" : "AKUN BARU"}</p><h2>${edit ? "Edit pengguna" : "Tambah akun"}</h2><p class="muted">${edit ? "Perbarui data akun pengguna." : "Akun baru dibuat sebagai ADMIN aktif."}</p><form id="user-form"><label class="field">Username<input id="u-username" required pattern="[a-z0-9._-]{3,40}" minlength="3" maxlength="40" value="${esc(u.username || "")}" ${edit ? "readonly" : ""}></label><label class="field">Nama pengguna<input id="u-name" required maxlength="120" value="${esc(u.display_name || "")}"></label>${edit ? `<label class="field">Role<select id="u-role"><option ${u.role === "ADMIN" ? "selected" : ""}>ADMIN</option><option ${u.role === "SUPER_ADMIN" ? "selected" : ""}>SUPER_ADMIN</option></select></label><label class="field">Status<select id="u-active"><option value="true" ${u.active !== false ? "selected" : ""}>Aktif</option><option value="false" ${u.active === false ? "selected" : ""}>Nonaktif</option></select></label>` : ""}<div class="actions"><button type="button" class="secondary" id="cancel-user">Batal</button><button class="primary" ${s.loading ? "disabled" : ""}>${s.loading ? "Menyimpan…" : "Simpan"}</button></div></form></div></section>`;
  }
  function shell() {
    return `<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-mark">T</span>THR <b>Management</b></div><div class="side-label">WORKSPACE</div>${[
      ["dashboard", "Dashboard", "▦"],
      ["input", "Catat THR", "＋"],
      ["history", "Daftar Penerima", "▤"],
      ...(s.user?.role === "SUPER_ADMIN" ? [["users", "Manajemen Pengguna", "♙"]] : []),
      ["audit", "Audit Log", "◷"],
      ["settings", "Pengaturan", "⚙"],
      ["logout", "Keluar", "↪"],
    ]
      .map(
        (x) =>
          `<button class="nav ${s.page === x[0] ? "active" : ""}" ${x[0] === "logout" ? 'id="logout"' : ""} data-page="${x[0]}">${x[2]} <span>${x[1]}</span></button>`,
      )
      .join(
        "",
      )}<div class="side-note">Bukti penyerahan tersimpan privat di Google Drive.</div></aside><main class="main"><header class="topbar"><div><div class="eyebrow">DOKUMENTASI PENYERAHAN BARANG</div><h1>THR Management</h1></div><button class="primary" data-page="input">＋ Catat THR</button></header><div id="view"></div><footer>THR Management · THR berupa barang, bukan pembayaran</footer></main></div>`;
  }
  function dashboard() {
    let r = s.records;
    return `<section><div class="welcome"><div><h2>Ringkasan penyerahan</h2><p class="muted">Pantau dokumentasi THR barang secara terpusat.</p></div></div><div class="stats"><div class="stat"><span>Total catatan</span><strong>${r.length}</strong></div><div class="stat"><span>Penerima unik</span><strong>${new Set(r.map((x) => x.recipient_name_snapshot)).size}</strong></div><div class="stat"><span>Terakhir diperbarui</span><strong>${r[0] ? new Date(r[0].timestamp_server).toLocaleDateString("id-ID") : "—"}</strong></div></div><div class="card"><h3>Aktivitas terbaru</h3><div class="gold-line"></div>${r.length ? `<p>${esc(r[0].recipient_name_snapshot)} menerima ${esc(r[0].item_name)}.</p>` : '<div class="empty">Belum ada penyerahan. Mulai dengan mengambil foto bukti.</div>'}</div></section>`;
  }
  function rows(rs) {
    return rs.length
      ? rs
          .map(
            (x) =>
              `<div class="row"><b>${esc(x.recipient_name_snapshot)}</b><span>${esc(x.item_name)}</span><span>${esc(x.officer_name_snapshot)}</span><span>${new Date(x.timestamp_server).toLocaleString("id-ID")}</span><span class="badge">${esc(x.status || "ACTIVE")}</span></div>`,
          )
          .join("")
      : '<div class="empty">Belum ada data penerimaan.</div>';
  }
  function history() {
    return `<section><div class="toolbar"><div><h2>Daftar penerima</h2><p class="muted">Riwayat penyerahan THR.</p></div><input class="search" id="search" placeholder="Cari nama, barang, petugas"></div><div class="table" id="rows">${rows(s.records)}</div></section>`;
  }
  function simple(t, d) {
    return `<section><h2>${t}</h2><p class="muted">${d}</p><div class="card empty">Data tersedia setelah backend Apps Script terhubung dan pengguna terotorisasi.</div></section>`;
  }
  function input() {
    let f = s.form,
      b = "";
    if (s.step === 1)
      b = `<div class="card camera-box"><label><strong>${s.photo ? "Ambil Ulang Foto" : "Ambil Foto"}</strong><span class="muted">Gunakan kamera HP atau pilih dari galeri</span><input id="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label>${s.photo ? `<img class="preview" src="${s.photo}" alt="Preview foto"><button class="primary" id="next-photo">Lanjutkan</button>` : ""}</div>`;
    if (s.step === 2)
      b = `<div class="card">${s.photo ? `<img class="thumb" src="${s.photo}" alt="Thumbnail foto">` : ""}<label class="field">Nama penerima<input id="name" maxlength="120" value="${esc(f.name)}" required></label><label class="field">Jenis barang THR<input id="item" maxlength="160" value="${esc(f.item)}" required></label><label class="field">Nama petugas penyerah<input id="officer" maxlength="120" value="${esc(f.officer)}" required></label><label class="field">Catatan opsional<textarea id="notes" maxlength="500">${esc(f.notes)}</textarea></label><div class="actions"><button class="secondary" id="back-photo">Kembali</button><button class="primary" id="next-data">Lanjutkan</button></div></div>`;
    if (s.step === 3)
      b = `<div class="card"><img class="preview" src="${s.photo}" alt="Foto bukti"><p><b>${esc(f.name)}</b> menerima <b>${esc(f.item)}</b>, diserahkan oleh <b>${esc(f.officer)}</b>.</p><div class="actions"><button class="secondary" id="back-data">Kembali</button><button class="primary" id="save" ${s.loading ? "disabled" : ""}>${s.loading ? "Menyimpan…" : "Simpan"}</button></div></div>`;
    return `<section><h2>Catat penyerahan THR</h2><p class="muted">Ikuti langkah foto, data penerima, dan konfirmasi.</p><div class="steps"><span class="step on">1 Foto</span><span class="step ${s.step > 1 ? "on" : ""}">2 Data</span><span class="step ${s.step > 2 ? "on" : ""}">3 Simpan</span></div>${b}</section>`;
  }
  function renderUserForm() {
    const u = s.edit_user || {};
    $("#view").innerHTML = userForm(u);
  }
  async function loadUsers() {
    if (!s.user || s.user.role !== "SUPER_ADMIN") return;
    s.loading = true;
    try {
      s.users = (await api("users")).data || [];
    } catch (x) {
      if (isSessionError(x)) clearSession("Sesi berakhir. Silakan masuk kembali.");
      else toast(x.message);
    } finally {
      s.loading = false;
    }
  }
  async function saveUser(e) {
    e.preventDefault();
    if (s.loading || !s.user || s.user.role !== "SUPER_ADMIN") return;
    const editUser = s.edit_user;
    const edit = Boolean(editUser);
    if (!confirm(edit ? "Simpan perubahan pengguna?" : "Buat pengguna baru?")) return;
    const payload = {
      user_id: editUser?.user_id,
      username: $("#u-username").value.trim(),
      display_name: $("#u-name").value.trim(),
      role: edit ? $("#u-role").value : "ADMIN",
      active: edit ? $("#u-active").value === "true" : true,
    };
    s.loading = true;
    renderUserForm();
    try {
      await api("save_user", payload);
      s.edit_user = null;
      await loadUsers();
      toast("Pengguna berhasil disimpan.");
      render();
    } catch (x) {
      if (isSessionError(x)) clearSession("Sesi berakhir. Silakan masuk kembali.");
      else toast(x.message);
    } finally {
      s.loading = false;
      render();
    }
  }
  async function render() {
    if (!s.session_token || !s.user) {
      document.querySelector("#app").innerHTML = login();
      bind();
      return;
    }
    if (s.page === "users" && s.user.role !== "SUPER_ADMIN") s.page = "dashboard";
    document.querySelector("#app").innerHTML = shell();
    let v = $("#view");
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
                ? simple(
                    "Audit log",
                    "Riwayat tindakan penting dari seluruh pengguna.",
                  )
                : simple(
                    "Pengaturan",
                    "Status koneksi backend dan konfigurasi penyimpanan.",
                  );
    bind();
  }
  function bind() {
    document.querySelectorAll("[data-page]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (b.id === "logout") return;
          s.page = b.dataset.page;
          if (s.page === "history") await load();
          if (s.page === "users") await loadUsers();
          render();
        }),
    );
    if ($("#login-form"))
      $("#login-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          const d = await api("login", { username: $("#login-username").value });
          const role = String(d.user?.role || "").trim().toUpperCase();
          s.session_token = d.session_token;
          s.user = normalizeUser(d.user);
          s.page = role === "SUPER_ADMIN" ? "users" : "dashboard";
          persistSession();
          if (role === "SUPER_ADMIN") await loadUsers();
          render();
        } catch (x) { toast(x.message); }
      };
    if ($("#logout"))
      $("#logout").onclick = async () => {
        await api("logout").catch(() => {});
        clearSession();
      };
    if ($("#add-user")) $("#add-user").onclick = () => { s.edit_user = null; renderUserForm(); };
    document.querySelectorAll(".edit-user").forEach((b) => b.onclick = () => { s.edit_user = s.users.find((u) => u.user_id === b.dataset.id); renderUserForm(); });
    ["user-search", "user-role", "user-active"].forEach((id) => {
      if ($("#" + id)) $("#" + id).oninput = (e) => { s.user_filter[id === "user-search" ? "query" : id === "user-role" ? "role" : "active"] = e.target.value.toLowerCase(); render(); };
    });
    if ($("#user-form")) $("#user-form").onsubmit = saveUser;
    if ($("#cancel-user")) $("#cancel-user").onclick = () => { s.edit_user = null; render(); };
    let p = $("#photo");
    if (p)
      p.onchange = (e) => {
        let f = e.target.files[0];
        if (!f) return;
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
          f.size > 5242880
        ) {
          toast("Foto harus JPG, PNG, atau WebP maksimal 5 MB.");
          return;
        }
        let r = new FileReader();
        r.onload = () => {
          s.photo = String(r.result);
          render();
        };
        r.readAsDataURL(f);
      };
    if ($("#next-photo"))
      $("#next-photo").onclick = () => {
        s.step = 2;
        render();
      };
    if ($("#back-photo"))
      $("#back-photo").onclick = () => {
        s.step = 1;
        render();
      };
    if ($("#next-data"))
      $("#next-data").onclick = () => {
        s.form = {
          name: $("#name").value.trim(),
          item: $("#item").value.trim(),
          officer: $("#officer").value.trim(),
          notes: $("#notes").value.trim(),
        };
        if (!s.form.name || !s.form.item || !s.form.officer) {
          toast("Nama, barang, dan petugas wajib diisi.");
          return;
        }
        s.step = 3;
        render();
      };
    if ($("#back-data"))
      $("#back-data").onclick = () => {
        s.step = 2;
        render();
      };
    if ($("#save")) $("#save").onclick = save;
    if ($("#search"))
      $("#search").oninput = (e) =>
        ($("#rows").innerHTML = rows(
          s.records.filter((x) =>
            (x.recipient_name_snapshot + x.item_name + x.officer_name_snapshot)
              .toLowerCase()
              .includes(e.target.value.toLowerCase()),
          ),
        ));
  }
  async function load() {
    try {
      s.records = (await api("list")).data || [];
    } catch (e) {
      toast(e.message);
    }
  }
  async function restoreAndValidateSession() {
    if (!restoreSession()) return render();
    try {
      if (s.user.role === "SUPER_ADMIN") await loadUsers();
      else await api("list");
      render();
    } catch (error) {
      if (isSessionError(error)) clearSession("Sesi berakhir. Silakan masuk kembali.");
      else {
        toast("Koneksi gagal. Sesi tetap disimpan; coba lagi.");
        render();
      }
    }
  }
  async function save() {
    s.loading = true;
    render();
    try {
      let r = await api("create", {
        idempotency_key: crypto.randomUUID(),
        recipient_name: s.form.name,
        item_name: s.form.item,
        officer_name: s.form.officer,
        notes: s.form.notes,
        photo: { dataUrl: s.photo },
      });
      s.records.unshift({
        transaction_id: r.data.transaction_id,
        recipient_name_snapshot: s.form.name,
        item_name: s.form.item,
        officer_name_snapshot: s.form.officer,
        timestamp_server: r.data.timestamp_server || new Date().toISOString(),
        status: "ACTIVE",
      });
      s.page = "history";
      s.step = 1;
      s.photo = "";
      s.form = { name: "", item: "", officer: "", notes: "" };
      toast(
        r.demo
          ? "Mode demo: data belum tersimpan ke Google Sheets."
          : "Data dan foto berhasil disimpan.",
      );
      render();
    } catch (e) {
      s.loading = false;
      render();
      toast(e.message);
    }
  }
  restoreAndValidateSession();
})();
