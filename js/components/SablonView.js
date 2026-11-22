(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  var blockSeq = 1;
  var stagedSeq = 1;

  function makeOrderBlock() {
    return {
      localId: ++blockSeq,
      searchText: '',
      dropdownOpen: false,
      selectedPesananId: '',
      sisiInputs: {}
    };
  }

  global.ZcpComponents.SablonView = {
    name: 'SablonView',
    props: {
      sablonList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      pesananList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      loading: { type: Boolean, default: false },
      driveReady: { type: Boolean, default: false },
      userRole: { type: String, default: 'superadmin' },
      currentUserUid: { type: String, default: '' },
      hasMore: { type: Boolean, default: false },
      defaultPageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: ['notify', 'request-confirm', 'go-pesanan', 'load-more'],
    data: function () {
      return {
        searchQuery: '',
        statusFilter: 'all',
        currentPage: 1,
        localPageSize: this.defaultPageSize,
        busyIds: {},
        modalOpen: false,
        editingSablon: null,
        saving: false,
        uploadProgressText: '',
        formError: '',
        isDragging: false,
        form: {
          namaSablon: '',
          orderBlocks: [makeOrderBlock()],
          jumlahPerulangan: 1,
          catatan: '',
          existingFiles: [],
          removedFileIds: [],
          stagedFiles: []
        },
        previewModalOpen: false,
        previewSablon: null,
        lightboxFile: null
      };
    },
    watch: {
      defaultPageSize: function (val) {
        this.localPageSize = val;
        this.currentPage = 1;
      },
      searchQuery: function () {
        this.currentPage = 1;
      },
      statusFilter: function () {
        this.currentPage = 1;
      }
    },
    computed: {
      isKaryawan: function () {
        return this.userRole === 'karyawan';
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
      /**
       * Total qty yang sudah selesai dari seluruh sablon (dipakai untuk hitung sisa saat input).
       */
      completedQtyMap: function () {
        var totals = {};
        for (var i = 0; i < this.sablonList.length; i++) {
          var s = this.sablonList[i];
          var checkedCount = Array.isArray(s.perulanganChecks)
            ? s.perulanganChecks.filter(Boolean).length
            : (s.statusSelesai ? Math.max(1, parseInt(s.jumlahPerulangan, 10) || 1) : 0);
          if (checkedCount <= 0) continue;
          var items = Array.isArray(s.pesananItems) ? s.pesananItems : [];
          for (var j = 0; j < items.length; j++) {
            var item = items[j];
            var pid = item && item.pesananId;
            if (!pid) continue;
            if (!totals[pid]) totals[pid] = {};
            var sq = item.sisiQuantities || {};
            Object.keys(sq).forEach(function (side) {
              totals[pid][side] = (totals[pid][side] || 0) + ((Number(sq[side]) || 0) * checkedCount);
            });
          }
        }
        return totals;
      },
      activeSablonCount: function () {
        return this.sablonList.filter(function (s) {
          return !s.statusSelesai;
        }).length;
      },
      doneSablonCount: function () {
        return this.sablonList.filter(function (s) {
          return s.statusSelesai;
        }).length;
      },
      filteredList: function () {
        var q = this.searchQuery.trim().toLowerCase();
        var status = this.statusFilter;

        return this.sablonList.filter(function (sablon) {
          if (status === 'active' && sablon.statusSelesai) return false;
          if (status === 'done' && !sablon.statusSelesai) return false;
          if (!q) return true;

          var matchNama = (sablon.namaSablon || '').toLowerCase().indexOf(q) !== -1;
          var matchCatatan = (sablon.catatan || '').toLowerCase().indexOf(q) !== -1;
          var matchOrder =
            Array.isArray(sablon.pesananItems) &&
            sablon.pesananItems.some(function (item) {
              return (
                (item.namaPemesan || '').toLowerCase().indexOf(q) !== -1 ||
                (item.namaProduk || '').toLowerCase().indexOf(q) !== -1
              );
            });
          return matchNama || matchCatatan || matchOrder;
        });
      },
      paginatedList: function () {
        if (this.localPageSize === 'all') return this.filteredList;
        var size = Number(this.localPageSize) || 10;
        var start = (this.currentPage - 1) * size;
        return this.filteredList.slice(start, start + size);
      }
    },
    mounted: function () {
      window.addEventListener('keydown', this.handleKeydown);
    },
    beforeUnmount: function () {
      window.removeEventListener('keydown', this.handleKeydown);
      this.revokeAllStagedPreviews();
    },
    methods: {
      formatDate: function (ts) {
        return global.ZcpPesananService.formatDate(ts);
      },
      formatFileSize: function (bytes) {
        return global.ZcpPesananService.formatFileSize(bytes);
      },
      checkedCount: function (sablon) {
        if (!Array.isArray(sablon.perulanganChecks)) return 0;
        return sablon.perulanganChecks.filter(Boolean).length;
      },
      revokeAllStagedPreviews: function () {
        var staged = this.form.stagedFiles || [];
        for (var i = 0; i < staged.length; i++) {
          if (staged[i].previewUrl) {
            URL.revokeObjectURL(staged[i].previewUrl);
          }
        }
      },
      resetForm: function () {
        this.revokeAllStagedPreviews();
        this.editingSablon = null;
        this.formError = '';
        this.uploadProgressText = '';
        this.isDragging = false;
        this.form = {
          namaSablon: '',
          orderBlocks: [makeOrderBlock()],
          jumlahPerulangan: 1,
          catatan: '',
          existingFiles: [],
          removedFileIds: [],
          stagedFiles: []
        };
      },
      openAddModal: function () {
        if (this.isKaryawan) return;
        this.resetForm();
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.sablonNameInput) {
            this.$refs.sablonNameInput.focus();
          }
        });
      },
      openEditModal: function (sablon) {
        if (this.isKaryawan) return;
        this.resetForm();
        this.editingSablon = sablon;
        var self = this;

        var blocks = (Array.isArray(sablon.pesananItems) ? sablon.pesananItems : []).map(function (item) {
          var order = self.pesananMap[item.pesananId];
          var sisiMap = {};
          var orderSisi = order && Array.isArray(order.namaSisi)
            ? order.namaSisi
            : Object.keys(item.sisiQuantities || {});

          orderSisi.forEach(function (side) {
            sisiMap[side] = Number(item.sisiQuantities && item.sisiQuantities[side]) || 0;
          });

          var block = makeOrderBlock();
          block.selectedPesananId = item.pesananId || '';
          block.sisiInputs = sisiMap;
          block.searchText = '';
          block.dropdownOpen = false;
          return block;
        });

        this.form = {
          namaSablon: sablon.namaSablon || '',
          orderBlocks: blocks.length ? blocks : [makeOrderBlock()],
          jumlahPerulangan: Number(sablon.jumlahPerulangan) || 1,
          catatan: sablon.catatan || '',
          existingFiles: Array.isArray(sablon.fileSablon)
            ? sablon.fileSablon.map(function (f) {
                return Object.assign({}, f);
              })
            : [],
          removedFileIds: [],
          stagedFiles: []
        };

        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.sablonNameInput) {
            this.$refs.sablonNameInput.focus();
          }
        });
      },
      closeModal: function () {
        if (this.saving) return;
        this.revokeAllStagedPreviews();
        this.modalOpen = false;
      },
      addOrderBlock: function () {
        this.form.orderBlocks.push(makeOrderBlock());
      },
      removeOrderBlock: function (idx) {
        if (this.form.orderBlocks.length <= 1) return;
        this.form.orderBlocks.splice(idx, 1);
      },
      isOrderUsedInOtherBlock: function (orderId, currentBlockIdx) {
        for (var i = 0; i < this.form.orderBlocks.length; i++) {
          if (i !== currentBlockIdx && this.form.orderBlocks[i].selectedPesananId === orderId) {
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
            (order.namaExpedisi || '').toLowerCase().indexOf(q) !== -1
          );
        });
      },
      openBlockDropdown: function (block) {
        this.form.orderBlocks.forEach(function (b) {
          if (b.localId !== block.localId) b.dropdownOpen = false;
        });
        block.dropdownOpen = true;
      },
      selectOrderForBlock: function (block, blockIdx, order) {
        if (this.isOrderUsedInOtherBlock(order.id, blockIdx)) return;
        block.selectedPesananId = order.id;
        block.searchText = '';
        block.dropdownOpen = false;

        var sisiInputs = {};
        var sisiList = Array.isArray(order.namaSisi) ? order.namaSisi : [];
        for (var i = 0; i < sisiList.length; i++) {
          sisiInputs[sisiList[i]] = 0;
        }
        block.sisiInputs = sisiInputs;
      },
      clearOrderBlockSelection: function (block) {
        block.selectedPesananId = '';
        block.sisiInputs = {};
        block.searchText = '';
        block.dropdownOpen = true;
      },
      getOrderForBlock: function (block) {
        if (!block.selectedPesananId) return null;
        if (this.pesananMap[block.selectedPesananId]) {
          return this.pesananMap[block.selectedPesananId];
        }
        // Fallback snapshot jika pesanan sudah dihapus namun sedang edit sablon lama
        if (this.editingSablon && Array.isArray(this.editingSablon.pesananItems)) {
          var found = this.editingSablon.pesananItems.find(function (p) {
            return p.pesananId === block.selectedPesananId;
          });
          if (found) {
            return {
              id: found.pesananId,
              namaPemesan: found.namaPemesan,
              namaProduk: found.namaProduk,
              jumlahProduk: found.jumlahProduk || 0,
              namaSisi: Object.keys(found.sisiQuantities || {}),
              deletedFromMaster: true
            };
          }
        }
        return null;
      },
      /**
       * Menghitung berapa pcs sisi yang sudah selesai dari sablon LAIN
       * (dikurangi kontribusi sablon ini sendiri jika sedang edit dan statusnya sudah selesai).
       */
      getOtherCompletedForSide: function (pesananId, sisi) {
        var totalCompleted =
          (this.completedQtyMap[pesananId] && Number(this.completedQtyMap[pesananId][sisi])) || 0;
        if (this.editingSablon) {
          var prevChecked = this.checkedCount(this.editingSablon);
          if (prevChecked > 0) {
            var prevItems = Array.isArray(this.editingSablon.pesananItems)
              ? this.editingSablon.pesananItems
              : [];
            var prevItem = prevItems.find(function (it) {
              return it.pesananId === pesananId;
            });
            if (prevItem && prevItem.sisiQuantities) {
              totalCompleted -= (Number(prevItem.sisiQuantities[sisi]) || 0) * prevChecked;
            }
          }
        }
        return Math.max(0, totalCompleted);
      },
      getFormMultiplier: function () {
        return Math.max(1, parseInt(this.form.jumlahPerulangan, 10) || 1);
      },
      getSideEffectiveTotal: function (block, sisi) {
        var inputVal = Math.max(0, parseInt(block.sisiInputs[sisi], 10) || 0);
        return inputVal * this.getFormMultiplier();
      },
      getSideOverAmount: function (block, order, sisi) {
        if (!order || !order.jumlahProduk) return 0;
        var otherDone = this.getOtherCompletedForSide(order.id, sisi);
        var effectiveQty = this.getSideEffectiveTotal(block, sisi);
        return Math.max(0, otherDone + effectiveQty - order.jumlahProduk);
      },
      triggerFilePicker: function () {
        if (this.saving) return;
        if (this.$refs.sablonFileInput) {
          this.$refs.sablonFileInput.click();
        }
      },
      onFileInputChange: function (event) {
        var files = event && event.target && event.target.files ? event.target.files : [];
        this.stageFiles(files);
        if (event && event.target) {
          event.target.value = '';
        }
      },
      onFileDrop: function (event) {
        this.isDragging = false;
        if (this.saving) return;
        var files = event && event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : [];
        this.stageFiles(files);
      },
      stageFiles: function (fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          try {
            global.ZcpDriveService.validateFile(file);
            var isImage = file.type === 'image/png' || file.type === 'image/jpeg';
            this.form.stagedFiles.push({
              localId: ++stagedSeq,
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
      removeStagedFile: function (idx) {
        var item = this.form.stagedFiles[idx];
        if (item && item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
        this.form.stagedFiles.splice(idx, 1);
      },
      isMarkedForRemoval: function (fileId) {
        return this.form.removedFileIds.indexOf(fileId) !== -1;
      },
      toggleExistingFileRemoval: function (fileId) {
        var idx = this.form.removedFileIds.indexOf(fileId);
        if (idx === -1) {
          this.form.removedFileIds.push(fileId);
        } else {
          this.form.removedFileIds.splice(idx, 1);
        }
      },
      saveSablon: async function () {
        this.formError = '';
        this.uploadProgressText = '';

        var namaSablon = (this.form.namaSablon || '').trim();
        if (!namaSablon) {
          this.formError = 'Nama sablon wajib diisi.';
          return;
        }

        var perulangan = parseInt(this.form.jumlahPerulangan, 10);
        if (!perulangan || perulangan < 1 || perulangan > 20) {
          this.formError = 'Jumlah perulangan harus antara 1 sampai 20.';
          return;
        }

        var pesananItems = [];
        for (var i = 0; i < this.form.orderBlocks.length; i++) {
          var block = this.form.orderBlocks[i];
          var order = this.getOrderForBlock(block);
          if (!order) {
            this.formError = 'Pesanan pada baris ke-' + (i + 1) + ' belum dipilih.';
            return;
          }
          var sisiQuantities = {};
          var sumSide = 0;
          var sideNames = Array.isArray(order.namaSisi) ? order.namaSisi : Object.keys(block.sisiInputs || {});
          for (var s = 0; s < sideNames.length; s++) {
            var side = sideNames[s];
            var q = Math.max(0, parseInt(block.sisiInputs[side], 10) || 0);
            sisiQuantities[side] = q;
            sumSide += q;
          }
          if (sumSide <= 0) {
            this.formError =
              'Isi minimal 1 jumlah sablon (> 0) untuk pesanan "' + order.namaPemesan + '".';
            return;
          }
          pesananItems.push({
            pesananId: order.id,
            namaPemesan: order.namaPemesan,
            namaProduk: order.namaProduk,
            jumlahProduk: order.jumlahProduk || 0,
            sisiQuantities: sisiQuantities
          });
        }

        if (this.form.stagedFiles.length > 0 && !this.driveReady) {
          this.formError =
            'Google Apps Script (gasUrl) belum diisi di js/firebase-config.js, sehingga file sablon tidak dapat diupload.';
          return;
        }

        this.saving = true;
        var self = this;
        try {
          var uploadedFiles = [];
          if (this.form.stagedFiles.length > 0) {
            var rawFiles = this.form.stagedFiles.map(function (f) {
              return f.file;
            });
            uploadedFiles = await global.ZcpDriveService.uploadMultipleFiles(
              rawFiles,
              'sablon',
              function (prog) {
                self.uploadProgressText =
                  'Mengupload file ' + prog.current + '/' + prog.total + ': ' + prog.fileName + '...';
              }
            );
          }

          this.uploadProgressText = 'Menyimpan data sablon...';

          var keptExisting = this.form.existingFiles.filter(function (f) {
            return self.form.removedFileIds.indexOf(f.fileId) === -1;
          });
          var mergedFiles = keptExisting.concat(uploadedFiles);

          var payload = {
            namaSablon: namaSablon,
            pesananItems: pesananItems,
            jumlahPerulangan: perulangan,
            fileSablon: mergedFiles,
            catatan: this.form.catatan
          };

          if (this.editingSablon) {
            await global.ZcpSablonService.updateSablon(
              this.editingSablon.id,
              payload,
              this.editingSablon
            );

            if (this.driveReady && this.form.removedFileIds.length > 0) {
              for (var r = 0; r < this.form.removedFileIds.length; r++) {
                try {
                  await global.ZcpDriveService.deleteFile(this.form.removedFileIds[r]);
                } catch (e) {
                  // Best-effort cleanup
                }
              }
            }

            this.$emit('notify', {
              type: 'success',
              message: 'Data sablon "' + namaSablon + '" berhasil diperbarui.'
            });
          } else {
            await global.ZcpSablonService.addSablon(payload);
            this.$emit('notify', {
              type: 'success',
              message: 'Data sablon "' + namaSablon + '" berhasil ditambahkan.'
            });
          }

          this.revokeAllStagedPreviews();
          this.modalOpen = false;
        } catch (err) {
          this.formError = err && err.message ? err.message : 'Gagal menyimpan data sablon.';
        } finally {
          this.saving = false;
          this.uploadProgressText = '';
        }
      },
      canUndoSelesai: function (sablon) {
        if (!this.isKaryawan) return true;
        return Boolean(sablon.completedByUid && sablon.completedByUid === this.currentUserUid);
      },
      canToggleChildRow: function (sablon, idx) {
        if (!this.isKaryawan) return true;
        if (sablon.statusSelesai && !this.canUndoSelesai(sablon)) return false;
        var isChecked = Boolean(sablon.perulanganChecks && sablon.perulanganChecks[idx]);
        if (isChecked) {
          var meta = sablon.perulanganCheckMeta && sablon.perulanganCheckMeta[idx];
          return Boolean(meta && meta.uid === this.currentUserUid);
        }
        return true;
      },
      getChildMetaName: function (sablon, idx) {
        var meta = sablon.perulanganCheckMeta && sablon.perulanganCheckMeta[idx];
        return meta && meta.nama ? meta.nama : '';
      },
      onToggleChildCheck: async function (sablon, checkIdx) {
        if (this.busyIds[sablon.id] || !this.canToggleChildRow(sablon, checkIdx)) return;
        this.busyIds[sablon.id] = true;
        try {
          var res = await global.ZcpSablonService.toggleChildCheck(sablon, checkIdx);
          if (res.statusSelesai) {
            this.$emit('notify', {
              type: 'success',
              message:
                'Semua print "' +
                sablon.namaSablon +
                '" selesai dicetak! Progres operasional diperbarui.'
            });
          } else if (res.checked) {
            this.$emit('notify', {
              type: 'success',
              message:
                'Print ke-' +
                (checkIdx + 1) +
                ' "' +
                sablon.namaSablon +
                '" dicatat! Progres operasional bertambah.'
            });
          } else {
            this.$emit('notify', {
              type: 'info',
              message:
                'Checklist print ke-' +
                (checkIdx + 1) +
                ' "' +
                sablon.namaSablon +
                '" dibatalkan. Progres operasional disesuaikan.'
            });
          }
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal memperbarui status print.'
          });
        } finally {
          this.busyIds[sablon.id] = false;
        }
      },
      onToggleSablonSelesai: async function (sablon) {
        if (this.busyIds[sablon.id]) return;
        var nextDone = !sablon.statusSelesai;
        if (!nextDone && !this.canUndoSelesai(sablon)) {
          this.$emit('notify', {
            type: 'error',
            message:
              'Hanya ' +
              (sablon.completedByName || 'akun yang menyelesaikan') +
              ' atau Admin yang dapat membatalkan status selesai sablon ini.'
          });
          return;
        }
        this.busyIds[sablon.id] = true;
        try {
          await global.ZcpSablonService.setSablonSelesai(sablon, nextDone);
          this.$emit('notify', {
            type: nextDone ? 'success' : 'info',
            message: nextDone
              ? 'Sablon "' + sablon.namaSablon + '" selesai di-print! Progres sisi di Operasional bertambah.'
              : 'Status selesai "' + sablon.namaSablon + '" dibatalkan.'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal memperbarui status sablon.'
          });
        } finally {
          this.busyIds[sablon.id] = false;
        }
      },
      confirmDelete: function (sablon) {
        if (this.isKaryawan) return;
        var self = this;
        var hasFiles = Array.isArray(sablon.fileSablon) && sablon.fileSablon.length > 0;
        var hasChecked = this.checkedCount(sablon) > 0;
        this.$emit('request-confirm', {
          title: 'Hapus Data Sablon',
          message:
            'Hapus data sablon "' +
            sablon.namaSablon +
            '"?' +
            (hasChecked
              ? ' Karena sudah ada print yang tercatat, progres di menu Operasional akan ikut dikurangi.'
              : ''),
          confirmText: 'Hapus Sablon',
          variant: 'danger',
          onConfirm: async function () {
            await global.ZcpSablonService.deleteSablon(sablon);
            if (hasFiles && self.driveReady) {
              for (var i = 0; i < sablon.fileSablon.length; i++) {
                var fid = sablon.fileSablon[i] && sablon.fileSablon[i].fileId;
                if (fid) {
                  try {
                    await global.ZcpDriveService.deleteFile(fid);
                  } catch (e) {
                    // Best-effort cleanup
                  }
                }
              }
            }
            self.$emit('notify', {
              type: 'success',
              message: 'Data sablon "' + sablon.namaSablon + '" berhasil dihapus.'
            });
          }
        });
      },
      openPreviewModal: function (sablon) {
        this.previewSablon = sablon;
        this.previewModalOpen = true;
      },
      closePreviewModal: function () {
        this.lightboxFile = null;
        this.previewModalOpen = false;
        this.previewSablon = null;
      },
      openLightbox: function (file) {
        this.lightboxFile = file;
      },
      closeLightbox: function () {
        this.lightboxFile = null;
      },
      getHighResPreviewUrl: function (file) {
        if (!file) return '';
        return file.previewUrl || (file.fileId ? 'https://drive.google.com/thumbnail?id=' + file.fileId + '&sz=w1000' : '');
      },
      handleKeydown: function (event) {
        if (event.key === 'Escape' && this.lightboxFile) {
          this.closeLightbox();
        }
      }
    },
    template: `
      <div>
        <!-- 3 KPI Sablon -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Total Batch Sablon</div>
                <div class="kpi-value">{{ sablonList.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">print</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">Terhubung dengan data pesanan &amp; operasional</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Dalam Proses</div>
                <div class="kpi-value">{{ activeSablonCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">pending</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">Menunggu seluruh perulangan print selesai dicetak</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Sablon Selesai Print</div>
                <div class="kpi-value">{{ doneSablonCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">verified</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span style="color: var(--accent-info); font-weight: 600;">Border biru</span> • otomatis menambah progres sisi (jumlah × perulangan)
            </div>
          </div>
        </div>

        <div class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Manajemen Sablon</h2>
              <p>Catat daftar sablon yang akan dan sudah di-print, jumlah perulangan print, serta file cetak.</p>
            </div>

            <div class="panel-actions">
              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="searchQuery"
                  type="text"
                  class="form-control"
                  placeholder="Cari nama sablon atau pemesan..."
                  aria-label="Cari sablon"
                />
                <button
                  v-if="searchQuery"
                  type="button"
                  class="input-action-btn"
                  aria-label="Hapus pencarian"
                  @click="searchQuery = ''"
                >
                  <span class="material-symbols-rounded" style="font-size: 18px;">close</span>
                </button>
              </div>

              <select v-model="statusFilter" class="filter-select" aria-label="Filter status sablon">
                <option value="all">Semua Status</option>
                <option value="active">Dalam Proses</option>
                <option value="done">Selesai</option>
              </select>

              <button v-if="!isKaryawan" type="button" class="btn btn-primary" @click="openAddModal">
                <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
                <span>Tambah Sablon</span>
              </button>
            </div>
          </div>

          <div v-if="loading" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Memuat data sablon...</p>
          </div>

          <div v-else-if="!filteredList.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">print</span>
            </div>
            <h3>{{ (searchQuery || statusFilter !== 'all') ? 'Data sablon tidak ditemukan' : 'Belum ada data sablon' }}</h3>
            <p>
              {{
                (searchQuery || statusFilter !== 'all')
                  ? 'Coba ubah filter atau kata kunci pencarian di atas.'
                  : (isKaryawan ? 'Belum ada data sablon untuk diproses.' : 'Buat data sablon baru dan hubungkan ke satu atau beberapa pesanan pelanggan.')
              }}
            </p>
            <button
              v-if="!isKaryawan && !(searchQuery || statusFilter !== 'all')"
              type="button"
              class="btn btn-primary"
              @click="openAddModal"
            >
              <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
              <span>Tambah Sablon Pertama</span>
            </button>
          </div>

          <!-- Daftar Sablon: Setiap grup (1 Induk + N Anak Row) dibungkus 1 border menyatu -->
          <div v-else class="sablon-list">
            <div
              v-for="sablon in paginatedList"
              :key="sablon.id"
              class="sablon-group"
              :class="{ 'is-done': sablon.statusSelesai }"
            >
              <!-- Induk Row -->
              <div class="sablon-parent-row">
                <div class="sablon-parent-main">
                  <div class="sablon-title-row">
                    <span class="item-mini-icon">
                      <span class="material-symbols-rounded" style="font-size: 18px;">print</span>
                    </span>
                    <div>
                      <div class="sablon-name">{{ sablon.namaSablon }}</div>
                      <div class="form-hint">
                        Dibuat: {{ formatDate(sablon.createdAt) }}
                        <span v-if="sablon.catatan"> • {{ sablon.catatan }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Daftar Pesanan Terhubung & Jumlah per Sisi -->
                  <div class="sablon-linked-orders">
                    <div
                      v-for="(item, iIdx) in sablon.pesananItems"
                      :key="item.pesananId || iIdx"
                      class="sablon-linked-pill"
                    >
                      <span class="sablon-linked-name">
                        {{ item.namaPemesan }} ({{ item.namaProduk }}):
                      </span>
                      <span
                        v-for="(qty, sideName) in item.sisiQuantities"
                        :key="sideName"
                        v-show="qty > 0"
                        class="chip"
                      >
                        {{ sideName }}:
                        <strong v-if="sablon.jumlahPerulangan > 1">
                          {{ qty }} × {{ sablon.jumlahPerulangan }} = {{ qty * sablon.jumlahPerulangan }}
                        </strong>
                        <strong v-else>{{ qty }}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div class="sablon-parent-meta">
                  <button
                    v-if="sablon.fileSablon && sablon.fileSablon.length"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="openPreviewModal(sablon)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 16px;">attach_file</span>
                    <span>{{ sablon.fileSablon.length }} file</span>
                  </button>

                  <span class="badge-count">
                    {{ checkedCount(sablon) }}/{{ sablon.jumlahPerulangan }} Print
                  </span>

                  <span class="status-badge" :class="sablon.statusSelesai ? 'active' : 'warn'">
                    <span class="material-symbols-rounded" style="font-size: 15px;">
                      {{ sablon.statusSelesai ? 'verified' : 'hourglass_top' }}
                    </span>
                    <span>{{ sablon.statusSelesai ? 'Selesai' : 'Proses' }}</span>
                  </span>

                  <span v-if="sablon.statusSelesai" class="completed-by-tag">
                    <span class="material-symbols-rounded" style="font-size: 14px;">person</span>
                    <span>Selesai oleh: {{ sablon.completedByName || 'Admin' }}</span>
                  </span>
                </div>

                <div class="sablon-parent-actions">
                  <button
                    v-if="!sablon.statusSelesai || canUndoSelesai(sablon)"
                    type="button"
                    class="btn btn-sm"
                    :class="sablon.statusSelesai ? 'btn-secondary' : 'btn-info-solid'"
                    :disabled="Boolean(busyIds[sablon.id])"
                    @click="onToggleSablonSelesai(sablon)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 16px;">
                      {{ sablon.statusSelesai ? 'undo' : 'done_all' }}
                    </span>
                    <span>{{ sablon.statusSelesai ? 'Batal Selesai' : 'Selesai' }}</span>
                  </button>
                  <span v-else class="form-hint">
                    Diselesaikan oleh {{ sablon.completedByName || 'Admin' }}
                  </span>
                  <button
                    v-if="!isKaryawan"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="Boolean(busyIds[sablon.id])"
                    @click="openEditModal(sablon)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 16px;">edit</span>
                    <span>Edit</span>
                  </button>
                  <button
                    v-if="!isKaryawan"
                    type="button"
                    class="btn btn-danger btn-sm"
                    :disabled="Boolean(busyIds[sablon.id])"
                    @click="confirmDelete(sablon)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 16px;">delete</span>
                    <span>Hapus</span>
                  </button>
                </div>
              </div>

              <!-- Anak Row (Jumlah perulangan = jumlah child row menyatu di dalam border) -->
              <div class="sablon-child-list">
                <label
                  v-for="(isChecked, cIdx) in sablon.perulanganChecks"
                  :key="cIdx"
                  class="sablon-child-row"
                  :class="{ checked: isChecked }"
                >
                  <div class="sablon-child-left">
                    <span class="sablon-child-connector"></span>
                    <input
                      type="checkbox"
                      class="op-checkbox"
                      :checked="isChecked"
                      :disabled="Boolean(busyIds[sablon.id]) || !canToggleChildRow(sablon, cIdx)"
                      @change="onToggleChildCheck(sablon, cIdx)"
                    />
                    <span class="sablon-child-title">
                      Print ke-{{ cIdx + 1 }} — {{ sablon.namaSablon }}
                    </span>
                  </div>
                  <span class="status-badge" :class="isChecked ? 'active' : 'neutral'">
                    <template v-if="isChecked">
                      {{ getChildMetaName(sablon, cIdx) ? 'Sudah di-print oleh ' + getChildMetaName(sablon, cIdx) + ' ✓' : 'Sudah di-print ✓' }}
                    </template>
                    <template v-else>Belum di-print</template>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <table-pagination
            v-if="!loading && filteredList.length"
            :total-items="filteredList.length"
            :current-page="currentPage"
            :page-size="localPageSize"
            @update:current-page="currentPage = $event"
            @update:page-size="localPageSize = $event"
          ></table-pagination>

          <div
            v-if="hasMore && !loading"
            style="padding: 12px 20px; border-top: 1px solid var(--border-color); text-align: center;"
          >
            <button type="button" class="btn btn-secondary btn-sm" @click="$emit('load-more')">
              <span>Muat Data Sablon Lebih Lama (+150)</span>
            </button>
          </div>
        </div>

        <!-- Modal Tambah / Edit Sablon -->
        <div
          v-if="modalOpen"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeModal"
        >
          <div class="modal-card modal-lg">
            <div class="modal-header">
              <h3 class="modal-title">
                {{ editingSablon ? 'Edit Data Sablon' : 'Tambah Data Sablon' }}
              </h3>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                :disabled="saving"
                aria-label="Tutup modal"
                @click="closeModal"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>

            <form @submit.prevent="saveSablon">
              <div class="modal-body">
                <div v-if="!pesananList.length && !editingSablon" class="alert alert-warning">
                  <span class="material-symbols-rounded">warning</span>
                  <div style="flex: 1;">
                    <strong>Belum ada data pesanan.</strong>
                    <div>Buat pesanan terlebih dahulu di Manajemen Pesanan agar bisa dihubungkan ke sablon.</div>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="margin-top: 8px;"
                      @click="closeModal(); $emit('go-pesanan');"
                    >
                      Buka Manajemen Pesanan
                    </button>
                  </div>
                </div>

                <div v-if="formError" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ formError }}</div>
                </div>

                <div class="form-row-2">
                  <div class="form-group">
                    <label class="form-label" for="sablon-nama">
                      Nama Sablon <span class="required">*</span>
                    </label>
                    <input
                      id="sablon-nama"
                      ref="sablonNameInput"
                      v-model="form.namaSablon"
                      type="text"
                      class="form-control"
                      placeholder="Contoh: Film Sablon Plastisol Logo ZCP"
                      :disabled="saving"
                      required
                    />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="sablon-perulangan">
                      Jumlah Perulangan Print <span class="required">*</span>
                    </label>
                    <input
                      id="sablon-perulangan"
                      v-model.number="form.jumlahPerulangan"
                      type="number"
                      min="1"
                      max="20"
                      step="1"
                      class="form-control"
                      :disabled="saving"
                      required
                    />
                    <span class="form-hint">
                      Setiap 1x print mencetak jumlah sisi di bawah. Total hasil = jumlah sisi × {{ getFormMultiplier() }} kali print.
                    </span>
                  </div>
                </div>

                <!-- Dynamic Multi-Order Selector (+ Tambah Pesanan) -->
                <div class="form-group">
                  <div class="sisi-header-row" style="margin-bottom: 8px;">
                    <label class="form-label" style="margin: 0;">
                      Pesanan Terhubung &amp; Jumlah per Sisi <span class="required">*</span>
                    </label>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="saving"
                      @click="addOrderBlock"
                    >
                      <span class="material-symbols-rounded" style="font-size: 17px;">add</span>
                      <span>Tambah Pesanan</span>
                    </button>
                  </div>

                  <div class="sablon-blocks-wrap">
                    <div
                      v-for="(block, bIdx) in form.orderBlocks"
                      :key="block.localId"
                      class="sablon-order-block"
                    >
                      <div class="sablon-block-head">
                        <span class="badge-count">Pesanan #{{ bIdx + 1 }}</span>
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm"
                          style="color: var(--accent-danger);"
                          :disabled="saving || form.orderBlocks.length <= 1"
                          @click="removeOrderBlock(bIdx)"
                        >
                          <span class="material-symbols-rounded" style="font-size: 16px;">delete</span>
                          <span>Hapus</span>
                        </button>
                      </div>

                      <!-- Jika belum memilih pesanan: Searchable Dropdown -->
                      <div v-if="!block.selectedPesananId" class="searchable-select">
                        <div class="search-box" style="width: 100%; min-width: 0;">
                          <span class="material-symbols-rounded input-icon">search</span>
                          <input
                            v-model="block.searchText"
                            type="text"
                            class="form-control"
                            placeholder="Cari nama pemesan, produk, atau expedisi..."
                            :disabled="saving"
                            @focus="openBlockDropdown(block)"
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
                            :disabled="isOrderUsedInOtherBlock(order.id, bIdx)"
                            @click="selectOrderForBlock(block, bIdx, order)"
                          >
                            <div>
                              <strong>{{ order.namaPemesan }}</strong> — {{ order.namaProduk }}
                              <span class="form-hint">({{ order.jumlahProduk }} pcs • {{ order.namaSisi.join(', ') }})</span>
                            </div>
                            <span
                              v-if="isOrderUsedInOtherBlock(order.id, bIdx)"
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

                      <!-- Jika pesanan sudah dipilih: Tampilkan ringkasan + input jumlah tiap sisi -->
                      <div v-else>
                        <div class="selected-order-banner">
                          <div>
                            <strong>{{ getOrderForBlock(block).namaPemesan }}</strong>
                            <span> — {{ getOrderForBlock(block).namaProduk }}</span>
                            <span class="form-hint">
                              (Target: {{ getOrderForBlock(block).jumlahProduk }} pcs)
                            </span>
                          </div>
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            :disabled="saving"
                            @click="clearOrderBlockSelection(block)"
                          >
                            Ganti Pesanan
                          </button>
                        </div>

                        <div class="sisi-qty-grid">
                          <div
                            v-for="side in getOrderForBlock(block).namaSisi"
                            :key="side"
                            class="sisi-qty-card"
                          >
                            <label class="form-label" style="margin-bottom: 4px;">
                              Sisi {{ side }} <span class="form-hint" style="font-weight: 500;">(per 1x print)</span>
                            </label>
                            <input
                              v-model.number="block.sisiInputs[side]"
                              type="number"
                              min="0"
                              step="1"
                              class="form-control"
                              :disabled="saving"
                            />
                            <div
                              v-if="(parseInt(block.sisiInputs[side], 10) || 0) > 0"
                              class="sisi-total-preview"
                            >
                              Jumlah setelah selesai sisi {{ side }} jadi {{ getSideEffectiveTotal(block, side) }} pcs
                              <span v-if="getFormMultiplier() > 1">
                                ({{ parseInt(block.sisiInputs[side], 10) || 0 }} × {{ getFormMultiplier() }} print)
                              </span>
                            </div>
                            <div class="form-hint" style="margin-top: 4px;">
                              Sudah di-print: {{ getOtherCompletedForSide(getOrderForBlock(block).id, side) }}/{{ getOrderForBlock(block).jumlahProduk }}
                              • Sisa: {{ Math.max(0, getOrderForBlock(block).jumlahProduk - getOtherCompletedForSide(getOrderForBlock(block).id, side)) }}
                            </div>
                            <div
                              v-if="getSideOverAmount(block, getOrderForBlock(block), side) > 0"
                              class="over-warn"
                            >
                              Melebihi target (+{{ getSideOverAmount(block, getOrderForBlock(block), side) }} pcs)
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Multi Upload File Sablon -->
                <div class="form-group">
                  <label class="form-label">Upload File Sablon (PNG, JPG, PDF)</label>

                  <div v-if="!driveReady" class="alert alert-warning" style="margin-bottom: 10px;">
                    <span class="material-symbols-rounded">cloud_off</span>
                    <div>
                      <code>gasConfig.gasUrl</code> belum diisi di <code>js/firebase-config.js</code>.
                      Data sablon tetap bisa disimpan tanpa file.
                    </div>
                  </div>

                  <input
                    ref="sablonFileInput"
                    type="file"
                    multiple
                    accept=".png,.jpg,.jpeg,.pdf"
                    style="display: none;"
                    @change="onFileInputChange"
                  />

                  <div
                    class="upload-dropzone"
                    :class="{ dragging: isDragging }"
                    @click="triggerFilePicker"
                    @dragover.prevent="isDragging = true"
                    @dragleave.prevent="isDragging = false"
                    @drop.prevent="onFileDrop"
                  >
                    <span class="material-symbols-rounded">cloud_upload</span>
                    <div class="upload-dropzone-title">Klik atau seret file sablon ke sini</div>
                    <div class="upload-dropzone-sub">
                      Support PNG, JPG/JPEG, PDF (maks. 15 MB per file) — disimpan ke Google Drive
                    </div>
                  </div>

                  <div v-if="form.existingFiles.length" class="file-preview-list">
                    <div
                      v-for="ef in form.existingFiles"
                      :key="ef.fileId"
                      class="file-preview-item"
                      :class="{ 'marked-remove': isMarkedForRemoval(ef.fileId) }"
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
                        <a
                          v-if="ef.viewUrl"
                          :href="ef.viewUrl"
                          target="_blank"
                          rel="noopener"
                          class="btn btn-secondary btn-sm"
                        >
                          Lihat
                        </a>
                        <button
                          type="button"
                          class="btn btn-sm"
                          :class="isMarkedForRemoval(ef.fileId) ? 'btn-secondary' : 'btn-danger'"
                          :disabled="saving"
                          @click="toggleExistingFileRemoval(ef.fileId)"
                        >
                          {{ isMarkedForRemoval(ef.fileId) ? 'Batal Hapus' : 'Hapus' }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div v-if="form.stagedFiles.length" class="file-preview-list">
                    <div
                      v-for="(sf, idx) in form.stagedFiles"
                      :key="sf.localId"
                      class="file-preview-item"
                    >
                      <div class="file-preview-left">
                        <img
                          v-if="sf.previewUrl"
                          :src="sf.previewUrl"
                          :alt="sf.name"
                          class="file-thumb"
                        />
                        <div v-else class="file-thumb">
                          <span class="material-symbols-rounded">picture_as_pdf</span>
                        </div>
                        <div class="file-meta">
                          <div class="file-name">{{ sf.name }}</div>
                          <div class="file-size">Siap diupload • {{ formatFileSize(sf.size) }}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="btn btn-ghost btn-icon"
                        :disabled="saving"
                        aria-label="Hapus file"
                        @click="removeStagedFile(idx)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 19px;">delete</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" for="sablon-catatan">Catatan (Opsional)</label>
                  <textarea
                    id="sablon-catatan"
                    v-model="form.catatan"
                    class="form-textarea"
                    placeholder="Contoh: Screen T61, tinta rubber putih 2x naik..."
                    :disabled="saving"
                  ></textarea>
                </div>
              </div>

              <div class="modal-footer" style="justify-content: space-between; flex-wrap: wrap;">
                <span class="form-hint" style="margin-right: auto;">{{ uploadProgressText }}</span>
                <div class="action-group">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    :disabled="saving"
                    @click="closeModal"
                  >
                    Batal
                  </button>
                  <button type="submit" class="btn btn-primary" :disabled="saving">
                    <span v-if="saving" class="spinner spinner-sm"></span>
                    <span>
                      {{ saving ? 'Memproses...' : (editingSablon ? 'Simpan Perubahan' : 'Simpan Sablon') }}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <!-- Modal Galeri Preview File Sablon -->
        <div
          v-if="previewModalOpen && previewSablon"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closePreviewModal"
        >
          <div class="modal-card modal-lg">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">File Sablon — {{ previewSablon.namaSablon }}</h3>
                <div class="form-hint">{{ previewSablon.fileSablon.length }} file terlampir</div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                aria-label="Tutup galeri"
                @click="closePreviewModal"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
            <div class="modal-body">
              <div class="file-gallery-grid">
                <div
                  v-for="(file, fIdx) in previewSablon.fileSablon"
                  :key="file.fileId || fIdx"
                  class="file-gallery-card"
                >
                  <div
                    class="file-gallery-media"
                    title="Klik untuk memperbesar"
                    @click="openLightbox(file)"
                  >
                    <img
                      v-if="file.mimeType !== 'application/pdf' && file.previewUrl"
                      :src="file.previewUrl"
                      :alt="file.originalName"
                      referrerpolicy="no-referrer"
                    />
                    <span
                      v-else
                      class="material-symbols-rounded"
                      style="font-size: 48px; color: var(--accent-danger);"
                    >
                      picture_as_pdf
                    </span>
                  </div>
                  <div class="file-gallery-body">
                    <div class="file-name" :title="file.originalName">
                      {{ file.originalName || file.fileName }}
                    </div>
                    <div class="file-size">{{ formatFileSize(file.size) }}</div>
                    <div class="file-gallery-actions">
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        @click="openLightbox(file)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">zoom_in</span>
                        <span>Lihat</span>
                      </button>
                      <a
                        v-if="file.viewUrl"
                        :href="file.viewUrl"
                        target="_blank"
                        rel="noopener"
                        class="btn btn-secondary btn-sm"
                      >
                        Drive
                      </a>
                      <a
                        v-if="file.downloadUrl"
                        :href="file.downloadUrl"
                        target="_blank"
                        rel="noopener"
                        class="btn btn-secondary btn-sm"
                      >
                        Unduh
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" @click="closePreviewModal">
                Tutup
              </button>
            </div>
          </div>
        </div>

        <!-- Modal Lightbox Perbesar Gambar / PDF -->
        <div
          v-if="lightboxFile"
          class="modal-overlay lightbox-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeLightbox"
        >
          <div class="modal-card lightbox-card">
            <div class="modal-header">
              <div style="min-width: 0;">
                <h3 class="modal-title" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  {{ lightboxFile.originalName || lightboxFile.fileName }}
                </h3>
                <div class="form-hint">{{ formatFileSize(lightboxFile.size) }}</div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                aria-label="Tutup tampilan besar"
                @click="closeLightbox"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
            <div class="lightbox-body">
              <img
                v-if="lightboxFile.mimeType !== 'application/pdf'"
                :src="getHighResPreviewUrl(lightboxFile)"
                :alt="lightboxFile.originalName"
                referrerpolicy="no-referrer"
                class="lightbox-img"
              />
              <iframe
                v-else
                :src="lightboxFile.previewUrl"
                class="lightbox-pdf"
                title="Preview PDF"
              ></iframe>
            </div>
            <div class="modal-footer">
              <a
                v-if="lightboxFile.viewUrl"
                :href="lightboxFile.viewUrl"
                target="_blank"
                rel="noopener"
                class="btn btn-secondary btn-sm"
              >
                Buka di Drive
              </a>
              <a
                v-if="lightboxFile.downloadUrl"
                :href="lightboxFile.downloadUrl"
                target="_blank"
                rel="noopener"
                class="btn btn-primary btn-sm"
              >
                Unduh
              </a>
              <button type="button" class="btn btn-secondary btn-sm" @click="closeLightbox">
                Tutup
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  };
})(window);
