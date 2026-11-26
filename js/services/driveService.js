/**
 * Service Upload, Hapus & Baca File langsung via Google Drive API v3 (100% Frontend, Maks. 100 MB)
 */
(function (global) {
  'use strict';

  var MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
  var MAX_AI_READ_BYTES = 8 * 1024 * 1024; // 8 MB untuk payload inline AI
  var ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
  var DEFAULT_ROOT_FOLDER_NAME = 'ZCP_STORE_FILES';
  var DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
  var DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
  var DRIVE_ABOUT_API = 'https://www.googleapis.com/drive/v3/about';
  var OAUTH_TOKEN_API = 'https://oauth2.googleapis.com/token';

  var fileBase64Cache = {};
  var tokenCache = {
    accessToken: '',
    expiresAt: 0,
    configSig: ''
  };
  var tokenRefreshPromise = null;
  var folderIdCache = {};
  var folderCacheConfigSig = '';

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

  function extractFolderId(raw) {
    if (global.ZcpSettingsService && typeof global.ZcpSettingsService.extractDriveFolderId === 'function') {
      return global.ZcpSettingsService.extractDriveFolderId(raw);
    }
    var val = typeof raw === 'string' ? raw.trim() : '';
    if (!val) return '';
    var folderMatch = val.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) return folderMatch[1];
    var idMatch = val.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) return idMatch[1];
    return val.replace(/\/+$/, '');
  }

  function normalizeConfig(cfg) {
    var src = cfg && typeof cfg === 'object' ? cfg : {};
    var rootName =
      typeof src.rootFolderName === 'string' && src.rootFolderName.trim()
        ? src.rootFolderName.trim()
        : DEFAULT_ROOT_FOLDER_NAME;
    return {
      clientId: typeof src.clientId === 'string' ? src.clientId.trim() : '',
      clientSecret: typeof src.clientSecret === 'string' ? src.clientSecret.trim() : '',
      refreshToken: typeof src.refreshToken === 'string' ? src.refreshToken.trim() : '',
      accessToken: typeof src.accessToken === 'string' ? src.accessToken.trim() : '',
      rootFolderId: extractFolderId(src.rootFolderId),
      rootFolderName: rootName
    };
  }

  function getConfigSignature(cfg) {
    var c = normalizeConfig(cfg);
    return [c.clientId, c.clientSecret, c.refreshToken, c.accessToken, c.rootFolderId, c.rootFolderName].join('|');
  }

  function getActiveConfig() {
    if (global.ZcpDriveConfig && typeof global.ZcpDriveConfig.getConfig === 'function') {
      return normalizeConfig(global.ZcpDriveConfig.getConfig());
    }
    return normalizeConfig({});
  }

  function getDriveConfigOrThrow() {
    var cfg = getActiveConfig();
    var hasRefresh = Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken);
    if (!hasRefresh && !cfg.accessToken) {
      throw new Error(
        'Konfigurasi Google Drive API belum diisi. Minta Superadmin melengkapinya di menu Pengaturan.'
      );
    }
    return cfg;
  }

  function inferMimeType(file) {
    if (!file) return '';
    var raw = String(file.type || '').toLowerCase().trim();
    if (raw === 'image/jpg') return 'image/jpeg';
    if (ALLOWED_MIME_TYPES.indexOf(raw) !== -1) return raw;
    var name = String(file.name || '').toLowerCase();
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.pdf')) return 'application/pdf';
    return raw;
  }

  function validateFile(file) {
    if (!file) {
      throw new Error('File tidak valid atau kosong.');
    }
    var mimeType = inferMimeType(file);
    if (ALLOWED_MIME_TYPES.indexOf(mimeType) === -1) {
      throw new Error(
        'Format file "' +
          file.name +
          '" tidak didukung. Gunakan PNG, JPG/JPEG, atau PDF.'
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        'Ukuran file "' + file.name + '" melebihi batas maksimal 100 MB.'
      );
    }
    return true;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var commaIdx = result.indexOf(',');
        if (commaIdx === -1) {
          reject(new Error('Gagal membaca konten file.'));
          return;
        }
        resolve(result.slice(commaIdx + 1));
      };
      reader.onerror = function () {
        reject(new Error('Gagal membaca data file.'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function fileToBase64(file) {
    return blobToBase64(file);
  }

  function resizeImageBlobForAi(blob, maxDimension, quality) {
    return new Promise(function (resolve, reject) {
      if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined') {
        reject(new Error('Browser tidak mendukung pemrosesan gambar.'));
        return;
      }
      var objUrl = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width || 1;
          var h = img.naturalHeight || img.height || 1;
          var maxDim = maxDimension || 400;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var targetW = Math.max(1, Math.round(w * scale));
          var targetH = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          var dataUrl = canvas.toDataURL('image/jpeg', quality || 0.85);
          var commaIdx = dataUrl.indexOf(',');
          if (commaIdx === -1) {
            reject(new Error('Gagal mengonversi gambar untuk AI.'));
            return;
          }
          resolve({
            mimeType: 'image/jpeg',
            base64: dataUrl.slice(commaIdx + 1)
          });
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(objUrl);
        reject(new Error('Gagal memuat gambar dari Google Drive.'));
      };
      img.src = objUrl;
    });
  }

  function buildSafeFileName(originalName) {
    var clean = String(originalName || 'file')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .trim();
    if (!clean) {
      clean = 'file';
    }
    var d = new Date();
    var yyyy = String(d.getFullYear());
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    var ss = String(d.getSeconds()).padStart(2, '0');
    return yyyy + mm + dd + '_' + hh + mi + ss + '_' + clean;
  }

  async function parseDriveErrorMessage(response, fallback) {
    try {
      var text = await response.text();
      if (!text) return fallback;
      try {
        var json = JSON.parse(text);
        if (json && json.error) {
          if (typeof json.error === 'string') {
            return json.error_description || json.error;
          }
          if (json.error.message) {
            return json.error.message;
          }
        }
      } catch (e) {
        return text.slice(0, 220);
      }
      return fallback;
    } catch (e) {
      return fallback;
    }
  }

  async function fetchFreshAccessToken(cfg) {
    var c = normalizeConfig(cfg);
    var hasRefresh = Boolean(c.clientId && c.clientSecret && c.refreshToken);

    if (hasRefresh) {
      var params = new URLSearchParams();
      params.set('client_id', c.clientId);
      params.set('client_secret', c.clientSecret);
      params.set('refresh_token', c.refreshToken);
      params.set('grant_type', 'refresh_token');

      var res = await fetch(OAUTH_TOKEN_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      var data = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }

      if (!res.ok || !data || !data.access_token) {
        var errCode = (data && data.error) || '';
        var errDesc = (data && (data.error_description || data.error)) || 'HTTP ' + res.status;
        if (errCode === 'invalid_grant') {
          throw new Error(
            'Refresh Token Google Drive kadaluarsa atau dicabut (invalid_grant). Pastikan OAuth Consent Screen berstatus "In Production" lalu buat ulang Refresh Token di OAuth Playground.'
          );
        }
        throw new Error('Gagal memperbarui Access Token Google Drive: ' + errDesc);
      }

      return {
        accessToken: String(data.access_token),
        expiresIn: Number(data.expires_in) || 3600,
        authMode: 'oauth_refresh'
      };
    }

    if (c.accessToken) {
      return {
        accessToken: c.accessToken,
        expiresIn: 3000,
        authMode: 'manual_token'
      };
    }

    throw new Error(
      'Konfigurasi Google Drive API belum diisi. Minta Superadmin melengkapinya di menu Pengaturan.'
    );
  }

  async function getAccessToken(forceRefresh, overrideConfig) {
    if (overrideConfig) {
      return fetchFreshAccessToken(overrideConfig);
    }

    var cfg = getDriveConfigOrThrow();
    var sig = getConfigSignature(cfg);

    if (
      !forceRefresh &&
      tokenCache.accessToken &&
      tokenCache.configSig === sig &&
      Date.now() < tokenCache.expiresAt
    ) {
      return {
        accessToken: tokenCache.accessToken,
        expiresIn: Math.round((tokenCache.expiresAt - Date.now()) / 1000),
        authMode: cfg.clientId && cfg.clientSecret && cfg.refreshToken ? 'oauth_refresh' : 'manual_token'
      };
    }

    if (tokenRefreshPromise && !forceRefresh) {
      return tokenRefreshPromise;
    }

    tokenRefreshPromise = fetchFreshAccessToken(cfg)
      .then(function (tok) {
        var safeTtlSec = Math.max(60, (tok.expiresIn || 3600) - 120);
        tokenCache = {
          accessToken: tok.accessToken,
          expiresAt: Date.now() + safeTtlSec * 1000,
          configSig: sig
        };
        return tok;
      })
      .finally(function () {
        tokenRefreshPromise = null;
      });

    return tokenRefreshPromise;
  }

  async function driveApiFetch(url, options, retryOn401) {
    var tok = await getAccessToken(false);
    var opts = Object.assign({}, options || {});
    var headers = Object.assign({}, opts.headers || {}, {
      Authorization: 'Bearer ' + tok.accessToken
    });
    opts.headers = headers;

    var res = await fetch(url, opts);

    if (res.status === 401 && !retryOn401) {
      var cfg = getActiveConfig();
      if (cfg.clientId && cfg.clientSecret && cfg.refreshToken) {
        var freshTok = await getAccessToken(true);
        opts.headers = Object.assign({}, options && options.headers ? options.headers : {}, {
          Authorization: 'Bearer ' + freshTok.accessToken
        });
        res = await fetch(url, opts);
      } else {
        throw new Error(
          'Access Token Google Drive tidak valid atau sudah kadaluarsa. Perbarui token atau gunakan OAuth Refresh Token di menu Pengaturan.'
        );
      }
    }

    return res;
  }

  function escapeDriveQuery(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async function findOrCreateFolder(name, parentId) {
    var safeParent = parentId || 'root';
    var q =
      "name = '" +
      escapeDriveQuery(name) +
      "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '" +
      escapeDriveQuery(safeParent) +
      "' in parents";

    var queryUrl =
      DRIVE_FILES_API +
      '?q=' +
      encodeURIComponent(q) +
      '&fields=' +
      encodeURIComponent('files(id,name)') +
      '&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true';

    var searchRes = await driveApiFetch(queryUrl, { method: 'GET' });
    if (!searchRes.ok) {
      var searchErr = await parseDriveErrorMessage(
        searchRes,
        'Gagal mencari folder "' + name + '" di Google Drive (HTTP ' + searchRes.status + ').'
      );
      throw new Error(searchErr);
    }

    var searchJson = await searchRes.json();
    if (searchJson && Array.isArray(searchJson.files) && searchJson.files.length > 0) {
      return searchJson.files[0].id;
    }

    var body = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder'
    };
    if (safeParent) {
      body.parents = [safeParent];
    }

    var createRes = await driveApiFetch(
      DRIVE_FILES_API + '?fields=id,name&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify(body)
      }
    );

    if (!createRes.ok) {
      var createErr = await parseDriveErrorMessage(
        createRes,
        'Gagal membuat folder "' + name + '" di Google Drive (HTTP ' + createRes.status + ').'
      );
      throw new Error(createErr);
    }

    var created = await createRes.json();
    if (!created || !created.id) {
      throw new Error('Google Drive tidak mengembalikan ID folder untuk "' + name + '".');
    }
    return created.id;
  }

  function normalizeSubfolderKey(folderKey) {
    if (folderKey === 'designs' || folderKey === 'sablon') return folderKey;
    if (folderKey === 'pesanan') return 'designs';
    return 'lainnya';
  }

  async function resolveTargetFolderId(folderKey) {
    var cfg = getDriveConfigOrThrow();
    var sig = getConfigSignature(cfg);
    if (folderCacheConfigSig !== sig) {
      folderIdCache = {};
      folderCacheConfigSig = sig;
    }

    var safeFolder = normalizeSubfolderKey(folderKey);
    if (folderIdCache[safeFolder]) {
      return folderIdCache[safeFolder];
    }

    var rootId = cfg.rootFolderId;
    if (!rootId) {
      if (!folderIdCache.__root) {
        folderIdCache.__root = await findOrCreateFolder(
          cfg.rootFolderName || DEFAULT_ROOT_FOLDER_NAME,
          'root'
        );
      }
      rootId = folderIdCache.__root;
    }

    var subId = await findOrCreateFolder(safeFolder, rootId);
    folderIdCache[safeFolder] = subId;
    return subId;
  }

  function putBinaryToResumableUrl(uploadUrl, file, mimeType, onFileProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      if (mimeType) {
        xhr.setRequestHeader('Content-Type', mimeType);
      }

      if (xhr.upload && typeof onFileProgress === 'function') {
        xhr.upload.onprogress = function (event) {
          var total = event.lengthComputable && event.total ? event.total : file.size;
          var loaded = event.loaded || 0;
          var percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
          onFileProgress({
            loaded: loaded,
            total: total,
            percent: percent
          });
        };
      }

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var parsed = JSON.parse(xhr.responseText || '{}');
            resolve(parsed);
          } catch (e) {
            reject(new Error('Respons Google Drive setelah upload tidak valid.'));
          }
          return;
        }
        var errMsg = 'Upload ke Google Drive gagal (HTTP ' + xhr.status + ').';
        try {
          var errJson = JSON.parse(xhr.responseText || '{}');
          if (errJson && errJson.error && errJson.error.message) {
            errMsg = errJson.error.message;
          }
        } catch (e) {
          // Gunakan fallback errMsg
        }
        reject(new Error(errMsg));
      };

      xhr.onerror = function () {
        reject(new Error('Koneksi terputus saat mengunggah file "' + file.name + '" ke Google Drive.'));
      };

      xhr.ontimeout = function () {
        reject(new Error('Waktu upload file "' + file.name + '" ke Google Drive habis (timeout).'));
      };

      xhr.send(file);
    });
  }

  async function grantAnyoneViewerPermission(fileId) {
    try {
      await driveApiFetch(
        DRIVE_FILES_API + '/' + encodeURIComponent(fileId) + '/permissions?supportsAllDrives=true',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        }
      );
    } catch (e) {
      // Best-effort: tetap lanjutkan jika organisasi/domain membatasi share publik
    }
  }

  global.ZcpDriveService = {
    MAX_FILE_SIZE_BYTES: MAX_FILE_SIZE_BYTES,
    ALLOWED_MIME_TYPES: ALLOWED_MIME_TYPES,

    setConfig: function (cfg) {
      var normalized = normalizeConfig(cfg);
      var nextSig = getConfigSignature(normalized);
      if (global.ZcpDriveConfig && typeof global.ZcpDriveConfig.setConfig === 'function') {
        global.ZcpDriveConfig.setConfig(normalized);
      }
      if (tokenCache.configSig !== nextSig) {
        tokenCache = { accessToken: '', expiresAt: 0, configSig: '' };
        tokenRefreshPromise = null;
      }
      if (folderCacheConfigSig !== nextSig) {
        folderIdCache = {};
        folderCacheConfigSig = '';
      }
      return normalized;
    },

    isConfigured: function () {
      return Boolean(global.ZcpDriveConfig && global.ZcpDriveConfig.isConfigured());
    },

    validateFile: validateFile,
    fileToBase64: fileToBase64,

    uploadFile: async function (file, folder, onFileProgress) {
      getDriveConfigOrThrow();
      validateFile(file);

      var mimeType = inferMimeType(file) || 'application/octet-stream';
      var safeFolder = normalizeSubfolderKey(folder || 'designs');
      var targetFolderId = await resolveTargetFolderId(safeFolder);
      var safeFileName = buildSafeFileName(file.name);

      // Tahap 1: Inisiasi Resumable Upload Session di Google Drive API v3
      var initUrl =
        DRIVE_UPLOAD_API +
        '?uploadType=resumable&fields=' +
        encodeURIComponent('id,name,mimeType,size') +
        '&supportsAllDrives=true';

      var initRes = await driveApiFetch(initUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': String(file.size)
        },
        body: JSON.stringify({
          name: safeFileName,
          mimeType: mimeType,
          parents: [targetFolderId]
        })
      });

      if (!initRes.ok) {
        var initErr = await parseDriveErrorMessage(
          initRes,
          'Gagal memulai sesi upload Google Drive (HTTP ' + initRes.status + ').'
        );
        throw new Error(initErr);
      }

      var uploadUrl = initRes.headers.get('Location');
      if (!uploadUrl) {
        throw new Error(
          'Google Drive tidak mengembalikan header Location untuk sesi upload resumable.'
        );
      }

      // Tahap 2: Upload biner langsung ke Google Drive (mendukung 100 MB tanpa Base64)
      var uploaded = await putBinaryToResumableUrl(uploadUrl, file, mimeType, onFileProgress);
      var id = uploaded && uploaded.id;
      if (!id) {
        throw new Error('Upload selesai tetapi Google Drive tidak mengembalikan fileId.');
      }

      // Tahap 3: Berikan izin baca via link agar pratinjau di aplikasi berjalan untuk semua karyawan
      await grantAnyoneViewerPermission(id);

      var viewUrl = 'https://drive.google.com/file/d/' + id + '/view';
      var downloadUrl = 'https://drive.google.com/uc?export=download&id=' + id;
      var previewUrl =
        mimeType === 'application/pdf'
          ? 'https://drive.google.com/file/d/' + id + '/preview'
          : 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000';

      return {
        fileId: id,
        fileName: (uploaded && uploaded.name) || safeFileName,
        originalName: file.name,
        mimeType: mimeType,
        size: Number((uploaded && uploaded.size) || file.size) || file.size,
        folder: safeFolder,
        viewUrl: viewUrl,
        downloadUrl: downloadUrl,
        previewUrl: previewUrl,
        uploadedAt: new Date().toISOString()
      };
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
            fileName: currentFile.name,
            percent: 0,
            loaded: 0,
            totalBytes: currentFile.size
          });
        }
        var data = await this.uploadFile(currentFile, folder, function (fileProg) {
          if (typeof onProgress === 'function') {
            onProgress({
              current: j + 1,
              total: list.length,
              fileName: currentFile.name,
              percent: fileProg.percent,
              loaded: fileProg.loaded,
              totalBytes: fileProg.total
            });
          }
        });
        uploaded.push(data);
      }

      return uploaded;
    },

    deleteFile: async function (fileId) {
      if (!fileId) {
        throw new Error('fileId wajib diisi untuk menghapus file.');
      }
      getDriveConfigOrThrow();

      var res = await driveApiFetch(
        DRIVE_FILES_API + '/' + encodeURIComponent(fileId) + '?supportsAllDrives=true',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8'
          },
          body: JSON.stringify({ trashed: true })
        }
      );

      if (res.status === 404) {
        return {
          success: true,
          deletedFileId: fileId
        };
      }

      if (!res.ok) {
        var errMsg = await parseDriveErrorMessage(
          res,
          'Gagal memindahkan file ke Trash Google Drive (HTTP ' + res.status + ').'
        );
        throw new Error(errMsg);
      }

      return {
        success: true,
        deletedFileId: fileId
      };
    },

    testConnection: async function (overrideConfig) {
      var cfg = normalizeConfig(overrideConfig || getActiveConfig());
      var hasRefresh = Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken);
      if (!hasRefresh && !cfg.accessToken) {
        throw new Error(
          'Isi OAuth Client ID + Client Secret + Refresh Token, atau isi Access Token manual terlebih dahulu.'
        );
      }

      var tok = await getAccessToken(true, cfg);
      var aboutUrl =
        DRIVE_ABOUT_API +
        '?fields=' +
        encodeURIComponent('user(displayName,emailAddress),storageQuota(limit,usage)');

      var aboutRes = await fetch(aboutUrl, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + tok.accessToken
        }
      });

      if (!aboutRes.ok) {
        var aboutErr = await parseDriveErrorMessage(
          aboutRes,
          'Gagal terhubung ke Google Drive API (HTTP ' + aboutRes.status + ').'
        );
        throw new Error(aboutErr);
      }

      var aboutJson = await aboutRes.json();
      var user = (aboutJson && aboutJson.user) || {};
      var quota = (aboutJson && aboutJson.storageQuota) || {};

      var folderName = cfg.rootFolderName || DEFAULT_ROOT_FOLDER_NAME;
      if (cfg.rootFolderId) {
        var folderRes = await fetch(
          DRIVE_FILES_API +
            '/' +
            encodeURIComponent(cfg.rootFolderId) +
            '?fields=' +
            encodeURIComponent('id,name,mimeType,trashed') +
            '&supportsAllDrives=true',
          {
            method: 'GET',
            headers: {
              Authorization: 'Bearer ' + tok.accessToken
            }
          }
        );

        if (!folderRes.ok) {
          var fErr = await parseDriveErrorMessage(
            folderRes,
            'Folder Root Drive dengan ID "' + cfg.rootFolderId + '" tidak dapat diakses.'
          );
          throw new Error(fErr);
        }

        var folderMeta = await folderRes.json();
        if (!folderMeta || folderMeta.trashed) {
          throw new Error('Folder Root Drive yang dipilih berada di Trash.');
        }
        if (folderMeta.mimeType !== 'application/vnd.google-apps.folder') {
          throw new Error('ID yang dimasukkan bukan merupakan folder Google Drive.');
        }
        folderName = folderMeta.name || cfg.rootFolderId;
      }

      return {
        email: user.emailAddress || '',
        displayName: user.displayName || '',
        usageBytes: Number(quota.usage) || 0,
        limitBytes: Number(quota.limit) || 0,
        folderName: folderName,
        authMode: tok.authMode
      };
    },

    fetchFilesBase64: async function (fileIds, onProgress, options) {
      var opts = options || {};
      var mode = opts.mode === 'original' ? 'original' : 'thumb';
      var rawThumb = typeof opts.thumbSize === 'string' ? opts.thumbSize.trim() : '';
      var thumbSize = /^w\d{2,4}$/.test(rawThumb) ? rawThumb : 'w400';
      var thumbPx = parseInt(thumbSize.slice(1), 10) || 400;
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
      var CONCURRENCY = 4;
      var totalMissing = missing.length;
      var nextIdx = 0;
      var completedMissing = 0;
      var idbToStore = [];

      if (typeof onProgress === 'function') {
        onProgress({
          batch: 0,
          totalBatches: totalMissing,
          fetched: cachedCount,
          total: unique.length,
          cachedCount: cachedCount,
          missingCount: totalMissing
        });
      }

      async function fetchSingleFileEntry(fid) {
        var metaRes = await driveApiFetch(
          DRIVE_FILES_API +
            '/' +
            encodeURIComponent(fid) +
            '?fields=' +
            encodeURIComponent('id,name,mimeType,size,trashed,thumbnailLink') +
            '&supportsAllDrives=true',
          { method: 'GET' }
        );
        if (!metaRes.ok) {
          return null;
        }
        var meta = await metaRes.json();
        if (!meta || meta.trashed) {
          return null;
        }

        var fileName = meta.name || '';
        var mimeType = meta.mimeType || 'image/jpeg';
        var fileSize = Number(meta.size) || 0;

        // Jalur cepat thumbnail Drive API jika mode === 'thumb'
        if (mode !== 'original' && meta.thumbnailLink) {
          try {
            var thumbUrl = String(meta.thumbnailLink).replace(/=s\d+$/, '=s' + thumbPx);
            var thumbRes = await fetch(thumbUrl);
            if (thumbRes.ok) {
              var thumbBlob = await thumbRes.blob();
              if (thumbBlob && thumbBlob.type && thumbBlob.type.indexOf('image/') === 0) {
                var thumbB64 = await blobToBase64(thumbBlob);
                return {
                  fileId: fid,
                  fileName: fileName,
                  mimeType: thumbBlob.type,
                  size: thumbBlob.size || fileSize,
                  base64: thumbB64
                };
              }
            }
          } catch (e) {
            // Fallback ke alt=media di bawah jika thumbnailLink gagal/CORS
          }
        }

        // Untuk file non-gambar > 8 MB (mis. PDF besar), hindari download penuh untuk AI
        if (mimeType.indexOf('image/') !== 0 && fileSize > MAX_AI_READ_BYTES) {
          return null;
        }

        var mediaRes = await driveApiFetch(
          DRIVE_FILES_API +
            '/' +
            encodeURIComponent(fid) +
            '?alt=media&supportsAllDrives=true',
          { method: 'GET' }
        );
        if (!mediaRes.ok) {
          return null;
        }

        var blob = await mediaRes.blob();
        var effectiveMime = blob.type || mimeType;
        var outBase64 = '';
        var outMime = effectiveMime;
        var outSize = blob.size || fileSize;

        if (effectiveMime.indexOf('image/') === 0 && (mode !== 'original' || outSize > MAX_AI_READ_BYTES)) {
          var resized = await resizeImageBlobForAi(
            blob,
            mode === 'original' ? 1500 : thumbPx,
            0.85
          );
          outBase64 = resized.base64;
          outMime = resized.mimeType;
        } else {
          if (outSize > MAX_AI_READ_BYTES) {
            return null;
          }
          outBase64 = await blobToBase64(blob);
        }

        if (!outBase64) return null;

        return {
          fileId: fid,
          fileName: fileName,
          mimeType: outMime,
          size: outSize,
          base64: outBase64
        };
      }

      async function worker() {
        while (nextIdx < missing.length) {
          var myIdx = nextIdx;
          nextIdx += 1;
          var fid = missing[myIdx];

          try {
            var entry = await fetchSingleFileEntry(fid);
            if (entry && entry.base64) {
              var cKey = keyPrefix + fid;
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
          } catch (err) {
            var msg = String((err && err.message) || '');
            if (msg.indexOf('Access Token') !== -1 || msg.indexOf('Refresh Token') !== -1) {
              throw err;
            }
            // Abaikan error per file agar file lain tetap terproses
          }

          completedMissing += 1;
          if (typeof onProgress === 'function') {
            onProgress({
              batch: completedMissing,
              totalBatches: totalMissing,
              fetched: cachedCount + completedMissing,
              total: unique.length,
              cachedCount: cachedCount,
              missingCount: totalMissing
            });
          }
        }
      }

      var workers = [];
      var workerCount = Math.min(CONCURRENCY, missing.length);
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
