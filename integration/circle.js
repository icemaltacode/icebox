// icebox.icecampus.com/?studentEmail=PLACEHOLDER_EMAIL&class=PLACEHOLDER_CLASS&studentId=PLACEHOLDER_ID


(() => {
  const SEL = 'a[href*="studentEmail=PLACEHOLDER_EMAIL"][href*="class=PLACEHOLDER_CLASS"]';
  let done = false, observer, tid;

  const getEmail = () => {
    try {
      const k = Object.keys(localStorage).find(k => k.startsWith('_pendo_visitorId'));
      if (!k) return null;
      return JSON.parse(localStorage.getItem(k) || '{}')?.value || null;
    } catch { return null; }
  };

  const getClassSlug = () => {
    try {
      const arr = JSON.parse(sessionStorage.getItem('previous_page_loads') || '[]');
      const url = arr.at(-1)?.url;
      return url?.match(/\/c\/([^/]+)/)?.[1] || null;
    } catch { return null; }
  };

  const getStudentId = () => {
    try {
      return JSON.parse(localStorage.getItem('V1-PunditUserContext') || 'null')
        ?.current_user?.public_uid || null;
    } catch { return null; }
  };

  const update = () => {
    if (done) return true;

    const email = getEmail();
    const cls = getClassSlug();
    const studentId = getStudentId();

    if (!email || !cls) {
      console.log('[Icebox Link Updater] Waiting: email or class not ready.');
      return false;
    }

    const links = document.querySelectorAll(SEL);
    if (!links.length) {
      console.log('[Icebox Link Updater] Waiting: placeholder links not in DOM yet.');
      return false;
    }

    links.forEach(a => {
      try {
        const u = new URL(a.href, location.href);
        u.searchParams.set('studentEmail', encodeURIComponent(email));
        u.searchParams.set('class', encodeURIComponent(cls));
        if (studentId) {
          u.searchParams.set('studentId', encodeURIComponent(studentId));
        } else {
          console.log('[Icebox Link Updater] Note: studentId not available yet.');
        }
        a.href = u.toString();
        console.log('[Icebox Link Updater] Updated link →', a.href);
      } catch (e) {
        console.warn('[Icebox Link Updater] Failed updating a link:', e);
      }
    });

    console.log(`[Icebox Link Updater] ✅ Finished — ${links.length} link(s) updated.`);
    done = true;
    observer && observer.disconnect();
    tid && clearInterval(tid);
    return true;
  };

  console.log('[Icebox Link Updater] Initialising…');

  // Try now (if script is at end of body)
  update();

  // Retry every 500ms for up to 10s
  tid = setInterval(() => { if (update()) clearInterval(tid); }, 500);
  setTimeout(() => clearInterval(tid), 10000);

  // Watch for dynamic DOM injections
  observer = new MutationObserver(() => update());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Fallback when everything is fully loaded
  window.addEventListener('load', update);
})();
