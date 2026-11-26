(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

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
      aiConfig: {
        type: Object,
        default: function () {
          return { geminiApiUrl: '', geminiApiKey: '' };
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
      },
      hasUnsavedDrafts: { type: Boolean, default: false },
      aiQueue: { type: Object, default: null }
    },
    emits: [
      'notify',
      'request-confirm',
      'go-pesanan',
      'load-more',
      'open-sablon-form',
      'edit-sablon'
    ],
    data: function () {
      return {
        searchQuery: '',
        statusFilter: 'all',
        currentPage: 1,
        localPageSize: this.defaultPageSize,
        busyIds: {},
        previewSablon: null
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
    methods: {
      formatDate: function (ts) {
        return global.ZcpPesananService.formatDate(ts);
      },
      checkedCount: function (sablon) {
        if (!Array.isArray(sablon.perulanganChecks)) return 0;
        return sablon.perulanganChecks.filter(Boolean).length;
      },
      openCreatePage: function () {
        if (this.isKaryawan) return;
        this.$emit('open-sablon-form');
      },
      openEditPage: function (sablon) {
        if (this.isKaryawan) return;
        this.$emit('edit-sablon', sablon);
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
      },
      closePreviewModal: function () {
        this.previewSablon = null;
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
              <span style="color: var(--accent-info); font-weight: 600;">Border biru</span> • otomatis menambah progres sisi di Operasional
            </div>
          </div>
        </div>

        <div
          v-if="!isKaryawan && hasUnsavedDrafts"
          class="alert alert-info"
          style="margin-bottom: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap;"
        >
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="material-symbols-rounded">drafts</span>
            <div>
              <strong>Draft Buat Sablon tersimpan.</strong>
              <span v-if="aiQueue && aiQueue.running">
                Proses Isi Sisi Otomatis sedang berjalan di latar belakang ({{ aiQueue.percent }}%).
              </span>
              <span v-else>
                Anda masih memiliki input sablon yang belum disimpan.
              </span>
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" @click="openCreatePage">
            <span class="material-symbols-rounded" style="font-size: 16px;">arrow_forward</span>
            <span>Lanjutkan Buat Sablon</span>
          </button>
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

              <button v-if="!isKaryawan" type="button" class="btn btn-primary" @click="openCreatePage">
                <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
                <span>{{ hasUnsavedDrafts ? 'Lanjutkan Buat Sablon' : 'Tambah Sablon' }}</span>
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
                  : (isKaryawan ? 'Belum ada data sablon untuk diproses.' : 'Buat data sablon baru, upload film sablon, dan gunakan AI untuk mengisi jumlah sisi otomatis.')
              }}
            </p>
            <button
              v-if="!isKaryawan && !(searchQuery || statusFilter !== 'all')"
              type="button"
              class="btn btn-primary"
              @click="openCreatePage"
            >
              <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
              <span>Tambah Sablon Pertama</span>
            </button>
          </div>

          <!-- Daftar Sablon -->
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
                    @click="openEditPage(sablon)"
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

              <!-- Anak Row -->
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

        <file-preview-modal
          :visible="Boolean(previewSablon)"
          :title="'File Sablon — ' + (previewSablon ? previewSablon.namaSablon : '')"
          :subtitle="previewSablon ? ((previewSablon.fileSablon || []).length + ' file terlampir') : ''"
          :files="previewSablon ? previewSablon.fileSablon : []"
          @close="closePreviewModal"
        ></file-preview-modal>
      </div>
    `
  };
})(window);
