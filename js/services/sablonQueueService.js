/**
 * State Persisten Multi-Sablon & Runner Antrian AI Auto-Fill Berurutan (Background Queue)
 */
(function (global) {
  'use strict';

  var blockSeq = 1;
  var draftSeq = 1;
  var stagedSeq = 1;
  var MAX_API_RETRIES = 5;
  var RETRY_WAIT_SECONDS = 5;
  var ORDER_CHUNK_SIZE = 6;

  function makeOrderBlock() {
    return {
      localId: ++blockSeq,
      searchText: '',
      dropdownOpen: false,
      selectedPesananId: '',
      sisiInputs: {},
      legacyExtraSlots: []
    };
  }

  function makeInitialAiState() {
    return {
      status: 'idle', // idle | queued | running | retrying | done | error
      percent: 0,
      analyzedOrders: 0,
      totalOrders: 0,
      stageText: '',
      retryAttempt: 0,
      retryCountdown: 0,
      errorMessage: '',
      result: null
    };
  }

  function makeSablonDraft() {
    return {
      localId: ++draftSeq,
      namaSablon: '',
      jumlahPerulangan: 1,
      catatan: '',
      existingFiles: [],
      removedFileIds: [],
      stagedFiles: [],
      orderBlocks: [makeOrderBlock()],
      isDragging: false,
      formError: '',
      aiState: makeInitialAiState()
    };
  }

  function revokeDraftPreviewUrls(draft) {
    if (!draft || !Array.isArray(draft.stagedFiles)) return;
    for (var i = 0; i < draft.stagedFiles.length; i++) {
      if (draft.stagedFiles[i] && draft.stagedFiles[i].previewUrl) {
        try {
          URL.revokeObjectURL(draft.stagedFiles[i].previewUrl);
        } catch (e) {
          // Abaikan
        }
      }
    }
  }

  function revokeAllDrafts() {
    for (var i = 0; i < formState.drafts.length; i++) {
      revokeDraftPreviewUrls(formState.drafts[i]);
    }
  }

  var formState = Vue.reactive({
    mode: 'create', // create | edit
    editingSablon: null,
    drafts: [makeSablonDraft()],
    savingAll: false,
    saveProgressText: '',
    globalError: ''
  });

  var aiQueue = Vue.reactive({
    running: false,
    stopRequested: false,
    status: 'idle', // idle | running | done | error | stopped
    mode: 'all', // single | all
    currentPos: 0,
    totalInQueue: 0,
    currentDraftId: null,
    currentSablonLabel: '',
    analyzedOrders: 0,
    totalOrders: 0,
    stageText: '',
    percent: 0,
    retryAttempt: 0,
    maxRetries: MAX_API_RETRIES,
    retryCountdown: 0,
    errorMessage: '',
    completedCount: 0,
    dismissedFromNavbar: false
  });

  function resetQueueMeta() {
    aiQueue.running = false;
    aiQueue.stopRequested = false;
    aiQueue.status = 'idle';
    aiQueue.mode = 'all';
    aiQueue.currentPos = 0;
    aiQueue.totalInQueue = 0;
    aiQueue.currentDraftId = null;
    aiQueue.currentSablonLabel = '';
    aiQueue.analyzedOrders = 0;
    aiQueue.totalOrders = 0;
    aiQueue.stageText = '';
    aiQueue.percent = 0;
    aiQueue.retryAttempt = 0;
    aiQueue.retryCountdown = 0;
    aiQueue.errorMessage = '';
    aiQueue.completedCount = 0;
    aiQueue.dismissedFromNavbar = false;
  }

  function draftHasSablonFiles(draft) {
    if (!draft) return false;
    var stagedCount = Array.isArray(draft.stagedFiles) ? draft.stagedFiles.length : 0;
    var removedIds = Array.isArray(draft.removedFileIds) ? draft.removedFileIds : [];
    var keptCount = (Array.isArray(draft.existingFiles) ? draft.existingFiles : []).filter(function (f) {
      return f && f.fileId && removedIds.indexOf(f.fileId) === -1;
    }).length;
    return stagedCount + keptCount > 0;
  }

  function addDraft() {
    if (formState.mode === 'edit' || formState.savingAll) return null;
    var d = makeSablonDraft();
    formState.drafts.push(d);
    return d;
  }

  function removeDraft(idx) {
    if (formState.mode === 'edit' || formState.savingAll || aiQueue.running) return;
    if (formState.drafts.length <= 1) return;
    var target = formState.drafts[idx];
    revokeDraftPreviewUrls(target);
    formState.drafts.splice(idx, 1);
  }

  function resetToCreate() {
    if (aiQueue.running) return;
    revokeAllDrafts();
    formState.mode = 'create';
    formState.editingSablon = null;
    formState.drafts = [makeSablonDraft()];
    formState.savingAll = false;
    formState.saveProgressText = '';
    formState.globalError = '';
    resetQueueMeta();
  }

  function loadForEdit(sablon, pesananMap) {
    if (aiQueue.running || !sablon) return false;
    revokeAllDrafts();
    var pMap = pesananMap || {};

    var blocks = (Array.isArray(sablon.pesananItems) ? sablon.pesananItems : []).map(function (item) {
      var order = pMap[item.pesananId] || {
        id: item.pesananId,
        namaPemesan: item.namaPemesan,
        namaProduk: item.namaProduk,
        jumlahProduk: item.jumlahProduk || 0,
        namaSisi: Object.keys(item.sisiQuantities || {})
      };
      var slots = global.ZcpSablonService
        ? global.ZcpSablonService.buildOrderSablonSlots(order)
        : [];
      var slotKeyMap = {};
      slots.forEach(function (sl) {
        slotKeyMap[sl.key] = true;
      });

      var sisiMap = {};
      slots.forEach(function (sl) {
        sisiMap[sl.key] = Number(item.sisiQuantities && item.sisiQuantities[sl.key]) || 0;
      });

      var legacyExtraSlots = [];
      var oldSq = item.sisiQuantities || {};
      var oldSlotMap = item.sisiSlotMap || {};
      Object.keys(oldSq).forEach(function (oldKey) {
        if (!slotKeyMap[oldKey] && (Number(oldSq[oldKey]) || 0) > 0) {
          var members =
            Array.isArray(oldSlotMap[oldKey]) && oldSlotMap[oldKey].length
              ? oldSlotMap[oldKey]
              : [oldKey];
          legacyExtraSlots.push({
            key: oldKey,
            label: oldKey,
            sides: members
          });
          sisiMap[oldKey] = Number(oldSq[oldKey]) || 0;
        }
      });

      var block = makeOrderBlock();
      block.selectedPesananId = item.pesananId || '';
      block.sisiInputs = sisiMap;
      block.legacyExtraSlots = legacyExtraSlots;
      return block;
    });

    var draft = makeSablonDraft();
    draft.namaSablon = sablon.namaSablon || '';
    draft.jumlahPerulangan = Number(sablon.jumlahPerulangan) || 1;
    draft.catatan = sablon.catatan || '';
    draft.existingFiles = Array.isArray(sablon.fileSablon)
      ? sablon.fileSablon.map(function (f) {
          return Object.assign({}, f);
        })
      : [];
    draft.removedFileIds = [];
    draft.stagedFiles = [];
    draft.orderBlocks = blocks.length ? blocks : [makeOrderBlock()];

    formState.mode = 'edit';
    formState.editingSablon = sablon;
    formState.drafts = [draft];
    formState.savingAll = false;
    formState.saveProgressText = '';
    formState.globalError = '';
    resetQueueMeta();
    return true;
  }

  function hasUnsavedCreateDrafts() {
    if (formState.mode !== 'create') return false;
    if (aiQueue.running) return true;
    if (formState.drafts.length > 1) return true;
    var first = formState.drafts[0];
    if (!first) return false;
    if ((first.namaSablon || '').trim()) return true;
    if ((first.catatan || '').trim()) return true;
    if (first.stagedFiles && first.stagedFiles.length > 0) return true;
    if (
      first.orderBlocks &&
      first.orderBlocks.some(function (b) {
        return Boolean(b.selectedPesananId);
      })
    ) {
      return true;
    }
    if (first.aiState && first.aiState.status === 'done') return true;
    return false;
  }

  function nextStagedLocalId() {
    return ++stagedSeq;
  }

  function findDraftByLocalId(localId) {
    for (var i = 0; i < formState.drafts.length; i++) {
      if (formState.drafts[i].localId === localId) {
        return { draft: formState.drafts[i], index: i };
      }
    }
    return null;
  }

  /**
   * Memfilter pesanan aktif yang layak dianalisis AI:
   * - Status belum selesai (!order.statusSelesai)
   * - Memiliki file design
   * - Progres sablon seluruh sisinya BELUM mencapai 100% (lewati pesanan yang sudah 100% tercetak)
   */
  function getEligibleOrdersForAi(pesananList, sablonList, excludeSablonId) {
    var orders = Array.isArray(pesananList) ? pesananList : [];
    var sablons = Array.isArray(sablonList) ? sablonList : [];
    var completedMap = {};

    for (var i = 0; i < sablons.length; i++) {
      var s = sablons[i];
      if (!s || (excludeSablonId && s.id === excludeSablonId)) continue;
      var checkedCount = Array.isArray(s.perulanganChecks)
        ? s.perulanganChecks.filter(Boolean).length
        : s.statusSelesai
        ? Math.max(1, parseInt(s.jumlahPerulangan, 10) || 1)
        : 0;
      if (checkedCount <= 0) continue;

      var items = Array.isArray(s.pesananItems) ? s.pesananItems : [];
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        var pid = item && item.pesananId;
        if (!pid) continue;
        if (!completedMap[pid]) completedMap[pid] = {};
        if (global.ZcpSablonService && global.ZcpSablonService.expandItemToSideTotals) {
          var expanded = global.ZcpSablonService.expandItemToSideTotals(item, checkedCount);
          Object.keys(expanded).forEach(function (side) {
            completedMap[pid][side] = global.ZcpSablonService.roundQty(
              (completedMap[pid][side] || 0) + (Number(expanded[side]) || 0)
            );
          });
        }
      }
    }

    var eligibleOrders = [];
    var skippedFullCount = 0;

    orders.forEach(function (order) {
      if (!order || order.statusSelesai) return;
      if (!Array.isArray(order.fileDesigns) || order.fileDesigns.length === 0) return;

      var targetQty = Number(order.jumlahProduk) || 0;
      var sides = Array.isArray(order.namaSisi) ? order.namaSisi : [];
      if (targetQty > 0 && sides.length > 0) {
        var orderTotals = completedMap[order.id] || {};
        var allSidesComplete = sides.every(function (side) {
          return (Number(orderTotals[side]) || 0) >= targetQty;
        });
        if (allSidesComplete) {
          skippedFullCount += 1;
          return;
        }
      }

      eligibleOrders.push(order);
    });

    return {
      eligibleOrders: eligibleOrders,
      skippedFullCount: skippedFullCount
    };
  }

  function sleepWithCancelCheck(ms) {
    return new Promise(function (resolve) {
      var elapsed = 0;
      var step = 250;
      function tick() {
        if (aiQueue.stopRequested || elapsed >= ms) {
          resolve();
          return;
        }
        elapsed += step;
        setTimeout(tick, step);
      }
      setTimeout(tick, Math.min(step, ms));
    });
  }

  async function runWithRetry(fn, onRetryTick) {
    var retryCount = 0;
    while (true) {
      if (aiQueue.stopRequested) {
        var cancelErr = new Error('Antrian dihentikan oleh pengguna.');
        cancelErr.cancelled = true;
        throw cancelErr;
      }
      try {
        return await fn();
      } catch (err) {
        if (aiQueue.stopRequested || (err && err.cancelled)) {
          var abortErr = new Error('Antrian dihentikan oleh pengguna.');
          abortErr.cancelled = true;
          throw abortErr;
        }
        if (retryCount >= MAX_API_RETRIES) {
          throw err;
        }
        retryCount += 1;
        for (var sec = RETRY_WAIT_SECONDS; sec >= 1; sec--) {
          if (aiQueue.stopRequested) {
            var stopErr = new Error('Antrian dihentikan oleh pengguna.');
            stopErr.cancelled = true;
            throw stopErr;
          }
          if (typeof onRetryTick === 'function') {
            onRetryTick(retryCount, sec, err);
          }
          await sleepWithCancelCheck(1000);
        }
      }
    }
  }

  async function runAiQueue(draftLocalIds, context) {
    if (aiQueue.running) return;

    var ctx = context || {};
    var aiConfig = typeof ctx.getAiConfig === 'function' ? ctx.getAiConfig() : {};
    var driveReady = typeof ctx.getDriveReady === 'function' ? ctx.getDriveReady() : false;
    var pesananList = typeof ctx.getPesananList === 'function' ? ctx.getPesananList() : [];
    var sablonList = typeof ctx.getSablonList === 'function' ? ctx.getSablonList() : [];
    var notify = typeof ctx.notify === 'function' ? ctx.notify : function () {};

    var targetIds = (Array.isArray(draftLocalIds) ? draftLocalIds : []).filter(function (id) {
      var found = findDraftByLocalId(id);
      return Boolean(found && draftHasSablonFiles(found.draft));
    });

    if (!targetIds.length) {
      if (global.ZcpAlert) {
        global.ZcpAlert.warning('Upload minimal 1 file sablon terlebih dahulu sebelum menjalankan AI.');
      }
      return;
    }

    if (!aiConfig || !String(aiConfig.geminiApiKey || '').trim()) {
      if (global.ZcpAlert) {
        global.ZcpAlert.warning(
          'API Key Gemini belum diatur. Minta Superadmin mengisinya di menu Pengaturan.'
        );
      }
      return;
    }

    if (!driveReady) {
      if (global.ZcpAlert) {
        global.ZcpAlert.warning(
          'Google Apps Script URL (gasUrl) belum dikonfigurasi sehingga file desain pesanan dari Google Drive belum dapat dibaca.'
        );
      }
      return;
    }

    var excludeSablonId =
      formState.mode === 'edit' && formState.editingSablon ? formState.editingSablon.id : '';
    var eligibility = getEligibleOrdersForAi(pesananList, sablonList, excludeSablonId);
    var eligibleOrders = eligibility.eligibleOrders;
    var skippedFullCount = eligibility.skippedFullCount;

    if (!eligibleOrders.length) {
      if (global.ZcpAlert) {
        global.ZcpAlert.info(
          skippedFullCount > 0
            ? 'Semua pesanan belum selesai yang memiliki file desain (' +
                skippedFullCount +
                ' pesanan) progres sablonnya sudah mencapai 100%, sehingga dilewati.'
            : 'Tidak ada pesanan berstatus belum selesai yang memiliki file desain untuk dicocokkan.',
          'Tidak Ada Pesanan Untuk Dianalisis'
        );
      }
      return;
    }

    var pesananMap = {};
    pesananList.forEach(function (o) {
      if (o && o.id) pesananMap[o.id] = o;
    });

    aiQueue.running = true;
    aiQueue.stopRequested = false;
    aiQueue.status = 'running';
    aiQueue.mode = targetIds.length > 1 || ctx.queueMode === 'all' ? 'all' : 'single';
    aiQueue.currentPos = 0;
    aiQueue.totalInQueue = targetIds.length;
    aiQueue.currentDraftId = null;
    aiQueue.currentSablonLabel = '';
    aiQueue.analyzedOrders = 0;
    aiQueue.totalOrders = eligibleOrders.length;
    aiQueue.stageText =
      'Menyiapkan thumbnail desain dari ' + eligibleOrders.length + ' pesanan aktif...';
    aiQueue.percent = 3;
    aiQueue.retryAttempt = 0;
    aiQueue.retryCountdown = 0;
    aiQueue.errorMessage = '';
    aiQueue.completedCount = 0;
    aiQueue.dismissedFromNavbar = false;

    // Tandai seluruh draft target sebagai queued
    targetIds.forEach(function (id) {
      var found = findDraftByLocalId(id);
      if (!found) return;
      found.draft.formError = '';
      found.draft.aiState = {
        status: 'queued',
        percent: 0,
        analyzedOrders: 0,
        totalOrders: eligibleOrders.length,
        stageText: 'Menunggu antrian AI...',
        retryAttempt: 0,
        retryCountdown: 0,
        errorMessage: '',
        result: null
      };
    });

    try {
      // Tahap 1: Ambil thumbnail w400 pesanan aktif 1x (IndexedDB cache + fetchAll paralel)
      var designIds = [];
      eligibleOrders.forEach(function (order) {
        (order.fileDesigns || []).forEach(function (fd) {
          if (fd && fd.fileId) designIds.push(fd.fileId);
        });
      });

      var designFilesMap = await runWithRetry(
        function () {
          return global.ZcpDriveService.fetchFilesBase64(
            designIds,
            function (prog) {
              aiQueue.stageText =
                'Mengambil gambar desain (' +
                prog.fetched +
                '/' +
                prog.total +
                ' file)...';
              var firstTarget = findDraftByLocalId(targetIds[0]);
              if (firstTarget) {
                firstTarget.draft.aiState.stageText = aiQueue.stageText;
              }
            },
            { mode: 'thumb', thumbSize: 'w400' }
          );
        },
        function (attempt, sec) {
          aiQueue.retryAttempt = attempt;
          aiQueue.retryCountdown = sec;
          aiQueue.stageText =
            'Gagal mengambil file Drive, mencoba lagi dalam ' +
            sec +
            ' detik (percobaan ' +
            attempt +
            '/' +
            MAX_API_RETRIES +
            ')...';
        }
      );

      aiQueue.retryAttempt = 0;
      aiQueue.retryCountdown = 0;

      var readableOrders = eligibleOrders.filter(function (order) {
        return (order.fileDesigns || []).some(function (fd) {
          return Boolean(fd && fd.fileId && designFilesMap[fd.fileId] && designFilesMap[fd.fileId].base64);
        });
      });

      if (!readableOrders.length) {
        throw new Error('Tidak ada file desain pesanan aktif yang berhasil terbaca dari Google Drive.');
      }

      var totalOrders = readableOrders.length;
      aiQueue.totalOrders = totalOrders;

      // Tahap 2: Jalankan sablon satu per satu secara berurutan (queue sequential)
      for (var q = 0; q < targetIds.length; q++) {
        if (aiQueue.stopRequested) break;

        var targetId = targetIds[q];
        var foundDraft = findDraftByLocalId(targetId);
        if (!foundDraft) continue;
        var draft = foundDraft.draft;
        var label = (draft.namaSablon || '').trim() || 'Sablon #' + (foundDraft.index + 1);

        aiQueue.currentPos = q + 1;
        aiQueue.currentDraftId = draft.localId;
        aiQueue.currentSablonLabel = label;
        aiQueue.analyzedOrders = 0;

        draft.aiState.status = 'running';
        draft.aiState.percent = 5;
        draft.aiState.analyzedOrders = 0;
        draft.aiState.totalOrders = totalOrders;
        draft.aiState.stageText = 'Mengompresi salinan file sablon...';
        aiQueue.stageText = label + ': Mengompresi salinan file sablon...';

        // Siapkan salinan file sablon (resize client-side agar cepat)
        var sablonFilesPayload = [];
        for (var sfIdx = 0; sfIdx < draft.stagedFiles.length; sfIdx++) {
          var sf = draft.stagedFiles[sfIdx];
          var resized = await global.ZcpAiService.resizeImageForAi(sf.file, 1500, 0.85);
          sablonFilesPayload.push({
            name: resized.name,
            mimeType: resized.mimeType,
            base64: resized.base64
          });
        }

        var keptExisting = (draft.existingFiles || []).filter(function (f) {
          return f && f.fileId && (draft.removedFileIds || []).indexOf(f.fileId) === -1;
        });

        if (keptExisting.length) {
          var existingIds = keptExisting.map(function (kf) {
            return kf.fileId;
          });
          var existingMap = await runWithRetry(
            function () {
              return global.ZcpDriveService.fetchFilesBase64(existingIds, null, { mode: 'original' });
            },
            function (attempt, sec) {
              draft.aiState.status = 'retrying';
              draft.aiState.retryAttempt = attempt;
              draft.aiState.retryCountdown = sec;
              draft.aiState.stageText =
                'Error mengambil file sablon, mencoba lagi dalam ' +
                sec +
                ' detik (percobaan ' +
                attempt +
                '/' +
                MAX_API_RETRIES +
                ')...';
              aiQueue.retryAttempt = attempt;
              aiQueue.retryCountdown = sec;
              aiQueue.stageText = label + ': ' + draft.aiState.stageText;
            }
          );
          keptExisting.forEach(function (kf) {
            var entry = existingMap[kf.fileId];
            if (entry && entry.base64) {
              sablonFilesPayload.push({
                name: kf.originalName || kf.fileName || entry.fileName || 'sablon',
                mimeType: entry.mimeType || kf.mimeType || 'image/jpeg',
                base64: entry.base64
              });
            }
          });
        }

        if (!sablonFilesPayload.length) {
          throw new Error('File sablon pada "' + label + '" gagal dibaca.');
        }

        // Pecah analisis pesanan ke chunk kecil agar progress bar menampilkan "X dari Y pesanan" real-time
        var mergedMatchesById = {};
        var mergedMatchOrder = [];
        var mergedWarnings = [];
        var chunkSummaries = [];

        for (var cStart = 0; cStart < totalOrders; cStart += ORDER_CHUNK_SIZE) {
          if (aiQueue.stopRequested) break;

          var chunk = readableOrders.slice(cStart, cStart + ORDER_CHUNK_SIZE);
          var rangeStart = cStart + 1;
          var rangeEnd = Math.min(totalOrders, cStart + chunk.length);
          var rangeLabel =
            rangeStart === rangeEnd ? String(rangeEnd) : rangeStart + '–' + rangeEnd;

          draft.aiState.status = 'running';
          draft.aiState.retryAttempt = 0;
          draft.aiState.retryCountdown = 0;
          draft.aiState.stageText =
            'AI menganalisis gambar pada ' + rangeLabel + ' dari ' + totalOrders + ' pesanan';
          draft.aiState.percent = Math.min(
            95,
            Math.max(8, Math.round(((cStart + chunk.length * 0.35) / totalOrders) * 90) + 5)
          );

          aiQueue.retryAttempt = 0;
          aiQueue.retryCountdown = 0;
          aiQueue.stageText = label + ': ' + draft.aiState.stageText;
          aiQueue.percent = Math.min(
            98,
            Math.max(
              5,
              Math.round(((q + (cStart + chunk.length * 0.35) / totalOrders) / targetIds.length) * 100)
            )
          );

          var chunkResult = await runWithRetry(
            (function (activeChunk) {
              return function () {
                return global.ZcpAiService.analyzeSablonAutoFill({
                  aiConfig: aiConfig,
                  sablonFiles: sablonFilesPayload,
                  activeOrders: activeChunk,
                  designFilesMap: designFilesMap
                });
              };
            })(chunk),
            function (attempt, sec) {
              draft.aiState.status = 'retrying';
              draft.aiState.retryAttempt = attempt;
              draft.aiState.retryCountdown = sec;
              draft.aiState.stageText =
                'Error API, mencoba lagi dalam ' +
                sec +
                ' detik (percobaan ' +
                attempt +
                '/' +
                MAX_API_RETRIES +
                ')...';
              aiQueue.retryAttempt = attempt;
              aiQueue.retryCountdown = sec;
              aiQueue.stageText = label + ': ' + draft.aiState.stageText;
            }
          );

          draft.aiState.status = 'running';
          draft.aiState.retryAttempt = 0;
          draft.aiState.retryCountdown = 0;
          draft.aiState.analyzedOrders = rangeEnd;
          aiQueue.analyzedOrders = rangeEnd;

          if (chunkResult && chunkResult.summary) {
            chunkSummaries.push(chunkResult.summary);
          }
          if (chunkResult && Array.isArray(chunkResult.warnings)) {
            chunkResult.warnings.forEach(function (w) {
              if (w && mergedWarnings.indexOf(w) === -1) {
                mergedWarnings.push(w);
              }
            });
          }
          if (chunkResult && Array.isArray(chunkResult.matches)) {
            chunkResult.matches.forEach(function (m) {
              if (!m || !m.pesananId) return;
              if (!mergedMatchesById[m.pesananId]) {
                mergedMatchesById[m.pesananId] = {
                  pesananId: m.pesananId,
                  namaPemesan: m.namaPemesan,
                  namaProduk: m.namaProduk,
                  sisiQuantities: Object.assign({}, m.sisiQuantities || {}),
                  totalQty: Number(m.totalQty) || 0,
                  reason: m.reason || ''
                };
                mergedMatchOrder.push(m.pesananId);
              } else {
                var existingMatch = mergedMatchesById[m.pesananId];
                Object.keys(m.sisiQuantities || {}).forEach(function (k) {
                  existingMatch.sisiQuantities[k] =
                    (Number(existingMatch.sisiQuantities[k]) || 0) +
                    (Number(m.sisiQuantities[k]) || 0);
                });
                existingMatch.totalQty = Object.keys(existingMatch.sisiQuantities).reduce(
                  function (acc, k) {
                    return acc + (Number(existingMatch.sisiQuantities[k]) || 0);
                  },
                  0
                );
                if (m.reason) {
                  existingMatch.reason = existingMatch.reason
                    ? existingMatch.reason + '; ' + m.reason
                    : m.reason;
                }
              }
            });
          }
        }

        if (aiQueue.stopRequested) break;

        var finalMatches = mergedMatchOrder.map(function (pid) {
          return mergedMatchesById[pid];
        });

        var finalSummary = finalMatches.length
          ? 'Berhasil mencocokkan ' + finalMatches.length + ' pesanan dari file sablon.'
          : chunkSummaries[0] || 'Tidak ditemukan desain pesanan aktif yang cocok.';

        var finalResult = {
          summary: finalSummary,
          warnings: mergedWarnings,
          matches: finalMatches,
          skippedFullCount: skippedFullCount
        };

        draft.aiState.result = finalResult;

        if (finalMatches.length > 0) {
          var nextBlocks = [];
          finalMatches.forEach(function (match) {
            var order = pesananMap[match.pesananId];
            if (!order) return;
            var block = makeOrderBlock();
            block.selectedPesananId = order.id;
            block.legacyExtraSlots = [];
            var sisiInputs = {};
            var slots = global.ZcpSablonService
              ? global.ZcpSablonService.buildOrderSablonSlots(order)
              : [];
            slots.forEach(function (sl) {
              sisiInputs[sl.key] = Number(match.sisiQuantities && match.sisiQuantities[sl.key]) || 0;
            });
            block.sisiInputs = sisiInputs;
            nextBlocks.push(block);
          });
          if (nextBlocks.length) {
            draft.orderBlocks = nextBlocks;
          }
        }

        draft.aiState.status = 'done';
        draft.aiState.percent = 100;
        draft.aiState.analyzedOrders = totalOrders;
        draft.aiState.stageText =
          'Selesai menganalisis ' +
          totalOrders +
          ' pesanan' +
          (finalMatches.length ? ' (' + finalMatches.length + ' pesanan cocok)' : '');

        aiQueue.completedCount += 1;
        aiQueue.percent = Math.round(((q + 1) / targetIds.length) * 100);
      }

      if (aiQueue.stopRequested) {
        aiQueue.running = false;
        aiQueue.status = 'stopped';
        aiQueue.retryAttempt = 0;
        aiQueue.retryCountdown = 0;
        aiQueue.stageText = 'Antrian dihentikan oleh pengguna.';
        formState.drafts.forEach(function (d) {
          if (d.aiState && (d.aiState.status === 'queued' || d.aiState.status === 'running' || d.aiState.status === 'retrying')) {
            d.aiState.status = 'idle';
            d.aiState.stageText = '';
          }
        });
        notify({
          type: 'info',
          message: 'Antrian Isi Sisi Otomatis dihentikan.'
        });
        return;
      }

      aiQueue.running = false;
      aiQueue.status = 'done';
      aiQueue.percent = 100;
      aiQueue.retryAttempt = 0;
      aiQueue.retryCountdown = 0;
      aiQueue.stageText =
        targetIds.length > 1
          ? 'Selesai menganalisis ' + aiQueue.completedCount + ' sablon.'
          : 'Analisa AI selesai.';

      notify({
        type: 'success',
        message:
          targetIds.length > 1
            ? 'Isi sisi otomatis selesai untuk ' +
              aiQueue.completedCount +
              ' sablon. Silakan cek hasilnya sebelum menyimpan.'
            : 'Analisa AI selesai. Silakan cek pesanan terhubung sebelum menyimpan.'
      });
    } catch (err) {
      if (err && err.cancelled) {
        aiQueue.running = false;
        aiQueue.status = 'stopped';
        aiQueue.retryAttempt = 0;
        aiQueue.retryCountdown = 0;
        aiQueue.stageText = 'Antrian dihentikan oleh pengguna.';
        formState.drafts.forEach(function (d) {
          if (d.aiState && (d.aiState.status === 'queued' || d.aiState.status === 'running' || d.aiState.status === 'retrying')) {
            d.aiState.status = 'idle';
            d.aiState.stageText = '';
          }
        });
        return;
      }

      var errMsg = (err && err.message) || 'Gagal terhubung ke API Gemini.';
      if (aiQueue.currentDraftId) {
        var curFound = findDraftByLocalId(aiQueue.currentDraftId);
        if (curFound) {
          curFound.draft.aiState.status = 'error';
          curFound.draft.aiState.retryAttempt = 0;
          curFound.draft.aiState.retryCountdown = 0;
          curFound.draft.aiState.errorMessage = errMsg;
          curFound.draft.aiState.stageText =
            'Gagal setelah ' + MAX_API_RETRIES + 'x percobaan: ' + errMsg;
        }
      }

      formState.drafts.forEach(function (d) {
        if (d.aiState && d.aiState.status === 'queued') {
          d.aiState.status = 'idle';
          d.aiState.stageText = '';
        }
      });

      aiQueue.running = false;
      aiQueue.status = 'error';
      aiQueue.retryAttempt = 0;
      aiQueue.retryCountdown = 0;
      aiQueue.errorMessage = errMsg;
      aiQueue.stageText = 'Antrian dihentikan karena error API setelah ' + MAX_API_RETRIES + 'x percobaan.';

      if (global.ZcpAlert) {
        global.ZcpAlert.error(
          'Antrian Isi Sisi Otomatis dihentikan karena API tetap error setelah ' +
            MAX_API_RETRIES +
            ' kali percobaan ulang (jeda 5 detik): ' +
            errMsg,
          'Queue AI Dihentikan'
        );
      } else {
        notify({ type: 'error', message: errMsg });
      }
    }
  }

  function stopAiQueue() {
    if (!aiQueue.running) return;
    aiQueue.stopRequested = true;
    aiQueue.stageText = 'Menghentikan antrian AI...';
  }

  function dismissNavbarStatus() {
    aiQueue.dismissedFromNavbar = true;
  }

  function cleanupOnLogout() {
    aiQueue.stopRequested = true;
    aiQueue.running = false;
    revokeAllDrafts();
    formState.mode = 'create';
    formState.editingSablon = null;
    formState.drafts = [makeSablonDraft()];
    formState.savingAll = false;
    formState.saveProgressText = '';
    formState.globalError = '';
    resetQueueMeta();
  }

  global.ZcpSablonQueueService = {
    formState: formState,
    aiQueue: aiQueue,
    makeOrderBlock: makeOrderBlock,
    makeSablonDraft: makeSablonDraft,
    nextStagedLocalId: nextStagedLocalId,
    draftHasSablonFiles: draftHasSablonFiles,
    hasUnsavedCreateDrafts: hasUnsavedCreateDrafts,
    addDraft: addDraft,
    removeDraft: removeDraft,
    resetToCreate: resetToCreate,
    loadForEdit: loadForEdit,
    getEligibleOrdersForAi: getEligibleOrdersForAi,
    runAiQueue: runAiQueue,
    stopAiQueue: stopAiQueue,
    dismissNavbarStatus: dismissNavbarStatus,
    cleanupOnLogout: cleanupOnLogout
  };
})(window);
