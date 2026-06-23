export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/save") {
      const form = await request.formData();

      let code = cleanCode(form.get("code") || randomCode());
      const text = String(form.get("text") || "").trim();
      const password = String(form.get("password") || "");

      if (!code) return page(env, "خطا", errorPage("شناسه نامعتبر است"), 400);
      if (!text) return page(env, "خطا", errorPage("متن خالی قابل ذخیره نیست."), 400);

      const existing = await getClip(env, code);
      if (existing) {
        return page(env, "خطا", errorPage("این شناسه قبلاً استفاده شده است. شناسه دیگری انتخاب کن."), 409);
      }

      const maxLen = Number(env.MAX_TEXT_LENGTH || 50000);
      if (text.length > maxLen) return page(env, "خطا", errorPage("متن بیش از حد بزرگ است."), 413);

      const forever = form.get("forever") === "1";
      const ttl = getTtl(form, env);
      const now = Date.now();

      const item = {
        v: 3,
        text,
        createdAt: now,
        expiresAt: forever ? null : now + ttl * 1000,
        passwordHash: password ? await sha256(password) : null,
      };

      const options = forever ? undefined : { expirationTtl: ttl };
      await env.CLIPS.put(code, JSON.stringify(item), options);

      return Response.redirect(`${url.origin}/c/${code}`, 302);
    }

    if (request.method === "POST" && url.pathname === "/admin/delete") {
      const auth = checkAdmin(request, env);
      if (!auth.ok) return auth.response;

      const form = await request.formData();
      const code = cleanCode(form.get("code") || "");

      if (code) await env.CLIPS.delete(code);

      return Response.redirect(`${url.origin}/admin`, 302);
    }

    if (url.pathname === "/api/get") {
      const code = cleanCode(url.searchParams.get("code") || "");
      const password = url.searchParams.get("password") || "";
      const item = await getClip(env, code);

      if (!item) return json({ ok: false, error: "not_found" }, 404);

      if (item.passwordHash) {
        const ok = await verifyPassword(password, item.passwordHash);
        if (!ok) return json({ ok: false, error: "password_required" }, 403);
      }

      return json({ ok: true, text: item.text || "" });
    }

    if (url.pathname === "/admin") {
      const auth = checkAdmin(request, env);
      if (!auth.ok) return auth.response;
      return page(env, "مدیریت", await adminPage(env));
    }

    if (url.pathname === "/new") return page(env, "متن جدید", newPage(env));
    if (url.pathname === "/open") return page(env, "مشاهده متن", openPage());

    if (url.pathname.startsWith("/c/")) {
      const code = cleanCode(url.pathname.replace("/c/", ""));
      const item = await getClip(env, code);
      return page(env, `شناسه ${code}`, viewPage(code, item));
    }

    return page(env, env.SITE_TITLE || "Clipboard", landingPage(env));
  },
};

function landingPage(env) {
  return `
    <main class="landing">
      <section class="hero">
        <div class="badge">Online Clipboard</div>
        <h1>${e(env.SITE_TITLE || "Pirdel Clipboard")}</h1>
        <p class="hint">انتقال سریع متن بین موبایل، لپ‌تاپ و هر دستگاه دیگر.</p>
      </section>

      <section class="choice-grid">
        <a class="choice-card" href="/new">
          <span>01</span>
          <h2>متن جدید بساز</h2>
          <p>یک متن ذخیره کن و با شناسه اشتراک روی دستگاه دیگر باز کن.</p>
        </a>

        <a class="choice-card" href="/open">
          <span>02</span>
          <h2>متن ذخیره‌شده را باز کن</h2>
          <p>شناسه اشتراک را وارد کن و متن را ببین.</p>
        </a>
      </section>
    </main>
  `;
}

function newPage(env) {
  return `
    <main>
      <section class="hero">
        <div class="badge">New Text</div>
        <h1>متن جدید</h1>
        <p class="hint">شناسه اختیاری است. اگر خالی بماند، یک شناسه تصادفی ساخته می‌شود.</p>
      </section>

      <form method="POST" action="/save" class="card">
        <label>شناسه اشتراک</label>
        <input name="code" placeholder="اختیاری؛ مثل office یا 4821">

        <label>متن</label>
        <textarea id="clipText" name="text" dir="auto" placeholder="متن را اینجا وارد کن..." autofocus required></textarea>

        <label>مدت نگهداری</label>
        <div class="ttl-grid">
          <input name="ttl" type="number" min="1" placeholder="خالی = ۱۰ دقیقه">
          <select name="ttl_unit">
            <option value="minutes">دقیقه</option>
            <option value="hours">ساعت</option>
            <option value="days">روز</option>
          </select>
        </div>

        <label class="check">
          <input type="checkbox" name="forever" value="1">
          نگهداری دائمی
        </label>

        <label>رمز مشاهده، اختیاری</label>
        <input name="password" type="password" placeholder="اگر وارد شود، مشاهده متن نیاز به رمز دارد">

        <div class="actions">
          <button type="submit">ذخیره متن</button>
          <a href="/">بازگشت</a>
        </div>
      </form>

      ${sharedScripts()}
    </main>
  `;
}

function openPage() {
  return `
    <main>
      <section class="hero">
        <div class="badge">Open Text</div>
        <h1>مشاهده متن</h1>
        <p class="hint">شناسه اشتراک را وارد کن.</p>
      </section>

      <section class="card">
        <label>شناسه اشتراک</label>
        <div class="row">
          <input id="openCode" placeholder="مثلاً 4821 یا office" autofocus>
          <button type="button" onclick="openCode()">باز کن</button>
        </div>

        <div class="actions">
          <a href="/">بازگشت</a>
        </div>
      </section>
    </main>

    <script>
      function openCode() {
        const code = document.getElementById('openCode').value.trim();
        if (code) location.href = '/c/' + encodeURIComponent(code);
      }

      document.getElementById('openCode').addEventListener('keydown', e => {
        if (e.key === 'Enter') openCode();
      });
    </script>
  `;
}

function viewPage(code, item) {
  if (!item) {
    return `
      <main>
        <section class="card">
          <h1>متن پیدا نشد</h1>
          <p class="hint">این شناسه وجود ندارد یا منقضی شده است.</p>
          <div class="actions">
            <a href="/">صفحه اصلی</a>
          </div>
        </section>
      </main>
    `;
  }

  const protectedText = !!item.passwordHash;

  return `
    <main>
      <section class="hero">
        <div class="badge">Shared Text</div>
        <h1>شناسه <code>${e(code)}</code></h1>
        <p class="hint">متن فقط قابل مشاهده و کپی است. امکان تغییر بعد از ذخیره بسته شده است.</p>

        <div class="share-row">
          <input id="shareUrl" type="text" readonly onclick="this.select()">
          <button class="icon-btn" type="button" title="کپی لینک" onclick="copyLink()">⧉</button>
        </div>

        <div id="remain" class="remain"></div>
      </section>

      <section class="card">
        ${protectedText ? `
          <div id="passwordBox">
            <label>رمز مشاهده</label>
            <div class="row">
              <input id="viewPassword" type="password" placeholder="رمز را وارد کن">
              <button type="button" onclick="loadText()">نمایش</button>
            </div>
          </div>
        ` : ""}

        <label>متن</label>

        <div class="text-shell">
          <textarea id="clipText" readonly dir="auto" placeholder="متنی برای نمایش وجود ندارد.">${protectedText ? "" : e(item.text)}</textarea>

          <div class="side-icons">
            <button type="button" class="icon-btn" title="کپی متن" onclick="copyText()">⧉</button>
            <button type="button" class="icon-btn" title="اشتراک‌گذاری" onclick="shareLink()">↗</button>
            <button type="button" class="icon-btn" title="QR متن" onclick="showQr()">▣</button>
          </div>
        </div>

        <div class="actions">
          <a href="/">صفحه اصلی</a>
        </div>
      </section>

      <div id="qrModal" class="modal" hidden>
        <div class="modal-backdrop" onclick="closeQr()"></div>
        <div class="modal-card">
          <button class="modal-close" type="button" onclick="closeQr()">×</button>
          <h2>QR متن</h2>
          <p class="modal-hint">این QR از خود متن ساخته می‌شود.</p>
          <img id="qrImage" alt="QR Code">
          <small>برای متن‌های طولانی، QR ممکن است سخت اسکن شود.</small>
        </div>
      </div>

      <script>
        const CODE = ${JSON.stringify(code)};
        const EXPIRES_AT = ${JSON.stringify(item.expiresAt || null)};
        const PROTECTED = ${JSON.stringify(protectedText)};
        const clipText = document.getElementById('clipText');
        const shareUrlInput = document.getElementById('shareUrl');

        function fullShareUrl() {
          return window.location.origin + '/c/' + encodeURIComponent(CODE);
        }

        shareUrlInput.value = fullShareUrl();

        updateTextDirection(clipText);
        startCountdown(EXPIRES_AT);

        if (!PROTECTED) {
          updateTextDirection(clipText);
        }

        async function loadText() {
          const password = document.getElementById('viewPassword')?.value || '';
          const res = await fetch('/api/get?code=' + encodeURIComponent(CODE) + '&password=' + encodeURIComponent(password));
          const data = await res.json();

          if (!data.ok) {
            alert('رمز اشتباه است یا متن وجود ندارد');
            return;
          }

          clipText.value = data.text || '';
          updateTextDirection(clipText);
          document.getElementById('passwordBox').hidden = true;
        }

        async function copyText() {
          if (!clipText.value.trim()) return alert('متنی برای کپی وجود ندارد');
          await navigator.clipboard.writeText(clipText.value);
          alert('متن کپی شد');
        }

        async function copyLink() {
          await navigator.clipboard.writeText(fullShareUrl());
          alert('لینک کپی شد');
        }

        async function shareLink() {
          const url = fullShareUrl();

          if (navigator.share) {
            await navigator.share({ title: document.title, url });
          } else {
            await navigator.clipboard.writeText(url);
            alert('لینک کپی شد');
          }
        }

        function showQr() {
          const text = clipText.value.trim();

          if (!text) return alert('متنی برای ساخت QR وجود ندارد');
          if (text.length > 1200) return alert('متن برای QR خیلی طولانی است.');

          document.getElementById('qrImage').src =
            'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(text);

          document.getElementById('qrModal').hidden = false;
          document.body.classList.add('modal-open');
        }

        function closeQr() {
          document.getElementById('qrModal').hidden = true;
          document.body.classList.remove('modal-open');
        }

        document.addEventListener('keydown', e => {
          if (e.key === 'Escape') closeQr();
        });
      </script>

      ${sharedScripts()}
    </main>
  `;
}

async function adminPage(env) {
  const list = await env.CLIPS.list({ limit: 1000 });
  const rows = [];

  for (const key of list.keys) {
    const item = await getClip(env, key.name);
    if (!item) continue;

    rows.push(`
      <tr>
        <td><code>${e(key.name)}</code></td>
        <td>${e((item.text || "").slice(0, 120))}</td>
        <td>${item.passwordHash ? "دارد" : "ندارد"}</td>
        <td>${item.expiresAt ? new Date(item.expiresAt).toLocaleString("fa-IR") : "دائمی"}</td>
        <td>
          <form method="POST" action="/admin/delete" onsubmit="return confirm('حذف شود؟')">
            <input type="hidden" name="code" value="${e(key.name)}">
            <button class="danger" type="submit">حذف</button>
          </form>
        </td>
      </tr>
    `);
  }

  return `
    <main>
      <section class="hero">
        <div class="badge">Admin</div>
        <h1>پنل مدیریت</h1>
        <p class="hint">مشاهده و حذف همه متن‌های ذخیره‌شده.</p>
      </section>

      <section class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>شناسه</th>
                <th>متن</th>
                <th>رمز</th>
                <th>انقضا</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.join("") : `<tr><td colspan="5">موردی وجود ندارد.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  `;
}

function sharedScripts() {
  return `
    <script>
      function updateTextDirection(el) {
        if (!el) return;
        const value = el.value.trim();
        const hasPersian = /[\\u0600-\\u06FF]/.test(value);
        el.dir = hasPersian ? 'rtl' : 'ltr';
        el.style.textAlign = hasPersian ? 'right' : 'left';
      }

      document.querySelectorAll('textarea').forEach(el => {
        updateTextDirection(el);
        el.addEventListener('input', () => updateTextDirection(el));
      });

      function startCountdown(expiresAt) {
        const el = document.getElementById('remain');
        if (!el) return;

        if (!expiresAt) {
          el.textContent = 'بدون تاریخ حذف';
          return;
        }

        function tick() {
          const diff = expiresAt - Date.now();
          if (diff <= 0) {
            el.textContent = 'منقضی شده';
            return;
          }

          const m = Math.floor(diff / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          el.textContent = 'زمان باقی‌مانده: ' + m + ' دقیقه و ' + s + ' ثانیه';
          setTimeout(tick, 1000);
        }

        tick();
      }
    </script>
  `;
}

function page(env, title, body, status = 200) {
  return new Response(`<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${e(title)}</title>
  <style>
    @font-face {
      font-family: Vazirmatn;
      src: url("https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn-Regular.woff2") format("woff2");
      font-weight: 400;
      font-display: swap;
    }

    @font-face {
      font-family: Vazirmatn;
      src: url("https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn-Bold.woff2") format("woff2");
      font-weight: 700;
      font-display: swap;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top right, rgba(37, 99, 235, .22), transparent 34%),
        radial-gradient(circle at bottom left, rgba(14, 165, 233, .12), transparent 36%),
        linear-gradient(135deg, #020617, #0f172a);
      color: #e5e7eb;
      font-family: Vazirmatn, Tahoma, Arial, sans-serif;
    }

    body.modal-open { overflow: hidden; }

    main {
      max-width: 980px;
      margin: 0 auto;
      padding: 52px 20px;
    }

    .landing {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .hero {
      text-align: center;
      margin-bottom: 30px;
    }

    .badge {
      display: inline-block;
      margin-bottom: 14px;
      padding: 6px 12px;
      border: 1px solid rgba(148, 163, 184, .25);
      border-radius: 999px;
      background: rgba(15, 23, 42, .65);
      color: #93c5fd;
      font-size: 13px;
      direction: ltr;
    }

    h1 {
      margin: 0 0 10px;
      font-size: 38px;
      font-weight: 700;
      letter-spacing: -0.8px;
    }

    h2 {
      margin: 0 0 10px;
      font-size: 23px;
      font-weight: 700;
    }

    p { margin: 0; line-height: 2; }

    .hint {
      color: #cbd5e1;
      font-size: 16px;
    }

    .remain {
      margin-top: 12px;
      color: #93c5fd;
      font-size: 14px;
    }

    .choice-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    .choice-card, .card {
      border: 1px solid rgba(148, 163, 184, .22);
      background: rgba(15, 23, 42, .72);
      backdrop-filter: blur(16px);
      border-radius: 24px;
      padding: 24px;
      box-shadow: 0 20px 60px rgba(0,0,0,.24);
    }

    .choice-card {
      color: #e5e7eb;
      text-decoration: none;
      min-height: 190px;
      transition: transform .16s ease, border-color .16s ease, background .16s ease;
    }

    .choice-card:hover {
      transform: translateY(-3px);
      border-color: rgba(147, 197, 253, .6);
      background: rgba(30, 41, 59, .78);
    }

    .choice-card span {
      display: inline-block;
      margin-bottom: 26px;
      color: #93c5fd;
      direction: ltr;
      font-size: 14px;
    }

    label {
      display: block;
      margin: 18px 0 8px;
      color: #cbd5e1;
      font-size: 14px;
    }

    input, textarea, select {
      width: 100%;
      border: 1px solid #334155;
      background: #020617;
      color: #e5e7eb;
      border-radius: 16px;
      padding: 14px 15px;
      font-size: 15px;
      outline: none;
      font-family: Vazirmatn, Tahoma, Arial, sans-serif;
    }

    textarea {
      min-height: 340px;
      resize: vertical;
      line-height: 1.9;
    }

    textarea[readonly] {
      cursor: default;
    }

    input:focus, textarea:focus, select:focus {
      border-color: #60a5fa;
      box-shadow: 0 0 0 3px rgba(96, 165, 250, .15);
    }

    button, a {
      border: 0;
      background: #2563eb;
      color: white;
      border-radius: 14px;
      padding: 12px 18px;
      font-size: 15px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      font-family: Vazirmatn, Tahoma, Arial, sans-serif;
      transition: transform .15s ease, background .15s ease;
    }

    button:hover, a:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }

    .danger { background: #dc2626; }
    .danger:hover { background: #b91c1c; }

    .ttl-grid {
      display: grid;
      grid-template-columns: 1fr 120px;
      gap: 10px;
    }

    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
      margin-bottom: 16px;
      cursor: pointer;
      user-select: none;
    }

    .check input {
      width: auto;
      min-width: 18px;
      height: 18px;
    }

    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 16px;
    }

    .row {
      display: flex;
      gap: 10px;
    }

    .row button { white-space: nowrap; }

    .share-row {
      max-width: 560px;
      margin: 18px auto 0;
      display: flex;
      gap: 8px;
    }

    .share-row input {
      direction: ltr;
      text-align: left;
      font-size: 13px;
    }

    .text-shell {
      position: relative;
    }

    .text-shell textarea {
      padding-left: 56px;
    }

    .side-icons {
      position: absolute;
      left: 12px;
      top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .icon-btn {
      width: 38px;
      height: 38px;
      padding: 0;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: #1e293b;
      font-size: 18px;
      line-height: 1;
    }

    .icon-btn:hover {
      background: #2563eb;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      direction: rtl;
    }

    th, td {
      border-bottom: 1px solid #334155;
      padding: 12px;
      text-align: right;
      vertical-align: top;
      font-size: 14px;
    }

    .table-wrap {
      overflow-x: auto;
    }

    .modal[hidden] { display: none; }

    .modal {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      padding: 20px;
    }

    .modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(2, 6, 23, .72);
      backdrop-filter: blur(8px);
    }

    .modal-card {
      position: relative;
      width: min(420px, 100%);
      border: 1px solid rgba(148, 163, 184, .24);
      background: #0f172a;
      border-radius: 24px;
      padding: 24px;
      box-shadow: 0 30px 90px rgba(0,0,0,.45);
      text-align: center;
    }

    .modal-card img {
      margin-top: 16px;
      background: white;
      padding: 12px;
      border-radius: 16px;
      max-width: 320px;
      width: 100%;
    }

    .modal-card small {
      display: block;
      margin-top: 12px;
      color: #94a3b8;
      line-height: 1.9;
    }

    .modal-hint {
      color: #cbd5e1;
      font-size: 14px;
    }

    .modal-close {
      position: absolute;
      top: 12px;
      left: 12px;
      width: 36px;
      height: 36px;
      padding: 0;
      border-radius: 50%;
      font-size: 24px;
      line-height: 1;
      background: #1e293b;
    }

    code {
      direction: ltr;
      display: inline-block;
      color: #93c5fd;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    @media (max-width: 780px) {
      main { padding: 34px 14px; }
      .choice-grid { grid-template-columns: 1fr; }
      h1 { font-size: 29px; }
      .row, .ttl-grid {
        grid-template-columns: 1fr;
        flex-direction: column;
      }
    }
  </style>
</head>
<body>${body}</body>
</html>`, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function errorPage(message) {
  return `<main><section class="card"><h1>خطا</h1><p>${e(message)}</p><div class="actions"><a href="/">صفحه اصلی</a></div></section></main>`;
}

async function getClip(env, code) {
  const raw = await env.CLIPS.get(code);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v >= 3) return parsed;
  } catch {}

  return {
    v: 3,
    text: raw,
    createdAt: Date.now(),
    expiresAt: null,
    passwordHash: null,
  };
}

function getTtl(form, env) {
  const defaultTtl = Number(env.DEFAULT_TTL || 600);
  const raw = String(form.get("ttl") || "").trim();
  const unit = String(form.get("ttl_unit") || "minutes");

  if (!raw) return defaultTtl;

  const value = Math.max(1, Number(raw));
  if (!Number.isFinite(value)) return defaultTtl;

  if (unit === "hours") return value * 60 * 60;
  if (unit === "days") return value * 24 * 60 * 60;
  return value * 60;
}

function cleanCode(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
}

function randomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(password, hash) {
  if (!hash) return true;
  if (!password) return false;
  return await sha256(password) === hash;
}

function checkAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return {
      ok: false,
      response: page(env, "غیرفعال", errorPage("ADMIN_PASSWORD تنظیم نشده است."), 500)
    };
  }

  const auth = request.headers.get("Authorization") || "";
  const expected = "Basic " + btoa("admin:" + env.ADMIN_PASSWORD);

  if (auth === expected) return { ok: true };

  return {
    ok: false,
    response: new Response("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Admin Panel"'
      }
    })
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function e(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}
