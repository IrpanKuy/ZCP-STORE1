/**
 * Service Upload & Hapus File Google Drive melalui Google Apps Script (code.gs)
 */
(function (global) {
  'use strict';

  var MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
  var ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

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
    }
  };
})(window);
