/**
 * Service Firestore untuk Master Data Produk (Template Sisi & Grouping), Expedisi, dan Asal Pesanan
 */
(function (global) {
  'use strict';

  var PRODUK_COLLECTION = 'master_produk';
  var EXPEDISI_COLLECTION = 'master_expedisi';
  var ASAL_PESANAN_COLLECTION = 'master_asal_pesanan';

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

  function normalizeGroupings(rawGroupings, validSides) {
    if (!Array.isArray(rawGroupings)) return [];
    var validSet = {};
    (validSides || []).forEach(function (s) {
      validSet[String(s).toLowerCase()] = String(s);
    });

    var result = [];
    for (var i = 0; i < rawGroupings.length; i++) {
      var g = rawGroupings[i] || {};
      var namaGrouping = String(g.namaGrouping || '').trim();
      var rawSelected = Array.isArray(g.sisi) ? g.sisi : [];
      var seenSisi = {};
      var cleanedSisi = [];
      for (var j = 0; j < rawSelected.length; j++) {
        var key = String(rawSelected[j] || '').trim().toLowerCase();
        var canonical = validSet[key];
        if (canonical && !seenSisi[key]) {
          seenSisi[key] = true;
          cleanedSisi.push(canonical);
        }
      }
      if (!namaGrouping || !cleanedSisi.length) continue;
      result.push({
        id: String(g.id || '').trim() || 'grp_' + (i + 1),
        namaGrouping: namaGrouping,
        sisi: cleanedSisi
      });
    }
    return result;
  }

  function normalizeTemplateSisiList(rawTemplates, legacyNamaSisi) {
    var list = Array.isArray(rawTemplates) ? rawTemplates : [];
    var result = [];
    for (var i = 0; i < list.length; i++) {
      var tpl = list[i] || {};
      var namaTemplate = String(tpl.namaTemplate || '').trim();
      var sisiList = normalizeSisiList(tpl.sisiList);
      if (!namaTemplate || !sisiList.length) continue;
      result.push({
        id: String(tpl.id || '').trim() || 'tpl_' + (i + 1),
        namaTemplate: namaTemplate,
        sisiList: sisiList,
        groupings: normalizeGroupings(tpl.groupings, sisiList)
      });
    }

    if (!result.length) {
      var fallbackSides = normalizeSisiList(legacyNamaSisi);
      if (fallbackSides.length) {
        result.push({
          id: 'tpl_legacy',
          namaTemplate: 'Default',
          sisiList: fallbackSides,
          groupings: []
        });
      }
    }
    return result;
  }

  function flattenTemplateSides(templateSisi) {
    var combined = [];
    (templateSisi || []).forEach(function (tpl) {
      if (tpl && Array.isArray(tpl.sisiList)) {
        combined = combined.concat(tpl.sisiList);
      }
    });
    return normalizeSisiList(combined);
  }

  function mapProdukDoc(doc) {
    var data = doc.data() || {};
    var legacySides = Array.isArray(data.namaSisi) ? data.namaSisi : [];
    var templateSisi = normalizeTemplateSisiList(data.templateSisi, legacySides);
    var namaSisi = flattenTemplateSides(templateSisi);
    return {
      id: doc.id,
      namaProduk: data.namaProduk || '',
      templateSisi: templateSisi,
      namaSisi: namaSisi.length ? namaSisi : normalizeSisiList(legacySides),
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null
    };
  }

  function validateProdukPayload(payload) {
    var namaProduk = (payload.namaProduk || '').trim();
    if (!namaProduk) {
      throw new Error('Nama produk wajib diisi.');
    }

    var rawTemplates = Array.isArray(payload.templateSisi) ? payload.templateSisi : [];
    var seenTemplates = {};
    var cleanTemplates = [];

    for (var i = 0; i < rawTemplates.length; i++) {
      var tpl = rawTemplates[i] || {};
      var namaTemplate = String(tpl.namaTemplate || '').trim();
      if (!namaTemplate) {
        throw new Error('Nama template sisi ke-' + (i + 1) + ' wajib diisi.');
      }
      var tplLower = namaTemplate.toLowerCase();
      if (seenTemplates[tplLower]) {
        throw new Error('Nama template sisi "' + namaTemplate + '" tidak boleh duplikat.');
      }
      seenTemplates[tplLower] = true;

      var sisiList = normalizeSisiList(tpl.sisiList);
      if (!sisiList.length) {
        throw new Error('Template sisi "' + namaTemplate + '" wajib memiliki minimal 1 sisi.');
      }

      var rawGroupings = Array.isArray(tpl.groupings) ? tpl.groupings : [];
      var validSet = {};
      sisiList.forEach(function (s) {
        validSet[s.toLowerCase()] = s;
      });
      var cleanGroupings = [];
      for (var g = 0; g < rawGroupings.length; g++) {
        var grp = rawGroupings[g] || {};
        var gName = String(grp.namaGrouping || '').trim();
        var gSisi = Array.isArray(grp.sisi)
          ? grp.sisi
              .map(function (s) {
                return validSet[String(s || '').trim().toLowerCase()] || '';
              })
              .filter(Boolean)
          : [];
        if (!gName) {
          throw new Error(
            'Nama grouping ke-' + (g + 1) + ' pada template "' + namaTemplate + '" wajib diisi.'
          );
        }
        if (!gSisi.length) {
          throw new Error(
            'Pilih minimal 1 sisi untuk grouping "' + gName + '" pada template "' + namaTemplate + '".'
          );
        }
        cleanGroupings.push({
          id: String(grp.id || '').trim() || 'grp_' + Date.now() + '_' + g,
          namaGrouping: gName,
          sisi: normalizeSisiList(gSisi)
        });
      }

      cleanTemplates.push({
        id: String(tpl.id || '').trim() || 'tpl_' + Date.now() + '_' + i,
        namaTemplate: namaTemplate,
        sisiList: sisiList,
        groupings: cleanGroupings
      });
    }

    // Fallback bila pemanggil lama (mis. AI) hanya mengirim namaSisi
    if (!cleanTemplates.length) {
      var legacySides = normalizeSisiList(payload.namaSisi);
      if (!legacySides.length) {
        throw new Error('Minimal harus ada 1 template sisi beserta sisinya.');
      }
      cleanTemplates.push({
        id: 'tpl_' + Date.now(),
        namaTemplate: 'Default',
        sisiList: legacySides,
        groupings: []
      });
    }

    var namaSisi = flattenTemplateSides(cleanTemplates);
    return {
      namaProduk: namaProduk,
      templateSisi: cleanTemplates,
      namaSisi: namaSisi
    };
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
    normalizeTemplateSisiList: normalizeTemplateSisiList,
    flattenTemplateSides: flattenTemplateSides,

    fetchProduk: async function () {
      var db = getDbOrThrow();
      var snapshot = await db.collection(PRODUK_COLLECTION).orderBy('createdAt', 'desc').get();
      return snapshot.docs.map(mapProdukDoc);
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

    fetchAsalPesanan: async function () {
      var db = getDbOrThrow();
      var snapshot = await db.collection(ASAL_PESANAN_COLLECTION).orderBy('createdAt', 'desc').get();
      return snapshot.docs.map(function (doc) {
        var data = doc.data() || {};
        return {
          id: doc.id,
          namaAsal: data.namaAsal || '',
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
            onData(snapshot.docs.map(mapProdukDoc));
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
      var clean = validateProdukPayload(payload);

      var res = await db.collection(PRODUK_COLLECTION).add({
        namaProduk: clean.namaProduk,
        templateSisi: clean.templateSisi,
        namaSisi: clean.namaSisi,
        createdAt: global.ZcpFirebase.serverTimestamp(),
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'CREATE',
          module: 'Master Produk',
          targetName: clean.namaProduk,
          details:
            clean.templateSisi.length +
            ' template sisi (' +
            clean.templateSisi
              .map(function (t) {
                return t.namaTemplate;
              })
              .join(', ') +
            ')'
        });
      }
      return res;
    },

    updateProduk: async function (id, payload) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID produk tidak valid.');
      }
      var clean = validateProdukPayload(payload);

      await db.collection(PRODUK_COLLECTION).doc(id).update({
        namaProduk: clean.namaProduk,
        templateSisi: clean.templateSisi,
        namaSisi: clean.namaSisi,
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Master Produk',
          targetName: clean.namaProduk,
          details:
            clean.templateSisi.length +
            ' template sisi (' +
            clean.templateSisi
              .map(function (t) {
                return t.namaTemplate;
              })
              .join(', ') +
            ')'
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
    },

    addAsalPesanan: async function (payload) {
      var db = getDbOrThrow();
      var namaAsal = (payload.namaAsal || '').trim();
      if (!namaAsal) {
        throw new Error('Nama asal pesanan wajib diisi.');
      }

      var res = await db.collection(ASAL_PESANAN_COLLECTION).add({
        namaAsal: namaAsal,
        createdAt: global.ZcpFirebase.serverTimestamp(),
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'CREATE',
          module: 'Master Asal Pesanan',
          targetName: namaAsal,
          details: 'Menambahkan asal pesanan baru'
        });
      }
      return res;
    },

    updateAsalPesanan: async function (id, payload) {
      var db = getDbOrThrow();
      var namaAsal = (payload.namaAsal || '').trim();
      if (!id) {
        throw new Error('ID asal pesanan tidak valid.');
      }
      if (!namaAsal) {
        throw new Error('Nama asal pesanan wajib diisi.');
      }

      await db.collection(ASAL_PESANAN_COLLECTION).doc(id).update({
        namaAsal: namaAsal,
        updatedAt: global.ZcpFirebase.serverTimestamp()
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Master Asal Pesanan',
          targetName: namaAsal,
          details: 'Memperbarui nama asal pesanan'
        });
      }
    },

    deleteAsalPesanan: async function (id, targetName) {
      var db = getDbOrThrow();
      if (!id) {
        throw new Error('ID asal pesanan tidak valid.');
      }
      await db.collection(ASAL_PESANAN_COLLECTION).doc(id).delete();

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'DELETE',
          module: 'Master Asal Pesanan',
          targetName: targetName || id,
          details: 'Menghapus master asal pesanan'
        });
      }
    }
  };
})(window);
