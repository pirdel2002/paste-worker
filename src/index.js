export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/new") {
      const form = await request.formData();
      const text = String(form.get("text") || "").trim();

      if (!text) {
        return new Response("Empty paste", { status: 400 });
      }

      if (text.length > 100_000) {
        return new Response("Paste too large", { status: 413 });
      }

      const id = crypto.randomUUID().slice(0, 8);
      const ttl = Number(env.DEFAULT_TTL || 604800);

      await env.PASTES.put(id, text, {
        expirationTtl: ttl,
      });

      return Response.redirect(`${url.origin}/p/${id}`, 302);
    }

    if (url.pathname.startsWith("/p/")) {
      const id = url.pathname.replace("/p/", "");
      const text = await env.PASTES.get(id);

      if (!text) {
        return html("Not found", `<h1>Paste not found or expired</h1>`, 404);
      }

      return html(
        "Paste",
        `
        <main>
          <div class="top">
            <a href="/">New Paste</a>
            <button onclick="copyText()">Copy</button>
          </div>
          <pre id="paste">${escapeHtml(text)}</pre>
        </main>
        <script>
          function copyText() {
            navigator.clipboard.writeText(document.getElementById('paste').innerText);
          }
        </script>
        `
      );
    }

    return html(
      env.SITE_TITLE || "Paste",
      `
      <main>
        <h1>${escapeHtml(env.SITE_TITLE || "Paste")}</h1>
        <form method="POST" action="/new">
          <textarea name="text" placeholder="Paste your text here..." autofocus></textarea>
          <button type="submit">Create Paste</button>
        </form>
      </main>
      `
    );
  },
};

function html(title, body, status = 200) {
  return new Response(
    `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f172a;
      color: #e5e7eb;
    }
    main {
      max-width: 900px;
      margin: 40px auto;
      padding: 20px;
    }
    h1 {
      margin-bottom: 20px;
      font-size: 28px;
    }
    textarea {
      width: 100%;
      min-height: 420px;
      box-sizing: border-box;
      padding: 16px;
      border: 1px solid #334155;
      border-radius: 14px;
      background: #020617;
      color: #e5e7eb;
      font-size: 15px;
      line-height: 1.8;
      direction: ltr;
      resize: vertical;
    }
    button, a {
      display: inline-block;
      margin-top: 14px;
      padding: 10px 18px;
      border: 0;
      border-radius: 10px;
      background: #2563eb;
      color: white;
      text-decoration: none;
      cursor: pointer;
      font-size: 14px;
    }
    .top {
      display: flex;
      gap: 10px;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      direction: ltr;
      background: #020617;
      border: 1px solid #334155;
      border-radius: 14px;
      padding: 18px;
      line-height: 1.7;
      font-size: 15px;
    }
  </style>
</head>
<body>${body}</body>
</html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    }
  );
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
