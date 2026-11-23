/**
 * Service AI Chatbot Assistant (Gemini API) + Eksekusi CRUD / Bulk CRUD + Log Perubahan 20 Terakhir & Rollback
 */
(function (global) {
  'use strict';

  var AI_LOGS_COLLECTION = 'ai_change_logs';
  var MAX_AI_LOGS = 20;
  var MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
  var ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
  var ALLOWED_COLLECTIONS = ['pesanan', 'sablon', 'master_produk', 'master_expedisi'];

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

  function getTodayIso() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function inferMimeType(file) {
    if (!file) return '';
    var type = String(file.type || '').toLowerCase();
    if (ALLOWED_MIME_TYPES.indexOf(type) !== -1) {
      return type;
    }
    var name = String(file.name || '').toLowerCase();
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.pdf')) return 'application/pdf';
    return type;
  }

  function validateChatFile(file) {
    if (!file) {
      throw new Error('File tidak valid.');
    }
    var mimeType = inferMimeType(file);
    if (ALLOWED_MIME_TYPES.indexOf(mimeType) === -1) {
      throw new Error(
        'Format "' + file.name + '" tidak didukung. Gunakan PNG, JPG/JPEG, atau PDF.'
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error('Ukuran "' + file.name + '" melebihi batas maksimal 15 MB.');
    }
    return mimeType;
  }

  function readChatFile(file) {
    return new Promise(function (resolve, reject) {
      var mimeType;
      try {
        mimeType = validateChatFile(file);
      } catch (err) {
        reject(err);
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var commaIdx = result.indexOf(',');
        if (commaIdx === -1) {
          reject(new Error('Gagal membaca file "' + file.name + '".'));
          return;
        }
        resolve({
          id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          file: file,
          name: file.name || 'lampiran',
          mimeType: mimeType,
          size: Number(file.size) || 0,
          isImage: mimeType.indexOf('image/') === 0,
          previewDataUrl: mimeType.indexOf('image/') === 0 ? result : '',
          base64: result.slice(commaIdx + 1)
        });
      };
      reader.onerror = function () {
        reject(new Error('Gagal membaca file "' + file.name + '".'));
      };
      reader.readAsDataURL(file);
    });
  }

  function buildGeminiEndpoint(apiUrl, apiKey) {
    var defaultUrl =
      (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_GEMINI_URL) ||
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    var url = String(apiUrl || '').trim() || defaultUrl;
    var key = String(apiKey || '').trim();

    if (!key) {
      throw new Error(
        'API Key Gemini belum diisi. Minta Superadmin mengaturnya di menu Pengaturan.'
      );
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('URL API Gemini harus diawali http:// atau https://.');
    }

    var parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      throw new Error('Format URL API Gemini tidak valid.');
    }

    // Normalisasi endpoint resmi Google Gemini agar selalu memakai :generateContent (non-SSE JSON)
    if (parsed.hostname.indexOf('generativelanguage.googleapis.com') !== -1) {
      if (parsed.pathname.indexOf(':streamGenerateContent') !== -1) {
        parsed.pathname = parsed.pathname.replace(':streamGenerateContent', ':generateContent');
      } else if (
        parsed.pathname.indexOf('/models/') !== -1 &&
        parsed.pathname.indexOf(':generateContent') === -1
      ) {
        parsed.pathname = parsed.pathname.replace(/\/+$/, '') + ':generateContent';
      }
      if (parsed.searchParams.get('alt') === 'sse') {
        parsed.searchParams.delete('alt');
      }
    }

    // Sambungkan API Key dari Pengaturan secara langsung ke parameter ?key= / &key=
    // (mengganti key= kosong atau placeholder seperti YOUR_API_KEY)
    var existingKey = (parsed.searchParams.get('key') || '').trim();
    if (!existingKey || /^(YOUR_API_KEY|API_KEY|<API_KEY>)$/i.test(existingKey)) {
      parsed.searchParams.set('key', key);
    }

    return parsed.toString();
  }

  function sanitizeForLog(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (typeof value.toDate === 'function') {
      return { __zcpTsMs: value.toDate().getTime() };
    }
    if (value instanceof Date) {
      return { __zcpTsMs: value.getTime() };
    }
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return item === undefined ? null : sanitizeForLog(item);
      });
    }
    if (typeof value === 'object') {
      // Abaikan FieldValue (mis. serverTimestamp) karena Firestore melarang FieldValue di dalam array
      if (typeof value.isEqual === 'function' && !value.toDate) {
        return null;
      }
      var out = {};
      Object.keys(value).forEach(function (k) {
        if (value[k] !== undefined) {
          var v = sanitizeForLog(value[k]);
          if (v !== undefined) {
            out[k] = v;
          }
        }
      });
      return out;
    }
    return null;
  }

  function reviveFromLog(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) {
      return value.map(reviveFromLog);
    }
    if (typeof value === 'object') {
      if (
        Object.keys(value).length === 1 &&
        typeof value.__zcpTsMs === 'number' &&
        isFinite(value.__zcpTsMs)
      ) {
        if (
          global.firebase &&
          global.firebase.firestore &&
          global.firebase.firestore.Timestamp &&
          typeof global.firebase.firestore.Timestamp.fromMillis === 'function'
        ) {
          return global.firebase.firestore.Timestamp.fromMillis(value.__zcpTsMs);
        }
        return new Date(value.__zcpTsMs);
      }
      var out = {};
      Object.keys(value).forEach(function (k) {
        out[k] = reviveFromLog(value[k]);
      });
      return out;
    }
    return value;
  }

  function compactStoreSnapshot(storeContext) {
    var ctx = storeContext || {};
    var produk = (ctx.produkList || []).map(function (p) {
      return {
        id: p.id,
        namaProduk: p.namaProduk,
        namaSisi: Array.isArray(p.namaSisi) ? p.namaSisi : []
      };
    });
    var expedisi = (ctx.expedisiList || []).map(function (e) {
      return {
        id: e.id,
        namaExpedisi: e.namaExpedisi
      };
    });
    var pesanan = (ctx.pesananList || []).slice(0, 80).map(function (o) {
      return {
        id: o.id,
        namaPemesan: o.namaPemesan,
        produkId: o.produkId,
        namaProduk: o.namaProduk,
        namaSisi: Array.isArray(o.namaSisi) ? o.namaSisi : [],
        jumlahProduk: Number(o.jumlahProduk) || 0,
        sisiProgress: o.sisiProgress || {},
        namaExpedisi: o.namaExpedisi || '',
        expedisiId: o.expedisiId || '',
        tanggalMulai: o.tanggalMulai || '',
        tanggalDeadline: o.tanggalDeadline || '',
        catatan: o.catatan || '',
        statusSelesai: Boolean(o.statusSelesai)
      };
    });
    var sablon = (ctx.sablonList || []).slice(0, 60).map(function (s) {
      return {
        id: s.id,
        namaSablon: s.namaSablon,
        jumlahPerulangan: Number(s.jumlahPerulangan) || 1,
        perulanganChecks: Array.isArray(s.perulanganChecks) ? s.perulanganChecks : [],
        pesananItems: (s.pesananItems || []).map(function (it) {
          return {
            pesananId: it.pesananId,
            namaPemesan: it.namaPemesan,
            namaProduk: it.namaProduk,
            sisiQuantities: it.sisiQuantities || {}
          };
        }),
        catatan: s.catatan || '',
        statusSelesai: Boolean(s.statusSelesai)
      };
    });

    return {
      tanggalHariIni: getTodayIso(),
      master_produk: produk,
      master_expedisi: expedisi,
      pesanan: pesanan,
      sablon: sablon
    };
  }

  function buildSystemInstruction(storeContext) {
    var snapshot = compactStoreSnapshot(storeContext);
    return (
      'Kamu adalah ZCP AI Assistant, asisten operasional cerdas untuk aplikasi konveksi & sablon ZCP STORE.\n' +
      'Tugasmu membantu admin melakukan tanya-jawab data, pembacaan dokumen/gambar (PNG, JPG, PDF seperti nota/PO/spreadsheet/desain), serta CRUD dan BULK CRUD ke koleksi Firestore.\n\n' +
      'WAJIB balas HANYA dalam format JSON valid (tanpa teks tambahan di luar JSON) dengan struktur persis:\n' +
      '{\n' +
      '  "reply": "Penjelasan singkat, jelas, ramah dalam Bahasa Indonesia tentang hasil analisis atau daftar aksi yang disiapkan.",\n' +
      '  "operations": [\n' +
      '    {\n' +
      '      "type": "CREATE" | "UPDATE" | "DELETE",\n' +
      '      "collection": "pesanan" | "sablon" | "master_produk" | "master_expedisi",\n' +
      '      "docId": "wajib diisi persis id dari konteks saat UPDATE atau DELETE; kosongkan saat CREATE",\n' +
      '      "label": "Label ringkas item (misal: Pesanan Rompi - Pelanggan Umum 13 pcs)",\n' +
      '      "reason": "Alasan singkat perubahan",\n' +
      '      "data": { ...field yang dibuat atau diubah... }\n' +
      '    }\n' +
      '  ]\n' +
      '}\n\n' +
      'ATURAN KOLEKSI & DEFAULT CERDAS:\n' +
      '1. `pesanan`: field valid = { namaPemesan, produkId, namaProduk, namaSisi (array string), jumlahProduk (integer >=1), expedisiId, namaExpedisi, catatan, tanggalMulai (YYYY-MM-DD), tanggalDeadline (YYYY-MM-DD), statusSelesai (boolean) }.\n' +
      '   - Jika user memberi perintah singkat mis. "buatkan pesanan Rompi 13 pcs" tanpa menyebut nama pemesan, isi namaPemesan = "Pelanggan Umum" dan langsung usulkan operasi CREATE (jangan bertanya balik jika produk & jumlah sudah jelas).\n' +
      '   - Cocokkan namaProduk dengan `master_produk` di konteks (abaikan huruf besar/kecil). Jika cocok, salin `produkId`, `namaProduk`, dan `namaSisi` dari master. Jika produk belum ada di master, set `produkId: ""`, isi `namaProduk`, dan default `namaSisi: ["Depan", "Belakang"]`.\n' +
      '2. `sablon`: field valid = { namaSablon, jumlahPerulangan (integer >=1), perulanganChecks (array boolean), catatan, statusSelesai (boolean), pesananItems: [{ pesananId, namaPemesan, namaProduk, jumlahProduk, sisiQuantities: { [namaSisi]: integer } }] }.\n' +
      '3. `master_produk`: field valid = { namaProduk, namaSisi (array string minimal 1 item) }.\n' +
      '4. `master_expedisi`: field valid = { namaExpedisi }.\n' +
      '5. Untuk `UPDATE` dan `DELETE`: DILARANG mengarang `docId`. Gunakan `id` persis dari data konteks di bawah. Jika record yang dimaksud user ambigu atau tidak ditemukan, set `"operations": []` dan jelaskan di `"reply"`.\n' +
      '6. Jika user hanya bertanya / meminta ringkasan / membaca isi file tanpa perintah mengubah data, set `"operations": []`.\n' +
      '7. Untuk BULK CRUD (mis. mengimpor daftar pesanan dari PDF/foto, membuat banyak pesanan, menandai selesai banyak pesanan, atau menghapus banyak item sekaligus), masukkan seluruh operasinya ke array `"operations"` agar user dapat mengonfirmasi semuanya dalam satu modal.\n\n' +
      'KONTEKS DATA SAAT INI (JSON):\n' +
      JSON.stringify(snapshot)
    );
  }

  function extractJsonFromText(rawText) {
    var text = String(rawText || '').trim();
    if (!text) {
      throw new Error('AI mengembalikan respons kosong.');
    }

    // Hilangkan markdown code fence bila model tetap menyertakannya
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      return JSON.parse(text);
    } catch (e) {
      var firstBrace = text.indexOf('{');
      var lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(text.slice(firstBrace, lastBrace + 1));
        } catch (e2) {
          // Fallback: kembalikan sebagai chat teks biasa
        }
      }
      return {
        reply: rawText,
        operations: []
      };
    }
  }

  function normalizeText(str) {
    return String(str || '').trim().toLowerCase();
  }

  function findMatchingProduk(data, produkList) {
    var list = produkList || [];
    if (!list.length) return null;
    if (data.produkId) {
      var byId = list.find(function (p) {
        return p.id === data.produkId;
      });
      if (byId) return byId;
    }
    var targetName = normalizeText(data.namaProduk);
    if (!targetName) return null;
    var exact = list.find(function (p) {
      return normalizeText(p.namaProduk) === targetName;
    });
    if (exact) return exact;
    return (
      list.find(function (p) {
        var pn = normalizeText(p.namaProduk);
        return pn.indexOf(targetName) !== -1 || targetName.indexOf(pn) !== -1;
      }) || null
    );
  }

  function findMatchingExpedisi(data, expedisiList) {
    var list = expedisiList || [];
    if (!list.length) return null;
    if (data.expedisiId) {
      var byId = list.find(function (e) {
        return e.id === data.expedisiId;
      });
      if (byId) return byId;
    }
    var targetName = normalizeText(data.namaExpedisi);
    if (!targetName) return null;
    var exact = list.find(function (e) {
      return normalizeText(e.namaExpedisi) === targetName;
    });
    if (exact) return exact;
    return (
      list.find(function (e) {
        var en = normalizeText(e.namaExpedisi);
        return en.indexOf(targetName) !== -1 || targetName.indexOf(en) !== -1;
      }) || null
    );
  }

  function findExistingDoc(collection, docId, storeContext) {
    var ctx = storeContext || {};
    var map = {
      pesanan: ctx.pesananList || [],
      sablon: ctx.sablonList || [],
      master_produk: ctx.produkList || [],
      master_expedisi: ctx.expedisiList || []
    };
    var list = map[collection] || [];
    return (
      list.find(function (item) {
        return item.id === docId;
      }) || null
    );
  }

  function formatDisplayValue(val) {
    if (val === null || val === undefined || val === '') return '(kosong)';
    if (typeof val === 'boolean') return val ? 'Ya / Selesai' : 'Tidak / Proses';
    if (Array.isArray(val)) {
      if (!val.length) return '[]';
      if (typeof val[0] === 'string' || typeof val[0] === 'boolean' || typeof val[0] === 'number') {
        return val.join(', ');
      }
      return val.length + ' item';
    }
    if (typeof val === 'object') {
      return Object.keys(val)
        .map(function (k) {
          return k + ': ' + val[k];
        })
        .join(', ');
    }
    return String(val);
  }

  function buildPesananPayload(type, rawData, existingDoc, storeContext) {
    var data = rawData && typeof rawData === 'object' ? rawData : {};
    var matchedProduk = findMatchingProduk(data, storeContext.produkList);
    var matchedExp = findMatchingExpedisi(data, storeContext.expedisiList);

    if (type === 'CREATE') {
      var namaPemesan = String(data.namaPemesan || '').trim() || 'Pelanggan Umum';
      var namaProduk = matchedProduk
        ? matchedProduk.namaProduk
        : String(data.namaProduk || '').trim() || 'Produk Custom';
      var rawSisi = Array.isArray(data.namaSisi)
        ? data.namaSisi
            .map(function (s) {
              return String(s || '').trim();
            })
            .filter(Boolean)
        : [];
      var namaSisi = rawSisi.length
        ? rawSisi
        : matchedProduk && Array.isArray(matchedProduk.namaSisi) && matchedProduk.namaSisi.length
        ? matchedProduk.namaSisi.slice()
        : ['Depan', 'Belakang'];
      var qty = Math.max(1, parseInt(data.jumlahProduk, 10) || 1);
      var sisiProgress = {};
      namaSisi.forEach(function (s) {
        sisiProgress[s] = 0;
      });
      var done = Boolean(data.statusSelesai);
      var actor = getActor();

      return {
        namaPemesan: namaPemesan,
        produkId: matchedProduk ? matchedProduk.id : '',
        namaProduk: namaProduk,
        namaSisi: namaSisi,
        jumlahProduk: qty,
        sisiProgress: sisiProgress,
        fileDesigns: [],
        expedisiId: matchedExp ? matchedExp.id : '',
        namaExpedisi: matchedExp ? matchedExp.namaExpedisi : String(data.namaExpedisi || '').trim(),
        catatan: String(data.catatan || '').trim(),
        tanggalMulai: String(data.tanggalMulai || '').trim(),
        tanggalDeadline: String(data.tanggalDeadline || '').trim(),
        statusSelesai: done,
        completedAt: done ? { __zcpTsMs: Date.now() } : null,
        completedByUid: done ? actor.uid || '' : '',
        completedByName: done ? actor.nama || actor.email || 'Admin (AI)' : ''
      };
    }

    // UPDATE: hanya sertakan field yang diubah dari existingDoc
    var patch = {};
    if (data.namaPemesan !== undefined) {
      var np = String(data.namaPemesan || '').trim();
      if (np) patch.namaPemesan = np;
    }
    if (data.produkId !== undefined || data.namaProduk !== undefined) {
      if (matchedProduk) {
        patch.produkId = matchedProduk.id;
        patch.namaProduk = matchedProduk.namaProduk;
        if (!Array.isArray(data.namaSisi)) {
          patch.namaSisi = matchedProduk.namaSisi.slice();
        }
      } else if (data.namaProduk !== undefined) {
        patch.namaProduk = String(data.namaProduk || '').trim();
      }
    }
    if (Array.isArray(data.namaSisi)) {
      var cleanSisi = data.namaSisi
        .map(function (s) {
          return String(s || '').trim();
        })
        .filter(Boolean);
      if (cleanSisi.length) {
        patch.namaSisi = cleanSisi;
      }
    }
    if (patch.namaSisi) {
      var prevProgress = (existingDoc && existingDoc.sisiProgress) || {};
      var nextProgress = {};
      patch.namaSisi.forEach(function (s) {
        nextProgress[s] = Number(prevProgress[s]) || 0;
      });
      patch.sisiProgress = nextProgress;
    }
    if (data.jumlahProduk !== undefined) {
      var q = parseInt(data.jumlahProduk, 10);
      if (q > 0) patch.jumlahProduk = q;
    }
    if (data.expedisiId !== undefined || data.namaExpedisi !== undefined) {
      if (matchedExp) {
        patch.expedisiId = matchedExp.id;
        patch.namaExpedisi = matchedExp.namaExpedisi;
      } else {
        patch.expedisiId = '';
        patch.namaExpedisi = String(data.namaExpedisi || '').trim();
      }
    }
    if (data.catatan !== undefined) patch.catatan = String(data.catatan || '').trim();
    if (data.tanggalMulai !== undefined) patch.tanggalMulai = String(data.tanggalMulai || '').trim();
    if (data.tanggalDeadline !== undefined) {
      patch.tanggalDeadline = String(data.tanggalDeadline || '').trim();
    }
    if (data.statusSelesai !== undefined) {
      var nextDone = Boolean(data.statusSelesai);
      var actor2 = getActor();
      patch.statusSelesai = nextDone;
      patch.completedAt = nextDone ? { __zcpTsMs: Date.now() } : null;
      patch.completedByUid = nextDone ? actor2.uid || '' : '';
      patch.completedByName = nextDone ? actor2.nama || actor2.email || 'Admin (AI)' : '';
    }
    return patch;
  }

  function normalizeSablonItems(rawItems, pesananList) {
    var items = Array.isArray(rawItems) ? rawItems : [];
    var list = pesananList || [];
    return items
      .map(function (item) {
        if (!item || !item.pesananId) return null;
        var found = list.find(function (p) {
          return p.id === item.pesananId;
        });
        var sq = {};
        if (item.sisiQuantities && typeof item.sisiQuantities === 'object') {
          Object.keys(item.sisiQuantities).forEach(function (s) {
            var num = Math.max(0, parseInt(item.sisiQuantities[s], 10) || 0);
            if (num > 0) sq[s] = num;
          });
        }
        return {
          pesananId: item.pesananId,
          namaPemesan: (found && found.namaPemesan) || String(item.namaPemesan || '').trim(),
          namaProduk: (found && found.namaProduk) || String(item.namaProduk || '').trim(),
          jumlahProduk:
            (found && Number(found.jumlahProduk)) || Number(item.jumlahProduk) || 0,
          sisiQuantities: sq
        };
      })
      .filter(Boolean);
  }

  function buildSablonPayload(type, rawData, existingDoc, storeContext) {
    var data = rawData && typeof rawData === 'object' ? rawData : {};
    if (type === 'CREATE') {
      var count = Math.max(1, parseInt(data.jumlahPerulangan, 10) || 1);
      var checks = [];
      for (var i = 0; i < count; i++) {
        checks.push(Boolean(Array.isArray(data.perulanganChecks) && data.perulanganChecks[i]));
      }
      var allChecked = checks.length > 0 && checks.every(Boolean);
      var done = data.statusSelesai !== undefined ? Boolean(data.statusSelesai) : allChecked;
      var actor = getActor();
      var meta = checks.map(function (c) {
        return c
          ? {
              uid: actor.uid || '',
              nama: actor.nama || actor.email || 'Admin (AI)',
              checkedAt: new Date().toISOString()
            }
          : null;
      });
      return {
        namaSablon: String(data.namaSablon || '').trim() || 'Sablon Baru (AI)',
        pesananItems: normalizeSablonItems(data.pesananItems, storeContext.pesananList),
        jumlahPerulangan: count,
        perulanganChecks: checks,
        perulanganCheckMeta: meta,
        fileSablon: [],
        catatan: String(data.catatan || '').trim(),
        statusSelesai: done,
        completedAt: done ? { __zcpTsMs: Date.now() } : null,
        completedByUid: done ? actor.uid || '' : '',
        completedByName: done ? actor.nama || actor.email || 'Admin (AI)' : ''
      };
    }

    var patch = {};
    if (data.namaSablon !== undefined && String(data.namaSablon || '').trim()) {
      patch.namaSablon = String(data.namaSablon).trim();
    }
    if (data.pesananItems !== undefined) {
      patch.pesananItems = normalizeSablonItems(data.pesananItems, storeContext.pesananList);
    }
    if (data.jumlahPerulangan !== undefined || Array.isArray(data.perulanganChecks)) {
      var nextCount = Math.max(
        1,
        parseInt(
          data.jumlahPerulangan !== undefined
            ? data.jumlahPerulangan
            : existingDoc && existingDoc.jumlahPerulangan,
          10
        ) || 1
      );
      var srcChecks = Array.isArray(data.perulanganChecks)
        ? data.perulanganChecks
        : (existingDoc && existingDoc.perulanganChecks) || [];
      var srcMeta = (existingDoc && existingDoc.perulanganCheckMeta) || [];
      var nextChecks = [];
      var nextMeta = [];
      var actorUpd = getActor();
      for (var j = 0; j < nextCount; j++) {
        var c = Boolean(srcChecks[j]);
        nextChecks.push(c);
        nextMeta.push(
          c
            ? srcMeta[j] || {
                uid: actorUpd.uid || '',
                nama: actorUpd.nama || actorUpd.email || 'Admin (AI)',
                checkedAt: new Date().toISOString()
              }
            : null
        );
      }
      patch.jumlahPerulangan = nextCount;
      patch.perulanganChecks = nextChecks;
      patch.perulanganCheckMeta = nextMeta;
    }
    if (data.catatan !== undefined) patch.catatan = String(data.catatan || '').trim();
    if (data.statusSelesai !== undefined) {
      var nextDone2 = Boolean(data.statusSelesai);
      var actor3 = getActor();
      patch.statusSelesai = nextDone2;
      patch.completedAt = nextDone2 ? { __zcpTsMs: Date.now() } : null;
      patch.completedByUid = nextDone2 ? actor3.uid || '' : '';
      patch.completedByName = nextDone2 ? actor3.nama || actor3.email || 'Admin (AI)' : '';
    }
    return patch;
  }

  function buildMasterProdukPayload(rawData) {
    var data = rawData && typeof rawData === 'object' ? rawData : {};
    var namaSisi = Array.isArray(data.namaSisi)
      ? data.namaSisi
          .map(function (s) {
            return String(s || '').trim();
          })
          .filter(Boolean)
      : ['Depan', 'Belakang'];
    if (!namaSisi.length) namaSisi = ['Depan', 'Belakang'];
    return {
      namaProduk: String(data.namaProduk || '').trim() || 'Produk Baru',
      namaSisi: namaSisi
    };
  }

  function buildMasterExpedisiPayload(rawData) {
    var data = rawData && typeof rawData === 'object' ? rawData : {};
    return {
      namaExpedisi: String(data.namaExpedisi || '').trim() || 'Expedisi Baru'
    };
  }

  function prepareOperations(rawOps, storeContext) {
    var list = Array.isArray(rawOps) ? rawOps : [];
    var ctx = storeContext || {};
    return list
      .map(function (op, index) {
        if (!op || typeof op !== 'object') return null;
        var type = String(op.type || '').toUpperCase();
        var collection = String(op.collection || '').trim();
        if (['CREATE', 'UPDATE', 'DELETE'].indexOf(type) === -1) return null;
        if (ALLOWED_COLLECTIONS.indexOf(collection) === -1) return null;

        var docId = op.docId ? String(op.docId).trim() : '';
        var existingDoc = null;
        var valid = true;
        var invalidReason = '';

        if (type === 'UPDATE' || type === 'DELETE') {
          existingDoc = docId ? findExistingDoc(collection, docId, ctx) : null;
          if (!docId || !existingDoc) {
            valid = false;
            invalidReason = 'Dokumen target tidak ditemukan di data aplikasi.';
          }
        }

        var payload = {};
        if (type !== 'DELETE' && valid) {
          if (collection === 'pesanan') {
            payload = buildPesananPayload(type, op.data, existingDoc, ctx);
          } else if (collection === 'sablon') {
            payload = buildSablonPayload(type, op.data, existingDoc, ctx);
          } else if (collection === 'master_produk') {
            payload = buildMasterProdukPayload(op.data);
          } else if (collection === 'master_expedisi') {
            payload = buildMasterExpedisiPayload(op.data);
          }
        }

        var detailRows = [];
        if (type === 'CREATE') {
          Object.keys(payload).forEach(function (k) {
            if (['sisiProgress', 'fileDesigns', 'fileSablon', 'perulanganCheckMeta', 'completedAt', 'completedByUid', 'completedByName', 'produkId', 'expedisiId'].indexOf(k) !== -1) {
              return;
            }
            if (payload[k] === '' || payload[k] === null) return;
            detailRows.push({
              field: k,
              before: '',
              after: formatDisplayValue(payload[k])
            });
          });
        } else if (type === 'UPDATE' && existingDoc) {
          Object.keys(payload).forEach(function (k) {
            if (['sisiProgress', 'perulanganCheckMeta', 'completedAt', 'completedByUid', 'completedByName', 'produkId', 'expedisiId'].indexOf(k) !== -1) {
              return;
            }
            detailRows.push({
              field: k,
              before: formatDisplayValue(existingDoc[k]),
              after: formatDisplayValue(payload[k])
            });
          });
        } else if (type === 'DELETE' && existingDoc) {
          if (collection === 'pesanan') {
            detailRows.push({
              field: 'Data Dihapus',
              before:
                (existingDoc.namaPemesan || '-') +
                ' — ' +
                (existingDoc.namaProduk || '-') +
                ' (' +
                (existingDoc.jumlahProduk || 0) +
                ' pcs)',
              after: '(akan dihapus)'
            });
          } else if (collection === 'sablon') {
            detailRows.push({
              field: 'Data Dihapus',
              before:
                (existingDoc.namaSablon || '-') +
                ' (' +
                (existingDoc.jumlahPerulangan || 1) +
                'x perulangan)',
              after: '(akan dihapus)'
            });
          } else {
            detailRows.push({
              field: 'Data Dihapus',
              before: existingDoc.namaProduk || existingDoc.namaExpedisi || existingDoc.id,
              after: '(akan dihapus)'
            });
          }
        }

        var fallbackLabel =
          (payload && (payload.namaPemesan || payload.namaSablon || payload.namaProduk || payload.namaExpedisi)) ||
          (existingDoc && (existingDoc.namaPemesan || existingDoc.namaSablon || existingDoc.namaProduk || existingDoc.namaExpedisi)) ||
          collection;

        return {
          opKey: 'op_' + index + '_' + Date.now(),
          selected: valid,
          valid: valid,
          invalidReason: invalidReason,
          type: type,
          collection: collection,
          docId: docId,
          label: String(op.label || '').trim() || fallbackLabel,
          reason: String(op.reason || '').trim(),
          payload: payload,
          existingDoc: existingDoc,
          detailRows: detailRows
        };
      })
      .filter(Boolean);
  }

  async function callGeminiRaw(endpoint, requestBody) {
    var response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    var json = null;
    try {
      json = await response.json();
    } catch (e) {
      json = null;
    }

    if (!response.ok) {
      var errMsg =
        (json && json.error && json.error.message) ||
        'Permintaan ke Gemini API gagal (HTTP ' + response.status + ').';
      var err = new Error(errMsg);
      err.status = response.status;
      throw err;
    }

    return json;
  }

  function extractCandidateText(geminiJson) {
    var candidates = geminiJson && Array.isArray(geminiJson.candidates) ? geminiJson.candidates : [];
    if (!candidates.length) {
      var blockReason =
        geminiJson && geminiJson.promptFeedback && geminiJson.promptFeedback.blockReason;
      if (blockReason) {
        throw new Error('Permintaan diblokir oleh filter Gemini: ' + blockReason);
      }
      throw new Error('Gemini tidak mengembalikan respons teks.');
    }
    var parts =
      candidates[0] && candidates[0].content && Array.isArray(candidates[0].content.parts)
        ? candidates[0].content.parts
        : [];
    return parts
      .map(function (p) {
        return p && typeof p.text === 'string' ? p.text : '';
      })
      .join('\n')
      .trim();
  }

  async function trimAiChangeLogsTo20() {
    var db = getDbOrThrow();
    var snap = await db
      .collection(AI_LOGS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    if (snap.docs.length <= MAX_AI_LOGS) return;

    var batch = db.batch();
    for (var i = MAX_AI_LOGS; i < snap.docs.length; i++) {
      batch.delete(snap.docs[i].ref);
    }
    await batch.commit();
  }

  global.ZcpAiService = {
    MAX_AI_LOGS: MAX_AI_LOGS,
    MAX_FILE_SIZE_BYTES: MAX_FILE_SIZE_BYTES,
    ALLOWED_MIME_TYPES: ALLOWED_MIME_TYPES,
    readChatFile: readChatFile,

    testGeminiConnection: async function (aiConfig) {
      var endpoint = buildGeminiEndpoint(
        aiConfig && aiConfig.geminiApiUrl,
        aiConfig && aiConfig.geminiApiKey
      );
      var json = await callGeminiRaw(endpoint, {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Balas singkat dengan kata: OK' }]
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16
        }
      });
      var replyText = extractCandidateText(json);
      return replyText || 'OK';
    },

    sendToGemini: async function (params) {
      var aiConfig = params && params.aiConfig;
      var endpoint = buildGeminiEndpoint(
        aiConfig && aiConfig.geminiApiUrl,
        aiConfig && aiConfig.geminiApiKey
      );
      var userText = String((params && params.userText) || '').trim();
      var attachments = Array.isArray(params && params.attachments) ? params.attachments : [];
      var history = Array.isArray(params && params.history) ? params.history : [];
      var storeContext = (params && params.storeContext) || {};

      var contents = [];
      // Sertakan maks 6 pesan riwayat terakhir agar hemat token namun konteks percakapan terjaga
      history.slice(-6).forEach(function (msg) {
        if (!msg || !msg.text) return;
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(msg.text) }]
        });
      });

      var userParts = [];
      attachments.forEach(function (att) {
        if (att && att.base64 && att.mimeType) {
          userParts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: att.base64
            }
          });
        }
      });
      userParts.push({
        text:
          userText ||
          'Analisis file terlampir dan siapkan perubahan data ZCP STORE jika diperlukan.'
      });
      contents.push({ role: 'user', parts: userParts });

      var systemText = buildSystemInstruction(storeContext);
      var body = {
        systemInstruction: {
          parts: [{ text: systemText }]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      };

      var json;
      try {
        json = await callGeminiRaw(endpoint, body);
      } catch (err) {
        // Fallback jika custom proxy/endpoint lama menolak responseMimeType
        if (
          err &&
          err.status === 400 &&
          String(err.message || '').toLowerCase().indexOf('responsemimetype') !== -1
        ) {
          delete body.generationConfig.responseMimeType;
          json = await callGeminiRaw(endpoint, body);
        } else {
          throw err;
        }
      }

      var rawText = extractCandidateText(json);
      var parsed = extractJsonFromText(rawText);
      var preparedOps = prepareOperations(parsed.operations, storeContext);

      return {
        reply: String(parsed.reply || '').trim() || 'Berikut rencana perubahan yang disiapkan AI:',
        operations: preparedOps
      };
    },

    executeOperations: async function (params) {
      var db = getDbOrThrow();
      var approvedOps = (Array.isArray(params && params.approvedOps) ? params.approvedOps : []).filter(
        function (op) {
          return op && op.valid !== false;
        }
      );
      if (!approvedOps.length) {
        throw new Error('Tidak ada operasi valid yang dipilih.');
      }

      var rawAttachments = Array.isArray(params && params.attachFiles) ? params.attachFiles : [];
      var shouldAttachFiles = Boolean(params && params.uploadAttachmentsToDrive) && rawAttachments.length > 0;
      var uploadedByFolder = {};

      if (shouldAttachFiles && global.ZcpDriveService && global.ZcpDriveConfig && global.ZcpDriveConfig.isConfigured()) {
        var needsPesananUpload = approvedOps.some(function (op) {
          return op.collection === 'pesanan' && op.type !== 'DELETE';
        });
        var needsSablonUpload = approvedOps.some(function (op) {
          return op.collection === 'sablon' && op.type !== 'DELETE';
        });
        var rawFileObjs = rawAttachments
          .map(function (a) {
            return a && a.file ? a.file : null;
          })
          .filter(Boolean);

        if (rawFileObjs.length) {
          if (needsPesananUpload) {
            uploadedByFolder.pesanan = await global.ZcpDriveService.uploadMultipleFiles(
              rawFileObjs,
              'pesanan'
            );
          }
          if (needsSablonUpload) {
            uploadedByFolder.sablon = await global.ZcpDriveService.uploadMultipleFiles(
              rawFileObjs,
              'sablon'
            );
          }
        }
      }

      var ts = global.ZcpFirebase.serverTimestamp();
      var recordedChanges = [];
      var affectedSablonPesananIds = [];
      var sablonChangesForSync = [];

      for (var i = 0; i < approvedOps.length; i++) {
        var op = approvedOps[i];
        var colRef = db.collection(op.collection);

        if (op.type === 'CREATE') {
          var newRef = colRef.doc();
          var writeDoc = reviveFromLog(op.payload) || {};

          if (op.collection === 'pesanan' && uploadedByFolder.pesanan) {
            writeDoc.fileDesigns = uploadedByFolder.pesanan.slice();
          } else if (op.collection === 'sablon' && uploadedByFolder.sablon) {
            writeDoc.fileSablon = uploadedByFolder.sablon.slice();
          }

          var logAfterCreate = sanitizeForLog(
            Object.assign({}, writeDoc, {
              createdAt: { __zcpTsMs: Date.now() },
              updatedAt: { __zcpTsMs: Date.now() }
            })
          );

          await newRef.set(
            Object.assign({}, writeDoc, {
              createdAt: ts,
              updatedAt: ts
            })
          );

          if (op.collection === 'sablon' && global.ZcpSablonService) {
            var pIdsC = global.ZcpSablonService.extractPesananIds(writeDoc.pesananItems);
            affectedSablonPesananIds = affectedSablonPesananIds.concat(pIdsC);
            sablonChangesForSync.push({
              mode: 'upsert',
              doc: Object.assign({ id: newRef.id }, writeDoc)
            });
          }

          recordedChanges.push({
            type: 'CREATE',
            collection: op.collection,
            docId: newRef.id,
            label: op.label,
            beforeData: null,
            afterData: logAfterCreate
          });
        } else if (op.type === 'UPDATE') {
          var updRef = colRef.doc(op.docId);
          var snapU = await updRef.get();
          if (!snapU.exists) {
            throw new Error('Dokumen "' + op.label + '" tidak ditemukan saat akan diperbarui.');
          }
          var beforeRaw = snapU.data() || {};
          var beforeLog = sanitizeForLog(beforeRaw);
          var patchDoc = reviveFromLog(op.payload) || {};

          if (op.collection === 'pesanan' && uploadedByFolder.pesanan) {
            var prevDesigns = Array.isArray(beforeRaw.fileDesigns) ? beforeRaw.fileDesigns : [];
            patchDoc.fileDesigns = prevDesigns.concat(uploadedByFolder.pesanan);
          } else if (op.collection === 'sablon' && uploadedByFolder.sablon) {
            var prevSablonFiles = Array.isArray(beforeRaw.fileSablon) ? beforeRaw.fileSablon : [];
            patchDoc.fileSablon = prevSablonFiles.concat(uploadedByFolder.sablon);
          }

          await updRef.update(Object.assign({}, patchDoc, { updatedAt: ts }));

          var mergedAfter = Object.assign({}, beforeRaw, patchDoc);
          var afterLog = sanitizeForLog(
            Object.assign({}, mergedAfter, {
              updatedAt: { __zcpTsMs: Date.now() }
            })
          );

          if (op.collection === 'sablon' && global.ZcpSablonService) {
            var oldIds = global.ZcpSablonService.extractPesananIds(beforeRaw.pesananItems);
            var newIds = global.ZcpSablonService.extractPesananIds(mergedAfter.pesananItems);
            affectedSablonPesananIds = affectedSablonPesananIds.concat(oldIds, newIds);
            sablonChangesForSync.push({
              mode: 'upsert',
              doc: Object.assign({ id: op.docId }, mergedAfter)
            });
          }

          recordedChanges.push({
            type: 'UPDATE',
            collection: op.collection,
            docId: op.docId,
            label: op.label,
            beforeData: beforeLog,
            afterData: afterLog
          });
        } else if (op.type === 'DELETE') {
          var delRef = colRef.doc(op.docId);
          var snapD = await delRef.get();
          if (!snapD.exists) {
            continue;
          }
          var delRaw = snapD.data() || {};
          var delBeforeLog = sanitizeForLog(delRaw);
          await delRef.delete();

          if (op.collection === 'sablon' && global.ZcpSablonService) {
            var pIdsD = global.ZcpSablonService.extractPesananIds(delRaw.pesananItems);
            affectedSablonPesananIds = affectedSablonPesananIds.concat(pIdsD);
            sablonChangesForSync.push({
              mode: 'delete',
              id: op.docId
            });
          }

          recordedChanges.push({
            type: 'DELETE',
            collection: op.collection,
            docId: op.docId,
            label: op.label,
            beforeData: delBeforeLog,
            afterData: null
          });
        }
      }

      if (affectedSablonPesananIds.length && global.ZcpSablonService) {
        var uniqueIds = Array.from(new Set(affectedSablonPesananIds));
        await global.ZcpSablonService.syncPesananProgress(
          uniqueIds,
          sablonChangesForSync.length === 1 ? sablonChangesForSync[0] : null
        );
      }

      var actor = getActor();
      var summaryText =
        String((params && params.summary) || '').trim() ||
        recordedChanges
          .map(function (c) {
            return c.type + ' ' + c.collection + ': ' + c.label;
          })
          .join('; ');

      var aiLogRef = await db.collection(AI_LOGS_COLLECTION).add({
        prompt: String((params && params.promptText) || '').slice(0, 600),
        summary: summaryText.slice(0, 500),
        actorUid: actor.uid || '',
        actorName: actor.nama || actor.email || 'Admin',
        actorEmail: actor.email || '',
        actorRole: actor.role || 'admin',
        rolledBack: false,
        rolledBackAt: null,
        rolledBackByName: '',
        changes: recordedChanges,
        createdAt: ts
      });

      await trimAiChangeLogsTo20();

      if (global.ZcpActivityLogService && recordedChanges.length) {
        await global.ZcpActivityLogService.logActivity({
          action: recordedChanges.length > 1 ? 'BULK_UPDATE' : recordedChanges[0].type,
          module: 'AI Assistant',
          targetName:
            recordedChanges.length === 1
              ? recordedChanges[0].label
              : recordedChanges.length + ' operasi AI',
          details: summaryText.slice(0, 300)
        });
      }

      return {
        logId: aiLogRef.id,
        count: recordedChanges.length,
        changes: recordedChanges,
        touchedMaster: recordedChanges.some(function (c) {
          return c.collection === 'master_produk' || c.collection === 'master_expedisi';
        })
      };
    },

    fetchAiLogs: async function () {
      var db = getDbOrThrow();
      var snap = await db
        .collection(AI_LOGS_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(MAX_AI_LOGS)
        .get();

      return snap.docs.map(function (doc) {
        var data = doc.data() || {};
        return {
          id: doc.id,
          prompt: data.prompt || '',
          summary: data.summary || '',
          actorUid: data.actorUid || '',
          actorName: data.actorName || data.actorEmail || 'Admin',
          actorEmail: data.actorEmail || '',
          actorRole: data.actorRole || 'admin',
          rolledBack: Boolean(data.rolledBack),
          rolledBackAt: data.rolledBackAt || null,
          rolledBackByName: data.rolledBackByName || '',
          changes: Array.isArray(data.changes) ? data.changes : [],
          createdAt: data.createdAt || null
        };
      });
    },

    rollbackAiLog: async function (logEntry) {
      var db = getDbOrThrow();
      if (!logEntry || !logEntry.id) {
        throw new Error('Data log AI tidak valid.');
      }

      var logRef = db.collection(AI_LOGS_COLLECTION).doc(logEntry.id);
      var logSnap = await logRef.get();
      if (!logSnap.exists) {
        throw new Error('Log perubahan AI ini sudah tidak tersedia atau terhapus oleh batas 20 log.');
      }
      var freshLog = logSnap.data() || {};
      if (freshLog.rolledBack) {
        throw new Error('Perubahan pada log ini sudah pernah di-rollback.');
      }

      var changes = Array.isArray(freshLog.changes) ? freshLog.changes : [];
      var ts = global.ZcpFirebase.serverTimestamp();
      var affectedSablonPesananIds = [];
      var sablonChangesForSync = [];

      // Kembalikan perubahan dari urutan paling belakang ke awal
      for (var i = changes.length - 1; i >= 0; i--) {
        var ch = changes[i];
        if (!ch || !ch.collection || !ch.docId) continue;
        if (ALLOWED_COLLECTIONS.indexOf(ch.collection) === -1) continue;

        var targetRef = db.collection(ch.collection).doc(ch.docId);

        if (ch.type === 'CREATE') {
          await targetRef.delete();
          if (ch.collection === 'sablon' && global.ZcpSablonService) {
            var pIdsDel = global.ZcpSablonService.extractPesananIds(
              ch.afterData && ch.afterData.pesananItems
            );
            affectedSablonPesananIds = affectedSablonPesananIds.concat(pIdsDel);
            sablonChangesForSync.push({ mode: 'delete', id: ch.docId });
          }
        } else if ((ch.type === 'UPDATE' || ch.type === 'DELETE') && ch.beforeData) {
          var restored = reviveFromLog(ch.beforeData) || {};
          if (!restored.updatedAt) {
            restored.updatedAt = ts;
          }
          if (!restored.createdAt) {
            restored.createdAt = ts;
          }
          await targetRef.set(restored);

          if (ch.collection === 'sablon' && global.ZcpSablonService) {
            var pIdsBefore = global.ZcpSablonService.extractPesananIds(restored.pesananItems);
            var pIdsAfter = global.ZcpSablonService.extractPesananIds(
              ch.afterData && ch.afterData.pesananItems
            );
            affectedSablonPesananIds = affectedSablonPesananIds.concat(pIdsBefore, pIdsAfter);
            sablonChangesForSync.push({
              mode: 'upsert',
              doc: Object.assign({ id: ch.docId }, restored)
            });
          }
        }
      }

      if (affectedSablonPesananIds.length && global.ZcpSablonService) {
        var uniqueIds = Array.from(new Set(affectedSablonPesananIds));
        await global.ZcpSablonService.syncPesananProgress(
          uniqueIds,
          sablonChangesForSync.length === 1 ? sablonChangesForSync[0] : null
        );
      }

      var actor = getActor();
      await logRef.update({
        rolledBack: true,
        rolledBackAt: ts,
        rolledBackByUid: actor.uid || '',
        rolledBackByName: actor.nama || actor.email || 'Admin'
      });

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'ROLLBACK',
          module: 'AI Assistant',
          targetName: freshLog.summary || freshLog.prompt || 'Perubahan AI',
          details: 'Rollback ' + changes.length + ' perubahan AI ke kondisi sebelumnya'
        });
      }

      return {
        count: changes.length,
        touchedMaster: changes.some(function (c) {
          return c.collection === 'master_produk' || c.collection === 'master_expedisi';
        })
      };
    }
  };
})(window);
