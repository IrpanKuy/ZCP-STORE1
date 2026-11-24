/**
 * Service Firestore untuk Menu Borongan & Pengajuan Perubahan Kontribusi
 */
(function (global) {
  'use strict';

  var REQUESTS_COLLECTION = 'kontribusi_requests';
  var PESANAN_COLLECTION = 'pesanan';

  function getDbOrThrow() {
    var db = global.ZcpFirebase && global.ZcpFirebase.getDb();
    if (!db) {
      throw new Error('Firebase belum dikonfigurasi.');
    }
    return db;
  }

  function getActor() {
    return (global.ZcpActivityLogService && global.ZcpActivityLogService.getCurrentActor()) || {};
  }

  function getTimestampMs(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
    return 0;
  }

  function normalizeEntries(rawList) {
    if (global.ZcpPesananService && global.ZcpPesananService.normalizeKontribusiList) {
      return global.ZcpPesananService.normalizeKontribusiList(rawList);
    }
    return Array.isArray(rawList) ? rawList : [];
  }

  function areKontribusiEqual(listA, listB) {
    var mapA = {};
    var mapB = {};
    listA.forEach(function (item) {
      mapA[item.uid] = Number(item.qty) || 0;
    });
    listB.forEach(function (item) {
      mapB[item.uid] = Number(item.qty) || 0;
    });
    var keysA = Object.keys(mapA);
    var keysB = Object.keys(mapB);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(function (k) {
      return mapA[k] === mapB[k];
    });
  }

  function mapRequestDoc(doc) {
    var data = doc.data() || {};
    return {
      id: doc.id,
      pesananId: data.pesananId || '',
      namaPemesan: data.namaPemesan || '',
      namaProduk: data.namaProduk || '',
      jumlahProduk: Number(data.jumlahProduk) || 0,
      completedByUid: data.completedByUid || '',
      completedByName: data.completedByName || '',
      requestedByUid: data.requestedByUid || '',
      requestedByName: data.requestedByName || '',
      requestedByRole: data.requestedByRole || '',
      alasan: data.alasan || '',
      oldKontribusi: normalizeEntries(data.oldKontribusi),
      newKontribusi: normalizeEntries(data.newKontribusi),
      involvedUids: Array.isArray(data.involvedUids) ? data.involvedUids : [],
      status: data.status || 'pending',
      reviewedByUid: data.reviewedByUid || '',
      reviewedByName: data.reviewedByName || '',
      reviewNote: data.reviewNote || '',
      reviewedAt: data.reviewedAt || null,
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null
    };
  }

  global.ZcpBoronganService = {
    subscribeRequests: function (user, onData, onError) {
      var db = getDbOrThrow();
      if (!user || !user.uid) {
        onData([]);
        return function () {};
      }

      var isSuper = user.role === 'superadmin';
      // Hindari composite index: Superadmin orderBy createdAt, non-superadmin query involvedUids lalu sort di JS
      var query = isSuper
        ? db.collection(REQUESTS_COLLECTION).orderBy('createdAt', 'desc').limit(150)
        : db
            .collection(REQUESTS_COLLECTION)
            .where('involvedUids', 'array-contains', user.uid)
            .limit(150);

      return query.onSnapshot(
        function (snapshot) {
          var list = snapshot.docs.map(mapRequestDoc);
          if (!isSuper) {
            list.sort(function (a, b) {
              return getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt);
            });
          }
          onData(list);
        },
        function (error) {
          if (typeof onError === 'function') {
            onError(error);
          }
        }
      );
    },

    createChangeRequest: async function (params) {
      var db = getDbOrThrow();
      var order = params && params.order;
      var alasan = String((params && params.alasan) || '').trim();
      var actor = getActor();

      if (!order || !order.id) {
        throw new Error('Data pesanan tidak valid.');
      }
      if (!order.statusSelesai) {
        throw new Error('Hanya pesanan selesai yang dapat diajukan perubahan kontribusinya di menu Borongan.');
      }
      if (order.completedByUid && actor.uid && order.completedByUid === actor.uid) {
        throw new Error(
          'Akun yang mengklik Pesanan Selesai di Operasional tidak dapat mengajukan perubahan kontribusi pada pesanan ini.'
        );
      }

      var oldList = normalizeEntries(order.kontribusi);
      if (oldList.length < 2) {
        throw new Error(
          'Pengajuan perubahan kontribusi hanya tersedia untuk pesanan dengan minimal 2 karyawan berkontribusi.'
        );
      }

      var newList = normalizeEntries(params && params.newKontribusi);
      var newTotal = newList.reduce(function (sum, item) {
        return sum + (Number(item.qty) || 0);
      }, 0);

      if (newTotal !== Number(order.jumlahProduk)) {
        throw new Error(
          'Total kontribusi baru (' +
            newTotal +
            ' pcs) harus sama persis dengan jumlah pesanan (' +
            order.jumlahProduk +
            ' pcs).'
        );
      }

      if (areKontribusiEqual(oldList, newList)) {
        throw new Error('Belum ada perubahan jumlah qty kontribusi dibanding data saat ini.');
      }

      var uidSet = {};
      var involvedUids = [];
      function pushUid(u) {
        var clean = String(u || '').trim();
        if (clean && !uidSet[clean]) {
          uidSet[clean] = true;
          involvedUids.push(clean);
        }
      }

      pushUid(actor.uid);
      pushUid(order.completedByUid);
      oldList.forEach(function (k) {
        pushUid(k.uid);
      });
      newList.forEach(function (k) {
        pushUid(k.uid);
      });

      var ts = global.ZcpFirebase.serverTimestamp();
      var res = await db.collection(REQUESTS_COLLECTION).add({
        pesananId: order.id,
        namaPemesan: order.namaPemesan || '',
        namaProduk: order.namaProduk || '',
        jumlahProduk: Number(order.jumlahProduk) || 0,
        completedByUid: order.completedByUid || '',
        completedByName: order.completedByName || '',
        requestedByUid: actor.uid || '',
        requestedByName: actor.nama || actor.email || 'Karyawan',
        requestedByRole: actor.role || 'karyawan',
        alasan: alasan,
        oldKontribusi: oldList,
        newKontribusi: newList,
        involvedUids: involvedUids,
        status: 'pending',
        reviewedByUid: '',
        reviewedByName: '',
        reviewNote: '',
        reviewedAt: null,
        createdAt: ts,
        updatedAt: ts
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'CREATE',
          module: 'Borongan',
          targetName: order.namaPemesan + ' (' + order.namaProduk + ')',
          details:
            'Mengajukan perubahan kontribusi' + (alasan ? ': ' + alasan : '')
        });
      }

      return res;
    },

    approveChangeRequest: async function (req) {
      var db = getDbOrThrow();
      if (!req || !req.id || !req.pesananId) {
        throw new Error('Data pengajuan tidak valid.');
      }
      if (req.status !== 'pending') {
        throw new Error('Pengajuan ini sudah diproses sebelumnya.');
      }

      var actor = getActor();
      var isSuper = actor.role === 'superadmin';
      var isCompleter = Boolean(actor.uid && req.completedByUid && actor.uid === req.completedByUid);
      if (!isSuper && !isCompleter) {
        throw new Error(
          'Hanya Superadmin atau ' +
            (req.completedByName || 'akun yang menyelesaikan pesanan') +
            ' yang dapat menyetujui perubahan ini.'
        );
      }

      var newEntries = normalizeEntries(req.newKontribusi);
      var newUids = newEntries.map(function (k) {
        return k.uid;
      });
      var newTotal = newEntries.reduce(function (sum, k) {
        return sum + (Number(k.qty) || 0);
      }, 0);

      var ts = global.ZcpFirebase.serverTimestamp();
      var batch = db.batch();

      batch.update(db.collection(PESANAN_COLLECTION).doc(req.pesananId), {
        kontribusi: newEntries,
        kontribusiUids: newUids,
        kontribusiTotal: newTotal,
        updatedAt: ts
      });

      batch.update(db.collection(REQUESTS_COLLECTION).doc(req.id), {
        status: 'approved',
        reviewedByUid: actor.uid || '',
        reviewedByName: actor.nama || actor.email || 'Admin',
        reviewedAt: ts,
        updatedAt: ts
      });

      await batch.commit();

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Borongan',
          targetName: req.namaPemesan + ' (' + req.namaProduk + ')',
          details: 'Menyetujui pengajuan perubahan kontribusi dari ' + (req.requestedByName || 'karyawan')
        });
      }
    },

    rejectChangeRequest: async function (req, reviewNote) {
      var db = getDbOrThrow();
      if (!req || !req.id) {
        throw new Error('Data pengajuan tidak valid.');
      }
      if (req.status !== 'pending') {
        throw new Error('Pengajuan ini sudah diproses sebelumnya.');
      }

      var actor = getActor();
      var isSuper = actor.role === 'superadmin';
      var isCompleter = Boolean(actor.uid && req.completedByUid && actor.uid === req.completedByUid);
      if (!isSuper && !isCompleter) {
        throw new Error(
          'Hanya Superadmin atau ' +
            (req.completedByName || 'akun yang menyelesaikan pesanan') +
            ' yang dapat menolak pengajuan ini.'
        );
      }

      var ts = global.ZcpFirebase.serverTimestamp();
      var note = String(reviewNote || '').trim();

      await db.collection(REQUESTS_COLLECTION).doc(req.id).update({
        status: 'rejected',
        reviewedByUid: actor.uid || '',
        reviewedByName: actor.nama || actor.email || 'Admin',
        reviewNote: note,
        reviewedAt: ts,
        updatedAt: ts
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Borongan',
          targetName: req.namaPemesan + ' (' + req.namaProduk + ')',
          details:
            'Menolak pengajuan perubahan kontribusi' + (note ? ' (' + note + ')' : '')
        });
      }
    }
  };
})(window);
