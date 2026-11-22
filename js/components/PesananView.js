(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  var stagedFileSeq = 1;

  global.ZcpComponents.PesananView = {
    name: 'PesananView',
    props: {
      pesananList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      produkList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      expedisiList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      loading: { type: Boolean, default: false },
      driveReady: { type: Boolean, default: false },
      userRole: { type: String, default: 'superadmin' },
      hasMore: { type: Boolean, default: false },
      defaultPageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: ['notify', 'request-confirm', 'go-master', 'load-more'],
    data: function () {
      return {
        searchQuery: '',
        statusFilter: 'all',
        produkFilter: '',
        currentPage: 1,
        localPageSize: this.defaultPageSize,
        modalOpen: false,
        editingOrder: null,
        saving: false,
        uploadProgressText: '',
        formError: '',
        isDragging: false,
        form: {
          namaPemesan: '',
          selectedProdukKey: '',
          snapshotProdukId: '',
          snapshotProdukName: '',
          snapshotProdukSisi: [],
          selectedSisi: [],
          jumlahProduk: 1,
          selectedExpedisiKey: '',
          snapshotExpedisiId: '',
          snapshotExpedisiName: '',
          catatan: '',
          existingFiles: [],
          removedFileIds: [],
          stagedFiles: []
        },
        previewModalOpen: false,
        previewOrder: null,
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
      },
      produkFilter: function () {
        this.currentPage = 1;
      }
    },
    computed: {
      isReadOnly: function () {
        return this.userRole === 'karyawan';
      },
      produkFilterOptions: function () {
        var map = {};
        var names = [];
        this.produkList.forEach(function (p) {
          if (p.namaProduk && !map[p.namaProduk]) {
            map[p.namaProduk] = true;
            names.push(p.namaProduk);
          }
        });
        this.pesananList.forEach(function (o) {
          if (o.namaProduk && !map[o.namaProduk]) {
            map[o.namaProduk] = true;
            names.push(o.namaProduk);
          }
        });
        return names.sort();
      },
      filteredList: function () {
        var q = this.searchQuery.trim().toLowerCase();
        var status = this.statusFilter;
        var produk = this.produkFilter;

        return this.pesananList.filter(function (order) {
          if (status === 'active' && order.statusSelesai) return false;
          if (status === 'done' && !order.statusSelesai) return false;
          if (produk && order.namaProduk !== produk) return false;
          if (!q) return true;

          var matchPemesan = (order.namaPemesan || '').toLowerCase().indexOf(q) !== -1;
          var matchProduk = (order.namaProduk || '').toLowerCase().indexOf(q) !== -1;
          var matchExpedisi = (order.namaExpedisi || '').toLowerCase().indexOf(q) !== -1;
          var matchCatatan = (order.catatan || '').toLowerCase().indexOf(q) !== -1;
          var matchSisi =
            Array.isArray(order.namaSisi) &&
            order.namaSisi.some(function (s) {
              return String(s).toLowerCase().indexOf(q) !== -1;
            });

          return matchPemesan || matchProduk || matchExpedisi || matchCatatan || matchSisi;
        });
      },
      paginatedList: function () {
        if (this.localPageSize === 'all') return this.filteredList;
        var size = Number(this.localPageSize) || 10;
        var start = (this.currentPage - 1) * size;
        return this.filteredList.slice(start, start + size);
      },
      selectedProdukObj: function () {
        var key = this.form.selectedProdukKey;
        if (!key || key === '__snapshot__') return null;
        for (var i = 0; i < this.produkList.length; i++) {
          if (this.produkList[i].id === key) {
            return this.produkList[i];
          }
        }
        return null;
      },
      selectedExpedisiObj: function () {
        var key = this.form.selectedExpedisiKey;
        if (!key || key === '__snapshot__') return null;
        for (var i = 0; i < this.expedisiList.length; i++) {
          if (this.expedisiList[i].id === key) {
            return this.expedisiList[i];
          }
        }
        return null;
      },
      availableSisi: function () {
        var list = [];
        var seen = {};
        function pushUnique(name) {
          var clean = String(name || '').trim();
          if (!clean) return;
          var lower = clean.toLowerCase();
          if (!seen[lower]) {
            seen[lower] = true;
            list.push(clean);
          }
        }

        if (this.selectedProdukObj && Array.isArray(this.selectedProdukObj.namaSisi)) {
          this.selectedProdukObj.namaSisi.forEach(pushUnique);
        } else if (this.form.selectedProdukKey === '__snapshot__') {
          this.form.snapshotProdukSisi.forEach(pushUnique);
        }

        // Saat mengedit, pertahankan sisi historis pesanan jika ada sisi master yang sudah dihapus
        if (this.editingOrder && Array.isArray(this.editingOrder.namaSisi)) {
          var isOriginalProduk =
            (this.form.selectedProdukKey === '__snapshot__' &&
              this.form.snapshotProdukName === this.editingOrder.namaProduk) ||
            (this.selectedProdukObj && this.selectedProdukObj.id === this.editingOrder.produkId);
          if (isOriginalProduk) {
            this.editingOrder.namaSisi.forEach(pushUnique);
          }
        }

        return list;
      },
      masterMissingWarning: function () {
        return !this.produkList.length || !this.expedisiList.length;
      },
      totalPcsCount: function () {
        return this.pesananList.reduce(function (sum, item) {
          return sum + (Number(item.jumlahProduk) || 0);
        }, 0);
      },
      activeOrdersCount: function () {
        return this.pesananList.filter(function (o) {
          return !o.statusSelesai;
        }).length;
      },
      doneOrdersCount: function () {
        return this.pesananList.filter(function (o) {
          return o.statusSelesai;
        }).length;
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
        this.editingOrder = null;
        this.formError = '';
        this.uploadProgressText = '';
        this.isDragging = false;
        this.form = {
          namaPemesan: '',
          selectedProdukKey: '',
          snapshotProdukId: '',
          snapshotProdukName: '',
          snapshotProdukSisi: [],
          selectedSisi: [],
          jumlahProduk: 1,
          selectedExpedisiKey: '',
          snapshotExpedisiId: '',
          snapshotExpedisiName: '',
          catatan: '',
          existingFiles: [],
          removedFileIds: [],
          stagedFiles: []
        };
      },
      openAddModal: function () {
        if (this.isReadOnly) return;
        this.resetForm();
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.pemesanInput) {
            this.$refs.pemesanInput.focus();
          }
        });
      },
      openEditModal: function (order) {
        if (this.isReadOnly) return;
        this.resetForm();
        this.editingOrder = order;

        var matchedProduk = this.produkList.find(function (p) {
          return p.id === order.produkId || p.namaProduk === order.namaProduk;
        });
        var matchedExpedisi = this.expedisiList.find(function (e) {
          return e.id === order.expedisiId || e.namaExpedisi === order.namaExpedisi;
        });

        this.form = {
          namaPemesan: order.namaPemesan || '',
          selectedProdukKey: matchedProduk ? matchedProduk.id : '__snapshot__',
          snapshotProdukId: order.produkId || '',
          snapshotProdukName: order.namaProduk || '',
          snapshotProdukSisi: Array.isArray(order.namaSisi) ? order.namaSisi.slice() : [],
          selectedSisi: Array.isArray(order.namaSisi) ? order.namaSisi.slice() : [],
          jumlahProduk: Number(order.jumlahProduk) || 1,
          selectedExpedisiKey: matchedExpedisi ? matchedExpedisi.id : '__snapshot__',
          snapshotExpedisiId: order.expedisiId || '',
          snapshotExpedisiName: order.namaExpedisi || '',
          catatan: order.catatan || '',
          existingFiles: Array.isArray(order.fileDesigns)
            ? order.fileDesigns.map(function (f) {
                return Object.assign({}, f);
              })
            : [],
          removedFileIds: [],
          stagedFiles: []
        };

        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.pemesanInput) {
            this.$refs.pemesanInput.focus();
          }
        });
      },
      closeModal: function () {
        if (this.saving) return;
        this.revokeAllStagedPreviews();
        this.modalOpen = false;
      },
      onProdukChange: function () {
        this.form.selectedSisi = [];
      },
      isSisiSelected: function (sisi) {
        return this.form.selectedSisi.indexOf(sisi) !== -1;
      },
      toggleSisi: function (sisi) {
        var idx = this.form.selectedSisi.indexOf(sisi);
        if (idx === -1) {
          this.form.selectedSisi.push(sisi);
        } else {
          this.form.selectedSisi.splice(idx, 1);
        }
      },
      selectAllSisi: function () {
        this.form.selectedSisi = this.availableSisi.slice();
      },
      clearSisi: function () {
        this.form.selectedSisi = [];
      },
      triggerFilePicker: function () {
        if (this.saving) return;
        if (this.$refs.fileInput) {
          this.$refs.fileInput.click();
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
        if (!files.length) return;

        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          try {
            global.ZcpDriveService.validateFile(file);
            var isImage = file.type === 'image/png' || file.type === 'image/jpeg';
            this.form.stagedFiles.push({
              localId: ++stagedFileSeq,
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
      openPreviewModal: function (order) {
        this.previewOrder = order;
        this.previewModalOpen = true;
      },
      closePreviewModal: function () {
        this.lightboxFile = null;
        this.previewModalOpen = false;
        this.previewOrder = null;
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
      },
      savePesanan: async function () {
        this.formError = '';
        this.uploadProgressText = '';

        var namaPemesan = (this.form.namaPemesan || '').trim();
        if (!namaPemesan) {
          this.formError = 'Nama pemesan wajib diisi.';
          return;
        }

        var produkId = '';
        var namaProduk = '';
        if (this.selectedProdukObj) {
          produkId = this.selectedProdukObj.id;
          namaProduk = this.selectedProdukObj.namaProduk;
        } else if (this.form.selectedProdukKey === '__snapshot__') {
          produkId = this.form.snapshotProdukId;
          namaProduk = this.form.snapshotProdukName;
        }
        if (!namaProduk) {
          this.formError = 'Silakan pilih produk terlebih dahulu.';
          return;
        }

        if (!this.form.selectedSisi.length) {
          this.formError = 'Pilih minimal 1 sisi sablon.';
          return;
        }

        var jumlah = parseInt(this.form.jumlahProduk, 10);
        if (!jumlah || jumlah < 1) {
          this.formError = 'Jumlah produk minimal 1 pcs.';
          return;
        }

        var expedisiId = '';
        var namaExpedisi = '';
        if (this.selectedExpedisiObj) {
          expedisiId = this.selectedExpedisiObj.id;
          namaExpedisi = this.selectedExpedisiObj.namaExpedisi;
        } else if (this.form.selectedExpedisiKey === '__snapshot__') {
          expedisiId = this.form.snapshotExpedisiId;
          namaExpedisi = this.form.snapshotExpedisiName;
        }
        if (!namaExpedisi) {
          this.formError = 'Silakan pilih expedisi pengiriman.';
          return;
        }

        if (this.form.stagedFiles.length > 0 && !this.driveReady) {
          this.formError =
            'Google Apps Script (gasUrl) belum diisi di js/firebase-config.js, sehingga file desain tidak bisa diupload. Hapus file terpilih jika ingin menyimpan tanpa file.';
          return;
        }

        this.saving = true;
        var self = this;
        try {
          var uploadedFiles = [];
          if (this.form.stagedFiles.length > 0) {
            var rawFiles = this.form.stagedFiles.map(function (s) {
              return s.file;
            });
            uploadedFiles = await global.ZcpDriveService.uploadMultipleFiles(
              rawFiles,
              'designs',
              function (prog) {
                self.uploadProgressText =
                  'Mengupload file ' + prog.current + '/' + prog.total + ': ' + prog.fileName + '...';
              }
            );
          }

          this.uploadProgressText = 'Menyimpan pesanan ke database...';

          var keptExisting = this.form.existingFiles.filter(function (f) {
            return self.form.removedFileIds.indexOf(f.fileId) === -1;
          });
          var mergedFiles = keptExisting.concat(uploadedFiles);

          var payload = {
            namaPemesan: namaPemesan,
            produkId: produkId,
            namaProduk: namaProduk,
            namaSisi: this.form.selectedSisi.slice(),
            jumlahProduk: jumlah,
            fileDesigns: mergedFiles,
            expedisiId: expedisiId,
            namaExpedisi: namaExpedisi,
            catatan: this.form.catatan
          };

          if (this.editingOrder) {
            await global.ZcpPesananService.updatePesanan(
              this.editingOrder.id,
              payload,
              this.editingOrder.sisiProgress
            );

            // Hapus file lama yang ditandai hapus di Google Drive (best-effort)
            if (this.driveReady && this.form.removedFileIds.length > 0) {
              for (var i = 0; i < this.form.removedFileIds.length; i++) {
                try {
                  await global.ZcpDriveService.deleteFile(this.form.removedFileIds[i]);
                } catch (driveErr) {
                  // Abaikan kegagalan hapus file Drive agar update Firestore tetap sukses
                }
              }
            }

            this.$emit('notify', {
              type: 'success',
              message: 'Pesanan "' + namaPemesan + '" berhasil diperbarui.'
            });
          } else {
            await global.ZcpPesananService.addPesanan(payload);
            this.$emit('notify', {
              type: 'success',
              message: 'Pesanan "' + namaPemesan + '" berhasil ditambahkan.'
            });
          }

          this.revokeAllStagedPreviews();
          this.modalOpen = false;
        } catch (err) {
          this.formError = err && err.message ? err.message : 'Gagal menyimpan pesanan.';
        } finally {
          this.saving = false;
          this.uploadProgressText = '';
        }
      },
      confirmDelete: function (order) {
        if (this.isReadOnly) return;
        var self = this;
        var hasFiles = Array.isArray(order.fileDesigns) && order.fileDesigns.length > 0;
        this.$emit('request-confirm', {
          title: 'Hapus Pesanan',
          message:
            'Hapus pesanan atas nama "' +
            order.namaPemesan +
            '" (' +
            order.namaProduk +
            ' - ' +
            order.jumlahProduk +
            ' pcs)?' +
            (hasFiles && this.driveReady ? ' File desain terkait di Google Drive juga akan dipindahkan ke Trash.' : ''),
          confirmText: 'Hapus Pesanan',
          variant: 'danger',
          onConfirm: async function () {
            await global.ZcpPesananService.deletePesanan(order.id, order.namaPemesan);
            if (hasFiles && self.driveReady) {
              for (var i = 0; i < order.fileDesigns.length; i++) {
                var fid = order.fileDesigns[i] && order.fileDesigns[i].fileId;
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
              message: 'Pesanan "' + order.namaPemesan + '" berhasil dihapus.'
            });
          }
        });
      }
    },
    template: `
      <div>
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Total Pesanan</div>
                <div class="kpi-value">{{ pesananList.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">shopping_bag</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Total <span class="kpi-highlight">{{ totalPcsCount }} pcs</span> tercatat
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Sedang Diproses</div>
                <div class="kpi-value">{{ activeOrdersCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">pending_actions</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Pesanan aktif menunggu selesai
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Pesanan Selesai</div>
                <div class="kpi-value">{{ doneOrdersCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">task_alt</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span class="kpi-highlight">Siap kirim</span> / selesai dikerjakan
            </div>
          </div>
        </div>

        <div class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Daftar Pesanan Sablon</h2>
              <p>Kelola pesanan pelanggan, pilihan sisi produk, file desain, dan expedisi.</p>
            </div>

            <div class="panel-actions">
              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="searchQuery"
                  type="text"
                  class="form-control"
                  placeholder="Cari pemesan, produk, sisi..."
                  aria-label="Cari pesanan"
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

              <select v-model="statusFilter" class="filter-select" aria-label="Filter status">
                <option value="all">Semua Status</option>
                <option value="active">Diproses</option>
                <option value="done">Selesai</option>
              </select>

              <select v-model="produkFilter" class="filter-select" aria-label="Filter produk">
                <option value="">Semua Produk</option>
                <option v-for="pName in produkFilterOptions" :key="pName" :value="pName">
                  {{ pName }}
                </option>
              </select>

              <button v-if="!isReadOnly" type="button" class="btn btn-primary" @click="openAddModal">
                <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
                <span>Tambah Pesanan</span>
              </button>
            </div>
          </div>

          <div v-if="loading" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Memuat daftar pesanan...</p>
          </div>

          <div v-else-if="!filteredList.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">shopping_bag</span>
            </div>
            <h3>{{ (searchQuery || statusFilter !== 'all' || produkFilter) ? 'Pesanan tidak ditemukan' : 'Belum ada data pesanan' }}</h3>
            <p>
              {{
                (searchQuery || statusFilter !== 'all' || produkFilter)
                  ? 'Coba ubah kata kunci pencarian atau reset filter di atas.'
                  : (isReadOnly ? 'Belum ada data pesanan yang tercatat.' : 'Tambahkan pesanan pertama dengan memilih produk, sisi sablon, dan expedisi dari Master Data.')
              }}
            </p>
            <button
              v-if="!isReadOnly && !(searchQuery || statusFilter !== 'all' || produkFilter)"
              type="button"
              class="btn btn-primary"
              @click="openAddModal"
            >
              <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
              <span>Tambah Pesanan Pertama</span>
            </button>
          </div>

          <div v-else class="table-container">
            <table class="data-table responsive-table">
              <thead>
                <tr>
                  <th class="col-no">No</th>
                  <th>Pemesan</th>
                  <th>Produk &amp; Sisi</th>
                  <th>Jumlah</th>
                  <th>File Design</th>
                  <th>Expedisi</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th v-if="!isReadOnly" class="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(order, index) in paginatedList" :key="order.id">
                  <td class="col-no" data-label="No">
                    {{ (localPageSize === 'all' ? 0 : (currentPage - 1) * Number(localPageSize)) + index + 1 }}
                  </td>
                  <td data-label="Pemesan">
                    <div>
                      <div class="item-title-cell">
                        <span class="item-mini-icon">
                          <span class="material-symbols-rounded" style="font-size: 18px;">person</span>
                        </span>
                        <span>{{ order.namaPemesan }}</span>
                      </div>
                      <div v-if="order.catatan" class="note-preview" :title="order.catatan">
                        {{ order.catatan }}
                      </div>
                    </div>
                  </td>
                  <td class="sisi-cell" data-label="Produk & Sisi">
                    <div style="font-weight: 600; margin-bottom: 6px;">{{ order.namaProduk }}</div>
                    <div class="chips-wrap">
                      <span
                        v-for="(sisi, sIdx) in order.namaSisi"
                        :key="sIdx"
                        class="chip"
                      >
                        {{ sisi }}
                      </span>
                    </div>
                  </td>
                  <td data-label="Jumlah">
                    <span class="badge-count">{{ order.jumlahProduk }} pcs</span>
                  </td>
                  <td data-label="File Design">
                    <button
                      v-if="order.fileDesigns && order.fileDesigns.length"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="openPreviewModal(order)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 16px;">attach_file</span>
                      <span>{{ order.fileDesigns.length }} file</span>
                    </button>
                    <span v-else style="color: var(--text-muted); font-size: 12.5px;">Tidak ada</span>
                  </td>
                  <td data-label="Expedisi">
                    <span class="chip">{{ order.namaExpedisi }}</span>
                  </td>
                  <td data-label="Status">
                    <span class="status-badge" :class="order.statusSelesai ? 'done' : 'active'">
                      <span class="material-symbols-rounded" style="font-size: 15px;">
                        {{ order.statusSelesai ? 'check_circle' : 'schedule' }}
                      </span>
                      <span>{{ order.statusSelesai ? 'Selesai' : 'Diproses' }}</span>
                    </span>
                  </td>
                  <td data-label="Dibuat">{{ formatDate(order.createdAt) }}</td>
                  <td v-if="!isReadOnly" class="col-actions" data-label="Aksi">
                    <div class="action-group">
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        @click="openEditModal(order)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">edit</span>
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        class="btn btn-danger btn-sm"
                        @click="confirmDelete(order)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">delete</span>
                        <span>Hapus</span>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
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
              <span>Muat Pesanan Lebih Lama (+150)</span>
            </button>
          </div>
        </div>

        <!-- Modal Tambah / Edit Pesanan -->
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
                {{ editingOrder ? 'Edit Pesanan' : 'Tambah Pesanan Baru' }}
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

            <form @submit.prevent="savePesanan">
              <div class="modal-body">
                <div v-if="masterMissingWarning && !editingOrder" class="alert alert-warning" role="alert">
                  <span class="material-symbols-rounded">warning</span>
                  <div style="flex: 1;">
                    <strong>Master Data belum lengkap.</strong>
                    <div>
                      Pastikan Master Produk dan Master Expedisi sudah terisi sebelum membuat pesanan.
                    </div>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="margin-top: 8px;"
                      @click="closeModal(); $emit('go-master');"
                    >
                      Buka Master Data
                    </button>
                  </div>
                </div>

                <div v-if="formError" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ formError }}</div>
                </div>

                <div class="form-row-2">
                  <div class="form-group">
                    <label class="form-label" for="pesanan-pemesan">
                      Nama Pemesan <span class="required">*</span>
                    </label>
                    <input
                      id="pesanan-pemesan"
                      ref="pemesanInput"
                      v-model="form.namaPemesan"
                      type="text"
                      class="form-control"
                      placeholder="Contoh: Budi / Komunitas XYZ"
                      :disabled="saving"
                      required
                    />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="pesanan-jumlah">
                      Jumlah Produk (pcs) <span class="required">*</span>
                    </label>
                    <input
                      id="pesanan-jumlah"
                      v-model.number="form.jumlahProduk"
                      type="number"
                      min="1"
                      step="1"
                      class="form-control"
                      placeholder="Contoh: 20"
                      :disabled="saving"
                      required
                    />
                  </div>
                </div>

                <div class="form-row-2">
                  <div class="form-group">
                    <label class="form-label" for="pesanan-produk">
                      Nama Produk <span class="required">*</span>
                    </label>
                    <select
                      id="pesanan-produk"
                      v-model="form.selectedProdukKey"
                      class="form-select"
                      :disabled="saving"
                      @change="onProdukChange"
                      required
                    >
                      <option value="" disabled>-- Pilih Produk --</option>
                      <option
                        v-if="form.selectedProdukKey === '__snapshot__'"
                        value="__snapshot__"
                      >
                        {{ form.snapshotProdukName }} (Master dihapus)
                      </option>
                      <option
                        v-for="p in produkList"
                        :key="p.id"
                        :value="p.id"
                      >
                        {{ p.namaProduk }} ({{ p.namaSisi.length }} sisi)
                      </option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="pesanan-expedisi">
                      Expedisi <span class="required">*</span>
                    </label>
                    <select
                      id="pesanan-expedisi"
                      v-model="form.selectedExpedisiKey"
                      class="form-select"
                      :disabled="saving"
                      required
                    >
                      <option value="" disabled>-- Pilih Expedisi --</option>
                      <option
                        v-if="form.selectedExpedisiKey === '__snapshot__'"
                        value="__snapshot__"
                      >
                        {{ form.snapshotExpedisiName }} (Master dihapus)
                      </option>
                      <option
                        v-for="exp in expedisiList"
                        :key="exp.id"
                        :value="exp.id"
                      >
                        {{ exp.namaExpedisi }}
                      </option>
                    </select>
                  </div>
                </div>

                <!-- Dynamic Multiple Select Nama Sisi -->
                <div class="form-group">
                  <div class="sisi-header-row">
                    <label class="form-label" style="margin: 0;">
                      Pilih Nama Sisi <span class="required">*</span>
                    </label>
                    <div v-if="availableSisi.length" class="sisi-mini-actions">
                      <span class="form-hint">
                        {{ form.selectedSisi.length }} dari {{ availableSisi.length }} dipilih
                      </span>
                      <button type="button" class="link-btn" :disabled="saving" @click="selectAllSisi">
                        Pilih Semua
                      </button>
                      <button type="button" class="link-btn" :disabled="saving" @click="clearSisi">
                        Reset
                      </button>
                    </div>
                  </div>

                  <div v-if="!form.selectedProdukKey" class="form-hint">
                    Pilih produk terlebih dahulu untuk menampilkan pilihan sisi.
                  </div>
                  <div v-else-if="!availableSisi.length" class="form-hint">
                    Produk ini belum memiliki daftar sisi.
                  </div>
                  <div v-else class="sisi-selector-grid">
                    <label
                      v-for="sisi in availableSisi"
                      :key="sisi"
                      class="sisi-option"
                      :class="{ selected: isSisiSelected(sisi) }"
                    >
                      <input
                        type="checkbox"
                        :checked="isSisiSelected(sisi)"
                        :disabled="saving"
                        @change="toggleSisi(sisi)"
                      />
                      <span>{{ sisi }}</span>
                    </label>
                  </div>
                </div>

                <!-- Multi Upload File Design (Google Drive) -->
                <div class="form-group">
                  <label class="form-label">File Design (Opsional, bisa lebih dari 1)</label>

                  <div v-if="!driveReady" class="alert alert-warning" style="margin-bottom: 10px;">
                    <span class="material-symbols-rounded">cloud_off</span>
                    <div>
                      <code>gasConfig.gasUrl</code> belum diisi di <code>js/firebase-config.js</code>.
                      Pesanan tetap dapat disimpan tanpa upload file desain.
                    </div>
                  </div>

                  <input
                    ref="fileInput"
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
                    <div class="upload-dropzone-title">
                      Klik atau seret file desain ke sini
                    </div>
                    <div class="upload-dropzone-sub">
                      Mendukung PNG, JPG/JPEG, PDF (maks. 15 MB per file) — disimpan ke Google Drive
                    </div>
                  </div>

                  <!-- File yang sudah tersimpan (mode edit) -->
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
                          <div class="file-size">
                            Tersimpan di Drive • {{ formatFileSize(ef.size) }}
                          </div>
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

                  <!-- File baru yang siap diupload -->
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
                          <div class="file-size">
                            Siap diupload • {{ formatFileSize(sf.size) }}
                          </div>
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
                  <label class="form-label" for="pesanan-catatan">Catatan (Opsional)</label>
                  <textarea
                    id="pesanan-catatan"
                    v-model="form.catatan"
                    class="form-textarea"
                    placeholder="Contoh: Warna sablon putih solid, ukuran M 10 pcs & L 10 pcs..."
                    :disabled="saving"
                  ></textarea>
                </div>
              </div>

              <div class="modal-footer" style="justify-content: space-between; flex-wrap: wrap;">
                <span class="form-hint" style="margin-right: auto;">
                  {{ uploadProgressText }}
                </span>
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
                      {{ saving ? 'Memproses...' : (editingOrder ? 'Simpan Perubahan' : 'Simpan Pesanan') }}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <!-- Modal Galeri Preview File Design -->
        <div
          v-if="previewModalOpen && previewOrder"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closePreviewModal"
        >
          <div class="modal-card modal-lg">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">File Design — {{ previewOrder.namaPemesan }}</h3>
                <div class="form-hint">{{ previewOrder.namaProduk }} • {{ previewOrder.fileDesigns.length }} file</div>
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
                  v-for="(file, fIdx) in previewOrder.fileDesigns"
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
