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
        return html(env, "Invalid room", `<main><h1>کد اتاق نامعتبر است</h1><a href="/">بازگشت</a></main>`, 400);
      }

      const maxLen = Number(env.MAX_TEXT_LENGTH || 50000);

      if (text.length > maxLen) {
        return html(env, "Too large", `<main><h1>متن بیش از حد بزرگ است</h1><a href="/">بازگشت</a></main>`, 413);
      }

      const ttl = Number(env.DEFAULT_TTL || 600);

      await env.CLIPS.put(room, text, {
        expirationTtl: ttl,
      });

      return Response.redirect(`${url.origin}/r/${room}`, 302);
    }

    if (url.pathname.startsWith("/r/")) {
      const room = url.pathname.replace("/r/", "").trim().toLowerCase();
      const text = await env.CLIPS.get(room);

      return html(env, `Room ${room}`, roomPage(room, text || ""));
    }

    return html(env, env.SITE_TITLE || "Clipboard", homePage());
  },
};

function homePage() {
  return `
    <main>
      <h1>Online Clipboard</h1>
      <p class="hint">برای انتقال سریع متن بین موبایل و کامپیوتر</p>

      <form method="POST" action="/save">
        <label>کد اتاق، اختیاری</label>
        <input name="room" placeholder="مثلاً office یا 4821">

        <label>متن</label>
        <textarea name="text" placeholder="متن را اینجا Paste کن..." autofocus></textarea>

        <button type="submit">ذخیره و ساخت لینک</button>
      </form>

      <div class="open-box">
        <label>باز کردن اتاق</label>
        <div class="row">
          <input id="openRoom" placeholder="کد اتاق">
          <button type="button" onclick="openRoom()">باز کن</button>
        </div>
      </div>
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
      <h1>Room: <code>${escapeHtml(room)}</code></h1>
      <p class="hint">این متن بعد از حدود ۱۰ دقیقه حذف می‌شود.</p>

      <form method="POST" action="/save">
        <input type="hidden" name="room" value="${escapeHtml(room)}">

        <label>متن</label>
        <textarea id="clipText" name="text" placeholder="متن را اینجا وارد کن...">${escapeHtml(text)}</textarea>

        <div class="actions">
          <button type="submit">ذخیره / آپدیت</button>
          <button type="button" onclick="copyText()">Copy</button>
          <a href="/">اتاق جدید</a>
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
    body {
      margin: 0;
      background: #0f172a;
      color: #e5e7eb;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 820px;
      margin: 40px auto;
      padding: 20px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 30px;
    }
    .hint {
      color: #94a3b8;
      margin-bottom: 24px;
    }
    label {
      display: block;
      margin: 16px 0 8px;
      color: #cbd5e1;
    }
    input, textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #334155;
      background: #020617;
      color: #e5e7eb;
      border-radius: 14px;
      padding: 14px;
      font-size: 16px;
      outline: none;
    }
    textarea {
      min-height: 330px;
      direction: ltr;
      resize: vertical;
      line-height: 1.7;
    }
    button, a {
      border: 0;
      background: #2563eb;
      color: white;
      border-radius: 12px;
      padding: 12px 18px;
      font-size: 15px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 14px;
    }
    .open-box {
      margin-top: 34px;
      padding-top: 24px;
      border-top: 1px solid #334155;
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
