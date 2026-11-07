/**
 * cloud-drive.js
 * Sincronització privada i gratuïta de Llibretes amb Google Drive (appDataFolder)
 * mitjançant Google Identity Services (OAuth 2.0 en navegador, Zero-Knowledge: cap servidor intermedi).
 */
(function () {
  'use strict';

  const GOOGLE_CLIENT_ID = '937960659753-p8gvd4uuif8bbejk6qvu0428tbtt1mvp.apps.googleusercontent.com';
  const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const GOOGLE_SCOPES = `${DRIVE_APPDATA_SCOPE} email profile`;
  const CLOUD_FILE_NAME = 'pissarra_workspace_v2.json';
  const AUTH_STORAGE_KEY = 'pissarra_gdrive_auth_v1';

  const AUTO_SYNC_DEBOUNCE_MS = 2200;
  const VISIBILITY_CHECK_THROTTLE_MS = 20000;

  const cloudState = {
    accessToken: null,
    expiresAt: 0,
    user: null, // { name, email, picture }
    fileId: null,
    lastCloudModifiedTime: null,
    lastSyncedAt: null,
    localDirtySinceSync: false,
    everConnected: false,

    // Estat efímer d'interfície
    status: 'disconnected', // 'disconnected' | 'connecting' | 'syncing' | 'synced' | 'pending' | 'expired' | 'error'
    errorMessage: '',
    needsScopeConsent: false
  };

  let tokenClient = null;
  let syncDebounceTimer = null;
  let inFlightSync = false;
  let queuedPushAfterFlight = false;
  let lastVisibilityCheckAt = 0;
  let pendingConflictPayload = null; // { remoteFile, cloudData }

  // ============================================================================
  // 1. Persistència de metadades de sessió local
  // ============================================================================
  function loadStoredAuth() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;

      cloudState.accessToken = parsed.accessToken || null;
      cloudState.expiresAt = Number(parsed.expiresAt || 0);
      cloudState.user = parsed.user || null;
      cloudState.fileId = parsed.fileId || null;
      cloudState.lastCloudModifiedTime = parsed.lastCloudModifiedTime || null;
      cloudState.lastSyncedAt = parsed.lastSyncedAt || null;
      cloudState.localDirtySinceSync = Boolean(parsed.localDirtySinceSync);
      cloudState.everConnected = Boolean(parsed.everConnected);

      if (isTokenValid()) {
        cloudState.status = cloudState.localDirtySinceSync ? 'pending' : 'synced';
      } else if (cloudState.everConnected) {
        cloudState.accessToken = null;
        cloudState.status = 'expired';
      } else {
        cloudState.status = 'disconnected';
      }
    } catch (_e) {
      cloudState.status = 'disconnected';
    }
  }

  function saveStoredAuth() {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        accessToken: cloudState.accessToken,
        expiresAt: cloudState.expiresAt,
        user: cloudState.user,
        fileId: cloudState.fileId,
        lastCloudModifiedTime: cloudState.lastCloudModifiedTime,
        lastSyncedAt: cloudState.lastSyncedAt,
        localDirtySinceSync: cloudState.localDirtySinceSync,
        everConnected: cloudState.everConnected
      }));
    } catch (_e) { /* ignora quota */ }
  }

  function isTokenValid() {
    return Boolean(
      cloudState.accessToken &&
      cloudState.expiresAt &&
      Date.now() < cloudState.expiresAt - 30000
    );
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTimeHuman(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '—';
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const timePart = d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (sameDay) return `avui a les ${timePart}`;
    const datePart = d.toLocaleDateString('ca-ES', { day: '2-digit', month: 'short' });
    return `${datePart}, ${timePart}`;
  }

  // ============================================================================
  // 2. Google Identity Services (OAuth 2.0 Token Client)
  // ============================================================================
  function ensureTokenClient() {
    if (tokenClient) return tokenClient;
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      return null;
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: handleTokenResponse,
      error_callback: (err) => {
        if (err && err.type === 'popup_closed') {
          cloudState.status = cloudState.everConnected ? 'expired' : 'disconnected';
          cloudState.errorMessage = '';
        } else {
          cloudState.status = 'error';
          cloudState.errorMessage =
            'No s\'ha pogut obrir la finestra d\'inici de sessió de Google. Revisa que el navegador no estigui bloquejant finestres emergents i que la URL actual estigui autoritzada a Google Cloud.';
        }
        renderCloudUI();
      }
    });
    return tokenClient;
  }

  function startGoogleSignIn(options = {}) {
    if (window.location.protocol === 'file:') {
      cloudState.status = 'error';
      cloudState.errorMessage =
        'Google no permet iniciar sessió obrint el fitxer directament amb file://. Obre la web des de http://localhost:8000 o des de la teva adreça de GitHub Pages.';
      renderCloudUI();
      openCloudPopover();
      return;
    }

    const client = ensureTokenClient();
    if (!client) {
      cloudState.status = 'error';
      cloudState.errorMessage =
        'Encara no s\'ha pogut carregar el servei d\'identitat de Google. Comprova la connexió a internet i torna-ho a provar.';
      renderCloudUI();
      openCloudPopover();
      return;
    }

    cloudState.status = 'connecting';
    cloudState.errorMessage = '';
    cloudState.needsScopeConsent = false;
    renderCloudUI();

    const reqConfig = {};
    if (options.forceConsent) {
      reqConfig.prompt = 'consent';
    } else if (options.fastReconnect && cloudState.user && cloudState.user.email) {
      reqConfig.prompt = '';
      reqConfig.hint = cloudState.user.email;
    } else {
      reqConfig.prompt = 'select_account';
    }

    client.requestAccessToken(reqConfig);
  }

  async function handleTokenResponse(resp) {
    if (!resp || resp.error) {
      cloudState.status = 'error';
      cloudState.errorMessage = resp && resp.error === 'access_denied'
        ? 'Accés cancel·lat o compte no inclòs a "Test users" de Google Cloud Console.'
        : `Error d'autenticació de Google (${resp?.error || 'desconegut'}).`;
      renderCloudUI();
      return;
    }

    // Verifica que l'usuari hagi marcat la casella de permís de drive.appdata
    if (
      window.google?.accounts?.oauth2?.hasGrantedAllScopes &&
      !window.google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_APPDATA_SCOPE)
    ) {
      cloudState.status = 'error';
      cloudState.needsScopeConsent = true;
      cloudState.errorMessage =
        'Cal marcar la casella de permís de Google Drive a la finestra d\'inici de sessió perquè la web pugui guardar i llegir les teves llibretes.';
      renderCloudUI();
      openCloudPopover();
      return;
    }

    const expiresInSec = Number(resp.expires_in || 3599);
    cloudState.accessToken = resp.access_token;
    cloudState.expiresAt = Date.now() + Math.max(60, expiresInSec - 60) * 1000;
    cloudState.everConnected = true;
    cloudState.needsScopeConsent = false;
    cloudState.errorMessage = '';
    cloudState.status = 'syncing';
    saveStoredAuth();
    renderCloudUI();

    // Carrega informació bàsica del perfil (nom, correu, foto) sense bloquejar si falla
    fetchUserProfile().finally(() => {
      renderCloudUI();
    });

    await performSmartSync({ onInitialConnect: true });
  }

  async function fetchUserProfile() {
    if (!isTokenValid()) return;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${cloudState.accessToken}` }
      });
      if (!res.ok) return;
      const info = await res.json();
      if (info && (info.email || info.name)) {
        cloudState.user = {
          name: info.name || info.given_name || 'Usuari de Google',
          email: info.email || '',
          picture: info.picture || ''
        };
        saveStoredAuth();
      }
    } catch (_e) { /* opcional */ }
  }

  function disconnectGoogleDrive(wipeLocalDevice = false) {
    clearTimeout(syncDebounceTimer);
    const tok = cloudState.accessToken;
    if (tok && window.google?.accounts?.oauth2?.revoke) {
      try { window.google.accounts.oauth2.revoke(tok, () => {}); } catch (_e) { /* ignora */ }
    }

    cloudState.accessToken = null;
    cloudState.expiresAt = 0;
    cloudState.user = null;
    cloudState.fileId = null;
    cloudState.lastCloudModifiedTime = null;
    cloudState.lastSyncedAt = null;
    cloudState.localDirtySinceSync = false;
    cloudState.everConnected = false;
    cloudState.status = 'disconnected';
    cloudState.errorMessage = '';
    cloudState.needsScopeConsent = false;

    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (_e) { /* ignora */ }

    if (wipeLocalDevice && window.PissarraApp?.resetToStarterWorkspace) {
      window.PissarraApp.resetToStarterWorkspace();
    } else {
      window.PissarraApp?.flashAutosaveIndicator?.('Sessió de Drive tancada');
    }

    renderCloudUI();
    closeCloudPopover();
  }

  // ============================================================================
  // 3. Operacions amb Google Drive REST API v3 (espai privat appDataFolder)
  // ============================================================================
  async function driveFetch(url, options = {}) {
    if (!isTokenValid()) {
      const expiredErr = new Error('TOKEN_EXPIRED');
      expiredErr.code = 'TOKEN_EXPIRED';
      throw expiredErr;
    }

    const headers = {
      Authorization: `Bearer ${cloudState.accessToken}`,
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      cloudState.accessToken = null;
      cloudState.expiresAt = 0;
      cloudState.status = 'expired';
      saveStoredAuth();
      const err = new Error('Sessió de Google caducada.');
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }

    if (!res.ok) {
      let detail = '';
      try {
        const errJson = await res.json();
        detail = errJson?.error?.message || '';
      } catch (_e) { /* ignora */ }
      const err = new Error(detail || `HTTP ${res.status}`);
      err.status = res.status;
      err.detail = detail;
      throw err;
    }

    return res;
  }

  async function findRemoteWorkspaceFile() {
    const q = `name = '${CLOUD_FILE_NAME}' and trashed = false`;
    const url =
      'https://www.googleapis.com/drive/v3/files' +
      '?spaces=appDataFolder' +
      `&q=${encodeURIComponent(q)}` +
      `&fields=${encodeURIComponent('files(id,name,modifiedTime,size)')}` +
      '&orderBy=modifiedTime%20desc' +
      '&pageSize=5';

    const res = await driveFetch(url);
    const json = await res.json();
    const files = Array.isArray(json.files) ? json.files : [];
    return files[0] || null;
  }

  async function downloadRemoteWorkspace(fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await driveFetch(url);
    return res.json();
  }

  async function uploadWorkspaceToDrive(snapshotObj) {
    const jsonString = JSON.stringify(snapshotObj);

    // Si ja coneixem el fileId d'aquest compte, actualitzem amb PATCH
    if (cloudState.fileId) {
      try {
        const patchUrl =
          `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(cloudState.fileId)}` +
          '?uploadType=media&fields=id,modifiedTime';
        const res = await driveFetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: jsonString
        });
        return await res.json();
      } catch (err) {
        if (err.status === 404) {
          cloudState.fileId = null;
        } else {
          throw err;
        }
      }
    }

    // Comprova abans de crear si ja existeix un fitxer per evitar duplicats
    const existing = await findRemoteWorkspaceFile();
    if (existing && existing.id) {
      cloudState.fileId = existing.id;
      const patchUrl =
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}` +
        '?uploadType=media&fields=id,modifiedTime';
      const res = await driveFetch(patchUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: jsonString
      });
      return res.json();
    }

    // Primera vegada: crea el fitxer dins de la carpeta oculta appDataFolder
    const metadata = {
      name: CLOUD_FILE_NAME,
      parents: ['appDataFolder'],
      mimeType: 'application/json'
    };
    const boundary = `pissarra_sync_${Math.random().toString(36).slice(2, 12)}`;
    const multipartBody =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${jsonString}\r\n` +
      `--${boundary}--`;

    const createUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime';
    const res = await driveFetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipartBody
    });
    return res.json();
  }

  // ============================================================================
  // 4. Lògica Intel·ligent de Sincronització i Protecció de Conflictes
  // ============================================================================
  function translateDriveError(err) {
    if (!err) return 'Error desconegut de sincronització.';
    if (err.code === 'TOKEN_EXPIRED') {
      return 'La sessió de Google ha caducat. Clica "Reconectar" per continuar sincronitzant.';
    }
    const msg = String(err.detail || err.message || '');
    if (err.status === 403 && /has not been used|disabled|accessNotConfigured/i.test(msg)) {
      return 'Falta activar la "Google Drive API" al teu projecte de Google Cloud Console (APIs & Services → Library → Google Drive API → Enable).';
    }
    if (err.status === 403 && /insufficient|scope|permission/i.test(msg)) {
      cloudState.needsScopeConsent = true;
      return 'Falta el permís de Google Drive (appDataFolder). Clica "Donar permís" i marca la casella a la finestra de Google.';
    }
    return `No s'ha pogut sincronitzar amb Google Drive: ${msg}`;
  }

  async function performSmartSync(opts = {}) {
    if (!window.PissarraApp) return;
    if (!isTokenValid()) {
      if (cloudState.everConnected) cloudState.status = 'expired';
      renderCloudUI();
      return;
    }
    if (inFlightSync) return;

    inFlightSync = true;
    cloudState.status = 'syncing';
    cloudState.errorMessage = '';
    renderCloudUI();

    try {
      const remoteFile = await findRemoteWorkspaceFile();

      // CAS 1: Encara no hi ha cap fitxer al Google Drive de l'usuari → pugem l'espai actual!
      if (!remoteFile) {
        const snapshot = window.PissarraApp.getCloudSnapshot();
        const uploaded = await uploadWorkspaceToDrive(snapshot);
        cloudState.fileId = uploaded.id;
        cloudState.lastCloudModifiedTime = uploaded.modifiedTime || new Date().toISOString();
        cloudState.lastSyncedAt = new Date().toISOString();
        cloudState.localDirtySinceSync = false;
        cloudState.status = 'synced';
        saveStoredAuth();
        window.PissarraApp.flashAutosaveIndicator('Pujat al Drive ☁️✓', 2200);
        renderCloudUI();
        return;
      }

      cloudState.fileId = remoteFile.id;

      // Si és una comprovació ràpida (ex: tornar a la pestanya) i el modifiedTime del núvol no ha canviat:
      if (
        opts.lightCheckOnly &&
        cloudState.lastCloudModifiedTime &&
        remoteFile.modifiedTime === cloudState.lastCloudModifiedTime
      ) {
        cloudState.status = cloudState.localDirtySinceSync ? 'pending' : 'synced';
        renderCloudUI();
        if (cloudState.localDirtySinceSync) {
          inFlightSync = false;
          await pushLocalToCloudNow();
          return;
        }
        return;
      }

      // CAS 2: Ja existeix el fitxer a Google Drive → descarreguem i comparem de forma segura
      const cloudData = await downloadRemoteWorkspace(remoteFile.id);
      const hasValidCloudNotebooks = cloudData && Array.isArray(cloudData.notebooks) && cloudData.notebooks.length > 0;

      if (!hasValidCloudNotebooks) {
        const snapshot = window.PissarraApp.getCloudSnapshot();
        const uploaded = await uploadWorkspaceToDrive(snapshot);
        cloudState.lastCloudModifiedTime = uploaded.modifiedTime || new Date().toISOString();
        cloudState.lastSyncedAt = new Date().toISOString();
        cloudState.localDirtySinceSync = false;
        cloudState.status = 'synced';
        saveStoredAuth();
        renderCloudUI();
        return;
      }

      const localFp = window.PissarraApp.getNotebooksFingerprint();
      const cloudFp = window.PissarraApp.computeExternalFingerprint(cloudData.notebooks);

      // 2A. Contingut idèntic entre local i Drive
      if (localFp === cloudFp) {
        cloudState.lastCloudModifiedTime = remoteFile.modifiedTime;
        cloudState.lastSyncedAt = new Date().toISOString();
        cloudState.localDirtySinceSync = false;
        cloudState.status = 'synced';
        saveStoredAuth();
        window.PissarraApp.flashAutosaveIndicator('Sincronitzat ☁️✓', 1800);
        renderCloudUI();
        return;
      }

      const localIsStarter = window.PissarraApp.isUntouchedStarterWorkspace();

      // 2B. Dispositiu nou (llibretes d'exemple intactes) o no hi ha canvis locals pendents → carreguem del Drive!
      if (localIsStarter || !cloudState.localDirtySinceSync) {
        window.PissarraApp.applyCloudSnapshot(cloudData, 'replace');
        cloudState.lastCloudModifiedTime = remoteFile.modifiedTime;
        cloudState.lastSyncedAt = new Date().toISOString();
        cloudState.localDirtySinceSync = false;
        cloudState.status = 'synced';
        saveStoredAuth();
        renderCloudUI();
        return;
      }

      // 2C. El Drive no ha canviat des de l'última sincronització d'aquest dispositiu, però tenim canvis locals nous → pugem!
      if (
        cloudState.lastCloudModifiedTime &&
        remoteFile.modifiedTime === cloudState.lastCloudModifiedTime &&
        cloudState.localDirtySinceSync
      ) {
        const snapshot = window.PissarraApp.getCloudSnapshot();
        const uploaded = await uploadWorkspaceToDrive(snapshot);
        cloudState.lastCloudModifiedTime = uploaded.modifiedTime || new Date().toISOString();
        cloudState.lastSyncedAt = new Date().toISOString();
        cloudState.localDirtySinceSync = false;
        cloudState.status = 'synced';
        saveStoredAuth();
        window.PissarraApp.flashAutosaveIndicator('Desat al Drive ☁️✓', 2000);
        renderCloudUI();
        return;
      }

      // 2D. Tant el Drive com aquest dispositiu tenen edicions pròpies diferents → preguntem a l'usuari sense esborrar res!
      pendingConflictPayload = { remoteFile, cloudData };
      cloudState.status = 'pending';
      renderCloudUI();
      openConflictModal(remoteFile, cloudData);
    } catch (err) {
      if (err.code === 'TOKEN_EXPIRED') {
        cloudState.status = 'expired';
      } else {
        cloudState.status = 'error';
      }
      cloudState.errorMessage = translateDriveError(err);
      renderCloudUI();
    } finally {
      inFlightSync = false;
    }
  }

  async function pushLocalToCloudNow(forceOverwrite = false) {
    if (!window.PissarraApp) return;
    if (!isTokenValid()) {
      if (cloudState.everConnected) cloudState.status = 'expired';
      renderCloudUI();
      return;
    }

    if (inFlightSync) {
      queuedPushAfterFlight = true;
      return;
    }

    inFlightSync = true;
    queuedPushAfterFlight = false;
    cloudState.status = 'syncing';
    cloudState.errorMessage = '';
    renderCloudUI();

    try {
      // Si no és forçat i mai hem sincronitzat en aquesta sessió amb un fitxer existent, fem primer sync segur
      if (!forceOverwrite && !cloudState.lastCloudModifiedTime) {
        inFlightSync = false;
        await performSmartSync();
        return;
      }

      const snapshot = window.PissarraApp.getCloudSnapshot();
      const uploaded = await uploadWorkspaceToDrive(snapshot);
      cloudState.fileId = uploaded.id || cloudState.fileId;
      cloudState.lastCloudModifiedTime = uploaded.modifiedTime || new Date().toISOString();
      cloudState.lastSyncedAt = new Date().toISOString();
      cloudState.localDirtySinceSync = false;
      cloudState.status = 'synced';
      saveStoredAuth();
      window.PissarraApp.flashAutosaveIndicator('Desat al Drive ☁️✓', 1800);
      renderCloudUI();
    } catch (err) {
      if (err.code === 'TOKEN_EXPIRED') {
        cloudState.status = 'expired';
      } else {
        cloudState.status = 'error';
      }
      cloudState.errorMessage = translateDriveError(err);
      renderCloudUI();
    } finally {
      inFlightSync = false;
      if (queuedPushAfterFlight && isTokenValid()) {
        queuedPushAfterFlight = false;
        scheduleCloudPush();
      }
    }
  }

  async function forcePullFromCloud() {
    if (!isTokenValid()) {
      startGoogleSignIn({ fastReconnect: true });
      return;
    }
    if (inFlightSync) return;

    if (
      cloudState.localDirtySinceSync &&
      !window.PissarraApp.isUntouchedStarterWorkspace() &&
      !confirm('Tens canvis locals pendents de pujar. Vols substituir les llibretes actuals per la versió guardada a Google Drive?')
    ) {
      return;
    }

    inFlightSync = true;
    cloudState.status = 'syncing';
    cloudState.errorMessage = '';
    renderCloudUI();

    try {
      const remoteFile = await findRemoteWorkspaceFile();
      if (!remoteFile) {
        alert('Encara no hi ha cap còpia guardada al teu Google Drive.');
        cloudState.status = 'synced';
        renderCloudUI();
        return;
      }
      const cloudData = await downloadRemoteWorkspace(remoteFile.id);
      if (cloudData && Array.isArray(cloudData.notebooks) && cloudData.notebooks.length > 0) {
        window.PissarraApp.applyCloudSnapshot(cloudData, 'replace');
        cloudState.fileId = remoteFile.id;
        cloudState.lastCloudModifiedTime = remoteFile.modifiedTime;
        cloudState.lastSyncedAt = new Date().toISOString();
        cloudState.localDirtySinceSync = false;
        cloudState.status = 'synced';
        saveStoredAuth();
      }
      renderCloudUI();
    } catch (err) {
      cloudState.status = err.code === 'TOKEN_EXPIRED' ? 'expired' : 'error';
      cloudState.errorMessage = translateDriveError(err);
      renderCloudUI();
    } finally {
      inFlightSync = false;
    }
  }

  function scheduleCloudPush() {
    cloudState.localDirtySinceSync = true;
    if (isTokenValid() && cloudState.status !== 'syncing') {
      cloudState.status = 'pending';
    }
    saveStoredAuth();
    renderCloudUI();

    if (!isTokenValid()) return;

    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      pushLocalToCloudNow(false);
    }, AUTO_SYNC_DEBOUNCE_MS);
  }

  // ============================================================================
  // 5. Resolució de Conflictes entre Dispositius
  // ============================================================================
  function openConflictModal(remoteFile, cloudData) {
    const modal = document.getElementById('cloudConflictModal');
    if (!modal) return;
    const cloudInfoEl = document.getElementById('conflictCloudSummary');
    const localInfoEl = document.getElementById('conflictLocalSummary');

    const cloudCount = (cloudData.notebooks || []).length;
    const localSnap = window.PissarraApp.getCloudSnapshot();
    const localCount = (localSnap.notebooks || []).length;

    if (cloudInfoEl) {
      cloudInfoEl.textContent = `${cloudCount} llibreta/es · Modificat ${formatTimeHuman(remoteFile.modifiedTime)}`;
    }
    if (localInfoEl) {
      localInfoEl.textContent = `${localCount} llibreta/es · En aquest navegador`;
    }

    modal.classList.add('open');
  }

  function closeConflictModal() {
    document.getElementById('cloudConflictModal')?.classList.remove('open');
  }

  async function resolveConflict(choice) {
    const payload = pendingConflictPayload;
    pendingConflictPayload = null;
    closeConflictModal();
    if (!payload) return;

    if (choice === 'cloud') {
      window.PissarraApp.applyCloudSnapshot(payload.cloudData, 'replace');
      cloudState.fileId = payload.remoteFile.id;
      cloudState.lastCloudModifiedTime = payload.remoteFile.modifiedTime;
      cloudState.lastSyncedAt = new Date().toISOString();
      cloudState.localDirtySinceSync = false;
      cloudState.status = 'synced';
      saveStoredAuth();
      renderCloudUI();
      return;
    }

    if (choice === 'local') {
      cloudState.fileId = payload.remoteFile.id;
      await pushLocalToCloudNow(true);
      return;
    }

    if (choice === 'merge') {
      cloudState.fileId = payload.remoteFile.id;
      window.PissarraApp.applyCloudSnapshot(payload.cloudData, 'merge');
      await pushLocalToCloudNow(true);
    }
  }

  // ============================================================================
  // 6. Renderitzat del Botó Superior i del Popover de Google Drive
  // ============================================================================
  function openCloudPopover() {
    document.getElementById('timerPopover')?.classList.remove('open');
    document.getElementById('cloudPopover')?.classList.add('open');
    renderCloudUI();
  }

  function closeCloudPopover() {
    document.getElementById('cloudPopover')?.classList.remove('open');
  }

  function googleIconSvg() {
    return `<svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true" style="flex-shrink:0;">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>`;
  }

  function renderCloudUI() {
    const btn = document.getElementById('btnCloudDrive');
    const body = document.getElementById('cloudPopoverBody');
    if (!btn || !body) return;

    // 1. Actualitza el botó de la barra superior
    let dotClass = 'offline';
    let label = 'Drive';
    let title = 'Connecta el teu Google Drive personal per sincronitzar les llibretes entre dispositius';

    if (cloudState.status === 'synced') {
      dotClass = 'online';
      label = 'Drive ✓';
      title = `Sincronitzat amb Google Drive (${cloudState.user?.email || 'connectat'})`;
    } else if (cloudState.status === 'syncing' || cloudState.status === 'connecting') {
      dotClass = 'syncing';
      label = 'Sincronitzant…';
      title = 'Sincronitzant llibretes amb el teu Google Drive…';
    } else if (cloudState.status === 'pending') {
      dotClass = 'pending';
      label = 'Drive · desant';
      title = 'Canvis pendents de pujar a Google Drive';
    } else if (cloudState.status === 'expired') {
      dotClass = 'expired';
      label = 'Reconectar Drive';
      title = 'Sessió de Google en pausa. Clica per tornar a connectar.';
    } else if (cloudState.status === 'error') {
      dotClass = 'error';
      label = 'Drive !';
      title = cloudState.errorMessage || 'Error de sincronització amb Google Drive';
    }

    btn.title = title;
    btn.innerHTML = `<span class="cloud-status-dot ${dotClass}"></span><span>☁️ ${escapeHtml(label)}</span>`;

    // 2. Actualitza l'interior del Popover
    const isFileProtocol = window.location.protocol === 'file:';
    const fileWarningHtml = isFileProtocol
      ? `<div class="cloud-alert warn">
          <strong>⚠️ Obert com a fitxer local (<code>file://</code>)</strong><br/>
          Per seguretat, el login de Google només funciona des d'un servidor web (<code>http://localhost:8000</code> en proves o la teva URL de <strong>GitHub Pages</strong>).
        </div>`
      : '';

    const errorHtml = cloudState.errorMessage
      ? `<div class="cloud-alert error">${escapeHtml(cloudState.errorMessage)}</div>`
      : '';

    // Vista A: Sessió activa i connectada
    if (isTokenValid()) {
      const userName = cloudState.user?.name || 'Compte de Google';
      const userEmail = cloudState.user?.email || 'Sessió activa';
      const initial = (userName[0] || 'G').toUpperCase();
      const avatarHtml = cloudState.user?.picture
        ? `<img src="${escapeHtml(cloudState.user.picture)}" alt="" class="cloud-avatar-img" referrerpolicy="no-referrer" />`
        : `<div class="cloud-avatar-fallback">${escapeHtml(initial)}</div>`;

      let syncBadgeText = '🟢 Sincronitzat al núvol';
      if (cloudState.status === 'syncing') syncBadgeText = '🔄 Sincronitzant ara mateix…';
      else if (cloudState.status === 'pending') syncBadgeText = '⏳ Canvis pendents de sincronitzar…';
      else if (cloudState.status === 'error') syncBadgeText = '⚠️ Error en l\'últim intent';

      body.innerHTML = `
        ${errorHtml}
        <div class="cloud-user-card">
          ${avatarHtml}
          <div class="cloud-user-meta">
            <div class="cloud-user-name">${escapeHtml(userName)}</div>
            <div class="cloud-user-email">${escapeHtml(userEmail)}</div>
          </div>
        </div>

        <div class="cloud-sync-status-box">
          <div class="cloud-sync-headline">${syncBadgeText}</div>
          <div class="cloud-sync-sub">Última còpia: <strong>${escapeHtml(formatTimeHuman(cloudState.lastSyncedAt))}</strong></div>
        </div>

        <button class="primary-action-btn" id="btnCloudSyncNow" ${inFlightSync ? 'disabled' : ''}>
          🔄 Sincronitzar ara
        </button>

        <div class="cloud-dual-btns">
          <button class="secondary-action-btn" id="btnCloudForcePull" title="Descarregar la versió guardada a Google Drive">
            📥 Baixar del Drive
          </button>
          <button class="secondary-action-btn" id="btnCloudForcePush" title="Pujar les llibretes actuals a Google Drive">
            📤 Forçar pujada
          </button>
        </div>

        <div class="cloud-logout-section">
          <button class="cloud-text-btn" id="btnCloudDisconnectOnly">
            🚪 Desconnectar Drive (mantenir còpia aquí)
          </button>
          <button class="cloud-text-btn danger" id="btnCloudDisconnectAndWipe" title="Ideal si estàs en un ordinador compartit o d'institut">
            🧹 Tancar sessió i netejar aquest dispositiu
          </button>
        </div>
      `;

      body.querySelector('#btnCloudSyncNow')?.addEventListener('click', () => performSmartSync());
      body.querySelector('#btnCloudForcePull')?.addEventListener('click', () => forcePullFromCloud());
      body.querySelector('#btnCloudForcePush')?.addEventListener('click', () => pushLocalToCloudNow(true));
      body.querySelector('#btnCloudDisconnectOnly')?.addEventListener('click', () => disconnectGoogleDrive(false));
      body.querySelector('#btnCloudDisconnectAndWipe')?.addEventListener('click', () => {
        if (confirm('Es tancarà la sessió i s\'esborraran les teves llibretes d\'aquest navegador (quedaran intactes al teu Google Drive). Vols continuar?')) {
          disconnectGoogleDrive(true);
        }
      });
      return;
    }

    // Vista B: Sessió prèvia caducada (reconnexió ràpida d'1 clic)
    if (cloudState.everConnected && cloudState.status === 'expired') {
      const emailTxt = cloudState.user?.email || 'el teu compte de Google';
      body.innerHTML = `
        ${fileWarningHtml}
        ${errorHtml}
        <p class="cloud-desc">
          La sessió temporal amb <strong>${escapeHtml(emailTxt)}</strong> ha finalitzat per seguretat.
          ${cloudState.localDirtySinceSync ? '<br/><strong>Tens canvis locals guardats a punt de pujar!</strong>' : ''}
        </p>
        <button class="google-signin-btn" id="btnCloudFastReconnect">
          ${googleIconSvg()}
          <span>Tornar a connectar Drive</span>
        </button>
        <div class="cloud-logout-section" style="margin-top:6px;">
          <button class="cloud-text-btn" id="btnCloudSwitchAccount">Canviar de compte de Google</button>
          <button class="cloud-text-btn danger" id="btnCloudForgetDevice">Desvincular aquest dispositiu</button>
        </div>
      `;
      body.querySelector('#btnCloudFastReconnect')?.addEventListener('click', () => startGoogleSignIn({ fastReconnect: true }));
      body.querySelector('#btnCloudSwitchAccount')?.addEventListener('click', () => startGoogleSignIn({ fastReconnect: false }));
      body.querySelector('#btnCloudForgetDevice')?.addEventListener('click', () => disconnectGoogleDrive(false));
      return;
    }

    // Vista C: Desconnectat (o falta casella de permís)
    body.innerHTML = `
      ${fileWarningHtml}
      ${errorHtml}
      <p class="cloud-desc">
        Inicia sessió per desar i obrir automàticament les teves llibretes al teu propi <strong>Google Drive</strong> des de qualsevol ordinador, tauleta o mòbil.
      </p>
      <div class="cloud-privacy-note">
        🔒 <strong>100% privat:</strong> es desa en una carpeta oculta pròpia de l'app (<code>appDataFolder</code>) del teu compte. Ningú més pot veure les teves llibretes.
      </div>
      <button class="google-signin-btn" id="btnCloudSignIn" ${cloudState.status === 'connecting' ? 'disabled' : ''}>
        ${googleIconSvg()}
        <span>${
          cloudState.status === 'connecting'
            ? 'Obrint Google…'
            : cloudState.needsScopeConsent
              ? 'Donar permís a Google Drive'
              : 'Iniciar sessió amb Google'
        }</span>
      </button>
    `;

    body.querySelector('#btnCloudSignIn')?.addEventListener('click', () => {
      startGoogleSignIn({ forceConsent: cloudState.needsScopeConsent });
    });
  }

  // ============================================================================
  // 7. Inicialització i Esdeveniments Globals
  // ============================================================================
  function initCloudDrive() {
    loadStoredAuth();

    const btn = document.getElementById('btnCloudDrive');
    const popover = document.getElementById('cloudPopover');
    const closeBtn = document.getElementById('btnCloudClose');

    btn?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (popover?.classList.contains('open')) {
        closeCloudPopover();
      } else {
        openCloudPopover();
      }
    });

    closeBtn?.addEventListener('click', closeCloudPopover);

    document.addEventListener('click', (ev) => {
      if (!popover || !popover.classList.contains('open')) return;
      const group = document.getElementById('cloudToolbarGroup');
      if (group && !group.contains(ev.target)) {
        closeCloudPopover();
      }
    });

    // Botons del Modal de Conflictes
    document.getElementById('btnConflictUseCloud')?.addEventListener('click', () => resolveConflict('cloud'));
    document.getElementById('btnConflictUseLocal')?.addEventListener('click', () => resolveConflict('local'));
    document.getElementById('btnConflictMerge')?.addEventListener('click', () => resolveConflict('merge'));
    document.getElementById('btnCloseConflictModal')?.addEventListener('click', closeConflictModal);

    // Escolta qualsevol canvi local fet a la pissarra per auto-sincronitzar en segon pla
    if (window.PissarraApp?.onLocalSave) {
      window.PissarraApp.onLocalSave(({ contentChanged }) => {
        if (contentChanged) {
          scheduleCloudPush();
        } else if (isTokenValid() && !cloudState.localDirtySinceSync) {
          // Canvis lleugers de vista (pàgina activa / mode fosc) també s'actualitzen suaument
          clearTimeout(syncDebounceTimer);
          syncDebounceTimer = setTimeout(() => {
            pushLocalToCloudNow(false);
          }, 4000);
        }
      });
    }

    // Quan l'usuari torna a la pestanya, comprova si ha editat des d'un altre dispositiu
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!isTokenValid() || inFlightSync) return;
      const now = Date.now();
      if (now - lastVisibilityCheckAt < VISIBILITY_CHECK_THROTTLE_MS) return;
      lastVisibilityCheckAt = now;
      performSmartSync({ lightCheckOnly: true });
    });

    renderCloudUI();

    // Si en obrir/refrescar la pàgina el token encara és vigent, sincronitzem automàticament!
    if (isTokenValid()) {
      performSmartSync();
    }
  }

  window.PissarraCloud = {
    isConnected: () => isTokenValid(),
    syncNow: () => performSmartSync(),
    openPopover: openCloudPopover
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCloudDrive);
  } else {
    initCloudDrive();
  }
})();
