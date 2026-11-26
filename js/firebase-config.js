/**
 * Konfigurasi Firebase & Google Drive API v3 ZCP STORE
 *
 * Cara mengisi:
 * 1. Firebase: Buka https://console.firebase.google.com > Project Settings > Your apps > Web app (</>).
 * 2. Aktifkan Authentication (Email/Password) lalu buat akun admin di tab Users.
 * 3. Aktifkan Cloud Firestore lalu pasang isi file firestore.rules.
 * 4. Upload File (Google Drive API): Atur kredensial OAuth Google Drive API di menu Pengaturan (Superadmin).
 */
(function (global) {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyALEsC4q0UBApD6acMiyeLlJiQwZsyJdgY",
    authDomain: "zcp-store.firebaseapp.com",
    projectId: "zcp-store",
    storageBucket: "zcp-store.firebasestorage.app",
    messagingSenderId: "485122344431",
    appId: "1:485122344431:web:d95000a47543701b1d621a",
    measurementId: "G-03X1VXZR51"
  };

  var DEFAULT_DRIVE_ROOT_FOLDER = 'ZCP_STORE_FILES';
  var runtimeDriveConfig = {
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    accessToken: '',
    rootFolderId: '',
    rootFolderName: DEFAULT_DRIVE_ROOT_FOLDER
  };

  function normalizeDriveConfig(cfg) {
    var src = cfg && typeof cfg === 'object' ? cfg : {};
    var rootName =
      typeof src.rootFolderName === 'string' && src.rootFolderName.trim()
        ? src.rootFolderName.trim()
        : DEFAULT_DRIVE_ROOT_FOLDER;
    return {
      clientId: typeof src.clientId === 'string' ? src.clientId.trim() : '',
      clientSecret: typeof src.clientSecret === 'string' ? src.clientSecret.trim() : '',
      refreshToken: typeof src.refreshToken === 'string' ? src.refreshToken.trim() : '',
      accessToken: typeof src.accessToken === 'string' ? src.accessToken.trim() : '',
      rootFolderId: typeof src.rootFolderId === 'string' ? src.rootFolderId.trim() : '',
      rootFolderName: rootName
    };
  }

  function isConfigured() {
    if (typeof firebase === 'undefined') {
      return false;
    }
    var hasApiKey =
      typeof firebaseConfig.apiKey === 'string' &&
      firebaseConfig.apiKey.trim().length > 0 &&
      firebaseConfig.apiKey.indexOf('MASUKKAN_') !== 0;
    var hasProjectId =
      typeof firebaseConfig.projectId === 'string' &&
      firebaseConfig.projectId.trim().length > 0 &&
      firebaseConfig.projectId.indexOf('MASUKKAN_') !== 0;

    return hasApiKey && hasProjectId;
  }

  var configured = isConfigured();
  if (configured && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    try {
      firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(function () {
        // Abaikan jika browser memblokir multi-tab persistence
      });
    } catch (e) {
      // Abaikan jika persistence tidak didukung
    }
  }

  global.ZcpFirebase = {
    isConfigured: function () {
      return configured;
    },
    getAuth: function () {
      return configured ? firebase.auth() : null;
    },
    getSecondaryAuth: function () {
      if (!configured) return null;
      var secondaryApp = null;
      for (var i = 0; i < firebase.apps.length; i++) {
        if (firebase.apps[i].name === 'zcp-user-creator') {
          secondaryApp = firebase.apps[i];
          break;
        }
      }
      if (!secondaryApp) {
        secondaryApp = firebase.initializeApp(firebaseConfig, 'zcp-user-creator');
      }
      return secondaryApp.auth();
    },
    getDb: function () {
      return configured ? firebase.firestore() : null;
    },
    serverTimestamp: function () {
      return firebase.firestore.FieldValue.serverTimestamp();
    }
  };

  global.ZcpDriveConfig = {
    setConfig: function (cfg) {
      runtimeDriveConfig = normalizeDriveConfig(cfg);
      return this.getConfig();
    },
    getConfig: function () {
      return Object.assign({}, runtimeDriveConfig);
    },
    hasRefreshCredentials: function (cfg) {
      var c = cfg ? normalizeDriveConfig(cfg) : runtimeDriveConfig;
      return Boolean(c.clientId && c.clientSecret && c.refreshToken);
    },
    isConfigured: function (cfg) {
      var c = cfg ? normalizeDriveConfig(cfg) : runtimeDriveConfig;
      return Boolean((c.clientId && c.clientSecret && c.refreshToken) || c.accessToken);
    }
  };
})(window);
