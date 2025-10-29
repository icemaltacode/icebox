/*
  Circle -> ICEBox Adapter
  This script updates ICEBox links in Circle pages by replacing placeholder
  parameters with actual user and class data retrieved from localStorage and sessionStorage.

  Usage:
  1. Include this script in the SITE settings in Circle.
  2. Ensure that the ICEBox links contain the following placeholders in their href attributes:

  https://icebox.icecampus.com/?studentEmail=PLACEHOLDER_EMAIL&class=PLACEHOLDER_CLASS&studentId=PLACEHOLDER_ID&studentName=PLACEHOLDER_NAME&token=PLACEHOLDER_TOKEN
*/

/* Script starts here. Copy as-is - do not add <script> tags */

(() => {
  // Update this URL if you are working against a different ICEBox API stage.
  const API_BASE_URL = 'https://uav5qzlbbk.execute-api.eu-south-1.amazonaws.com';
  const SEL =
    'a[href*="studentEmail=PLACEHOLDER_EMAIL"][href*="class=PLACEHOLDER_CLASS"][href*="studentId=PLACEHOLDER_ID"][href*="studentName=PLACEHOLDER_NAME"][href*="token=PLACEHOLDER_TOKEN"]';
  let done = false, observer, tid;

  const requestShortToken = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/vle-token/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const data = await response.json();
      if (!data?.token) {
        throw new Error('Token missing in response');
      }

      return data.token;
    } catch (error) {
      console.error('[Icebox Link Updater] Failed to fetch short token', error);
      return null;
    }
  };

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

  const getUserContext = () => {
    try { return JSON.parse(localStorage.getItem('V1-PunditUserContext') || 'null') || {}; }
    catch { return {}; }
  };

  const update = () => {
    if (done) return true;

    const email = getEmail();
    const cls = getClassSlug();
    const ctx = getUserContext();
    const studentId = ctx?.current_user?.public_uid || null;
    const studentName = ctx?.current_user?.name || null;

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
        u.searchParams.set('studentEmail', email);
        u.searchParams.set('class', cls);
        if (studentId) u.searchParams.set('studentId', studentId);
        if (studentName) u.searchParams.set('studentName', studentName);
        u.searchParams.delete('token');
        a.href = u.toString();
        if (!a.dataset.iceboxHandled) {
          const ensureReferrer = () => {
            a.removeAttribute('rel');
            a.removeAttribute('referrerpolicy');
          };

          ensureReferrer();
          a.addEventListener('mouseenter', ensureReferrer);
          a.addEventListener('focus', ensureReferrer);
          a.addEventListener('touchstart', ensureReferrer, { passive: true });
          a.addEventListener('click', async (event) => {
            ensureReferrer();
            event.preventDefault();
            try {
              const shortToken = await requestShortToken();
              if (!shortToken) {
                alert('We could not prepare the ICEBox upload link. Please try again.');
                return;
              }

              const nav = new URL(a.href, location.href);
              nav.searchParams.set('token', shortToken);
              window.open(nav.toString(), '_blank', 'noopener');
            } catch (err) {
              console.error('[Icebox Link Updater] Failed to request short token', err);
              alert('We could not prepare the ICEBox upload link. Please try again.');
            }
          });
          a.dataset.iceboxHandled = 'true';
        }
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
  update();
  tid = setInterval(() => { if (update()) clearInterval(tid); }, 500);
  setTimeout(() => clearInterval(tid), 10000);
  observer = new MutationObserver(() => update());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', update);
})();
