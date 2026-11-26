/**
 * Service Firestore untuk Manajemen Pesanan, Kontribusi, & Status Operasional
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

  function normalizeGroupingsForOrder(rawGroupings, validSides) {
    if (!Array.isArray(rawGroupings)) return [];
    var validSet = {};
    (validSides || []).forEach(function (s) {
      validSet[String(s).toLowerCase()] = String(s);
    });
    var result = [];
    rawGroupings.forEach(function (g, idx) {
      if (!g || typeof g !== 'object') return;
      var gName = String(g.namaGrouping || '').trim();
      var sides = Array.isArray(g.sisi)
        ? g.sisi
            .map(function (s) {
              return validSet[String(s || '').trim().toLowerCase()] || '';
            })
            .filter(Boolean)
        : [];
      if (!gName || !sides.length) return;
      result.push({
        id: String(g.id || '').trim() || 'grp_' + (idx + 1),
        namaGrouping: gName,
        sisi: sides
      });
    });
    return result;
  }

  function normalizeKontribusiList(rawList) {
    if (!Array.isArray(rawList)) return [];
    var seen = {};
    var out = [];
    for (var i = 0; i < rawList.length; i++) {
      var item = rawList[i] || {};
      var uid = String(item.uid || '').trim();
      var qty = parseInt(item.qty, 10) || 0;
      if (!uid || qty <= 0) continue;
      if (seen[uid]) continue;
      seen[uid] = true;
      out.push({
        uid: uid,
        nama: String(item.nama || item.email || 'Karyawan').trim(),
        role: String(item.role || 'karyawan').trim(),
        qty: qty
      });
    }
    return out;
  }

  function validateOrderPayload(payload) {
    var namaPemesan = (payload.namaPemesan || '').trim();
    var namaProduk = (payload.namaProduk || '').trim();
    var namaExpedisi = (payload.namaExpedisi || '').trim();
    var namaAsalPesanan = (payload.namaAsalPesanan || '').trim();
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
      throw new Error('Pilih template sisi terlebih dahulu untuk pesanan ini.');
    }
    if (!jumlahProduk || jumlahProduk < 1) {
      throw new Error('Jumlah produk minimal 1 pcs.');
    }
    if (!namaExpedisi) {
      throw new Error('Expedisi wajib dipilih.');
    }

    var sisiGroupings = normalizeGroupingsForOrder(payload.sisiGroupings, namaSisi);

    return {
      namaPemesan: namaPemesan,
      asalPesananId: String(payload.asalPesananId || '').trim(),
      namaAsalPesanan: namaAsalPesanan,
      produkId: payload.produkId || '',
      namaProduk: namaProduk,
      kategoriId: String(payload.kategoriId || '').trim(),
      namaKategori: String(payload.namaKategori || '').trim(),
      templateSisiId: String(payload.templateSisiId || '').trim(),
      namaTemplateSisi: String(payload.namaTemplateSisi || '').trim(),
      namaSisi: namaSisi,
      sisiGroupings: sisiGroupings,
      jumlahProduk: jumlahProduk,
      fileDesigns: Array.isArray(payload.fileDesigns) ? payload.fileDesigns : [],
      expedisiId: payload.expedisiId || '',
      namaExpedisi: namaExpedisi,
      catatan: (payload.catatan || '').trim(),
      anggapSablonSelesai: Boolean(payload.anggapSablonSelesai)
    };
  }

  global.ZcpPesananService = {
    formatDate: formatDate,
    formatDateString: formatDateString,
    formatFileSize: formatFileSize,
    getDaysUntilDeadline: getDaysUntilDeadline,
    getDeadlineStatus: getDeadlineStatus,
    normalizeKontribusiList: normalizeKontribusiList,

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
              var kontribusi = normalizeKontribusiList(data.kontribusi);
              var kontribusiUids = kontribusi.map(function (k) {
                return k.uid;
              });
              var kontribusiTotal = kontribusi.reduce(function (sum, k) {
                return sum + (Number(k.qty) || 0);
              }, 0);
              var namaSisi = Array.isArray(data.namaSisi) ? data.namaSisi : [];
              var obj = {
                id: doc.id,
                namaPemesan: data.namaPemesan || '',
                asalPesananId: data.asalPesananId || '',
                namaAsalPesanan: data.namaAsalPesanan || '',
                produkId: data.produkId || '',
                namaProduk: data.namaProduk || '',
                kategoriId: data.kategoriId || '',
                namaKategori: data.namaKategori || '',
                templateSisiId: data.templateSisiId || '',
                namaTemplateSisi: data.namaTemplateSisi || '',
                namaSisi: namaSisi,
                sisiGroupings: normalizeGroupingsForOrder(data.sisiGroupings, namaSisi),
                jumlahProduk: Number(data.jumlahProduk) || 0,
                sisiProgress:
                  data.sisiProgress && typeof data.sisiProgress === 'object'
                    ? data.sisiProgress
                    : {},
                fileDesigns: Array.isArray(data.fileDesigns) ? data.fileDesigns : [],
                expedisiId: data.expedisiId || '',
                namaExpedisi: data.namaExpedisi || '',
                catatan: data.catatan || '',
                anggapSablonSelesai: Boolean(data.anggapSablonSelesai),
                tanggalMulai: data.tanggalMulai || '',
                tanggalDeadline: data.tanggalDeadline || '',
                statusSelesai: Boolean(data.statusSelesai),
                completedAt: data.completedAt || null,
                completedByUid: data.completedByUid || '',
                completedByName: data.completedByName || '',
                kontribusi: kontribusi,
                kontribusiUids: Array.isArray(data.kontribusiUids)
                  ? data.kontribusiUids
                  : kontribusiUids,
                kontribusiTotal:
                  typeof data.kontribusiTotal === 'number' ? data.kontribusiTotal : kontribusiTotal,
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
        asalPesananId: clean.asalPesananId,
        namaAsalPesanan: clean.namaAsalPesanan,
        produkId: clean.produkId,
        namaProduk: clean.namaProduk,
        kategoriId: clean.kategoriId,
        namaKategori: clean.namaKategori,
        templateSisiId: clean.templateSisiId,
        namaTemplateSisi: clean.namaTemplateSisi,
        namaSisi: clean.namaSisi,
        sisiGroupings: clean.sisiGroupings,
        jumlahProduk: clean.jumlahProduk,
        sisiProgress: sisiProgress,
        fileDesigns: clean.fileDesigns,
        expedisiId: clean.expedisiId,
        namaExpedisi: clean.namaExpedisi,
        catatan: clean.catatan,
        anggapSablonSelesai: clean.anggapSablonSelesai,
        tanggalMulai: '',
        tanggalDeadline: '',
        statusSelesai: false,
        completedAt: null,
        completedByUid: '',
        completedByName: '',
        kontribusi: [],
        kontribusiUids: [],
        kontribusiTotal: 0,
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
            ' pcs) • Asal: ' +
            (clean.namaAsalPesanan || '-') +
            ' • Template: ' +
            (clean.namaTemplateSisi || clean.namaSisi.join(', '))
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
        asalPesananId: clean.asalPesananId,
        namaAsalPesanan: clean.namaAsalPesanan,
        produkId: clean.produkId,
        namaProduk: clean.namaProduk,
        kategoriId: clean.kategoriId,
        namaKategori: clean.namaKategori,
        templateSisiId: clean.templateSisiId,
        namaTemplateSisi: clean.namaTemplateSisi,
        namaSisi: clean.namaSisi,
        sisiGroupings: clean.sisiGroupings,
        jumlahProduk: clean.jumlahProduk,
        sisiProgress: sisiProgress,
        fileDesigns: clean.fileDesigns,
        expedisiId: clean.expedisiId,
        namaExpedisi: clean.namaExpedisi,
        catatan: clean.catatan,
        anggapSablonSelesai: clean.anggapSablonSelesai,
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
            ' pcs) • Asal: ' +
            (clean.namaAsalPesanan || '-') +
            ' • Expedisi: ' +
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

    updateKontribusi: async function (id, rawEntries, orderMeta) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID pesanan tidak valid.');
      }
      var maxQty = Number(orderMeta && orderMeta.jumlahProduk) || 0;
      if (maxQty < 1) {
        throw new Error('Jumlah produk pesanan tidak valid.');
      }
      if (orderMeta && orderMeta.statusSelesai) {
        throw new Error(
          'Kontribusi pesanan yang sudah selesai hanya dapat diubah melalui Pengajuan Perubahan di menu Borongan.'
        );
      }

      var entries = normalizeKontribusiList(rawEntries);
      var total = entries.reduce(function (sum, e) {
        return sum + (Number(e.qty) || 0);
      }, 0);

      if (total > maxQty) {
        throw new Error(
          'Total kontribusi karyawan (' +
            total +
            ' pcs) melebihi jumlah pesanan (' +
            maxQty +
            ' pcs).'
        );
      }

      var uids = entries.map(function (e) {
        return e.uid;
      });

      await db.collection(PESANAN_COLLECTION).doc(id).update({
        kontribusi: entries,
        kontribusiUids: uids,
        kontribusiTotal: total,
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        var label =
          orderMeta && orderMeta.namaPemesan
            ? orderMeta.namaPemesan + (orderMeta.namaProduk ? ' (' + orderMeta.namaProduk + ')' : '')
            : id;
        var summary = entries.length
          ? entries
              .map(function (e) {
                return e.nama + ': ' + e.qty;
              })
              .join(', ')
          : 'Kosong';
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Operasional',
          targetName: label,
          details: 'Atur kontribusi (' + total + '/' + maxQty + ' pcs): ' + summary
        });
      }

      return { kontribusi: entries, kontribusiUids: uids, kontribusiTotal: total };
    },

    toggleStatusSelesai: async function (id, statusSelesai, orderMeta) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID pesanan tidak valid.');
      }
      var done = Boolean(statusSelesai);
      var actor =
        (global.ZcpActivityLogService && global.ZcpActivityLogService.getCurrentActor()) || {};

      if (done) {
        var targetQty = Number(orderMeta && orderMeta.jumlahProduk) || 0;
        var totalKontribusi = Number(orderMeta && orderMeta.kontribusiTotal) || 0;
        if (totalKontribusi !== targetQty) {
          throw new Error(
            'Pesanan belum dapat ditandai selesai. Total kontribusi karyawan harus sama dengan jumlah pesanan (' +
              totalKontribusi +
              '/' +
              targetQty +
              ' pcs).'
          );
        }
      } else {
        if (actor.role !== 'superadmin') {
          throw new Error(
            'Hanya Superadmin yang dapat membatalkan pesanan yang sudah ditandai selesai.'
          );
        }
      }

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
          details: done ? 'Menandai pesanan selesai' : 'Membatalkan status selesai pesanan (Superadmin)'
        });
      }
    },

    toggleAnggapSablonSelesai: async function (id, isDone, orderMeta) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID pesanan tidak valid.');
      }
      var nextVal = Boolean(isDone);
      await db.collection(PESANAN_COLLECTION).doc(id).update({
        anggapSablonSelesai: nextVal,
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        var label =
          orderMeta && orderMeta.namaPemesan
            ? orderMeta.namaPemesan + (orderMeta.namaProduk ? ' (' + orderMeta.namaProduk + ')' : '')
            : id;
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Pesanan',
          targetName: label,
          details: nextVal
            ? 'Mengaktifkan status Anggap Semua Sablon Selesai (ON)'
            : 'Menonaktifkan status Anggap Semua Sablon Selesai (OFF)'
        });
      }
    }
  };
})(window);
