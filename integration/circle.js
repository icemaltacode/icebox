/*
 * ICE Campus Header Scripts
 * Add this to Circle.so custom header JS
 * Contains: ICEBox file upload + Testportal test launcher
 *
 * ICEBox links must contain these placeholders in their href:
 * https://icebox.icecampus.com/?studentEmail=PLACEHOLDER_EMAIL&class=PLACEHOLDER_CLASS&studentId=PLACEHOLDER_ID&studentName=PLACEHOLDER_NAME&token=PLACEHOLDER_TOKEN
 *
 * The project is taken from the title of the lesson the link sits on. Append
 * &project=Your%20Project%20Name to a link to set it explicitly instead.
 */

/* Script starts here. Copy as-is - do not add <script> tags */

// ============================================
// ICEBox Link Updater (file uploads)
// ============================================
(() => {
  const API_BASE_URL = 'https://uav5qzlbbk.execute-api.eu-south-1.amazonaws.com';
  const SEL =
    'a[href*="studentEmail=PLACEHOLDER_EMAIL"][href*="class=PLACEHOLDER_CLASS"][href*="studentId=PLACEHOLDER_ID"][href*="studentName=PLACEHOLDER_NAME"][href*="token=PLACEHOLDER_TOKEN"]';
  let observer;

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
      console.error('[ICE] ICEBox: Failed to fetch short token', error);
      return null;
    }
  };

  const getPendoEmail = () => {
    try {
      const k = Object.keys(localStorage).find(k => k.startsWith('_pendo_visitorId'));
      return k ? JSON.parse(localStorage.getItem(k) || '{}')?.value || null : null;
    } catch { return null; }
  };

  const getLegacyUser = () => {
    try { return JSON.parse(localStorage.getItem('V1-PunditUserContext') || 'null')?.current_user || {}; }
    catch { return {}; }
  };

  // Circle exposes the signed-in member as window.circleUser. The localStorage
  // sources are older fallbacks and are not set for student accounts.
  // studentId must stay Circle's public UID: submissions are keyed on it.
  const getStudent = () => {
    const user = window.circleUser || {};
    const legacy = getLegacyUser();
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return {
      email: user.email || getPendoEmail() || legacy.email || null,
      id: user.publicUid || user.public_uid || legacy.public_uid || null,
      name: user.name || fullName || legacy.name || null
    };
  };

  const getClassSlug = () => {
    try {
      const arr = JSON.parse(sessionStorage.getItem('previous_page_loads') || '[]');
      const url = arr.at(-1)?.url;
      const fromSession = url?.match(/\/c\/([^/]+)/)?.[1];
      if (fromSession) return fromSession;
      return window.location.pathname.match(/\/c\/([^/]+)/)?.[1] || null;
    } catch { return null; }
  };

  // Circle renders the lesson title as an h2 in the <main> that holds the lesson body.
  // document.title is not usable: after a full reload it shows the space name instead.
  const getProjectName = (a) => {
    const main = a.closest('main') || document.querySelector('main');
    const heading = main?.querySelector('h2.text-heading-2xl') || main?.querySelector('h2');
    return heading?.textContent.replace(/\s+/g, ' ').trim() || null;
  };

  const updateIcebox = () => {
    const { email, id: studentId, name: studentName } = getStudent();
    const cls = getClassSlug();

    if (!email || !cls) return false;

    const links = document.querySelectorAll(SEL);
    if (!links.length) return false;

    let updatedCount = 0;
    links.forEach(a => {
      if (a.dataset.iceboxHandled === 'true') return;

      try {
        const u = new URL(a.href, location.href);
        u.searchParams.set('studentEmail', email);
        u.searchParams.set('class', cls);
        if (studentId) u.searchParams.set('studentId', studentId);
        if (studentName) u.searchParams.set('studentName', studentName);
        u.searchParams.delete('token');
        a.href = u.toString();

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
          // Resolved on click: the title may not be rendered yet when the link is first processed.
          const project = getProjectName(a);
          try {
            const shortToken = await requestShortToken();
            if (!shortToken) {
              alert('We could not prepare the ICEBox upload link. Please try again.');
              return;
            }
            const nav = new URL(a.href, location.href);
            nav.searchParams.set('token', shortToken);
            if (project && !nav.searchParams.get('project')) {
              nav.searchParams.set('project', project);
            }
            window.open(nav.toString(), '_blank', 'noopener');
          } catch (err) {
            console.error('[ICE] ICEBox: Failed to request short token', err);
            alert('We could not prepare the ICEBox upload link. Please try again.');
          }
        });

        a.dataset.iceboxHandled = 'true';
        updatedCount++;
      } catch (e) {
        console.warn('[ICE] ICEBox: Failed updating a link:', e);
      }
    });

    return updatedCount > 0;
  };

  updateIcebox();
  setInterval(updateIcebox, 2000);
  observer = new MutationObserver(() => updateIcebox());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', updateIcebox);
  console.log('[ICE] ICEBox link updater ready.');
})();

// ============================================
// Testportal Link Updater (tests/exams)
// Usage: <a href="https://testportal.invalid/YOUR_TEST_ID">Start Test</a>
// ============================================
(() => {
  const API_BASE_URL = 'https://gs8iaekpl2.execute-api.eu-south-1.amazonaws.com/dev';
  const TESTPORTAL_START_URL = 'https://icecampus.testportal.net/exam/start.html';
  const SEL = 'a[href^="https://testportal.invalid/"]';
  let observer;

  // Get current Circle.so user
  const getCircleUser = () => {
    return window.circleUser || null;
  };

  const getUserNameParts = (user) => {
    const firstName = user?.firstName || user?.first_name || null;
    const lastName = user?.lastName || user?.last_name || null;
    if (firstName && lastName) {
      return { firstName, lastName };
    }

    const fullName = user?.name || user?.full_name || null;
    if (!fullName || typeof fullName !== 'string') {
      return { firstName: null, lastName: null };
    }

    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: null };
    }

    return {
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1]
    };
  };

  const getPersonUid = (user) => user?.id || user?.uid || null;
  const getUserEmail = (user) => {
    if (user?.email) return user.email;
    try {
      const k = Object.keys(localStorage).find(k => k.startsWith('_pendo_visitorId'));
      if (k) {
        const email = JSON.parse(localStorage.getItem(k) || '{}')?.value || null;
        if (email) return email;
      }
      const ctx = JSON.parse(localStorage.getItem('V1-PunditUserContext') || 'null');
      return ctx?.current_user?.email || null;
    } catch { return null; }
  };

  const requestToken = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/token/request`, {
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
      console.error('[ICE] Testportal: Failed to fetch token', error);
      return null;
    }
  };

  const requestAccessCode = async (token, testId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/test/access-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, testId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Unexpected status ${response.status}`);
      }

      const data = await response.json();
      if (!data?.accessCode) {
        throw new Error('Access code missing in response');
      }

      return data.accessCode;
    } catch (error) {
      console.error('[ICE] Testportal: Failed to get access code', error);
      return null;
    }
  };

  const submitStartTest = (accessCode, user) => {
    const { firstName, lastName } = getUserNameParts(user);

    if (!firstName || !lastName) {
      alert('Please add your first and last name to start this test.');
      return;
    }

    const personalData = {
      firstName,
      lastName
    };

    const email = getUserEmail(user);
    if (email) {
      personalData.email = email;
    }

    const startTestRequest = {
      accessCode,
      autoSubmit: false,
      startPageReadOnly: true,
      personalData
    };

    const personUID = getPersonUid(user) || getUserEmail(user);
    if (personUID) {
      startTestRequest.personUID = String(personUID);
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = TESTPORTAL_START_URL;
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'startTestRequest';
    input.value = JSON.stringify(startTestRequest);

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();

    setTimeout(() => form.remove(), 1000);
  };

  const updateTestportal = () => {
    const user = getCircleUser();
    if (!user) return false;

    const links = document.querySelectorAll(SEL);
    if (!links.length) return false;

    let updatedCount = 0;
    links.forEach(a => {
      if (a.dataset.testportalHandled === 'true') return;

      try {
        const testId = a.getAttribute('href').replace('https://testportal.invalid/', '').trim();
        if (!testId || testId === 'PLACEHOLDER_TESTID') {
          console.warn('[ICE] Testportal: Missing test ID in link:', a);
          return;
        }

        // Remove Circle's attributes that interfere with our handler
        a.removeAttribute('target');
        a.removeAttribute('rel');

        a.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const currentUser = getCircleUser();
          if (!currentUser) {
            alert('Please log in to start the test.');
            return;
          }
          const token = await requestToken();
          if (!token) {
            alert('We could not prepare the test. Please try again.');
            return;
          }

          const accessCode = await requestAccessCode(token, testId);
          if (!accessCode) {
            alert('We could not retrieve your test access code. Please try again.');
            return;
          }

          submitStartTest(accessCode, currentUser);
        });

        a.dataset.testportalHandled = 'true';
        console.log('[ICE] Testportal: Bound link →', testId);
        updatedCount++;
      } catch (e) {
        console.warn('[ICE] Testportal: Failed binding link:', e);
      }
    });

    return updatedCount > 0;
  };

  updateTestportal();
  setInterval(updateTestportal, 2000);
  observer = new MutationObserver(() => updateTestportal());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', updateTestportal);
  console.log('[ICE] Testportal link updater ready.');
})();
