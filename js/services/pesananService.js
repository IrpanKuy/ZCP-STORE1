/**
 * Service Firestore untuk Manajemen Pesanan
 */
(function (global) {
  'use strict';

  var PESANAN_COLLECTION = 'pesanan';
  var latestPesananMap = {};

  function getDbOrThrow() {
    var db = global.ZcpFirebase && global.ZcpFirebase.getDb();
    if (!db) {
      throw new Error('Firebase belum dikonfigurasi. Lengkapi js/firebase-config.js terlebih dahulu.');
    }
    return db;
  }

  function formatDate(timestamp) {
    if (global.ZcpMasterService && typeof global.ZcpMasterService.formatDate === 'function') {
      return global.ZcpMasterService.formatDate(timestamp);
    }
    if (!timestamp) return 'Baru saja';
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
    return '-';
  }

  function formatFileSize(bytes) {
    var size = Number(bytes) || 0;
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function getDaysUntilDeadline(ymd) {
    var raw = ymd ? String(ymd).trim() : '';
    if (!raw) return null;

    var parts = raw.split('-');
    if (parts.length !== 3) return null;
    var deadlineDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(deadlineDate.getTime())) return null;

    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.ceil((deadlineDate.getTime() - today.getTime()) / 86400000);
  }

  function formatDateString(ymd) {
    var raw = ymd ? String(ymd).trim() : '';
    if (!raw) return '-';
    var parts = raw.split('-');
    if (parts.length !== 3) return raw;
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function getDeadlineStatus(order) {
    if (order && order.statusSelesai) return 'done';
    var diffDays = getDaysUntilDeadline(order && order.tanggalDeadline);
    if (diffDays === null) return 'unscheduled';
    if (diffDays < 0) return 'overdue';
    if (diffDays <= 3) return 'soon';
    return 'normal';
  }

  function buildInitialSisiProgress(namaSisi, existingProgress) {
    var map = {};
    var prev = existingProgress && typeof existingProgress === 'object' ? existingProgress : {};
    for (var i = 0; i < namaSisi.length; i++) {
      var side = namaSisi[i];
      map[side] = Number(prev[side]) || 0;
    }
    return map;
  }

  function validateOrderPayload(payload) {
    var namaPemesan = (payload.namaPemesan || '').trim();
    var namaProduk = (payload.namaProduk || '').trim();
    var namaExpedisi = (payload.namaExpedisi || '').trim();
    var jumlahProduk = parseInt(payload.jumlahProduk, 10);
    var namaSisi = Array.isArray(payload.namaSisi)
      ? payload.namaSisi
          .map(function (s) {
            return String(s || '').trim();
          })
          .filter(Boolean)
      : [];

    if (!namaPemesan) {
      throw new Error('Nama pemesan wajib diisi.');
    }
    if (!namaProduk) {
      throw new Error('Produk wajib dipilih.');
    }
    if (!namaSisi.length) {
      throw new Error('Pilih minimal 1 sisi sablon untuk pesanan ini.');
    }
    if (!jumlahProduk || jumlahProduk < 1) {
      throw new Error('Jumlah produk minimal 1 pcs.');
    }
    if (!namaExpedisi) {
      throw new Error('Expedisi wajib dipilih.');
    }

    return {
      namaPemesan: namaPemesan,
      produkId: payload.produkId || '',
      namaProduk: namaProduk,
      namaSisi: namaSisi,
      jumlahProduk: jumlahProduk,
      fileDesigns: Array.isArray(payload.fileDesigns) ? payload.fileDesigns : [],
      expedisiId: payload.expedisiId || '',
      namaExpedisi: namaExpedisi,
      catatan: (payload.catatan || '').trim()
    };
  }

  global.ZcpPesananService = {
    formatDate: formatDate,
    formatDateString: formatDateString,
    formatFileSize: formatFileSize,
    getDaysUntilDeadline: getDaysUntilDeadline,
    getDeadlineStatus: getDeadlineStatus,

    getCachedPesanan: function (id) {
      return latestPesananMap[id] || null;
    },

    subscribePesanan: function (onData, onError, limitCount) {
      var db = getDbOrThrow();
      var limit = Number(limitCount) > 0 ? Number(limitCount) : 150;
      return db
        .collection(PESANAN_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .onSnapshot(
          function (snapshot) {
            var nextMap = {};
            var list = snapshot.docs.map(function (doc) {
              var data = doc.data() || {};
              var obj = {
                id: doc.id,
                namaPemesan: data.namaPemesan || '',
                produkId: data.produkId || '',
                namaProduk: data.namaProduk || '',
                namaSisi: Array.isArray(data.namaSisi) ? data.namaSisi : [],
                jumlahProduk: Number(data.jumlahProduk) || 0,
                sisiProgress:
                  data.sisiProgress && typeof data.sisiProgress === 'object'
                    ? data.sisiProgress
                    : {},
                fileDesigns: Array.isArray(data.fileDesigns) ? data.fileDesigns : [],
                expedisiId: data.expedisiId || '',
                namaExpedisi: data.namaExpedisi || '',
                catatan: data.catatan || '',
                tanggalMulai: data.tanggalMulai || '',
                tanggalDeadline: data.tanggalDeadline || '',
                statusSelesai: Boolean(data.statusSelesai),
                completedAt: data.completedAt || null,
                completedByUid: data.completedByUid || '',
                completedByName: data.completedByName || '',
                createdAt: data.createdAt || null,
                updatedAt: data.updatedAt || null
              };
              nextMap[doc.id] = obj;
              return obj;
            });
            latestPesananMap = nextMap;
            onData(list, snapshot.docs.length >= limit);
          },
          function (error) {
            if (typeof onError === 'function') {
              onError(error);
            }
          }
        );
    },

    addPesanan: async function (payload) {
      var db = getDbOrThrow();
      var clean = validateOrderPayload(payload);
      var sisiProgress = buildInitialSisiProgress(clean.namaSisi, null);

      var res = await db.collection(PESANAN_COLLECTION).add({
        namaPemesan: clean.namaPemesan,
        produkId: clean.produkId,
        namaProduk: clean.namaProduk,
        namaSisi: clean.namaSisi,
        jumlahProduk: clean.jumlahProduk,
        sisiProgress: sisiProgress,
        fileDesigns: clean.fileDesigns,
        expedisiId: clean.expedisiId,
        namaExpedisi: clean.namaExpedisi,
        catatan: clean.catatan,
        tanggalMulai: '',
        tanggalDeadline: '',
        statusSelesai: false,
        completedAt: null,
        completedByUid: '',
        completedByName: '',
        createdAt: global.ZcpFirebase.serverTimestamp(),
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'CREATE',
          module: 'Pesanan',
          targetName: clean.namaPemesan,
          details:
            clean.namaProduk +
            ' (' +
            clean.jumlahProduk +
            ' pcs) • Sisi: ' +
            clean.namaSisi.join(', ')
        });
      }
      return res;
    },

    updatePesanan: async function (id, payload, existingProgress) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID pesanan tidak valid.');
      }
      var clean = validateOrderPayload(payload);
      var sisiProgress = buildInitialSisiProgress(clean.namaSisi, existingProgress);

      await db.collection(PESANAN_COLLECTION).doc(id).update({
        namaPemesan: clean.namaPemesan,
        produkId: clean.produkId,
        namaProduk: clean.namaProduk,
        namaSisi: clean.namaSisi,
        jumlahProduk: clean.jumlahProduk,
        sisiProgress: sisiProgress,
        fileDesigns: clean.fileDesigns,
        expedisiId: clean.expedisiId,
        namaExpedisi: clean.namaExpedisi,
        catatan: clean.catatan,
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Pesanan',
          targetName: clean.namaPemesan,
          details:
            clean.namaProduk +
            ' (' +
            clean.jumlahProduk +
            ' pcs) • Expedisi: ' +
            clean.namaExpedisi
        });
      }
    },

    deletePesanan: async function (id, targetName) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID pesanan tidak valid.');
      }
      await db.collection(PESANAN_COLLECTION).doc(id).delete();

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'DELETE',
          module: 'Pesanan',
          targetName: targetName || id,
          details: 'Menghapus pesanan'
        });
      }
    },

    updateJadwal: async function (id, jadwal, targetName) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID pesanan tidak valid.');
      }
      var mulai = (jadwal && jadwal.tanggalMulai ? String(jadwal.tanggalMulai) : '').trim();
      var deadline = (jadwal && jadwal.tanggalDeadline ? String(jadwal.tanggalDeadline) : '').trim();
      if (mulai && deadline && deadline < mulai) {
        throw new Error('Tanggal deadline tidak boleh lebih awal dari tanggal mulai.');
      }

      await db.collection(PESANAN_COLLECTION).doc(id).update({
        tanggalMulai: mulai,
        tanggalDeadline: deadline,
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Operasional',
          targetName: targetName || id,
          details:
            'Jadwal diubah (Mulai: ' + (mulai || '-') + ', Deadline: ' + (deadline || '-') + ')'
        });
      }
    },

    bulkUpdateJadwal: async function (ids, jadwal) {
      var db = getDbOrThrow();
      if (!Array.isArray(ids) || !ids.length) {
        throw new Error('Pilih minimal 1 pesanan untuk bulk update.');
      }

      var mulai = (jadwal && jadwal.tanggalMulai ? String(jadwal.tanggalMulai) : '').trim();
      var deadline = (jadwal && jadwal.tanggalDeadline ? String(jadwal.tanggalDeadline) : '').trim();

      if (!mulai && !deadline) {
        throw new Error('Isi minimal satu tanggal (Mulai atau Deadline).');
      }
      if (mulai && deadline && deadline < mulai) {
        throw new Error('Tanggal deadline tidak boleh lebih awal dari tanggal mulai.');
      }

      var batch = db.batch();
      var ts = global.ZcpFirebase.serverTimestamp();
      var updateData = { updatedAt: ts };
      if (mulai) updateData.tanggalMulai = mulai;
      if (deadline) updateData.tanggalDeadline = deadline;

      for (var i = 0; i < ids.length; i++) {
        var ref = db.collection(PESANAN_COLLECTION).doc(ids[i]);
        batch.update(ref, updateData);
      }
      await batch.commit();

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'BULK_UPDATE',
          module: 'Operasional',
          targetName: ids.length + ' pesanan',
          details:
            'Bulk update jadwal (Mulai: ' +
            (mulai || 'tidak diubah') +
            ', Deadline: ' +
            (deadline || 'tidak diubah') +
            ')'
        });
      }
    },

    toggleStatusSelesai: async function (id, statusSelesai, orderMeta) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID pesanan tidak valid.');
      }
      var done = Boolean(statusSelesai);
      var actor =
        (global.ZcpActivityLogService && global.ZcpActivityLogService.getCurrentActor()) || {};

      await db.collection(PESANAN_COLLECTION).doc(id).update({
        statusSelesai: done,
        completedAt: done ? global.ZcpFirebase.serverTimestamp() : null,
        completedByUid: done ? actor.uid || '' : '',
        completedByName: done ? actor.nama || actor.email || 'Admin' : '',
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        var label =
          orderMeta && orderMeta.namaPemesan
            ? orderMeta.namaPemesan + (orderMeta.namaProduk ? ' (' + orderMeta.namaProduk + ')' : '')
            : id;
        await global.ZcpActivityLogService.logActivity({
          action: done ? 'COMPLETE' : 'UNDO_COMPLETE',
          module: 'Operasional',
          targetName: label,
          details: done ? 'Menandai pesanan selesai' : 'Membatalkan status selesai pesanan'
        });
      }
    }
  };
})(window);
