/**
 * Service Upload & Hapus File Google Drive melalui Google Apps Script (code.gs)
 */
(function (global) {
  'use strict';

  var MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
  var ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
  var fileBase64Cache = {};

  var IDB_NAME = 'zcp_drive_ai_cache_v1';
  var IDB_STORE = 'files';
  var IDB_VERSION = 1;
  var idbPromise = null;

  function openCacheDb() {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    if (idbPromise) return idbPromise;

    idbPromise = new Promise(function (resolve) {
      try {
        var req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = function (event) {
          var db = event.target && event.target.result;
          if (db && !db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: 'cacheKey' });
          }
        };
        req.onsuccess = function (event) {
          resolve((event.target && event.target.result) || null);
        };
        req.onerror = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });

    return idbPromise;
  }

  function idbGetMany(cacheKeys) {
    if (!cacheKeys.length) return Promise.resolve({});
    return openCacheDb().then(function (db) {
      if (!db) return {};
      return new Promise(function (resolve) {
        var out = {};
        try {
          var tx = db.transaction(IDB_STORE, 'readonly');
          var store = tx.objectStore(IDB_STORE);
          for (var i = 0; i < cacheKeys.length; i++) {
            (function (ck) {
              var req = store.get(ck);
              req.onsuccess = function () {
                if (req.result && req.result.base64) {
                  out[ck] = req.result;
                }
              };
            })(cacheKeys[i]);
          }
          tx.oncomplete = function () {
            resolve(out);
          };
          tx.onerror = function () {
            resolve(out);
          };
          tx.onabort = function () {
            resolve(out);
          };
        } catch (e) {
          resolve(out);
        }
      });
    });
  }

  function idbPutMany(entries) {
    if (!entries.length) return Promise.resolve();
    return openCacheDb().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(IDB_STORE, 'readwrite');
          var store = tx.objectStore(IDB_STORE);
          for (var i = 0; i < entries.length; i++) {
            store.put(entries[i]);
          }
          tx.oncomplete = function () {
            resolve();
          };
          tx.onerror = function () {
            resolve();
          };
          tx.onabort = function () {
            resolve();
          };
        } catch (e) {
          resolve();
        }
      });
    });
  }

  function getDriveConfigOrThrow() {
    var cfg = global.ZcpDriveConfig;
    if (!cfg || !cfg.isConfigured()) {
      throw new Error(
        'Google Apps Script URL (gasUrl) belum diisi. Lengkapi gasConfig.gasUrl di js/firebase-config.js terlebih dahulu.'
      );
    }
    return cfg;
  }

  function validateFile(file) {
    if (!file) {
      throw new Error('File tidak valid atau kosong.');
    }
    if (ALLOWED_MIME_TYPES.indexOf(file.type) === -1) {
      throw new Error(
        'Format file "' +
          file.name +
          '" tidak didukung. Gunakan PNG, JPG/JPEG, atau PDF.'
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        'Ukuran file "' + file.name + '" melebihi batas maksimal 15 MB.'
      );
    }
    return true;
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var commaIdx = result.indexOf(',');
        if (commaIdx === -1) {
          reject(new Error('Gagal membaca konten file "' + file.name + '".'));
          return;
        }
        resolve(result.slice(commaIdx + 1));
      };
      reader.onerror = function () {
        reject(new Error('Gagal membaca file "' + file.name + '".'));
      };
      reader.readAsDataURL(file);
    });
  }

  async function postToGas(payload) {
    var cfg = getDriveConfigOrThrow();
    var bodyPayload = Object.assign({}, payload, {
      apiSecret: cfg.getApiSecret()
    });

    // Gunakan Content-Type text/plain agar browser tidak memicu CORS preflight (OPTIONS) ke Google Apps Script
    var response = await fetch(cfg.getGasUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(bodyPayload),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error('Permintaan ke Google Apps Script gagal (HTTP ' + response.status + ').');
    }

    var text = await response.text();
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('Respons Google Apps Script tidak valid (bukan JSON). Pastikan deployment Web App aktif.');
    }

    if (!parsed || !parsed.success) {
      throw new Error((parsed && parsed.error) || 'Operasi Google Drive gagal.');
    }

    return parsed;
  }

  global.ZcpDriveService = {
    MAX_FILE_SIZE_BYTES: MAX_FILE_SIZE_BYTES,
    ALLOWED_MIME_TYPES: ALLOWED_MIME_TYPES,

    isConfigured: function () {
      return Boolean(global.ZcpDriveConfig && global.ZcpDriveConfig.isConfigured());
    },

    validateFile: validateFile,
    fileToBase64: fileToBase64,

    uploadFile: async function (file, folder) {
      getDriveConfigOrThrow();
      validateFile(file);
      var base64Data = await fileToBase64(file);

      var res = await postToGas({
        action: 'upload',
        folder: folder || 'designs',
        fileName: file.name,
        mimeType: file.type,
        base64Data: base64Data
      });

      return res.data;
    },

    uploadMultipleFiles: async function (files, folder, onProgress) {
      var list = Array.prototype.slice.call(files || []);
      if (!list.length) return [];

      getDriveConfigOrThrow();

      // Validasi seluruh file terlebih dahulu sebelum mulai upload
      for (var i = 0; i < list.length; i++) {
        validateFile(list[i]);
      }

      var uploaded = [];
      for (var j = 0; j < list.length; j++) {
        var currentFile = list[j];
        if (typeof onProgress === 'function') {
          onProgress({
            current: j + 1,
            total: list.length,
            fileName: currentFile.name
          });
        }
        var data = await this.uploadFile(currentFile, folder);
        uploaded.push(data);
      }

      return uploaded;
    },

    deleteFile: async function (fileId) {
      if (!fileId) {
        throw new Error('fileId wajib diisi untuk menghapus file.');
      }
      return postToGas({
        action: 'delete',
        fileId: fileId
      });
    },

    fetchFilesBase64: async function (fileIds, onProgress, options) {
      var opts = options || {};
      var mode = opts.mode === 'original' ? 'original' : 'thumb';
      var rawThumb = typeof opts.thumbSize === 'string' ? opts.thumbSize.trim() : '';
      var thumbSize = /^w\d{2,4}$/.test(rawThumb) ? rawThumb : 'w400';
      var keyPrefix = mode === 'original' ? 'orig:' : 'thumb:' + thumbSize + ':';

      var list = Array.isArray(fileIds) ? fileIds : [];
      var unique = [];
      var seen = {};
      for (var i = 0; i < list.length; i++) {
        var clean = String(list[i] || '').trim();
        if (clean && !seen[clean]) {
          seen[clean] = true;
          unique.push(clean);
        }
      }

      var result = {};
      var afterRamMissing = [];
      unique.forEach(function (fid) {
        var cKey = keyPrefix + fid;
        if (fileBase64Cache[cKey]) {
          result[fid] = fileBase64Cache[cKey];
        } else {
          afterRamMissing.push(fid);
        }
      });

      var missing = [];
      if (afterRamMissing.length) {
        var idbKeys = afterRamMissing.map(function (fid) {
          return keyPrefix + fid;
        });
        var idbHits = await idbGetMany(idbKeys);
        afterRamMissing.forEach(function (fid) {
          var cKey = keyPrefix + fid;
          var hit = idbHits[cKey];
          if (hit && hit.base64) {
            var entry = {
              fileId: fid,
              fileName: hit.fileName || '',
              mimeType: hit.mimeType || 'image/jpeg',
              size: Number(hit.size) || 0,
              base64: hit.base64
            };
            fileBase64Cache[cKey] = entry;
            result[fid] = entry;
          } else {
            missing.push(fid);
          }
        });
      }

      var cachedCount = unique.length - missing.length;
      if (!missing.length) {
        if (typeof onProgress === 'function' && unique.length > 0) {
          onProgress({
            batch: 1,
            totalBatches: 1,
            fetched: unique.length,
            total: unique.length,
            cachedCount: cachedCount,
            missingCount: 0
          });
        }
        return result;
      }

      getDriveConfigOrThrow();
      var BATCH_SIZE = 10;
      var CONCURRENCY = 3;
      var batches = [];
      for (var b = 0; b < missing.length; b += BATCH_SIZE) {
        batches.push(missing.slice(b, b + BATCH_SIZE));
      }

      var totalBatches = batches.length;
      var completedBatches = 0;
      var fetchedMissing = 0;
      var nextBatchIndex = 0;
      var idbToStore = [];

      if (typeof onProgress === 'function') {
        onProgress({
          batch: 0,
          totalBatches: totalBatches,
          fetched: cachedCount,
          total: unique.length,
          cachedCount: cachedCount,
          missingCount: missing.length
        });
      }

      async function worker() {
        while (nextBatchIndex < batches.length) {
          var myIdx = nextBatchIndex;
          nextBatchIndex += 1;
          var batch = batches[myIdx];

          var res;
          try {
            res = await postToGas({
              action: 'getFilesBase64',
              fileIds: batch,
              mode: mode,
              thumbSize: thumbSize
            });
          } catch (err) {
            var msg = String((err && err.message) || '');
            if (msg.indexOf('tidak dikenali') !== -1 || msg.indexOf('getFilesBase64') !== -1) {
              throw new Error(
                'Deployment Google Apps Script (code.gs) Anda versi lama dan belum mendukung aksi "getFilesBase64". Perbarui isi code.gs lalu klik Deploy > New deployment (atau Manage deployments > New version).'
              );
            }
            throw err;
          }

          var filesMap = (res && res.files) || {};
          Object.keys(filesMap).forEach(function (fid) {
            var item = filesMap[fid];
            if (item && item.base64) {
              var cKey = keyPrefix + fid;
              var entry = {
                fileId: fid,
                fileName: item.fileName || '',
                mimeType: item.mimeType || 'image/jpeg',
                size: Number(item.size) || 0,
                base64: item.base64
              };
              fileBase64Cache[cKey] = entry;
              result[fid] = entry;
              idbToStore.push({
                cacheKey: cKey,
                fileId: fid,
                fileName: entry.fileName,
                mimeType: entry.mimeType,
                size: entry.size,
                base64: entry.base64,
                savedAt: Date.now()
              });
            }
          });

          completedBatches += 1;
          fetchedMissing += batch.length;
          if (typeof onProgress === 'function') {
            onProgress({
              batch: completedBatches,
              totalBatches: totalBatches,
              fetched: cachedCount + Math.min(fetchedMissing, missing.length),
              total: unique.length,
              cachedCount: cachedCount,
              missingCount: missing.length
            });
          }
        }
      }

      var workers = [];
      var workerCount = Math.min(CONCURRENCY, batches.length);
      for (var w = 0; w < workerCount; w++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      if (idbToStore.length) {
        idbPutMany(idbToStore);
      }

      return result;
    }
  };
})(window);
