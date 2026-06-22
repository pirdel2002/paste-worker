export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/save") {
      const form = await request.formData();

      let room = String(form.get("room") || "").trim().toLowerCase();
      const text = String(form.get("text") || "");

      if (!room) room = randomRoom();

      room = room.replace(/[^a-z0-9_-]/g, "").slice(0, 32);

      if (!room) {
        return html(env, "کد نامعتبر", `<main><h1>کد اتاق نامعتبر است</h1><a href="/">بازگشت</a></main>`, 400);
      }

      const maxLen = Number(env.MAX_TEXT_LENGTH || 50000);

      if (text.length > maxLen) {
        return html(env, "متن بزرگ است", `<main><h1>متن بیش از حد بزرگ است</h1><a href="/">بازگشت</a></main>`, 413);
      }

      const forever = form.get("forever") === "1";
      const ttl = getTtl(form, env);

      if (forever) {
        await env.CLIPS.put(room, text);
      } else {
        await env.CLIPS.put(room, text, { expirationTtl: ttl });
      }

      return Response.redirect(`${url.origin}/r/${room}`, 302);
    }

    if (url.pathname === "/new") {
      return html(env, "متن جدید", newPage(env));
    }

    if (url.pathname === "/open") {
      return html(env, "مشاهده متن", openPage());
    }

    if (url.pathname.startsWith("/r/")) {
      const room = url.pathname.replace("/r/", "").trim().toLowerCase();
      const text = await env.CLIPS.get(room);
      return html(env, `اتاق ${room}`, roomPage(room, text || ""));
    }

    return html(env, env.SITE_TITLE || "Clipboard", landingPage(env));
  },
};

function landingPage(env) {
  return `
    <main class="landing">
      <section class="hero">
        <div class="badge">Online Clipboard</div>
        <h1>${escapeHtml(env.SITE_TITLE || "Pirdel Clipboard")}</h1>
        <p class="hint">انتقال سریع متن بین دستگاه‌ها، بدون ورود و بدون پیچیدگی.</p>
      </section>

      <section class="choice-grid">
        <a class="choice-card" href="/new">
          <span>01</span>
          <h2>متن جدید بگذار</h2>
          <p>یک متن ذخیره کن و با کد اتاق روی دستگاه دیگر بازش کن.</p>
        </a>

        <a class="choice-card" href="/open">
          <span>02</span>
          <h2>متن ذخیره‌شده را ببین</h2>
          <p>کد اتاق را وارد کن و متن را سریع کپی کن.</p>
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
        <p class="hint">کد اتاق اختیاری است. اگر خالی بماند، کد تصادفی ساخته می‌شود.</p>
      </section>

      <form method="POST" action="/save" class="card">
        <label>کد اتاق</label>
        <input name="room" placeholder="اختیاری؛ مثل office یا 4821">

        <label>متن</label>
        <textarea name="text" placeholder="متن را اینجا وارد کن..." autofocus></textarea>

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

        <div class="actions">
          <button type="submit">ذخیره متن</button>
          <a href="/">بازگشت</a>
        </div>
      </form>
    </main>
  `;
}

function openPage() {
  return `
    <main>
      <section class="hero">
        <div class="badge">Open Room</div>
        <h1>مشاهده متن</h1>
        <p class="hint">کد اتاق را وارد کن تا متن ذخیره‌شده نمایش داده شود.</p>
      </section>

      <section class="card">
        <label>کد اتاق</label>
        <div class="row">
          <input id="openRoom" placeholder="مثلاً 4821 یا office" autofocus>
          <button type="button" onclick="openRoom()">باز کن</button>
        </div>
        <div class="actions">
          <a href="/">بازگشت</a>
        </div>
      </section>
    </main>

    <script>
      function openRoom() {
        const room = document.getElementById('openRoom').value.trim();
        if (room) location.href = '/r/' + encodeURIComponent(room);
      }

      document.getElementById('openRoom').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') openRoom();
      });
    </script>
  `;
}

function roomPage(room, text) {
  return `
    <main>
      <section class="hero">
        <div class="badge">Room</div>
        <h1>اتاق <code>${escapeHtml(room)}</code></h1>
        <p class="hint">متن را کپی کن یا همان اتاق را به‌روزرسانی کن.</p>
      </section>

      <form method="POST" action="/save" class="card">
        <input type="hidden" name="room" value="${escapeHtml(room)}">

        <label>متن</label>
        <textarea id="clipText" name="text" placeholder="متنی برای نمایش وجود ندارد.">${escapeHtml(text)}</textarea>

        <label>مدت نگهداری جدید</label>
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

        <div class="actions">
          <button type="button" onclick="copyText()">کپی</button>
          <button type="submit">ذخیره تغییرات</button>
          <a href="/">صفحه اصلی</a>
        </div>
      </form>
    </main>

    <script>
      async function copyText() {
        const text = document.getElementById('clipText').value;
        await navigator.clipboard.writeText(text);
        alert('کپی شد');
      }
    </script>
  `;
}

function html(env, title, body, status = 200) {
  return new Response(`<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>

  <style>
    @font-face {
      font-family: Vazirmatn;
      src: url("https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn-Regular.woff2") format("woff2");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: Vazirmatn;
      src: url("https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn-Bold.woff2") format("woff2");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }

    * {
      box-sizing: border-box;
    }

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

    p {
      margin: 0;
      line-height: 2;
    }

    .hint {
      color: #cbd5e1;
      font-size: 16px;
    }

    .choice-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    .choice-card,
    .card {
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

    input:focus, textarea:focus, select:focus {
      border-color: #60a5fa;
      box-shadow: 0 0 0 3px rgba(96, 165, 250, .15);
    }

    textarea {
      min-height: 340px;
      direction: ltr;
      resize: vertical;
      line-height: 1.8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
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

    .row button {
      white-space: nowrap;
    }

    code {
      direction: ltr;
      display: inline-block;
      color: #93c5fd;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    @media (max-width: 780px) {
      main {
        padding: 34px 14px;
      }

      .choice-grid {
        grid-template-columns: 1fr;
      }

      h1 {
        font-size: 29px;
      }

      .row,
      .ttl-grid {
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
      "cache-control": "no-store",
    },
  });
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

function randomRoom() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}
