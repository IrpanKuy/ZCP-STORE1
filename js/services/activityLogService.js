/**
 * Service Firestore untuk Log Aktivitas (CRUD & Operasional Semua Akun)
 */
(function (global) {
  'use strict';

  var LOG_COLLECTION = 'activity_logs';
  var currentActor = {
    uid: '',
    email: '',
    nama: 'Admin',
    role: 'superadmin'
  };

  function getDbOrThrow() {
    var db = global.ZcpFirebase && global.ZcpFirebase.getDb();
    if (!db) {
      throw new Error('Firebase belum dikonfigurasi.');
    }
    return db;
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return 'Baru saja';
    var date = null;
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    }
    if (!date || isNaN(date.getTime())) return '-';

    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  global.ZcpActivityLogService = {
    formatDateTime: formatDateTime,

    setCurrentActor: function (actor) {
      if (!actor || !actor.uid) {
        currentActor = { uid: '', email: '', nama: '', role: '' };
        return;
      }
      currentActor = {
        uid: String(actor.uid || ''),
        email: String(actor.email || ''),
        nama: String(actor.nama || actor.email || 'Admin'),
        role: String(actor.role || 'superadmin')
      };
    },

    getCurrentActor: function () {
      if (currentActor.uid) {
        return Object.assign({}, currentActor);
      }
      var auth = global.ZcpFirebase && global.ZcpFirebase.getAuth();
      var u = auth && auth.currentUser;
      if (u) {
        return {
          uid: u.uid,
          email: u.email || '',
          nama: (u.email || '').split('@')[0] || 'Admin',
          role: 'superadmin'
        };
      }
      return Object.assign({}, currentActor);
    },

    logActivity: async function (entry) {
      try {
        var db = global.ZcpFirebase && global.ZcpFirebase.getDb();
        var actor = this.getCurrentActor();
        if (!db || !actor || !actor.uid) return;

        await db.collection(LOG_COLLECTION).add({
          actorUid: actor.uid,
          actorName: actor.nama || actor.email || 'Admin',
          actorEmail: actor.email || '',
          actorRole: actor.role || 'superadmin',
          action: String((entry && entry.action) || 'UPDATE'),
          module: String((entry && entry.module) || 'Sistem'),
          targetName: String((entry && entry.targetName) || '-'),
          details: String((entry && entry.details) || ''),
          createdAt: global.ZcpFirebase.serverTimestamp()
        });
      } catch (err) {
        // Logging bersifat best-effort agar tidak menggagalkan operasi utama
      }
    },

    fetchLogs: async function (options) {
      var db = getDbOrThrow();
      var opts = options || {};
      var limitCount = Number(opts.limitCount) > 0 ? Number(opts.limitCount) : 100;
      var query = db
        .collection(LOG_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(limitCount);

      if (opts.startAfterDoc) {
        query = query.startAfter(opts.startAfterDoc);
      }

      var snapshot = await query.get();
      var items = snapshot.docs.map(function (doc) {
        var data = doc.data() || {};
        return {
          id: doc.id,
          actorUid: data.actorUid || '',
          actorName: data.actorName || '',
          actorEmail: data.actorEmail || '',
          actorRole: data.actorRole || 'karyawan',
          action: data.action || 'UPDATE',
          module: data.module || '',
          targetName: data.targetName || '',
          details: data.details || '',
          createdAt: data.createdAt || null
        };
      });

      return {
        items: items,
        lastDoc: snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null,
        hasMore: snapshot.docs.length >= limitCount
      };
    },

    subscribeLogs: function (onData, onError) {
      var db = getDbOrThrow();
      return db
        .collection(LOG_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(500)
        .onSnapshot(
          function (snapshot) {
            var list = snapshot.docs.map(function (doc) {
              var data = doc.data() || {};
              return {
                id: doc.id,
                actorUid: data.actorUid || '',
                actorName: data.actorName || '',
                actorEmail: data.actorEmail || '',
                actorRole: data.actorRole || 'karyawan',
                action: data.action || 'UPDATE',
                module: data.module || '',
                targetName: data.targetName || '',
                details: data.details || '',
                createdAt: data.createdAt || null
              };
            });
            onData(list);
          },
          function (error) {
            if (typeof onError === 'function') {
              onError(error);
            }
          }
        );
    }
  };
})(window);
