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
        await env.CLIPS.put(room, text, {
          expirationTtl: ttl,
        });
      }

      return Response.redirect(`${url.origin}/r/${room}`, 302);
    }

    if (url.pathname.startsWith("/r/")) {
      const room = url.pathname.replace("/r/", "").trim().toLowerCase();
      const text = await env.CLIPS.get(room);

      return html(env, `اتاق ${room}`, roomPage(room, text || ""));
    }

    return html(env, env.SITE_TITLE || "Clipboard", homePage(env));
  },
};

function homePage(env) {
  return `
    <main>
      <section class="hero">
        <div class="badge">Online Clipboard</div>
        <h1>${escapeHtml(env.SITE_TITLE || "Pirdel Clipboard")}</h1>
        <p class="hint">می‌خواهی متن جدید برای کپی کردن بذاری یا می‌خواهی یک متن کپی‌شده را ببینی؟</p>
      </section>

      <section class="cards">
        <div class="card">
          <h2>متن جدید می‌گذارم</h2>
          <p>متن را اینجا وارد کن. اگر کد اتاق را خالی بگذاری، خودش یک کد تصادفی می‌سازد.</p>

          <form method="POST" action="/save">
            <label>کد اتاق، اختیاری</label>
            <input name="room" placeholder="مثلاً office یا 4821">

            <label>متن برای کپی کردن</label>
            <textarea name="text" placeholder="متن را اینجا Paste کن..." autofocus></textarea>

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

            <button type="submit">ذخیره و ساخت لینک</button>
          </form>
        </div>

        <div class="card">
          <h2>متن کپی‌شده را می‌بینم</h2>
          <p>کد اتاق را وارد کن تا متن ذخیره‌شده را ببینی و کپی کنی.</p>

          <div class="open-box">
            <label>کد اتاق</label>
            <div class="row">
              <input id="openRoom" placeholder="مثلاً 4821 یا office">
              <button type="button" onclick="openRoom()">باز کن</button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <script>
      function openRoom() {
        const room = document.getElementById('openRoom').value.trim();
        if (room) location.href = '/r/' + encodeURIComponent(room);
      }
    </script>
  `;
}

function roomPage(room, text) {
  return `
    <main>
      <section class="hero">
        <div class="badge">Room</div>
        <h1>کد اتاق: <code>${escapeHtml(room)}</code></h1>
        <p class="hint">اگر زمان نگهداری را خالی بگذاری، متن ۱۰ دقیقه می‌ماند.</p>
      </section>

      <form method="POST" action="/save" class="card">
        <input type="hidden" name="room" value="${escapeHtml(room)}">

        <label>متن</label>
        <textarea id="clipText" name="text" placeholder="متن را اینجا وارد کن...">${escapeHtml(text)}</textarea>

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
          <button type="submit">ذخیره / آپدیت</button>
          <button type="button" onclick="copyText()">کپی متن</button>
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
        radial-gradient(circle at top right, rgba(37, 99, 235, .25), transparent 35%),
        linear-gradient(135deg, #020617, #0f172a);
      color: #e5e7eb;
      font-family: Vazirmatn, Tahoma, Arial, sans-serif;
    }

    main {
      max-width: 1050px;
      margin: 0 auto;
      padding: 48px 20px;
    }

    .hero {
      text-align: center;
      margin-bottom: 28px;
    }

    .badge {
      display: inline-block;
      margin-bottom: 14px;
      padding: 6px 12px;
      border: 1px solid #334155;
      border-radius: 999px;
      background: rgba(15, 23, 42, .7);
      color: #93c5fd;
      font-size: 13px;
      direction: ltr;
    }

    h1 {
      margin: 0 0 10px;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    h2 {
      margin: 0 0 8px;
      font-size: 22px;
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

    .cards {
      display: grid;
      grid-template-columns: 1.3fr .9fr;
      gap: 18px;
      align-items: start;
    }

    .card {
      border: 1px solid rgba(148, 163, 184, .22);
      background: rgba(15, 23, 42, .72);
      backdrop-filter: blur(16px);
      border-radius: 22px;
      padding: 22px;
      box-shadow: 0 20px 60px rgba(0,0,0,.25);
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
      min-height: 320px;
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
      margin-top: 14px;
    }

    .open-box {
      margin-top: 18px;
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
        padding: 30px 14px;
      }

      .cards {
        grid-template-columns: 1fr;
      }

      h1 {
        font-size: 28px;
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
