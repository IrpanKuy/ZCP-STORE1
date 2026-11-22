/**
 * Service Firestore untuk Master Data Produk & Master Data Expedisi
 */
(function (global) {
  'use strict';

  var PRODUK_COLLECTION = 'master_produk';
  var EXPEDISI_COLLECTION = 'master_expedisi';

  function getDbOrThrow() {
    var db = global.ZcpFirebase && global.ZcpFirebase.getDb();
    if (!db) {
      throw new Error('Firebase belum dikonfigurasi. Lengkapi js/firebase-config.js terlebih dahulu.');
    }
    return db;
  }

  function normalizeSisiList(rawList) {
    if (!Array.isArray(rawList)) return [];
    var seen = {};
    var cleaned = [];
    for (var i = 0; i < rawList.length; i++) {
      var item = typeof rawList[i] === 'string' ? rawList[i].trim() : '';
      if (!item) continue;
      var lower = item.toLowerCase();
      if (!seen[lower]) {
        seen[lower] = true;
        cleaned.push(item);
      }
    }
    return cleaned;
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'Baru saja';
    var date = null;
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      return '-';
    }
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  global.ZcpMasterService = {
    formatDate: formatDate,
    normalizeSisiList: normalizeSisiList,

    fetchProduk: async function () {
      var db = getDbOrThrow();
      var snapshot = await db.collection(PRODUK_COLLECTION).orderBy('createdAt', 'desc').get();
      return snapshot.docs.map(function (doc) {
        var data = doc.data() || {};
        return {
          id: doc.id,
          namaProduk: data.namaProduk || '',
          namaSisi: Array.isArray(data.namaSisi) ? data.namaSisi : [],
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        };
      });
    },

    fetchExpedisi: async function () {
      var db = getDbOrThrow();
      var snapshot = await db.collection(EXPEDISI_COLLECTION).orderBy('createdAt', 'desc').get();
      return snapshot.docs.map(function (doc) {
        var data = doc.data() || {};
        return {
          id: doc.id,
          namaExpedisi: data.namaExpedisi || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        };
      });
    },

    subscribeProduk: function (onData, onError) {
      var db = getDbOrThrow();
      return db
        .collection(PRODUK_COLLECTION)
        .orderBy('createdAt', 'desc')
        .onSnapshot(
          function (snapshot) {
            var list = snapshot.docs.map(function (doc) {
              var data = doc.data() || {};
              return {
                id: doc.id,
                namaProduk: data.namaProduk || '',
                namaSisi: Array.isArray(data.namaSisi) ? data.namaSisi : [],
                createdAt: data.createdAt || null,
                updatedAt: data.updatedAt || null
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
    },

    addProduk: async function (payload) {
      var db = getDbOrThrow();
      var namaProduk = (payload.namaProduk || '').trim();
      var namaSisi = normalizeSisiList(payload.namaSisi);

      if (!namaProduk) {
        throw new Error('Nama produk wajib diisi.');
      }
      if (!namaSisi.length) {
        throw new Error('Minimal harus ada 1 nama sisi.');
      }

      var res = await db.collection(PRODUK_COLLECTION).add({
        namaProduk: namaProduk,
        namaSisi: namaSisi,
        createdAt: global.ZcpFirebase.serverTimestamp(),
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'CREATE',
          module: 'Master Produk',
          targetName: namaProduk,
          details: 'Sisi: ' + namaSisi.join(', ')
        });
      }
      return res;
    },

    updateProduk: async function (id, payload) {
      var db = getDbOrThrow();
      var namaProduk = (payload.namaProduk || '').trim();
      var namaSisi = normalizeSisiList(payload.namaSisi);

      if (!id) {
        throw new Error('ID produk tidak valid.');
      }
      if (!namaProduk) {
        throw new Error('Nama produk wajib diisi.');
      }
      if (!namaSisi.length) {
        throw new Error('Minimal harus ada 1 nama sisi.');
      }

      await db.collection(PRODUK_COLLECTION).doc(id).update({
        namaProduk: namaProduk,
        namaSisi: namaSisi,
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Master Produk',
          targetName: namaProduk,
          details: 'Sisi: ' + namaSisi.join(', ')
        });
      }
    },

    deleteProduk: async function (id, targetName) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID produk tidak valid.');
      }
      await db.collection(PRODUK_COLLECTION).doc(id).delete();

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'DELETE',
          module: 'Master Produk',
          targetName: targetName || id,
          details: 'Menghapus master produk'
        });
      }
    },

    subscribeExpedisi: function (onData, onError) {
      var db = getDbOrThrow();
      return db
        .collection(EXPEDISI_COLLECTION)
        .orderBy('createdAt', 'desc')
        .onSnapshot(
          function (snapshot) {
            var list = snapshot.docs.map(function (doc) {
              var data = doc.data() || {};
              return {
                id: doc.id,
                namaExpedisi: data.namaExpedisi || '',
                createdAt: data.createdAt || null,
                updatedAt: data.updatedAt || null
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
    },

    addExpedisi: async function (payload) {
      var db = getDbOrThrow();
      var namaExpedisi = (payload.namaExpedisi || '').trim();
      if (!namaExpedisi) {
        throw new Error('Nama expedisi wajib diisi.');
      }

      var res = await db.collection(EXPEDISI_COLLECTION).add({
        namaExpedisi: namaExpedisi,
        createdAt: global.ZcpFirebase.serverTimestamp(),
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'CREATE',
          module: 'Master Expedisi',
          targetName: namaExpedisi,
          details: 'Menambahkan expedisi baru'
        });
      }
      return res;
    },

    updateExpedisi: async function (id, payload) {
      var db = getDbOrThrow();
      var namaExpedisi = (payload.namaExpedisi || '').trim();
      if (!id) {
        throw new Error('ID expedisi tidak valid.');
      }
      if (!namaExpedisi) {
        throw new Error('Nama expedisi wajib diisi.');
      }

      await db.collection(EXPEDISI_COLLECTION).doc(id).update({
        namaExpedisi: namaExpedisi,
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Master Expedisi',
          targetName: namaExpedisi,
          details: 'Memperbarui nama expedisi'
        });
      }
    },

    deleteExpedisi: async function (id, targetName) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID expedisi tidak valid.');
      }
      await db.collection(EXPEDISI_COLLECTION).doc(id).delete();

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'DELETE',
          module: 'Master Expedisi',
          targetName: targetName || id,
          details: 'Menghapus master expedisi'
        });
      }
    }
  };
})(window);
