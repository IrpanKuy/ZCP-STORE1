(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.SablonFormView = {
    name: 'SablonFormView',
    props: {
      formState: { type: Object, required: true },
      aiQueue: { type: Object, required: true },
      pesananList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      sablonList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      aiConfig: {
        type: Object,
        default: function () {
          return { geminiApiUrl: '', geminiApiKey: '' };
        }
      },
      driveReady: { type: Boolean, default: false },
      userRole: { type: String, default: 'superadmin' }
    },
    emits: [
      'back',
      'go-pesanan',
      'notify',
      'run-ai-single',
      'run-ai-all',
      'stop-ai-queue',
      'saved'
    ],
    data: function () {
      return {
        previewModalData: null
      };
    },
    computed: {
      isLocked: function () {
        return Boolean(this.formState.savingAll || this.aiQueue.running);
      },
      draftsWithFilesCount: function () {
        var svc = global.ZcpSablonQueueService;
        if (!svc) return 0;
        return this.formState.drafts.filter(function (d) {
          return svc.draftHasSablonFiles(d);
        }).length;
      },
      pesananMap: function () {
        var map = {};
        for (var i = 0; i < this.pesananList.length; i++) {
          map[this.pesananList[i].id] = this.pesananList[i];
        }
        return map;
      },
      sortedPesananOptions: function () {
        return this.pesananList.slice().sort(function (a, b) {
          if (a.statusSelesai !== b.statusSelesai) {
            return a.statusSelesai ? 1 : -1;
          }
          return (a.namaPemesan || '').localeCompare(b.namaPemesan || '');
        });
      },
      completedQtyMap: function () {
        var totals = {};
        for (var i = 0; i < this.sablonList.length; i++) {
          var s = this.sablonList[i];
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
            if (!totals[pid]) totals[pid] = {};
            var expanded = global.ZcpSablonService.expandItemToSideTotals(item, checkedCount);
            Object.keys(expanded).forEach(function (side) {
              totals[pid][side] = global.ZcpSablonService.roundQty(
                (totals[pid][side] || 0) + (Number(expanded[side]) || 0)
              );
            });
          }
        }
        return totals;
      }
    },
    methods: {
      formatFileSize: function (bytes) {
        return global.ZcpPesananService
          ? global.ZcpPesananService.formatFileSize(bytes)
          : String(bytes || 0) + ' B';
      },
      draftHasFiles: function (draft) {
        return global.ZcpSablonQueueService
          ? global.ZcpSablonQueueService.draftHasSablonFiles(draft)
          : false;
      },
      addSablonDraft: function () {
        if (this.formState.mode === 'edit' || this.isLocked) return;
        global.ZcpSablonQueueService.addDraft();
      },
      removeSablonDraft: function (idx) {
        if (this.formState.mode === 'edit' || this.isLocked) return;
        global.ZcpSablonQueueService.removeDraft(idx);
      },
      resetDraftFormIfEmpty: function () {
        if (this.isLocked || this.formState.mode === 'edit') return;
        var self = this;
        if (global.ZcpAlert && global.ZcpAlert.confirm) {
          global.ZcpAlert.confirm({
            title: 'Reset Form Buat Sablon',
            message: 'Kosongkan semua input sablon pada halaman ini?',
            confirmText: 'Reset Form',
            variant: 'danger',
            onConfirm: function () {
              global.ZcpSablonQueueService.resetToCreate();
              self.$emit('notify', {
                type: 'info',
                message: 'Form Buat Sablon telah direset.'
              });
            }
          });
        }
      },
      getDraftMultiplier: function (draft) {
        return Math.max(1, parseInt(draft && draft.jumlahPerulangan, 10) || 1);
      },
      getOrderSlots: function (order, block) {
        var slots = global.ZcpSablonService.buildOrderSablonSlots(order);
        var seen = {};
        slots.forEach(function (sl) {
          seen[sl.key] = true;
        });
        if (block && Array.isArray(block.legacyExtraSlots)) {
          block.legacyExtraSlots.forEach(function (sl) {
            if (!seen[sl.key]) {
              seen[sl.key] = true;
              slots.push(sl);
            }
          });
        }
        return slots;
      },
      addOrderBlock: function (draft) {
        if (this.isLocked) return;
        draft.orderBlocks.push(global.ZcpSablonQueueService.makeOrderBlock());
      },
      removeOrderBlock: function (draft, idx) {
        if (this.isLocked || draft.orderBlocks.length <= 1) return;
        draft.orderBlocks.splice(idx, 1);
      },
      isOrderUsedInOtherBlock: function (draft, orderId, currentBlockIdx) {
        for (var i = 0; i < draft.orderBlocks.length; i++) {
          if (i !== currentBlockIdx && draft.orderBlocks[i].selectedPesananId === orderId) {
            return true;
          }
        }
        return false;
      },
      filteredOrderOptions: function (block) {
        var q = (block.searchText || '').trim().toLowerCase();
        if (!q) return this.sortedPesananOptions;
        return this.sortedPesananOptions.filter(function (order) {
          return (
            (order.namaPemesan || '').toLowerCase().indexOf(q) !== -1 ||
            (order.namaProduk || '').toLowerCase().indexOf(q) !== -1 ||
            (order.namaTemplateSisi || '').toLowerCase().indexOf(q) !== -1 ||
            (order.namaExpedisi || '').toLowerCase().indexOf(q) !== -1
          );
        });
      },
      openBlockDropdown: function (draft, block) {
        draft.orderBlocks.forEach(function (b) {
          if (b.localId !== block.localId) b.dropdownOpen = false;
        });
        block.dropdownOpen = true;
      },
      selectOrderForBlock: function (draft, block, blockIdx, order) {
        if (this.isOrderUsedInOtherBlock(draft, order.id, blockIdx)) return;
        block.selectedPesananId = order.id;
        block.searchText = '';
        block.dropdownOpen = false;
        block.legacyExtraSlots = [];

        var sisiInputs = {};
        var slots = global.ZcpSablonService.buildOrderSablonSlots(order);
        for (var i = 0; i < slots.length; i++) {
          sisiInputs[slots[i].key] = 0;
        }
        block.sisiInputs = sisiInputs;
      },
      clearOrderBlockSelection: function (block) {
        if (this.isLocked) return;
        block.selectedPesananId = '';
        block.sisiInputs = {};
        block.legacyExtraSlots = [];
        block.searchText = '';
        block.dropdownOpen = true;
      },
      getOrderForBlock: function (block) {
        if (!block.selectedPesananId) return null;
        if (this.pesananMap[block.selectedPesananId]) {
          return this.pesananMap[block.selectedPesananId];
        }
        var editing = this.formState.editingSablon;
        if (editing && Array.isArray(editing.pesananItems)) {
          var found = editing.pesananItems.find(function (p) {
            return p.pesananId === block.selectedPesananId;
          });
          if (found) {
            return {
              id: found.pesananId,
              namaPemesan: found.namaPemesan,
              namaProduk: found.namaProduk,
              jumlahProduk: found.jumlahProduk || 0,
              namaSisi: Object.keys(found.sisiQuantities || {}),
              fileDesigns: [],
              deletedFromMaster: true
            };
          }
        }
        return null;
      },
      hasOrderDesignFiles: function (order) {
        return Boolean(order && Array.isArray(order.fileDesigns) && order.fileDesigns.length > 0);
      },
      openOrderDesignPreview: function (order) {
        if (!order || !this.hasOrderDesignFiles(order)) {
          this.$emit('notify', {
            type: 'info',
            message: 'Pesanan "' + ((order && order.namaPemesan) || 'terpilih') + '" belum memiliki file desain.'
          });
          return;
        }
        this.previewModalData = {
          title: 'File Design — ' + (order.namaPemesan || 'Pesanan'),
          subtitle:
            (order.namaProduk || '') +
            ' • Target ' +
            (order.jumlahProduk || 0) +
            ' pcs • ' +
            order.fileDesigns.length +
            ' file',
          files: order.fileDesigns
        };
      },
      openSablonFilePreview: function (file, label) {
        if (!file) return;
        this.previewModalData = {
          title: 'Preview File Sablon — ' + (label || 'Sablon'),
          subtitle: file.originalName || file.fileName || file.name || '',
          files: [file]
        };
      },
      closePreviewModal: function () {
        this.previewModalData = null;
      },
      checkedCount: function (sablon) {
        if (!Array.isArray(sablon.perulanganChecks)) return 0;
        return sablon.perulanganChecks.filter(Boolean).length;
      },
      getOtherCompletedForSide: function (pesananId, sideName) {
        var targetOrder = this.pesananMap[pesananId];
        if (targetOrder && targetOrder.anggapSablonSelesai) {
          return Number(targetOrder.jumlahProduk) || 0;
        }
        var totalCompleted =
          (this.completedQtyMap[pesananId] && Number(this.completedQtyMap[pesananId][sideName])) ||
          0;
        if (this.formState.mode === 'edit' && this.formState.editingSablon) {
          var prevChecked = this.checkedCount(this.formState.editingSablon);
          if (prevChecked > 0) {
            var prevItems = Array.isArray(this.formState.editingSablon.pesananItems)
              ? this.formState.editingSablon.pesananItems
              : [];
            var prevItem = prevItems.find(function (it) {
              return it.pesananId === pesananId;
            });
            if (prevItem) {
              var expandedSelf = global.ZcpSablonService.expandItemToSideTotals(
                prevItem,
                prevChecked
              );
              totalCompleted -= Number(expandedSelf[sideName]) || 0;
            }
          }
        }
        return Math.max(0, global.ZcpSablonService.roundQty(totalCompleted));
      },
      getOtherCompletedForSlot: function (orderId, slot) {
        var self = this;
        var sum = 0;
        (slot.sides || []).forEach(function (sideName) {
          sum += self.getOtherCompletedForSide(orderId, sideName);
        });
        return global.ZcpSablonService.roundQty(sum);
      },
      getSlotEffectiveTotal: function (draft, block, slotKey) {
        var inputVal = Math.max(0, parseInt(block.sisiInputs[slotKey], 10) || 0);
        return inputVal * this.getDraftMultiplier(draft);
      },
      getSlotTargetTotal: function (order, slot) {
        var base = Number(order && order.jumlahProduk) || 0;
        var countSides = Math.max(1, (slot.sides || []).length);
        return base * countSides;
      },
      getSlotOverAmount: function (draft, block, order, slot) {
        var targetTotal = this.getSlotTargetTotal(order, slot);
        if (!targetTotal) return 0;
        var otherDone = this.getOtherCompletedForSlot(order.id, slot);
        var eff = this.getSlotEffectiveTotal(draft, block, slot.key);
        return Math.max(0, global.ZcpSablonService.roundQty(otherDone + eff - targetTotal));
      },
      triggerFilePicker: function (draft) {
        if (this.isLocked) return;
        var el = document.getElementById('sablon-file-input-' + draft.localId);
        if (el) el.click();
      },
      onFileInputChange: function (draft, event) {
        var files = event && event.target && event.target.files ? event.target.files : [];
        this.stageFiles(draft, files);
        if (event && event.target) {
          event.target.value = '';
        }
      },
      onFileDrop: function (draft, event) {
        draft.isDragging = false;
        if (this.isLocked) return;
        var files =
          event && event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : [];
        this.stageFiles(draft, files);
      },
      stageFiles: function (draft, fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          try {
            global.ZcpDriveService.validateFile(file);
            var isImage = file.type === 'image/png' || file.type === 'image/jpeg';
            draft.stagedFiles.push({
              localId: global.ZcpSablonQueueService.nextStagedLocalId(),
              file: file,
              name: file.name,
              size: file.size,
              mimeType: file.type,
              previewUrl: isImage ? URL.createObjectURL(file) : ''
            });
          } catch (err) {
            this.$emit('notify', {
              type: 'error',
              message: err && err.message ? err.message : 'File tidak valid.'
            });
          }
        }
      },
      removeStagedFile: function (draft, idx) {
        if (this.isLocked) return;
        var item = draft.stagedFiles[idx];
        if (item && item.previewUrl) {
          try {
            URL.revokeObjectURL(item.previewUrl);
          } catch (e) {
            // Abaikan
          }
        }
        draft.stagedFiles.splice(idx, 1);
      },
      isMarkedForRemoval: function (draft, fileId) {
        return (draft.removedFileIds || []).indexOf(fileId) !== -1;
      },
      toggleExistingFileRemoval: function (draft, fileId) {
        if (this.isLocked) return;
        var idx = draft.removedFileIds.indexOf(fileId);
        if (idx === -1) {
          draft.removedFileIds.push(fileId);
        } else {
          draft.removedFileIds.splice(idx, 1);
        }
      },
      getDraftAiBadge: function (draft) {
        var st = draft && draft.aiState ? draft.aiState.status : 'idle';
        if (st === 'queued') return { label: 'Menunggu Antrian', cls: 'neutral' };
        if (st === 'running') return { label: 'Menganalisis AI...', cls: 'warn' };
        if (st === 'retrying') {
          return {
            label:
              'Retry ' +
              (draft.aiState.retryAttempt || 1) +
              '/5 (' +
              (draft.aiState.retryCountdown || 0) +
              'd)',
            cls: 'warn'
          };
        }
        if (st === 'done') return { label: 'AI Selesai', cls: 'active' };
        if (st === 'error') return { label: 'AI Error', cls: 'danger' };
        return null;
      },
      validateDraft: function (draft, idx) {
        draft.formError = '';
        var label = 'Sablon #' + (idx + 1);
        var namaSablon = (draft.namaSablon || '').trim();
        if (!namaSablon) {
          draft.formError = 'Nama sablon wajib diisi.';
          return label + ': Nama sablon wajib diisi.';
        }

        var perulangan = parseInt(draft.jumlahPerulangan, 10);
        if (!perulangan || perulangan < 1 || perulangan > 20) {
          draft.formError = 'Jumlah perulangan harus antara 1 sampai 20.';
          return label + ': Jumlah perulangan harus antara 1 sampai 20.';
        }

        var pesananItems = [];
        for (var i = 0; i < draft.orderBlocks.length; i++) {
          var block = draft.orderBlocks[i];
          var order = this.getOrderForBlock(block);
          if (!order) {
            draft.formError = 'Pesanan pada baris ke-' + (i + 1) + ' belum dipilih.';
            return label + ': ' + draft.formError;
          }
          var slots = this.getOrderSlots(order, block);
          var sisiQuantities = {};
          var sisiSlotMap = {};
          var sumSide = 0;
          for (var s = 0; s < slots.length; s++) {
            var sl = slots[s];
            var q = Math.max(0, parseInt(block.sisiInputs[sl.key], 10) || 0);
            sisiQuantities[sl.key] = q;
            sisiSlotMap[sl.key] = sl.sides.slice();
            sumSide += q;
          }
          if (sumSide <= 0) {
            draft.formError =
              'Isi minimal 1 jumlah sablon (> 0) untuk pesanan "' + order.namaPemesan + '".';
            return label + ': ' + draft.formError;
          }
          pesananItems.push({
            pesananId: order.id,
            namaPemesan: order.namaPemesan,
            namaProduk: order.namaProduk,
            jumlahProduk: order.jumlahProduk || 0,
            sisiQuantities: sisiQuantities,
            sisiSlotMap: sisiSlotMap
          });
        }

        if (draft.stagedFiles.length > 0 && !this.driveReady) {
          draft.formError =
            'Konfigurasi Google Drive API belum diisi di menu Pengaturan, sehingga file sablon tidak dapat diupload.';
          return label + ': ' + draft.formError;
        }

        return {
          namaSablon: namaSablon,
          jumlahPerulangan: perulangan,
          pesananItems: pesananItems
        };
      },
      saveAllDrafts: function () {
        if (this.isLocked) return;
        this.formState.globalError = '';
        this.formState.saveProgressText = '';

        var prepared = [];
        for (var i = 0; i < this.formState.drafts.length; i++) {
          var res = this.validateDraft(this.formState.drafts[i], i);
          if (typeof res === 'string') {
            this.formState.globalError = res;
            return;
          }
          prepared.push({
            draft: this.formState.drafts[i],
            data: res
          });
        }

        var jobItems = prepared.map(function (entry) {
          var d = entry.draft;
          var rawFiles = (d.stagedFiles || [])
            .map(function (f) {
              return f && f.file ? f.file : null;
            })
            .filter(Boolean);
          var removedIds = Array.isArray(d.removedFileIds) ? d.removedFileIds.slice() : [];
          var keptExistingFiles = (d.existingFiles || [])
            .filter(function (f) {
              return f && removedIds.indexOf(f.fileId) === -1;
            })
            .map(function (f) {
              return Object.assign({}, f);
            });

          return {
            namaSablon: entry.data.namaSablon,
            jumlahPerulangan: entry.data.jumlahPerulangan,
            pesananItems: entry.data.pesananItems,
            catatan: (d.catatan || '').trim(),
            rawFiles: rawFiles,
            keptExistingFiles: keptExistingFiles,
            removedFileIds: removedIds
          };
        });

        global.ZcpSablonQueueService.enqueueSaveJob({
          mode: this.formState.mode,
          editingSablon: this.formState.editingSablon,
          driveReady: this.driveReady,
          items: jobItems
        });

        global.ZcpSablonQueueService.resetToCreate();
        this.$emit('saved');
      }
    },
    template: `
      <div class="sablon-form-page">
        <!-- Top Action Bar -->
        <div class="card sablon-form-topbar">
          <div class="sablon-form-topbar-left">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="formState.savingAll"
              @click="$emit('back')"
            >
              <span class="material-symbols-rounded" style="font-size: 18px;">arrow_back</span>
              <span>Kembali</span>
            </button>

            <div>
              <h2 style="margin: 0; font-size: 17px; font-weight: 700;">
                {{ formState.mode === 'edit' ? 'Edit Data Sablon' : 'Buat Data Sablon' }}
              </h2>
              <div class="form-hint">
                {{
                  formState.mode === 'edit'
                    ? 'Perbarui detail batch sablon, file cetak, dan pesanan terhubung.'
                    : 'Anda dapat menambahkan lebih dari 1 sablon sekaligus dan menganalisis sisi otomatis.'
                }}
              </div>
            </div>
          </div>

          <div class="sablon-form-topbar-actions">
            <button
              v-if="formState.mode === 'create'"
              type="button"
              class="btn btn-secondary"
              :disabled="isLocked"
              @click="addSablonDraft"
            >
              <span class="material-symbols-rounded" style="font-size: 18px;">add</span>
              <span>Tambah Sablon</span>
            </button>

            <button
              type="button"
              class="btn btn-primary"
              :disabled="isLocked || !draftsWithFilesCount"
              @click="$emit('run-ai-all')"
            >
              <span v-if="aiQueue.running" class="spinner spinner-sm"></span>
              <span v-else class="material-symbols-rounded" style="font-size: 18px;">auto_awesome</span>
              <span>
                {{
                  aiQueue.running
                    ? 'Memproses Queue AI...'
                    : 'Isi Sisi Otomatis Semua Sablon' + (draftsWithFilesCount > 1 ? ' (' + draftsWithFilesCount + ')' : '')
                }}
              </span>
            </button>

            <button
              v-if="aiQueue.running"
              type="button"
              class="btn btn-danger-outline"
              @click="$emit('stop-ai-queue')"
            >
              <span class="material-symbols-rounded" style="font-size: 18px;">stop_circle</span>
              <span>Hentikan Queue</span>
            </button>

            <button
              v-if="formState.mode === 'create'"
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="isLocked"
              title="Kosongkan seluruh form"
              @click="resetDraftFormIfEmpty"
            >
              Reset
            </button>
          </div>
        </div>

        <!-- Peringatan belum ada pesanan -->
        <div
          v-if="!pesananList.length && formState.mode === 'create'"
          class="alert alert-warning"
          style="margin-bottom: 16px;"
        >
          <span class="material-symbols-rounded">warning</span>
          <div style="flex: 1;">
            <strong>Belum ada data pesanan.</strong>
            <div>Buat pesanan terlebih dahulu di menu Pesanan agar bisa dihubungkan ke sablon.</div>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              style="margin-top: 8px;"
              @click="$emit('go-pesanan')"
            >
              Buka Menu Pesanan
            </button>
          </div>
        </div>

        <!-- Banner Progress Global Queue AI -->
        <div
          v-if="aiQueue.status === 'running' || aiQueue.status === 'done' || aiQueue.status === 'error'"
          class="sablon-queue-banner"
          :class="'is-' + aiQueue.status"
        >
          <div class="sablon-queue-banner-head">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
              <span v-if="aiQueue.status === 'running'" class="spinner spinner-sm"></span>
              <span v-else class="material-symbols-rounded" style="font-size: 20px;">
                {{ aiQueue.status === 'error' ? 'error' : 'task_alt' }}
              </span>
              <div style="min-width: 0;">
                <div style="font-size: 13.5px; font-weight: 700;">
                  <template v-if="aiQueue.status === 'running'">
                    Queue AI Berjalan — Sablon {{ aiQueue.currentPos || 1 }} dari {{ aiQueue.totalInQueue || 1 }}
                    <span v-if="aiQueue.currentSablonLabel">({{ aiQueue.currentSablonLabel }})</span>
                  </template>
                  <template v-else-if="aiQueue.status === 'done'">
                    Queue Isi Sisi Otomatis Selesai
                  </template>
                  <template v-else>
                    Queue Isi Sisi Otomatis Dihentikan
                  </template>
                </div>
                <div class="form-hint" style="margin-top: 2px;">
                  {{ aiQueue.stageText }}
                  <span v-if="aiQueue.status === 'running'">
                    • Anda dapat berpindah halaman lain sembari menunggu, progres tetap berjalan di kanan atas.
                  </span>
                </div>
              </div>
            </div>
            <div style="font-size: 13px; font-weight: 700; flex-shrink: 0;">
              {{ aiQueue.percent }}%
            </div>
          </div>
          <div class="ai-progress-track" style="margin-top: 8px;">
            <div
              class="ai-progress-fill"
              :class="{
                retrying: aiQueue.retryCountdown > 0,
                done: aiQueue.status === 'done',
                error: aiQueue.status === 'error'
              }"
              :style="{ width: Math.max(3, Math.min(100, Number(aiQueue.percent) || 0)) + '%' }"
            ></div>
          </div>
        </div>

        <!-- Global Error -->
        <div v-if="formState.globalError" class="alert alert-danger" role="alert" style="margin-bottom: 16px;">
          <span class="material-symbols-rounded">error</span>
          <div>{{ formState.globalError }}</div>
        </div>

        <!-- Daftar Form Sablon (Multi-Sablon) -->
        <div class="sablon-drafts-stack">
          <section
            v-for="(draft, dIdx) in formState.drafts"
            :key="draft.localId"
            class="card sablon-draft-card"
          >
            <div class="sablon-draft-header">
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <span class="badge-count">Sablon #{{ dIdx + 1 }}</span>
                <strong style="font-size: 15px;">
                  {{ (draft.namaSablon || '').trim() || 'Draft Sablon Baru' }}
                </strong>
                <span
                  v-if="getDraftAiBadge(draft)"
                  class="status-badge"
                  :class="getDraftAiBadge(draft).cls"
                >
                  {{ getDraftAiBadge(draft).label }}
                </span>
              </div>

              <button
                v-if="formState.mode === 'create' && formState.drafts.length > 1"
                type="button"
                class="btn btn-ghost btn-sm"
                style="color: var(--accent-danger);"
                :disabled="isLocked"
                @click="removeSablonDraft(dIdx)"
              >
                <span class="material-symbols-rounded" style="font-size: 17px;">delete</span>
                <span>Hapus Sablon Ini</span>
              </button>
            </div>

            <div class="sablon-draft-body">
              <div v-if="draft.formError" class="alert alert-danger" role="alert" style="margin-bottom: 14px;">
                <span class="material-symbols-rounded">error</span>
                <div>{{ draft.formError }}</div>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label" :for="'sablon-nama-' + draft.localId">
                    Nama Sablon <span class="required">*</span>
                  </label>
                  <input
                    :id="'sablon-nama-' + draft.localId"
                    v-model="draft.namaSablon"
                    type="text"
                    class="form-control"
                    placeholder="Contoh: Film Sablon Plastisol Logo ZCP"
                    :disabled="isLocked"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label" :for="'sablon-perulangan-' + draft.localId">
                    Jumlah Perulangan Print <span class="required">*</span>
                  </label>
                  <input
                    :id="'sablon-perulangan-' + draft.localId"
                    v-model.number="draft.jumlahPerulangan"
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    class="form-control"
                    :disabled="isLocked"
                  />
                  <span class="form-hint">
                    Setiap 1x print mencetak jumlah sisi di bawah. Total hasil = jumlah sisi × {{ getDraftMultiplier(draft) }} kali print.
                  </span>
                </div>
              </div>

              <!-- 1. Multi Upload File Sablon (di atas Pesanan Terhubung) -->
              <div class="form-group">
                <label class="form-label">Upload File Sablon (PNG, JPG, PDF)</label>

                <div v-if="!driveReady" class="alert alert-warning" style="margin-bottom: 10px;">
                  <span class="material-symbols-rounded">cloud_off</span>
                  <div>
                    Konfigurasi Google Drive API belum diisi di menu <strong>Pengaturan</strong>.
                    Data sablon tetap bisa disimpan tanpa file.
                  </div>
                </div>

                <input
                  :id="'sablon-file-input-' + draft.localId"
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.pdf"
                  style="display: none;"
                  @change="onFileInputChange(draft, $event)"
                />

                <div
                  class="upload-dropzone"
                  :class="{ dragging: draft.isDragging }"
                  @click="triggerFilePicker(draft)"
                  @dragover.prevent="draft.isDragging = true"
                  @dragleave.prevent="draft.isDragging = false"
                  @drop.prevent="onFileDrop(draft, $event)"
                >
                  <span class="material-symbols-rounded">cloud_upload</span>
                  <div class="upload-dropzone-title">Klik atau seret file sablon ke sini</div>
                  <div class="upload-dropzone-sub">
                    Support PNG, JPG/JPEG, PDF (maks. 100 MB per file) — disimpan ke Google Drive
                  </div>
                </div>

                <!-- File Tersimpan (Edit mode) -->
                <div v-if="draft.existingFiles.length" class="file-preview-list">
                  <div
                    v-for="ef in draft.existingFiles"
                    :key="ef.fileId"
                    class="file-preview-item"
                    :class="{ 'marked-remove': isMarkedForRemoval(draft, ef.fileId) }"
                  >
                    <div class="file-preview-left">
                      <img
                        v-if="ef.mimeType !== 'application/pdf' && ef.previewUrl"
                        :src="ef.previewUrl"
                        :alt="ef.originalName"
                        class="file-thumb"
                      />
                      <div v-else class="file-thumb">
                        <span class="material-symbols-rounded">picture_as_pdf</span>
                      </div>
                      <div class="file-meta">
                        <div class="file-name">{{ ef.originalName || ef.fileName }}</div>
                        <div class="file-size">Tersimpan di Drive • {{ formatFileSize(ef.size) }}</div>
                      </div>
                    </div>
                    <div class="action-group">
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        @click="openSablonFilePreview(ef, draft.namaSablon)"
                      >
                        Lihat
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm"
                        :class="isMarkedForRemoval(draft, ef.fileId) ? 'btn-secondary' : 'btn-danger'"
                        :disabled="isLocked"
                        @click="toggleExistingFileRemoval(draft, ef.fileId)"
                      >
                        {{ isMarkedForRemoval(draft, ef.fileId) ? 'Batal Hapus' : 'Hapus' }}
                      </button>
                    </div>
                  </div>
                </div>

                <!-- File Baru Siap Upload -->
                <div v-if="draft.stagedFiles.length" class="file-preview-list">
                  <div
                    v-for="(sf, sfIdx) in draft.stagedFiles"
                    :key="sf.localId"
                    class="file-preview-item"
                  >
                    <div class="file-preview-left">
                      <img
                        v-if="sf.previewUrl"
                        :src="sf.previewUrl"
                        :alt="sf.name"
                        class="file-thumb"
                        style="cursor: pointer;"
                        title="Klik untuk preview"
                        @click="openSablonFilePreview(sf, draft.namaSablon)"
                      />
                      <div v-else class="file-thumb">
                        <span class="material-symbols-rounded">picture_as_pdf</span>
                      </div>
                      <div class="file-meta">
                        <div class="file-name">{{ sf.name }}</div>
                        <div class="file-size">Siap diupload • {{ formatFileSize(sf.size) }}</div>
                      </div>
                    </div>
                    <div class="action-group">
                      <button
                        v-if="sf.previewUrl"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        @click="openSablonFilePreview(sf, draft.namaSablon)"
                      >
                        Lihat
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-icon"
                        :disabled="isLocked"
                        aria-label="Hapus file"
                        @click="removeStagedFile(draft, sfIdx)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 19px;">delete</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Bar Isi Sisi Otomatis (Per Sablon) -->
                <div class="sablon-ai-bar">
                  <div style="flex: 1; min-width: 220px;">
                    <div style="font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                      <span class="material-symbols-rounded" style="font-size: 18px; color: var(--accent-info);">auto_awesome</span>
                      <span>Isi Sisi Otomatis dengan AI Gemini</span>
                    </div>
                    <div class="form-hint">
                      {{
                        (draft.aiState && draft.aiState.stageText)
                          ? draft.aiState.stageText
                          : 'Analisa file sablon di atas, hitung total desain yang sama, lalu cocokkan ke pesanan yang belum selesai.'
                      }}
                    </div>
                  </div>

                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="isLocked || !draftHasFiles(draft)"
                    @click="$emit('run-ai-single', draft.localId)"
                  >
                    <span
                      v-if="draft.aiState && (draft.aiState.status === 'running' || draft.aiState.status === 'retrying')"
                      class="spinner spinner-sm"
                    ></span>
                    <span v-else class="material-symbols-rounded" style="font-size: 17px;">smart_toy</span>
                    <span>
                      {{
                        (draft.aiState && (draft.aiState.status === 'running' || draft.aiState.status === 'retrying'))
                          ? 'Menganalisa...'
                          : 'Isi Sisi Otomatis'
                      }}
                    </span>
                  </button>
                </div>

                <!-- Progress Detail Per-Sablon -->
                <div
                  v-if="draft.aiState && (draft.aiState.status === 'queued' || draft.aiState.status === 'running' || draft.aiState.status === 'retrying')"
                  class="ai-progress-box"
                >
                  <div class="ai-progress-meta">
                    <span style="font-weight: 600;">{{ draft.aiState.stageText }}</span>
                    <span style="font-weight: 700;">
                      <template v-if="draft.aiState.totalOrders > 0">
                        {{ draft.aiState.analyzedOrders }}/{{ draft.aiState.totalOrders }} pesanan •
                      </template>
                      {{ draft.aiState.percent }}%
                    </span>
                  </div>
                  <div class="ai-progress-track">
                    <div
                      class="ai-progress-fill"
                      :class="{ retrying: draft.aiState.status === 'retrying' }"
                      :style="{ width: Math.max(4, Math.min(100, Number(draft.aiState.percent) || 0)) + '%' }"
                    ></div>
                  </div>
                </div>

                <!-- Error Per-Sablon -->
                <div
                  v-if="draft.aiState && draft.aiState.status === 'error'"
                  class="alert alert-danger"
                  style="margin-top: 8px;"
                >
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ draft.aiState.stageText }}</div>
                </div>

                <!-- Ringkasan Hasil Analisa AI -->
                <div v-if="draft.aiState && draft.aiState.result" class="sablon-ai-result-box">
                  <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
                    <div style="font-size: 12.5px; font-weight: 700;">
                      Hasil Analisa AI: {{ draft.aiState.result.summary }}
                    </div>
                    <button
                      type="button"
                      class="btn btn-ghost btn-icon-sm"
                      aria-label="Tutup ringkasan AI"
                      @click="draft.aiState.result = null"
                    >
                      <span class="material-symbols-rounded" style="font-size: 16px;">close</span>
                    </button>
                  </div>

                  <div
                    v-if="draft.aiState.result.skippedFullCount > 0"
                    class="form-hint"
                    style="margin-top: 4px;"
                  >
                    • {{ draft.aiState.result.skippedFullCount }} pesanan aktif dilewati otomatis karena progres sablonnya sudah 100%.
                  </div>

                  <div
                    v-if="draft.aiState.result.warnings && draft.aiState.result.warnings.length"
                    style="margin-top: 6px; font-size: 12px; color: var(--accent-warning);"
                  >
                    <div v-for="(w, wIdx) in draft.aiState.result.warnings" :key="wIdx">
                      • {{ w }}
                    </div>
                  </div>

                  <div
                    v-if="draft.aiState.result.matches && draft.aiState.result.matches.length"
                    style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px;"
                  >
                    <div
                      v-for="m in draft.aiState.result.matches"
                      :key="m.pesananId"
                      class="form-hint"
                      style="font-size: 12px;"
                    >
                      ✓ <strong>{{ m.namaPemesan }}</strong> ({{ m.namaProduk }}):
                      <span v-if="m.reason">{{ m.reason }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 2. Dynamic Multi-Order Selector -->
              <div class="form-group">
                <div class="sisi-header-row" style="margin-bottom: 8px;">
                  <label class="form-label" style="margin: 0;">
                    Pesanan Terhubung &amp; Jumlah per Sisi <span class="required">*</span>
                  </label>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="isLocked"
                    @click="addOrderBlock(draft)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 17px;">add</span>
                    <span>Tambah Pesanan</span>
                  </button>
                </div>

                <div class="sablon-blocks-wrap">
                  <div
                    v-for="(block, bIdx) in draft.orderBlocks"
                    :key="block.localId"
                    class="sablon-order-block"
                  >
                    <div class="sablon-block-head">
                      <span class="badge-count">Pesanan #{{ bIdx + 1 }}</span>
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        style="color: var(--accent-danger);"
                        :disabled="isLocked || draft.orderBlocks.length <= 1"
                        @click="removeOrderBlock(draft, bIdx)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">delete</span>
                        <span>Hapus</span>
                      </button>
                    </div>

                    <!-- Searchable Dropdown -->
                    <div v-if="!block.selectedPesananId" class="searchable-select">
                      <div class="search-box" style="width: 100%; min-width: 0;">
                        <span class="material-symbols-rounded input-icon">search</span>
                        <input
                          v-model="block.searchText"
                          type="text"
                          class="form-control"
                          placeholder="Cari nama pemesan, produk, atau template..."
                          :disabled="isLocked"
                          @focus="openBlockDropdown(draft, block)"
                        />
                      </div>

                      <div v-if="block.dropdownOpen" class="searchable-menu">
                        <div v-if="!filteredOrderOptions(block).length" class="searchable-empty">
                          Pesanan tidak ditemukan.
                        </div>
                        <button
                          v-for="order in filteredOrderOptions(block)"
                          :key="order.id"
                          type="button"
                          class="searchable-option"
                          :disabled="isOrderUsedInOtherBlock(draft, order.id, bIdx)"
                          @click="selectOrderForBlock(draft, block, bIdx, order)"
                        >
                          <div>
                            <strong>{{ order.namaPemesan }}</strong> — {{ order.namaProduk }}
                            <span v-if="order.namaTemplateSisi" class="form-hint">
                              [{{ order.namaTemplateSisi }}]
                            </span>
                            <span class="form-hint">({{ order.jumlahProduk }} pcs • {{ order.namaSisi.join(', ') }})</span>
                          </div>
                          <span
                            v-if="isOrderUsedInOtherBlock(draft, order.id, bIdx)"
                            class="form-hint"
                          >
                            Sudah dipilih
                          </span>
                          <span
                            v-else
                            class="status-badge"
                            :class="order.statusSelesai ? 'done' : 'active'"
                          >
                            {{ order.statusSelesai ? 'Selesai' : 'Aktif' }}
                          </span>
                        </button>
                      </div>
                    </div>

                    <!-- Input Qty per Sisi -->
                    <div v-else>
                      <div class="selected-order-banner">
                        <div>
                          <strong>{{ getOrderForBlock(block).namaPemesan }}</strong>
                          <span> — {{ getOrderForBlock(block).namaProduk }}</span>
                          <span
                            v-if="getOrderForBlock(block).namaTemplateSisi"
                            class="template-badge"
                            style="margin-left: 6px;"
                          >
                            {{ getOrderForBlock(block).namaTemplateSisi }}
                          </span>
                          <span class="form-hint" style="margin-left: 4px;">
                            (Target: {{ getOrderForBlock(block).jumlahProduk }} pcs/sisi)
                          </span>
                        </div>

                        <div class="action-group">
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            :disabled="!hasOrderDesignFiles(getOrderForBlock(block))"
                            :title="hasOrderDesignFiles(getOrderForBlock(block)) ? 'Lihat file desain lengkap pesanan ini' : 'Pesanan ini tidak memiliki file desain'"
                            @click="openOrderDesignPreview(getOrderForBlock(block))"
                          >
                            <span class="material-symbols-rounded" style="font-size: 16px;">image</span>
                            <span>
                              Lihat Design
                              <template v-if="hasOrderDesignFiles(getOrderForBlock(block))">
                                ({{ getOrderForBlock(block).fileDesigns.length }})
                              </template>
                            </span>
                          </button>

                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            :disabled="isLocked"
                            @click="clearOrderBlockSelection(block)"
                          >
                            Ganti Pesanan
                          </button>
                        </div>
                      </div>

                      <div class="sisi-qty-grid">
                        <div
                          v-for="slot in getOrderSlots(getOrderForBlock(block), block)"
                          :key="slot.key"
                          class="sisi-qty-card"
                        >
                          <label class="form-label" style="margin-bottom: 4px;">
                            Sisi {{ slot.label }}
                            <span class="form-hint" style="font-weight: 500;">(per 1x print)</span>
                          </label>
                          <input
                            v-model.number="block.sisiInputs[slot.key]"
                            type="number"
                            min="0"
                            step="1"
                            class="form-control"
                            :disabled="isLocked"
                          />
                          <div
                            v-if="(parseInt(block.sisiInputs[slot.key], 10) || 0) > 0"
                            class="sisi-total-preview"
                          >
                            Jumlah setelah selesai sisi {{ slot.label }} jadi {{ getSlotEffectiveTotal(draft, block, slot.key) }} pcs
                            <span v-if="getDraftMultiplier(draft) > 1">
                              ({{ parseInt(block.sisiInputs[slot.key], 10) || 0 }} × {{ getDraftMultiplier(draft) }} print)
                            </span>
                          </div>
                          <div class="form-hint" style="margin-top: 4px;">
                            Sudah di-print: {{ getOtherCompletedForSlot(getOrderForBlock(block).id, slot) }}/{{ getSlotTargetTotal(getOrderForBlock(block), slot) }}
                            • Sisa: {{ Math.max(0, getSlotTargetTotal(getOrderForBlock(block), slot) - getOtherCompletedForSlot(getOrderForBlock(block).id, slot)) }}
                          </div>
                          <div
                            v-if="getSlotOverAmount(draft, block, getOrderForBlock(block), slot) > 0"
                            class="over-warn"
                          >
                            Melebihi target (+{{ getSlotOverAmount(draft, block, getOrderForBlock(block), slot) }} pcs)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" :for="'sablon-catatan-' + draft.localId">Catatan (Opsional)</label>
                <textarea
                  :id="'sablon-catatan-' + draft.localId"
                  v-model="draft.catatan"
                  class="form-textarea"
                  placeholder="Contoh: Screen T61, tinta rubber putih 2x naik..."
                  :disabled="isLocked"
                ></textarea>
              </div>
            </div>
          </section>
        </div>

        <!-- Bottom Action Bar -->
        <div class="card sablon-form-footer-bar">
          <div>
            <button
              v-if="formState.mode === 'create'"
              type="button"
              class="btn btn-secondary"
              :disabled="isLocked"
              @click="addSablonDraft"
            >
              <span class="material-symbols-rounded" style="font-size: 18px;">add</span>
              <span>Tambah Sablon Lagi</span>
            </button>
          </div>

          <div class="action-group" style="flex-wrap: wrap;">
            <span v-if="formState.saveProgressText" class="form-hint" style="margin-right: 8px;">
              {{ formState.saveProgressText }}
            </span>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="formState.savingAll"
              @click="$emit('back')"
            >
              {{ aiQueue.running ? 'Kembali (Lanjut di Latar)' : 'Batal' }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="isLocked"
              @click="saveAllDrafts"
            >
              <span v-if="formState.savingAll" class="spinner spinner-sm"></span>
              <span>
                {{
                  formState.savingAll
                    ? 'Menyimpan...'
                    : formState.mode === 'edit'
                    ? 'Simpan Perubahan'
                    : formState.drafts.length > 1
                    ? 'Simpan Semua Sablon (' + formState.drafts.length + ')'
                    : 'Simpan Sablon'
                }}
              </span>
            </button>
          </div>
        </div>

        <file-preview-modal
          :visible="Boolean(previewModalData)"
          :title="previewModalData ? previewModalData.title : 'File Design'"
          :subtitle="previewModalData ? previewModalData.subtitle : ''"
          :files="previewModalData ? previewModalData.files : []"
          @close="closePreviewModal"
        ></file-preview-modal>
      </div>
    `
  };
})(window);
