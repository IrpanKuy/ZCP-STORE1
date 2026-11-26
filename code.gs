/**
 * =====================================================================
 * ZCP STORE — Google Apps Script Backend (Google Drive File Uploader)
 * =====================================================================
 *
 * Cara Deploy di Google Apps Script:
 * 1. Buka https://script.google.com > New project.
 * 2. Hapus kode bawaan lalu tempel seluruh isi file code.gs ini.
 * 3. Klik Deploy > New deployment > pilih Type: Web app.
 *    - Description : ZCP STORE Drive Uploader
 *    - Execute as  : Me (akun Google pemilik Drive)
 *    - Who has access: Anyone
 * 4. Klik Deploy, izinkan akses Google Drive saat diminta, lalu salin Web App URL (akhiran /exec).
 * 5. Tempel URL tersebut ke gasConfig.gasUrl di file js/firebase-config.js.
 *
 * Cara Mengaktifkan Penghapusan Otomatis File > 1 Bulan (30 Hari):
 * 1. Di editor Apps Script, pilih fungsi `pasangTriggerHapusOtomatis` pada dropdown toolbar atas.
 * 2. Klik Run (jalankan 1 kali saja) dan berikan izin jika diminta.
 * 3. Script otomatis berjalan setiap hari pukul 02:00 untuk membuang file yang lebih dari 30 hari.
 */

// Opsional: Isi ID folder Google Drive tujuan. Kosongkan ('') agar otomatis membuat folder ZCP_STORE_FILES.
var ROOT_FOLDER_ID = '';
var ROOT_FOLDER_NAME = 'ZCP_STORE_FILES';

// Batas usia file sebelum dihapus otomatis (1 bulan = 30 hari)
var RETENTION_DAYS = 30;

// Batas ukuran maksimal file (15 MB) dan tipe MIME yang diizinkan
var MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
var ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

// Opsional: Token rahasia tambahan. Jika diisi, samakan nilainya dengan gasConfig.apiSecret di js/firebase-config.js
var API_SECRET = '';

/**
 * Helper membuat response JSON.
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Mencari folder root jika sudah ada (tanpa membuat baru).
 */
function findRootFolderIfExists() {
  if (ROOT_FOLDER_ID) {
    return DriveApp.getFolderById(ROOT_FOLDER_ID);
  }
  var folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return null;
}

/**
 * Mengambil atau membuat folder root ZCP_STORE_FILES di Google Drive.
 */
function getRootFolder() {
  var existing = findRootFolderIfExists();
  if (existing) {
    return existing;
  }
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

/**
 * Mengambil atau membuat subfolder ('designs', 'sablon', atau 'lainnya') di dalam folder root.
 */
function getOrCreateSubfolder(parentFolder, folderKey) {
  var safeFolder = (folderKey === 'designs' || folderKey === 'sablon') ? folderKey : 'lainnya';
  var iter = parentFolder.getFoldersByName(safeFolder);
  if (iter.hasNext()) {
    return iter.next();
  }
  return parentFolder.createFolder(safeFolder);
}

/**
 * Membersihkan nama file dan menambahkan prefix timestamp agar tidak bentrok.
 */
function buildSafeFileName(originalName) {
  var clean = String(originalName || 'file')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim();
  if (!clean) {
    clean = 'file';
  }
  var tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  var prefix = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmmss');
  return prefix + '_' + clean;
}

/**
 * Endpoint GET untuk cek status layanan.
 */
function doGet(e) {
  return jsonResponse({
    success: true,
    service: 'ZCP STORE Google Drive Uploader',
    retentionDays: RETENTION_DAYS,
    timestamp: new Date().toISOString()
  });
}

/**
 * Endpoint POST untuk handle upload dan delete file dari frontend.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'Payload request kosong.' });
    }

    var payload = JSON.parse(e.postData.contents);

    if (API_SECRET && payload.apiSecret !== API_SECRET) {
      return jsonResponse({ success: false, error: 'Akses ditolak: apiSecret tidak valid.' });
    }

    var action = payload.action || '';

    if (action === 'upload') {
      return handleUpload(payload);
    }

    if (action === 'delete') {
      return handleDelete(payload);
    }

    if (action === 'getFilesBase64' || action === 'getFileBase64') {
      return handleGetFilesBase64(payload);
    }

    return jsonResponse({ success: false, error: 'Action "' + action + '" tidak dikenali.' });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: err && err.message ? err.message : 'Terjadi kesalahan pada Google Apps Script.'
    });
  }
}

/**
 * Memproses upload file base64 ke Google Drive.
 */
function handleUpload(payload) {
  var base64Data = payload.base64Data;
  var originalName = payload.fileName || 'file';
  var mimeType = payload.mimeType || '';
  var folderKey = (payload.folder === 'designs' || payload.folder === 'sablon') ? payload.folder : 'lainnya';

  if (!base64Data) {
    return jsonResponse({ success: false, error: 'Data file (base64Data) wajib diisi.' });
  }

  if (ALLOWED_MIME_TYPES.indexOf(mimeType) === -1) {
    return jsonResponse({
      success: false,
      error: 'Tipe file tidak didukung. Hanya PNG, JPG/JPEG, dan PDF yang diizinkan.'
    });
  }

  var bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > MAX_FILE_SIZE_BYTES) {
    return jsonResponse({
      success: false,
      error: 'Ukuran file melebihi batas maksimal 15 MB.'
    });
  }

  var safeFileName = buildSafeFileName(originalName);
  var blob = Utilities.newBlob(bytes, mimeType, safeFileName);

  var rootFolder = getRootFolder();
  var targetFolder = getOrCreateSubfolder(rootFolder, folderKey);
  var file = targetFolder.createFile(blob);

  // Berikan akses lihat lewat link agar admin dapat preview/download langsung dari webapp
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var id = file.getId();
  var viewUrl = 'https://drive.google.com/file/d/' + id + '/view';
  var downloadUrl = 'https://drive.google.com/uc?export=download&id=' + id;
  var previewUrl = mimeType === 'application/pdf'
    ? 'https://drive.google.com/file/d/' + id + '/preview'
    : 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000';

  return jsonResponse({
    success: true,
    data: {
      fileId: id,
      fileName: safeFileName,
      originalName: originalName,
      mimeType: mimeType,
      size: bytes.length,
      folder: folderKey,
      viewUrl: viewUrl,
      downloadUrl: downloadUrl,
      previewUrl: previewUrl,
      uploadedAt: new Date().toISOString()
    }
  });
}

/**
 * Memindahkan file ke Trash Google Drive berdasarkan fileId.
 */
function handleDelete(payload) {
  var fileId = payload.fileId;
  if (!fileId) {
    return jsonResponse({ success: false, error: 'fileId wajib diisi untuk menghapus file.' });
  }

  var file = DriveApp.getFileById(fileId);
  file.setTrashed(true);

  return jsonResponse({
    success: true,
    deletedFileId: fileId
  });
}

/**
 * Mengambil isi file Google Drive dalam format base64 (untuk analisa gambar AI).
 * Secara default menggunakan UrlFetchApp.fetchAll() terhadap thumbnail sz=w400 agar paralel & cepat,
 * dengan fallback otomatis ke DriveApp.getFileById() jika gagal atau jika mode === 'original'.
 */
function handleGetFilesBase64(payload) {
  var rawIds = [];
  if (payload && Array.isArray(payload.fileIds)) {
    rawIds = payload.fileIds;
  } else if (payload && payload.fileId) {
    rawIds = [payload.fileId];
  }

  var seen = {};
  var fileIds = [];
  for (var i = 0; i < rawIds.length && fileIds.length < 40; i++) {
    var cleanId = String(rawIds[i] || '').trim();
    if (cleanId && !seen[cleanId]) {
      seen[cleanId] = true;
      fileIds.push(cleanId);
    }
  }

  if (!fileIds.length) {
    return jsonResponse({
      success: false,
      error: 'fileIds wajib diisi untuk membaca file dari Google Drive.'
    });
  }

  var mode = payload && payload.mode === 'original' ? 'original' : 'thumb';
  var rawThumb = payload && typeof payload.thumbSize === 'string' ? payload.thumbSize.trim() : '';
  var thumbSize = /^w\d{2,4}$/.test(rawThumb) ? rawThumb : 'w400';

  var MAX_AI_READ_BYTES = 8 * 1024 * 1024;
  var filesMap = {};
  var errorsMap = {};
  var handled = {};

  // Ambil thumbnail paralel lewat UrlFetchApp.fetchAll() agar tidak sequential ke DriveApp
  if (mode !== 'original') {
    var requests = [];
    for (var r = 0; r < fileIds.length; r++) {
      requests.push({
        url: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileIds[r]) + '&sz=' + thumbSize,
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true
      });
    }

    try {
      var responses = UrlFetchApp.fetchAll(requests);
      for (var k = 0; k < fileIds.length; k++) {
        var tfid = fileIds[k];
        var resp = responses && responses[k];
        if (!resp || resp.getResponseCode() !== 200) continue;

        var headers = resp.getHeaders() || {};
        var contentType = String(headers['Content-Type'] || headers['content-type'] || '');
        if (contentType.toLowerCase().indexOf('image/') !== 0) continue;

        var thumbBytes = resp.getContent();
        if (thumbBytes && thumbBytes.length > 0 && thumbBytes.length <= MAX_AI_READ_BYTES) {
          filesMap[tfid] = {
            fileId: tfid,
            fileName: '',
            mimeType: contentType.split(';')[0].trim(),
            size: thumbBytes.length,
            base64: Utilities.base64Encode(thumbBytes),
            mode: 'thumb'
          };
          handled[tfid] = true;
        }
      }
    } catch (fetchAllErr) {
      // Abaikan error fetchAll massal; lanjutkan fallback DriveApp per file
    }
  }

  for (var j = 0; j < fileIds.length; j++) {
    var fid = fileIds[j];
    if (handled[fid]) continue;
    try {
      var file = DriveApp.getFileById(fid);
      if (file.isTrashed()) {
        errorsMap[fid] = 'File sudah berada di Trash.';
        continue;
      }
      var size = file.getSize();
      if (size > MAX_AI_READ_BYTES) {
        errorsMap[fid] = 'Ukuran file melebihi batas baca AI (8 MB).';
        continue;
      }
      var blob = file.getBlob();
      var bytes = blob.getBytes();
      var mimeType = blob.getContentType() || file.getMimeType() || 'image/jpeg';
      filesMap[fid] = {
        fileId: fid,
        fileName: file.getName(),
        mimeType: mimeType,
        size: bytes.length,
        base64: Utilities.base64Encode(bytes),
        mode: 'original'
      };
    } catch (err) {
      errorsMap[fid] = err && err.message ? err.message : 'Gagal membaca file Drive.';
    }
  }

  return jsonResponse({
    success: true,
    files: filesMap,
    errors: errorsMap
  });
}

/**
 * Menghapus (memindahkan ke Trash) semua file di folder ZCP_STORE_FILES
 * beserta seluruh subfoldernya yang dibuat lebih dari 1 bulan (RETENTION_DAYS = 30 hari) lalu.
 */
function hapusFileLebihDariSebulan() {
  var cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  var rootFolder = findRootFolderIfExists();

  if (!rootFolder) {
    Logger.log('Folder root "' + ROOT_FOLDER_NAME + '" belum ada. Tidak ada file yang diperiksa.');
    return {
      checkedCount: 0,
      deletedCount: 0,
      cutoffDate: cutoffDate.toISOString(),
      note: 'Folder root belum ada.'
    };
  }

  var stats = {
    checkedCount: 0,
    deletedCount: 0
  };

  scanAndTrashExpiredFiles(rootFolder, cutoffDate, stats);

  var summary = {
    checkedCount: stats.checkedCount,
    deletedCount: stats.deletedCount,
    cutoffDate: cutoffDate.toISOString()
  };

  Logger.log(
    'Ringkasan Pembersihan File (> ' + RETENTION_DAYS + ' hari): ' +
    'Diperiksa=' + summary.checkedCount +
    ', Dihapus=' + summary.deletedCount +
    ', Batas Tanggal=' + summary.cutoffDate
  );

  return summary;
}

/**
 * Rekursif memeriksa file pada folder dan seluruh subfoldernya.
 */
function scanAndTrashExpiredFiles(folder, cutoffDate, stats) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    stats.checkedCount += 1;

    if (file.getDateCreated() < cutoffDate) {
      file.setTrashed(true);
      stats.deletedCount += 1;
      Logger.log(
        'Dihapus (Trash): ' + file.getName() +
        ' | ID: ' + file.getId() +
        ' | Dibuat: ' + file.getDateCreated().toISOString()
      );
    }
  }

  var subFolders = folder.getFolders();
  while (subFolders.hasNext()) {
    var sub = subFolders.next();
    scanAndTrashExpiredFiles(sub, cutoffDate, stats);
  }
}

/**
 * Jalankan fungsi ini 1x secara manual di Google Apps Script Editor
 * untuk menjadwalkan penghapusan file > 30 hari otomatis setiap hari pukul 02:00.
 */
function pasangTriggerHapusOtomatis() {
  hapusTriggerOtomatis();

  ScriptApp.newTrigger('hapusFileLebihDariSebulan')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();

  Logger.log('Trigger harian hapusFileLebihDariSebulan berhasil dipasang (berjalan tiap hari pukul 02:00).');
}

/**
 * Menghapus semua trigger otomatis untuk fungsi hapusFileLebihDariSebulan.
 */
function hapusTriggerOtomatis() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'hapusFileLebihDariSebulan') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
