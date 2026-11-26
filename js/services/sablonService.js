/**
 * Service Firestore untuk Manajemen Sablon & Sinkronisasi Progres Operasional
 */
(function (global) {
  'use strict';

  var SABLON_COLLECTION = 'sablon';
  var PESANAN_COLLECTION = 'pesanan';
  var latestSablonList = [];
  var sablonListHydrated = false;

  function getDbOrThrow() {
    var db = global.ZcpFirebase && global.ZcpFirebase.getDb();
    if (!db) {
      throw new Error('Firebase belum dikonfigurasi. Lengkapi js/firebase-config.js terlebih dahulu.');
    }
    return db;
  }

  function extractPesananIds(pesananItems) {
    var seen = {};
    var ids = [];
    if (!Array.isArray(pesananItems)) return ids;
    for (var i = 0; i < pesananItems.length; i++) {
      var pid = pesananItems[i] && pesananItems[i].pesananId ? String(pesananItems[i].pesananId).trim() : '';
      if (pid && !seen[pid]) {
        seen[pid] = true;
        ids.push(pid);
      }
    }
    return ids;
  }

  function unionIds(listA, listB) {
    var seen = {};
    var result = [];
    [listA || [], listB || []].forEach(function (arr) {
      for (var i = 0; i < arr.length; i++) {
        var id = arr[i];
        if (id && !seen[id]) {
          seen[id] = true;
          result.push(id);
        }
      }
    });
    return result;
  }

  function normalizeChecks(rawChecks, count) {
    var arr = [];
    for (var i = 0; i < count; i++) {
      arr.push(Boolean(Array.isArray(rawChecks) && rawChecks[i]));
    }
    return arr;
  }

  function normalizeCheckMeta(rawMeta, checks) {
    var arr = [];
    for (var i = 0; i < checks.length; i++) {
      var item = Array.isArray(rawMeta) ? rawMeta[i] : null;
      if (checks[i] && item && typeof item === 'object') {
        arr.push({
          uid: String(item.uid || ''),
          nama: String(item.nama || ''),
          checkedAt: String(item.checkedAt || '')
        });
      } else {
        arr.push(null);
      }
    }
    return arr;
  }

  function countChecked(data) {
    if (!data) return 0;
    var count = Math.max(1, parseInt(data.jumlahPerulangan, 10) || 1);
    if (Array.isArray(data.perulanganChecks)) {
      var checks = normalizeChecks(data.perulanganChecks, count);
      return checks.filter(Boolean).length;
    }
    return data.statusSelesai ? count : 0;
  }

  function roundQty(num) {
    var n = Number(num) || 0;
    return Math.round(n * 100) / 100;
  }

  function buildOrderSablonSlots(order) {
    var orderSides = Array.isArray(order && order.namaSisi) ? order.namaSisi : [];
    var seen = {};
    var slots = [];

    orderSides.forEach(function (side) {
      var clean = String(side || '').trim();
      var lower = clean.toLowerCase();
      if (!clean || seen[lower]) return;
      seen[lower] = true;
      slots.push({
        key: clean,
        label: clean,
        isGroup: false,
        namaGrouping: '',
        sides: [clean]
      });
    });

    return slots;
  }

  function expandItemToSideTotals(item, multiplier) {
    var result = {};
    if (!item || typeof item !== 'object') return result;
    var mult = Number(multiplier);
    if (!isFinite(mult) || mult <= 0) return result;

    var sq =
      item.sisiQuantities && typeof item.sisiQuantities === 'object' ? item.sisiQuantities : {};
    var slotMap = item.sisiSlotMap && typeof item.sisiSlotMap === 'object' ? item.sisiSlotMap : {};

    Object.keys(sq).forEach(function (slotKey) {
      var rawQty = Number(sq[slotKey]) || 0;
      if (rawQty <= 0) return;

      var memberSides =
        Array.isArray(slotMap[slotKey]) && slotMap[slotKey].length ? slotMap[slotKey] : [slotKey];
      var totalForSlot = rawQty * mult;
      var perSide = totalForSlot / memberSides.length;

      memberSides.forEach(function (sideName) {
        var cleanSide = String(sideName || '').trim();
        if (!cleanSide) return;
        result[cleanSide] = roundQty((result[cleanSide] || 0) + perSide);
      });
    });

    return result;
  }

  function validateAndNormalizePayload(payload) {
    var namaSablon = (payload.namaSablon || '').trim();
    if (!namaSablon) {
      throw new Error('Nama sablon wajib diisi.');
    }

    var jumlahPerulangan = parseInt(payload.jumlahPerulangan, 10);
    if (!jumlahPerulangan || jumlahPerulangan < 1 || jumlahPerulangan > 20) {
      throw new Error('Jumlah perulangan harus antara 1 sampai 20.');
    }

    var rawItems = Array.isArray(payload.pesananItems) ? payload.pesananItems : [];
    if (!rawItems.length) {
      throw new Error('Pilih minimal 1 pesanan yang terhubung dengan sablon ini.');
    }

    var seenPesanan = {};
    var cleanItems = [];

    for (var i = 0; i < rawItems.length; i++) {
      var item = rawItems[i] || {};
      var pid = String(item.pesananId || '').trim();
      if (!pid) {
        throw new Error('Setiap baris pesanan yang ditambahkan wajib dipilih pesanannya.');
      }
      if (seenPesanan[pid]) {
        throw new Error('Pesanan "' + (item.namaPemesan || pid) + '" dipilih lebih dari sekali.');
      }
      seenPesanan[pid] = true;

      var rawQty = item.sisiQuantities && typeof item.sisiQuantities === 'object' ? item.sisiQuantities : {};
      var cleanQty = {};
      var totalItemQty = 0;

      Object.keys(rawQty).forEach(function (sisi) {
        var val = parseInt(rawQty[sisi], 10);
        if (!isNaN(val) && val > 0) {
          cleanQty[sisi] = val;
          totalItemQty += val;
        } else {
          cleanQty[sisi] = 0;
        }
      });

      if (totalItemQty <= 0) {
        throw new Error(
          'Masukkan minimal 1 jumlah sablon (> 0) pada sisi pesanan "' +
            (item.namaPemesan || 'terpilih') +
            '".'
        );
      }

      var rawSlotMap =
        item.sisiSlotMap && typeof item.sisiSlotMap === 'object' ? item.sisiSlotMap : {};
      var cleanSlotMap = {};
      Object.keys(cleanQty).forEach(function (slotKey) {
        if (Array.isArray(rawSlotMap[slotKey]) && rawSlotMap[slotKey].length) {
          cleanSlotMap[slotKey] = rawSlotMap[slotKey]
            .map(function (s) {
              return String(s || '').trim();
            })
            .filter(Boolean);
        }
      });

      cleanItems.push({
        pesananId: pid,
        namaPemesan: String(item.namaPemesan || '').trim(),
        namaProduk: String(item.namaProduk || '').trim(),
        jumlahProduk: Number(item.jumlahProduk) || 0,
        sisiQuantities: cleanQty,
        sisiSlotMap: cleanSlotMap
      });
    }

    return {
      namaSablon: namaSablon,
      pesananItems: cleanItems,
      jumlahPerulangan: jumlahPerulangan,
      fileSablon: Array.isArray(payload.fileSablon) ? payload.fileSablon : [],
      catatan: (payload.catatan || '').trim()
    };
  }

  /**
   * Menghitung ulang total progres per sisi langsung dari cache memori sablonList + pesanan
   * (0 server Read tambahan!) dan menyinkronkannya ke dokumen pesanan terkait secara atomik.
   */
  async function syncPesananProgress(affectedPesananIds, sablonOverride) {
    var db = getDbOrThrow();
    var ids = unionIds(affectedPesananIds, []);
    if (!ids.length) return;

    var workingList;
    if (sablonListHydrated) {
      workingList = latestSablonList.slice();
      if (sablonOverride && sablonOverride.mode === 'delete' && sablonOverride.id) {
        workingList = workingList.filter(function (s) {
          return s.id !== sablonOverride.id;
        });
      } else if (sablonOverride && sablonOverride.mode === 'upsert' && sablonOverride.doc) {
        var foundIdx = -1;
        for (var w = 0; w < workingList.length; w++) {
          if (workingList[w].id === sablonOverride.doc.id) {
            foundIdx = w;
            break;
          }
        }
        if (foundIdx !== -1) {
          workingList[foundIdx] = Object.assign({}, workingList[foundIdx], sablonOverride.doc);
        } else {
          workingList.push(sablonOverride.doc);
        }
      }
    } else {
      var allSablonSnap = await db.collection(SABLON_COLLECTION).get();
      workingList = allSablonSnap.docs.map(function (doc) {
        return Object.assign({ id: doc.id }, doc.data() || {});
      });
    }

    var totalsByOrder = {};
    workingList.forEach(function (data) {
      var checkedMult = countChecked(data);
      if (checkedMult <= 0) return;
      var items = Array.isArray(data.pesananItems) ? data.pesananItems : [];
      items.forEach(function (item) {
        var pid = item && item.pesananId;
        if (!pid) return;
        if (!totalsByOrder[pid]) {
          totalsByOrder[pid] = {};
        }
        var expanded = expandItemToSideTotals(item, checkedMult);
        Object.keys(expanded).forEach(function (sisi) {
          var q = Number(expanded[sisi]) || 0;
          if (q > 0) {
            totalsByOrder[pid][sisi] = roundQty((totalsByOrder[pid][sisi] || 0) + q);
          }
        });
      });
    });

    var batch = db.batch();
    var hasUpdates = false;
    var ts = global.ZcpFirebase.serverTimestamp();
    var uncachedIds = [];

    ids.forEach(function (pid) {
      var cached =
        global.ZcpPesananService && typeof global.ZcpPesananService.getCachedPesanan === 'function'
          ? global.ZcpPesananService.getCachedPesanan(pid)
          : null;
      if (cached) {
        var namaSisi = Array.isArray(cached.namaSisi) ? cached.namaSisi : [];
        var orderTotals = totalsByOrder[pid] || {};
        var newProgress = {};
        namaSisi.forEach(function (sisi) {
          newProgress[sisi] = orderTotals[sisi] || 0;
        });
        batch.update(db.collection(PESANAN_COLLECTION).doc(pid), {
          sisiProgress: newProgress,
          updatedAt: ts
        });
        hasUpdates = true;
      } else {
        uncachedIds.push(pid);
      }
    });

    if (uncachedIds.length) {
      var orderDocs = await Promise.all(
        uncachedIds.map(function (pid) {
          return db.collection(PESANAN_COLLECTION).doc(pid).get();
        })
      );
      orderDocs.forEach(function (doc) {
        if (!doc.exists) return;
        var orderData = doc.data() || {};
        var namaSisi = Array.isArray(orderData.namaSisi) ? orderData.namaSisi : [];
        var orderTotals = totalsByOrder[doc.id] || {};
        var newProgress = {};
        namaSisi.forEach(function (sisi) {
          newProgress[sisi] = orderTotals[sisi] || 0;
        });
        batch.update(doc.ref, {
          sisiProgress: newProgress,
          updatedAt: ts
        });
        hasUpdates = true;
      });
    }

    if (hasUpdates) {
      await batch.commit();
    }
  }

  global.ZcpSablonService = {
    roundQty: roundQty,
    buildOrderSablonSlots: buildOrderSablonSlots,
    expandItemToSideTotals: expandItemToSideTotals,
    extractPesananIds: extractPesananIds,
    syncPesananProgress: syncPesananProgress,

    subscribeSablon: function (onData, onError, limitCount) {
      var db = getDbOrThrow();
      var limit = Number(limitCount) > 0 ? Number(limitCount) : 150;
      return db
        .collection(SABLON_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .onSnapshot(
          function (snapshot) {
            var list = snapshot.docs.map(function (doc) {
              var data = doc.data() || {};
              var count = Math.max(1, parseInt(data.jumlahPerulangan, 10) || 1);
              var checks = normalizeChecks(data.perulanganChecks, count);
              return {
                id: doc.id,
                namaSablon: data.namaSablon || '',
                pesananItems: Array.isArray(data.pesananItems) ? data.pesananItems : [],
                jumlahPerulangan: count,
                perulanganChecks: checks,
                perulanganCheckMeta: normalizeCheckMeta(data.perulanganCheckMeta, checks),
                fileSablon: Array.isArray(data.fileSablon) ? data.fileSablon : [],
                catatan: data.catatan || '',
                statusSelesai: Boolean(data.statusSelesai),
                completedAt: data.completedAt || null,
                completedByUid: data.completedByUid || '',
                completedByName: data.completedByName || '',
                createdAt: data.createdAt || null,
                updatedAt: data.updatedAt || null
              };
            });
            latestSablonList = list;
            sablonListHydrated = true;
            onData(list, snapshot.docs.length >= limit);
          },
          function (error) {
            if (typeof onError === 'function') {
              onError(error);
            }
          }
        );
    },

    addSablon: async function (payload) {
      var db = getDbOrThrow();
      var clean = validateAndNormalizePayload(payload);
      var checks = normalizeChecks([], clean.jumlahPerulangan);
      var meta = normalizeCheckMeta([], checks);

      var res = await db.collection(SABLON_COLLECTION).add({
        namaSablon: clean.namaSablon,
        pesananItems: clean.pesananItems,
        jumlahPerulangan: clean.jumlahPerulangan,
        perulanganChecks: checks,
        perulanganCheckMeta: meta,
        fileSablon: clean.fileSablon,
        catatan: clean.catatan,
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
          module: 'Manajemen Sablon',
          targetName: clean.namaSablon,
          details:
            clean.pesananItems.length +
            ' pesanan • ' +
            clean.jumlahPerulangan +
            'x perulangan'
        });
      }
      return res;
    },

    updateSablon: async function (id, payload, existingSablon) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID sablon tidak valid.');
      }

      var clean = validateAndNormalizePayload(payload);
      var prevChecks = existingSablon && Array.isArray(existingSablon.perulanganChecks)
        ? existingSablon.perulanganChecks
        : [];
      var newChecks = normalizeChecks(prevChecks, clean.jumlahPerulangan);
      var newMeta = normalizeCheckMeta(
        existingSablon ? existingSablon.perulanganCheckMeta : [],
        newChecks
      );
      var newStatusSelesai = newChecks.every(Boolean);
      var wasSelesai = Boolean(existingSablon && existingSablon.statusSelesai);
      var actor =
        (global.ZcpActivityLogService && global.ZcpActivityLogService.getCurrentActor()) || {};

      var completedAtValue = null;
      var completedByUid = '';
      var completedByName = '';
      if (newStatusSelesai) {
        if (wasSelesai && existingSablon) {
          completedAtValue = existingSablon.completedAt || global.ZcpFirebase.serverTimestamp();
          completedByUid = existingSablon.completedByUid || actor.uid || '';
          completedByName = existingSablon.completedByName || actor.nama || actor.email || 'Admin';
        } else {
          completedAtValue = global.ZcpFirebase.serverTimestamp();
          completedByUid = actor.uid || '';
          completedByName = actor.nama || actor.email || 'Admin';
        }
      }

      await db.collection(SABLON_COLLECTION).doc(id).update({
        namaSablon: clean.namaSablon,
        pesananItems: clean.pesananItems,
        jumlahPerulangan: clean.jumlahPerulangan,
        perulanganChecks: newChecks,
        perulanganCheckMeta: newMeta,
        fileSablon: clean.fileSablon,
        catatan: clean.catatan,
        statusSelesai: newStatusSelesai,
        completedAt: completedAtValue,
        completedByUid: completedByUid,
        completedByName: completedByName,
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      var prevCheckedCount = countChecked(existingSablon);
      var newCheckedCount = countChecked({
        jumlahPerulangan: clean.jumlahPerulangan,
        perulanganChecks: newChecks
      });

      if (prevCheckedCount > 0 || newCheckedCount > 0) {
        var oldIds = extractPesananIds(existingSablon ? existingSablon.pesananItems : []);
        var newIds = extractPesananIds(clean.pesananItems);
        await syncPesananProgress(unionIds(oldIds, newIds), {
          mode: 'upsert',
          doc: {
            id: id,
            jumlahPerulangan: clean.jumlahPerulangan,
            perulanganChecks: newChecks,
            pesananItems: clean.pesananItems
          }
        });
      }

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Manajemen Sablon',
          targetName: clean.namaSablon,
          details:
            clean.pesananItems.length +
            ' pesanan • ' +
            clean.jumlahPerulangan +
            'x perulangan'
        });
      }
    },

    toggleChildCheck: async function (sablon, checkIndex) {
      var db = getDbOrThrow();
      if (!sablon || !sablon.id) {
        throw new Error('Data sablon tidak valid.');
      }

      var count = Math.max(1, parseInt(sablon.jumlahPerulangan, 10) || 1);
      var checks = normalizeChecks(sablon.perulanganChecks, count);
      var meta = normalizeCheckMeta(sablon.perulanganCheckMeta, checks);
      if (checkIndex < 0 || checkIndex >= checks.length) {
        throw new Error('Indeks checklist tidak valid.');
      }

      var actor =
        (global.ZcpActivityLogService && global.ZcpActivityLogService.getCurrentActor()) || {};
      var nextVal = !checks[checkIndex];
      checks[checkIndex] = nextVal;
      meta[checkIndex] = nextVal
        ? {
            uid: actor.uid || '',
            nama: actor.nama || actor.email || 'Admin',
            checkedAt: new Date().toISOString()
          }
        : null;

      var allChecked = checks.every(Boolean);

      await db.collection(SABLON_COLLECTION).doc(sablon.id).update({
        perulanganChecks: checks,
        perulanganCheckMeta: meta,
        statusSelesai: allChecked,
        completedAt: allChecked ? global.ZcpFirebase.serverTimestamp() : null,
        completedByUid: allChecked ? actor.uid || '' : '',
        completedByName: allChecked ? actor.nama || actor.email || 'Admin' : '',
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      await syncPesananProgress(extractPesananIds(sablon.pesananItems), {
        mode: 'upsert',
        doc: {
          id: sablon.id,
          jumlahPerulangan: count,
          perulanganChecks: checks,
          pesananItems: sablon.pesananItems
        }
      });

      if (global.ZcpActivityLogService && allChecked !== Boolean(sablon.statusSelesai)) {
        await global.ZcpActivityLogService.logActivity({
          action: allChecked ? 'COMPLETE' : 'UNDO_COMPLETE',
          module: 'Manajemen Sablon',
          targetName: sablon.namaSablon || sablon.id,
          details: allChecked
            ? 'Semua print (' + count + '/' + count + ') selesai dicetak'
            : 'Membatalkan status selesai sablon (print ke-' + (checkIndex + 1) + ')'
        });
      }

      return { statusSelesai: allChecked, checked: nextVal };
    },

    setSablonSelesai: async function (sablon, isDone) {
      var db = getDbOrThrow();
      if (!sablon || !sablon.id) {
        throw new Error('Data sablon tidak valid.');
      }

      var done = Boolean(isDone);
      var count = Math.max(1, parseInt(sablon.jumlahPerulangan, 10) || 1);
      var actor =
        (global.ZcpActivityLogService && global.ZcpActivityLogService.getCurrentActor()) || {};
      var checks = normalizeChecks(sablon.perulanganChecks, count);
      var meta = normalizeCheckMeta(sablon.perulanganCheckMeta, checks);

      if (done) {
        var nowIso = new Date().toISOString();
        for (var i = 0; i < count; i++) {
          checks[i] = true;
          if (!meta[i]) {
            meta[i] = {
              uid: actor.uid || '',
              nama: actor.nama || actor.email || 'Admin',
              checkedAt: nowIso
            };
          }
        }
      } else {
        if (actor.role === 'karyawan') {
          if (sablon.completedByUid && sablon.completedByUid !== actor.uid) {
            throw new Error(
              'Hanya ' +
                (sablon.completedByName || 'akun yang menyelesaikan') +
                ' atau Admin yang dapat membatalkan selesai.'
            );
          }
          var ownedCount = 0;
          for (var k = 0; k < count; k++) {
            if (meta[k] && meta[k].uid === actor.uid) {
              checks[k] = false;
              meta[k] = null;
              ownedCount += 1;
            }
          }
          if (ownedCount === 0) {
            for (var m = 0; m < count; m++) {
              checks[m] = false;
              meta[m] = null;
            }
          }
        } else {
          for (var j = 0; j < count; j++) {
            checks[j] = false;
            meta[j] = null;
          }
        }
      }

      var allChecked = checks.every(Boolean);

      await db.collection(SABLON_COLLECTION).doc(sablon.id).update({
        perulanganChecks: checks,
        perulanganCheckMeta: meta,
        statusSelesai: allChecked,
        completedAt: allChecked ? global.ZcpFirebase.serverTimestamp() : null,
        completedByUid: allChecked ? actor.uid || '' : '',
        completedByName: allChecked ? actor.nama || actor.email || 'Admin' : '',
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      await syncPesananProgress(extractPesananIds(sablon.pesananItems), {
        mode: 'upsert',
        doc: {
          id: sablon.id,
          jumlahPerulangan: count,
          perulanganChecks: checks,
          pesananItems: sablon.pesananItems
        }
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: done ? 'COMPLETE' : 'UNDO_COMPLETE',
          module: 'Manajemen Sablon',
          targetName: sablon.namaSablon || sablon.id,
          details: done ? 'Menandai sablon selesai di-print' : 'Membatalkan status selesai sablon'
        });
      }
    },

    deleteSablon: async function (sablon) {
      var db = getDbOrThrow();
      if (!sablon || !sablon.id) {
        throw new Error('ID sablon tidak valid.');
      }

      var hasChecked = countChecked(sablon) > 0;
      var affectedIds = extractPesananIds(sablon.pesananItems);

      await db.collection(SABLON_COLLECTION).doc(sablon.id).delete();

      if (hasChecked && affectedIds.length) {
        await syncPesananProgress(affectedIds, { mode: 'delete', id: sablon.id });
      }

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'DELETE',
          module: 'Manajemen Sablon',
          targetName: sablon.namaSablon || sablon.id,
          details: 'Menghapus data sablon'
        });
      }
    }
  };
})(window);
