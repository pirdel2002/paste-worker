export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/manifest.webmanifest") return manifest(env);
    if (url.pathname === "/sw.js") return serviceWorker();

    if (request.method === "POST" && url.pathname === "/save") {
      const form = await request.formData();
      let code = cleanCode(form.get("code") || randomCode());
      const text = String(form.get("text") || "");
      const password = String(form.get("password") || "");
      const oldPassword = String(form.get("old_password") || "");

      if (!code) return page(env, "خطا", errorPage("شناسه نامعتبر است"), 400);

      const maxLen = Number(env.MAX_TEXT_LENGTH || 50000);
      if (text.length > maxLen) return page(env, "خطا", errorPage("متن بیش از حد بزرگ است"), 413);

      const existing = await getClip(env, code);

      if (existing?.passwordHash) {
        const ok = await verifyPassword(oldPassword || password, existing.passwordHash);
        if (!ok) return page(env, "رمز لازم است", errorPage("برای تغییر این متن، رمز صحیح لازم است."), 403);
      }

      if (existing?.readonly && !existing?.passwordHash) {
        return page(env, "فقط خواندنی", errorPage("این متن فقط‌خواندنی است و قابل تغییر نیست."), 403);
      }

      const forever = form.get("forever") === "1";
      const ttl = getTtl(form, env);
      const now = Date.now();

      const item = {
        v: 2,
        text,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        expiresAt: forever ? null : now + ttl * 1000,
        passwordHash: password ? await sha256(password) : existing?.passwordHash || null,
        readonly: form.get("readonly") === "1",
        burnAfterRead: form.get("burn_after_read") === "1",
        encrypted: form.get("encrypted") === "1"
      };

      const options = forever ? undefined : { expirationTtl: ttl };
      await env.CLIPS.put(code, JSON.stringify(item), options);

      return Response.redirect(`${url.origin}/c/${code}`, 302);
    }

    if (request.method === "POST" && url.pathname === "/delete") {
      const form = await request.formData();
      const code = cleanCode(form.get("code") || "");
      const password = String(form.get("password") || "");
      const item = await getClip(env, code);

      if (!item) return page(env, "حذف شد", errorPage("متنی با این شناسه وجود ندارد."), 404);

      if (item.passwordHash) {
        const ok = await verifyPassword(password, item.passwordHash);
        if (!ok) return page(env, "خطا", errorPage("رمز حذف اشتباه است."), 403);
      }

      await env.CLIPS.delete(code);
      return page(env, "حذف شد", successPage("متن حذف شد."));
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

      if (item.burnAfterRead) await env.CLIPS.delete(code);

      return json({
        ok: true,
        text: item.text || "",
        encrypted: !!item.encrypted,
        burnAfterRead: !!item.burnAfterRead
      });
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
          <p>متن را ذخیره کن و با یک شناسه اشتراک روی دستگاه دیگر باز کن.</p>
        </a>

        <a class="choice-card" href="/open">
          <span>02</span>
          <h2>متن ذخیره‌شده را باز کن</h2>
          <p>شناسه اشتراک را وارد کن، متن را ببین و سریع کپی کن.</p>
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
        <p class="hint">شناسه را خودت وارد کن یا خالی بگذار تا تصادفی ساخته شود.</p>
      </section>

      <form id="saveForm" method="POST" action="/save" class="card">
        <input type="hidden" name="encrypted" id="encrypted" value="0">

        <label>شناسه اشتراک</label>
        <input name="code" placeholder="اختیاری؛ مثل office یا 4821">

        <label>متن</label>
        <textarea id="clipText" name="text" dir="auto" placeholder="متن را اینجا وارد کن..." autofocus></textarea>

        <label>مدت نگهداری</label>
        <div class="ttl-grid">
          <input name="ttl" type="number" min="1" placeholder="خالی = ۱۰ دقیقه">
          <select name="ttl_unit">
            <option value="minutes">دقیقه</option>
            <option value="hours">ساعت</option>
            <option value="days">روز</option>
          </select>
        </div>

        <label class="check"><input type="checkbox" name="forever" value="1"> نگهداری دائمی</label>
        <label class="check"><input type="checkbox" name="readonly" value="1"> فقط‌خواندنی</label>
        <label class="check"><input type="checkbox" name="burn_after_read" value="1"> حذف بعد از اولین مشاهده</label>

        <label>رمز اختیاری</label>
        <input name="password" type="password" placeholder="برای محدود کردن مشاهده/حذف/ویرایش">

        <label class="check"><input type="checkbox" id="useEncryption"> رمزنگاری سمت مرورگر</label>
        <input id="encryptionPassword" type="password" placeholder="رمز رمزنگاری؛ روی سرور ذخیره نمی‌شود">

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

        <div class="local-history">
          <h2>آخرین شناسه‌ها</h2>
          <div id="historyList"></div>
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

      const list = JSON.parse(localStorage.getItem('clip_history') || '[]');
      document.getElementById('historyList').innerHTML = list.length
        ? list.map(x => '<a href="/c/' + encodeURIComponent(x) + '">' + x + '</a>').join('')
        : '<p class="muted">هنوز چیزی ثبت نشده.</p>';
    </script>
  `;
}

function viewPage(code, item) {
  const exists = !!item;
  const meta = {
    code,
    exists,
    protected: !!item?.passwordHash,
    readonly: !!item?.readonly,
    burnAfterRead: !!item?.burnAfterRead,
    encrypted: !!item?.encrypted,
    expiresAt: item?.expiresAt || null
  };

  return `
    <main>
      <section class="hero">
        <div class="badge">Shared Text</div>
        <h1>شناسه <code>${e(code)}</code></h1>
        <p class="hint">${exists ? "متن را کپی کن، QR بساز یا لینک را به اشتراک بگذار." : "متنی با این شناسه پیدا نشد."}</p>

        <div class="share-link">
          <input id="shareUrl" type="text" readonly onclick="this.select()">
        </div>

        <div id="remain" class="remain"></div>
      </section>

      <section class="card">
        <div id="passwordBox" hidden>
          <label>رمز مشاهده</label>
          <div class="row">
            <input id="viewPassword" type="password" placeholder="رمز را وارد کن">
            <button type="button" onclick="loadText()">نمایش</button>
          </div>
        </div>

        <div id="decryptBox" hidden>
          <label>رمز رمزگشایی</label>
          <div class="row">
            <input id="decryptPassword" type="password" placeholder="رمز رمزنگاری سمت مرورگر">
            <button type="button" onclick="decryptCurrentText()">رمزگشایی</button>
          </div>
        </div>

        <form id="saveForm" method="POST" action="/save">
          <input type="hidden" name="code" value="${e(code)}">
          <input type="hidden" name="encrypted" id="encrypted" value="0">

          <label>متن</label>
          <textarea id="clipText" name="text" dir="auto" ${item?.readonly ? "readonly" : ""} placeholder="متنی برای نمایش وجود ندارد."></textarea>

          <label>مدت نگهداری جدید</label>
          <div class="ttl-grid">
            <input name="ttl" type="number" min="1" placeholder="خالی = ۱۰ دقیقه">
            <select name="ttl_unit">
              <option value="minutes">دقیقه</option>
              <option value="hours">ساعت</option>
              <option value="days">روز</option>
            </select>
          </div>

          <label class="check"><input type="checkbox" name="forever" value="1"> نگهداری دائمی</label>
          <label class="check"><input type="checkbox" name="readonly" value="1" ${item?.readonly ? "checked" : ""}> فقط‌خواندنی</label>
          <label class="check"><input type="checkbox" name="burn_after_read" value="1" ${item?.burnAfterRead ? "checked" : ""}> حذف بعد از اولین مشاهده</label>

          <label>رمز مدیریت / تغییر</label>
          <input name="old_password" type="password" placeholder="اگر رمز دارد، برای تغییر وارد کن">

          <div class="actions">
            <button type="button" onclick="copyText()">کپی متن</button>
            <button type="button" onclick="copyCode()">کپی شناسه</button>
            <button type="button" onclick="copyLink()">کپی لینک</button>
            <button type="button" onclick="shareLink()">اشتراک‌گذاری</button>
            <button type="button" onclick="showQr()">QR متن</button>
            ${item?.readonly ? "" : `<button type="submit">ذخیره تغییرات</button>`}
            <button type="button" class="danger" onclick="deleteClip()">حذف</button>
            <a href="/">صفحه اصلی</a>
          </div>
        </form>

        <label class="check auto-copy">
          <input type="checkbox" id="autoCopyToggle">
          کپی خودکار بعد از نمایش متن
        </label>
      </section>

      <div id="qrModal" class="modal" hidden>
        <div class="modal-backdrop" onclick="closeQr()"></div>
        <div class="modal-card">
          <button class="modal-close" type="button" onclick="closeQr()">×</button>
          <h2>QR متن</h2>
          <p class="modal-hint">این QR از خود متن ساخته می‌شود، نه از لینک.</p>
          <img id="qrImage" alt="QR Code">
          <small>برای متن‌های طولانی، QR ممکن است سخت اسکن شود.</small>
        </div>
      </div>

      ${sharedScripts()}

      <script>
        const META = ${JSON.stringify(meta)};
        const clipText = document.getElementById('clipText');
        const shareUrlInput = document.getElementById('shareUrl');
        const autoCopyToggle = document.getElementById('autoCopyToggle');

        function fullShareUrl() {
          return window.location.origin + '/c/' + encodeURIComponent(META.code);
        }

        shareUrlInput.value = fullShareUrl();

        saveHistory(META.code);

        autoCopyToggle.checked = localStorage.getItem('clip_auto_copy') === '1';
        autoCopyToggle.addEventListener('change', () => {
          localStorage.setItem('clip_auto_copy', autoCopyToggle.checked ? '1' : '0');
        });

        if (!META.exists) {
          clipText.value = '';
        } else if (META.protected) {
          document.getElementById('passwordBox').hidden = false;
        } else {
          loadText();
        }

        startCountdown(META.expiresAt);

        async function loadText() {
          const password = document.getElementById('viewPassword')?.value || '';
          const res = await fetch('/api/get?code=' + encodeURIComponent(META.code) + '&password=' + encodeURIComponent(password));
          const data = await res.json();

          if (!data.ok) {
            alert('رمز اشتباه است یا متن وجود ندارد');
            return;
          }

          clipText.value = data.text || '';
          updateTextDirection(clipText);

          if (data.encrypted) {
            document.getElementById('decryptBox').hidden = false;
          } else if (autoCopyToggle.checked) {
            await copyText();
          }

          if (data.burnAfterRead) {
            alert('این متن بعد از این مشاهده حذف شد.');
          }
        }

        async function decryptCurrentText() {
          const pass = document.getElementById('decryptPassword').value;
          if (!pass) return alert('رمز رمزگشایی را وارد کن');

          try {
            clipText.value = await decryptText(clipText.value, pass);
            updateTextDirection(clipText);
            document.getElementById('decryptBox').hidden = true;
            if (autoCopyToggle.checked) await copyText();
          } catch {
            alert('رمزگشایی ناموفق بود');
          }
        }

        async function copyText() {
          await navigator.clipboard.writeText(clipText.value);
          alert('متن کپی شد');
        }

        async function copyCode() {
          await navigator.clipboard.writeText(META.code);
          alert('شناسه کپی شد');
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
            await copyLink();
          }
        }

        function showQr() {
          const text = clipText.value.trim();

          if (!text) return alert('متنی برای ساخت QR وجود ندارد');
          if (text.length > 1200) return alert('متن برای QR خیلی طولانی است. بهتر است لینک را کپی کنی.');

          document.getElementById('qrImage').src =
            'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(text);

          document.getElementById('qrModal').hidden = false;
          document.body.classList.add('modal-open');
        }

        function closeQr() {
          document.getElementById('qrModal').hidden = true;
          document.body.classList.remove('modal-open');
        }

        async function deleteClip() {
          if (!confirm('متن حذف شود؟')) return;

          const password = prompt('اگر رمز دارد، وارد کن. اگر ندارد خالی بگذار.') || '';
          const form = new FormData();
          form.append('code', META.code);
          form.append('password', password);

          const res = await fetch('/delete', { method: 'POST', body: form });
          document.open();
          document.write(await res.text());
          document.close();
        }

        document.addEventListener('keydown', e => {
          if (e.key === 'Escape') closeQr();
        });
      </script>
    </main>
  `;
}

function sharedScripts() {
  return `
    <script>
      const form = document.getElementById('saveForm');
      if (form) {
        const textarea = form.querySelector('textarea');
        if (textarea) {
          updateTextDirection(textarea);
          textarea.addEventListener('input', () => updateTextDirection(textarea));
        }

        form.addEventListener('submit', async e => {
          const useEncryption = document.getElementById('useEncryption');
          const encPass = document.getElementById('encryptionPassword');
          const encrypted = document.getElementById('encrypted');
          const textarea = form.querySelector('textarea[name="text"]');

          if (useEncryption && useEncryption.checked) {
            if (!encPass.value) {
              e.preventDefault();
              alert('رمز رمزنگاری را وارد کن');
              return;
            }

            e.preventDefault();
            textarea.value = await encryptText(textarea.value, encPass.value);
            encrypted.value = '1';
            form.submit();
          }
        });
      }

      function updateTextDirection(el) {
        const value = el.value.trim();
        const hasPersian = /[\\u0600-\\u06FF]/.test(value);
        el.dir = hasPersian ? 'rtl' : 'ltr';
        el.style.textAlign = hasPersian ? 'right' : 'left';
      }

      function saveHistory(code) {
        const key = 'clip_history';
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        const next = [code, ...list.filter(x => x !== code)].slice(0, 8);
        localStorage.setItem(key, JSON.stringify(next));
      }

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

      async function encryptText(text, password) {
        const enc = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(password, salt);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));

        return JSON.stringify({
          alg: 'AES-GCM',
          salt: b64(salt),
          iv: b64(iv),
          data: b64(new Uint8Array(encrypted))
        });
      }

      async function decryptText(payload, password) {
        const obj = JSON.parse(payload);
        const salt = fromB64(obj.salt);
        const iv = fromB64(obj.iv);
        const data = fromB64(obj.data);
        const key = await deriveKey(password, salt);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return new TextDecoder().decode(decrypted);
      }

      async function deriveKey(password, salt) {
        const enc = new TextEncoder();
        const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);

        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      }

      function b64(bytes) {
        return btoa(String.fromCharCode(...bytes));
      }

      function fromB64(str) {
        return Uint8Array.from(atob(str), c => c.charCodeAt(0));
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
  <link rel="manifest" href="/manifest.webmanifest">
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

    .hint, .muted {
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

    input:focus, textarea:focus, select:focus {
      border-color: #60a5fa;
      box-shadow: 0 0 0 3px rgba(96, 165, 250, .15);
    }

    textarea {
      min-height: 340px;
      resize: vertical;
      line-height: 1.9;
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

    .share-link {
      max-width: 560px;
      margin: 18px auto 0;
    }

    .share-link input {
      text-align: left;
      direction: ltr;
      font-size: 13px;
    }

    .local-history {
      margin-top: 24px;
    }

    .local-history h2 {
      font-size: 17px;
    }

    .local-history a {
      margin: 6px 6px 0 0;
      background: #1e293b;
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

function successPage(message) {
  return `<main><section class="card"><h1>انجام شد</h1><p>${e(message)}</p><div class="actions"><a href="/">صفحه اصلی</a></div></section></main>`;
}

async function getClip(env, code) {
  const raw = await env.CLIPS.get(code);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v === 2) return parsed;
  } catch {}

  return {
    v: 2,
    text: raw,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: null,
    passwordHash: null,
    readonly: false,
    burnAfterRead: false,
    encrypted: false
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function manifest(env) {
  return json({
    name: env.SITE_TITLE || "Pirdel Clipboard",
    short_name: "Clipboard",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#2563eb",
    icons: []
  });
}

function serviceWorker() {
  return new Response(`self.addEventListener('fetch', () => {});`, {
    headers: { "content-type": "application/javascript; charset=utf-8" }
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
