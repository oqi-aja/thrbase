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
    if (!d.ok) throw Error(d.error || "Permintaan gagal.");
    return d;
  }
  function login() {
    return `<main class="login"><form id="login-form" class="card"><div class="brand"><span class="brand-mark">T</span>THR <b>Management</b></div><h1>Masuk</h1><p class="muted">Masukkan username untuk masuk.</p><label class="field">Username<input id="login-username" autocomplete="username" required></label><button class="primary">Masuk</button></form></main>`;
  }
  function usersPage() {
    const f = s.user_filter;
    const list = s.users.filter((u) => (!f.query || `${u.username} ${u.display_name}`.toLowerCase().includes(f.query)) && (!f.role || u.role === f.role) && (f.active === "" || String(u.active) === f.active));
    return `<section><div class="toolbar"><div><h2>Manajemen Pengguna</h2><p class="muted">Khusus SUPER_ADMIN.</p></div><button class="primary" id="add-user">＋ Tambah Pengguna</button></div><div class="stats"><div class="stat"><span>Total pengguna</span><strong>${s.users.length}</strong></div><div class="stat"><span>Aktif</span><strong>${s.users.filter((u) => u.active).length}</strong></div><div class="stat"><span>Nonaktif</span><strong>${s.users.filter((u) => !u.active).length}</strong></div></div><div class="toolbar"><input class="search" id="user-search" placeholder="Cari username atau nama" value="${esc(f.query)}"><select id="user-role"><option value="">Semua role</option>${["ADMIN"].map((r) => `<option value="${r}" ${f.role === r ? "selected" : ""}>${r}</option>`).join("")}</select><select id="user-active"><option value="">Semua status</option><option value="true" ${f.active === "true" ? "selected" : ""}>Aktif</option><option value="false" ${f.active === "false" ? "selected" : ""}>Nonaktif</option></select></div><div class="table">${list.map((u) => `<div class="row user-row"><b>${esc(u.username)}</b><span>${esc(u.display_name)}</span><span>${esc(u.role)}</span><span class="badge">${u.active ? "ACTIVE" : "INACTIVE"}</span><button class="secondary edit-user" data-id="${esc(u.user_id)}">Edit</button></div>`).join("") || '<div class="empty">Tidak ada pengguna.</div>'}</div></section>`;
  }
  function userForm(u = {}) {
    return `<section><div class="card"><h2>${u.user_id ? "Edit" : "Tambah"} Pengguna</h2><form id="user-form"><label class="field">Username<input id="u-username" required pattern="[a-z0-9._-]{3,40}" value="${esc(u.username || "")}" ${u.user_id ? "readonly" : ""}></label><label class="field">Nama lengkap<input id="u-name" required value="${esc(u.display_name || "")}"></label><label class="field">Role<select id="u-role">${["ADMIN"].map((r) => `<option ${u.role === r ? "selected" : ""}>${r}</option>`).join("")}</select></label><label class="field">Status<select id="u-active"><option value="true" ${u.active !== false ? "selected" : ""}>Aktif</option><option value="false" ${u.active === false ? "selected" : ""}>Nonaktif</option></select></label><div class="actions"><button type="button" class="secondary" id="cancel-user">Batal</button><button class="primary">Simpan</button></div></form></div></section>`;
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
    s.users = (await api("users")).data || [];
  }
  async function saveUser(e) {
    e.preventDefault();
    if (!confirm(s.edit_user ? "Simpan perubahan pengguna?" : "Buat pengguna baru?")) return;
    try {
      await api("save_user", { user_id: s.edit_user?.user_id, username: $("#u-username").value, display_name: $("#u-name").value, role: $("#u-role").value, active: $("#u-active").value === "true" });
      toast("Pengguna berhasil disimpan.");
      s.edit_user = null;
      await loadUsers();
      render();
    } catch (x) { toast(x.message); }
  }
  async function render() {
    if (!s.session_token || !s.user) {
      document.querySelector("#app").innerHTML = login();
      bind();
      return;
    }
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
          s.session_token = d.session_token;
          s.user = d.user;
          s.page = "dashboard";
          render();
        } catch (x) { toast(x.message); }
      };
    if ($("#logout"))
      $("#logout").onclick = async () => {
        await api("logout").catch(() => {});
        s.session_token = "";
        s.user = null;
        render();
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
  render();
})();
