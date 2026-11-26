/**
 * Konfigurasi Firebase & Google Apps Script (Google Drive) ZCP STORE
 *
 * Cara mengisi:
 * 1. Firebase: Buka https://console.firebase.google.com > Project Settings > Your apps > Web app (</>).
 * 2. Aktifkan Authentication (Email/Password) lalu buat akun admin di tab Users.
 * 3. Aktifkan Cloud Firestore lalu pasang isi file firestore.rules.
 * 4. Upload File (Google Drive): Deploy file code.gs di https://script.google.com sebagai Web App,
 *    lalu tempel URL hasil deploy (/exec) ke bagian gasConfig.gasUrl di bawah ini.
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

  // =========================================================================
  // TEMPEL URL GOOGLE APPS SCRIPT (GAS_URL) HASIL DEPLOY code.gs DI BAWAH INI
  // =========================================================================
  const gasConfig = {
    gasUrl: 'https://script.google.com/macros/s/AKfycbxsw-DV-86TYQh2yNrGfxc02f77b2Isd16nOlD65DXwSUqh3j3XlLWkZ7hR-9vRfcufRQ/exec', // Contoh: 'https://script.google.com/macros/s/AKfycb.../exec'
    apiSecret: '' // Opsional: samakan dengan API_SECRET di code.gs jika diaktifkan
  };

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
    getGasUrl: function () {
      return typeof gasConfig.gasUrl === 'string' ? gasConfig.gasUrl.trim() : '';
    },
    getApiSecret: function () {
      return typeof gasConfig.apiSecret === 'string' ? gasConfig.apiSecret : '';
    },
    isConfigured: function () {
      var url = this.getGasUrl();
      return (
        url.length > 0 &&
        url.indexOf('MASUKKAN_') !== 0 &&
        /^https:\/\/script\.google\.com\//i.test(url)
      );
    }
  };
})(window);
