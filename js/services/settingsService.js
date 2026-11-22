/**
 * Service Firestore untuk Pengaturan Aplikasi (Default Pagination, dll.)
 */
(function (global) {
  'use strict';

  var SETTINGS_COLLECTION = 'app_settings';
  var GENERAL_DOC_ID = 'general';
  var ALLOWED_PAGE_SIZES = [10, 20, 50, 'all'];

  function getDbOrThrow() {
    var db = global.ZcpFirebase && global.ZcpFirebase.getDb();
    if (!db) {
      throw new Error('Firebase belum dikonfigurasi.');
    }
    return db;
  }

  function normalizePageSize(val) {
    if (val === 'all') return 'all';
    var num = Number(val);
    if (num === 10 || num === 20 || num === 50) return num;
    return 10;
  }

  global.ZcpSettingsService = {
    ALLOWED_PAGE_SIZES: ALLOWED_PAGE_SIZES,
    normalizePageSize: normalizePageSize,

    fetchSettings: async function () {
      var db = getDbOrThrow();
      var doc = await db.collection(SETTINGS_COLLECTION).doc(GENERAL_DOC_ID).get();
      var data = doc.exists ? doc.data() || {} : {};
      return {
        defaultPageSize: normalizePageSize(data.defaultPageSize)
      };
    },

    subscribeSettings: function (onData, onError) {
      var db = getDbOrThrow();
      return db
        .collection(SETTINGS_COLLECTION)
        .doc(GENERAL_DOC_ID)
        .onSnapshot(
          function (doc) {
            var data = doc.exists ? doc.data() || {} : {};
            onData({
              defaultPageSize: normalizePageSize(data.defaultPageSize)
            });
          },
          function (error) {
            if (typeof onError === 'function') {
              onError(error);
            }
          }
        );
    },

    updateSettings: async function (payload) {
      var db = getDbOrThrow();
      var defaultPageSize = normalizePageSize(payload && payload.defaultPageSize);
      var actor =
        (global.ZcpActivityLogService && global.ZcpActivityLogService.getCurrentActor()) || {};

      await db
        .collection(SETTINGS_COLLECTION)
        .doc(GENERAL_DOC_ID)
        .set(
          {
            defaultPageSize: defaultPageSize,
            updatedByUid: actor.uid || '',
            updatedByName: actor.nama || actor.email || 'Superadmin',
            updatedAt: global.ZcpFirebase.serverTimestamp()
          },
          { merge: true }
        );

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Pengaturan',
          targetName: 'Default Pagination',
          details:
            'Mengubah default pagination tabel menjadi ' +
            (defaultPageSize === 'all' ? 'Semua' : defaultPageSize + ' baris')
        });
      }
    }
  };
})(window);
