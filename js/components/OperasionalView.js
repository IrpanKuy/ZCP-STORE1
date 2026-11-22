(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.OperasionalView = {
    name: 'OperasionalView',
    props: {
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
      loading: { type: Boolean, default: false },
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
        selectedIds: [],
        bulkMulai: '',
        bulkDeadline: '',
        bulkSaving: false,
        draftDates: {},
        dirtyMap: {},
        savingIdMap: {},
        filePreviewOrder: null
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
      pesananList: {
        immediate: true,
        handler: function (list) {
          var nextDrafts = Object.assign({}, this.draftDates);
          var existingIds = {};
          for (var i = 0; i < list.length; i++) {
            var order = list[i];
            existingIds[order.id] = true;
            if (!this.dirtyMap[order.id]) {
              nextDrafts[order.id] = {
                tanggalMulai: order.tanggalMulai || '',
                tanggalDeadline: order.tanggalDeadline || ''
              };
            }
          }
          this.draftDates = nextDrafts;
          this.selectedIds = this.selectedIds.filter(function (id) {
            return Boolean(existingIds[id]);
          });
        }
      }
    },
    computed: {
      /**
       * Agregasi cadangan langsung dari daftar sablon yang sudah selesai
       * agar progres tetap akurat seketika.
       */
      completedSablonTotals: function () {
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
      activeTotalCount: function () {
        return this.pesananList.filter(function (o) {
          return !o.statusSelesai;
        }).length;
      },
      doneTotalCount: function () {
        return this.pesananList.filter(function (o) {
          return o.statusSelesai;
        }).length;
      },
      overdueTotalCount: function () {
        return this.pesananList.filter(function (o) {
          return !o.statusSelesai && global.ZcpPesananService.getDeadlineStatus(o) === 'overdue';
        }).length;
      },
      urgentTotalCount: function () {
        return this.pesananList.filter(function (o) {
          if (o.statusSelesai) return false;
          var st = global.ZcpPesananService.getDeadlineStatus(o);
          return st === 'overdue' || st === 'soon';
        }).length;
      },
      filteredList: function () {
        var q = this.searchQuery.trim().toLowerCase();
        var filter = this.statusFilter;

        return this.pesananList.filter(function (order) {
          var deadlineStatus = global.ZcpPesananService.getDeadlineStatus(order);

          if (filter === 'active' && order.statusSelesai) return false;
          if (filter === 'done' && !order.statusSelesai) return false;
          if (filter === 'overdue' && deadlineStatus !== 'overdue') return false;
          if (filter === 'unscheduled' && (order.statusSelesai || deadlineStatus !== 'unscheduled')) {
            return false;
          }

          if (!q) return true;
          var matchPemesan = (order.namaPemesan || '').toLowerCase().indexOf(q) !== -1;
          var matchProduk = (order.namaProduk || '').toLowerCase().indexOf(q) !== -1;
          var matchExpedisi = (order.namaExpedisi || '').toLowerCase().indexOf(q) !== -1;
          var matchSisi =
            Array.isArray(order.namaSisi) &&
            order.namaSisi.some(function (s) {
              return String(s).toLowerCase().indexOf(q) !== -1;
            });

          return matchPemesan || matchProduk || matchExpedisi || matchSisi;
        });
      },
      activeFilteredOrders: function () {
        return this.filteredList
          .filter(function (o) {
            return !o.statusSelesai;
          })
          .sort(function (a, b) {
            var aHas = Boolean(a.tanggalDeadline);
            var bHas = Boolean(b.tanggalDeadline);
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            if (aHas && bHas && a.tanggalDeadline !== b.tanggalDeadline) {
              return a.tanggalDeadline < b.tanggalDeadline ? -1 : 1;
            }
            return 0;
          });
      },
      doneFilteredOrders: function () {
        return this.filteredList.filter(function (o) {
          return o.statusSelesai;
        });
      },
      isKaryawan: function () {
        return this.userRole === 'karyawan';
      },
      combinedOrderedList: function () {
        return this.activeFilteredOrders.concat(this.doneFilteredOrders);
      },
      paginatedCombinedList: function () {
        if (this.localPageSize === 'all') return this.combinedOrderedList;
        var size = Number(this.localPageSize) || 10;
        var start = (this.currentPage - 1) * size;
        return this.combinedOrderedList.slice(start, start + size);
      },
      paginatedActiveOrders: function () {
        return this.paginatedCombinedList.filter(function (o) {
          return !o.statusSelesai;
        });
      },
      paginatedDoneOrders: function () {
        return this.paginatedCombinedList.filter(function (o) {
          return o.statusSelesai;
        });
      },
      allFilteredIds: function () {
        return this.filteredList.map(function (o) {
          return o.id;
        });
      },
      allSelected: function () {
        if (!this.filteredList.length) return false;
        var selectedMap = {};
        this.selectedIds.forEach(function (id) {
          selectedMap[id] = true;
        });
        return this.filteredList.every(function (o) {
          return Boolean(selectedMap[o.id]);
        });
      }
    },
    methods: {
      isSelected: function (id) {
        return this.selectedIds.indexOf(id) !== -1;
      },
      toggleSelect: function (id) {
        var idx = this.selectedIds.indexOf(id);
        if (idx === -1) {
          this.selectedIds.push(id);
        } else {
          this.selectedIds.splice(idx, 1);
        }
      },
      toggleSelectAll: function () {
        if (this.allSelected) {
          this.selectedIds = [];
        } else {
          this.selectedIds = this.allFilteredIds.slice();
        }
      },
      selectAllActiveOnly: function () {
        this.selectedIds = this.activeFilteredOrders.map(function (o) {
          return o.id;
        });
      },
      clearSelection: function () {
        this.selectedIds = [];
      },
      getDraftDate: function (orderId, field) {
        return this.draftDates[orderId] ? this.draftDates[orderId][field] || '' : '';
      },
      onDateInput: function (order, field, val) {
        if (!this.draftDates[order.id]) {
          this.draftDates[order.id] = {
            tanggalMulai: order.tanggalMulai || '',
            tanggalDeadline: order.tanggalDeadline || ''
          };
        }
        this.draftDates[order.id][field] = val;
        this.dirtyMap[order.id] =
          this.draftDates[order.id].tanggalMulai !== (order.tanggalMulai || '') ||
          this.draftDates[order.id].tanggalDeadline !== (order.tanggalDeadline || '');
      },
      saveSingleSchedule: async function (order) {
        if (this.isKaryawan) return;
        var draft = this.draftDates[order.id] || {};
        var mulai = draft.tanggalMulai || '';
        var deadline = draft.tanggalDeadline || '';

        if (mulai && deadline && deadline < mulai) {
          this.$emit('notify', {
            type: 'error',
            message: 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'
          });
          return;
        }

        this.savingIdMap[order.id] = true;
        try {
          await global.ZcpPesananService.updateJadwal(
            order.id,
            {
              tanggalMulai: mulai,
              tanggalDeadline: deadline
            },
            order.namaPemesan
          );
          this.dirtyMap[order.id] = false;
          this.$emit('notify', {
            type: 'success',
            message: 'Jadwal pesanan "' + order.namaPemesan + '" berhasil disimpan.'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal menyimpan jadwal.'
          });
        } finally {
          this.savingIdMap[order.id] = false;
        }
      },
      applyBulkSchedule: async function () {
        if (!this.selectedIds.length) return;
        if (!this.bulkMulai && !this.bulkDeadline) {
          this.$emit('notify', {
            type: 'error',
            message: 'Isi minimal satu tanggal (Mulai atau Deadline) untuk bulk update.'
          });
          return;
        }
        if (this.bulkMulai && this.bulkDeadline && this.bulkDeadline < this.bulkMulai) {
          this.$emit('notify', {
            type: 'error',
            message: 'Tanggal deadline tidak boleh lebih awal dari tanggal mulai.'
          });
          return;
        }

        this.bulkSaving = true;
        try {
          var targetCount = this.selectedIds.length;
          var idsCopy = this.selectedIds.slice();
          await global.ZcpPesananService.bulkUpdateJadwal(idsCopy, {
            tanggalMulai: this.bulkMulai,
            tanggalDeadline: this.bulkDeadline
          });

          // Reset dirty flags untuk pesanan yang ikut bulk update agar sinkron dengan Firestore
          var self = this;
          idsCopy.forEach(function (id) {
            self.dirtyMap[id] = false;
          });

          this.selectedIds = [];
          this.bulkMulai = '';
          this.bulkDeadline = '';
          this.$emit('notify', {
            type: 'success',
            message: 'Jadwal ' + targetCount + ' pesanan berhasil diperbarui sekaligus.'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal melakukan bulk update jadwal.'
          });
        } finally {
          this.bulkSaving = false;
        }
      },
      getSideDoneCount: function (order, sisi) {
        if (this.sablonList && this.sablonList.length > 0) {
          return (
            (this.completedSablonTotals[order.id] &&
              Number(this.completedSablonTotals[order.id][sisi])) ||
            0
          );
        }
        return Number(order.sisiProgress && order.sisiProgress[sisi]) || 0;
      },
      getSidePercent: function (done, target) {
        if (!target || target <= 0) return 0;
        return Math.min(100, Math.round((done / target) * 100));
      },
      deadlineBadgeMeta: function (order) {
        if (order.statusSelesai) {
          return { cls: 'done', icon: 'check_circle', text: 'Pesanan Selesai' };
        }
        var st = global.ZcpPesananService.getDeadlineStatus(order);
        var days = global.ZcpPesananService.getDaysUntilDeadline(order.tanggalDeadline);
        if (st === 'overdue') {
          return {
            cls: 'danger',
            icon: 'warning',
            text: 'Lewat ' + Math.abs(days) + ' hari'
          };
        }
        if (st === 'soon') {
          return {
            cls: 'warn',
            icon: 'schedule',
            text: days === 0 ? 'Deadline Hari Ini' : 'Sisa ' + days + ' hari'
          };
        }
        if (st === 'normal') {
          return {
            cls: 'active',
            icon: 'event',
            text: global.ZcpPesananService.formatDateString(order.tanggalDeadline)
          };
        }
        return { cls: 'neutral', icon: 'event_busy', text: 'Belum Dijadwalkan' };
      },
      canUndoSelesai: function (order) {
        if (!this.isKaryawan) return true;
        return Boolean(order.completedByUid && order.completedByUid === this.currentUserUid);
      },
      formatDateString: function (ymd) {
        return global.ZcpPesananService.formatDateString(ymd);
      },
      openFilePreview: function (order) {
        this.filePreviewOrder = order;
      },
      closeFilePreview: function () {
        this.filePreviewOrder = null;
      },
      handleToggleSelesai: async function (order) {
        var self = this;

        if (order.statusSelesai) {
          if (!this.canUndoSelesai(order)) {
            this.$emit('notify', {
              type: 'error',
              message:
                'Hanya ' +
                (order.completedByName || 'akun yang menyelesaikan') +
                ' atau Admin yang dapat membatalkan status selesai pesanan ini.'
            });
            return;
          }
          this.savingIdMap[order.id] = true;
          try {
            await global.ZcpPesananService.toggleStatusSelesai(order.id, false, order);
            this.$emit('notify', {
              type: 'info',
              message: 'Pesanan "' + order.namaPemesan + '" dikembalikan ke daftar aktif.'
            });
          } catch (err) {
            this.$emit('notify', {
              type: 'error',
              message: (err && err.message) || 'Gagal mengubah status pesanan.'
            });
          } finally {
            this.savingIdMap[order.id] = false;
          }
          return;
        }

        // Cek apakah ada sisi yang progres sablonnya belum mencapai jumlahProduk
        var incompleteSides = [];
        var sisiList = Array.isArray(order.namaSisi) ? order.namaSisi : [];
        for (var i = 0; i < sisiList.length; i++) {
          var sisi = sisiList[i];
          var done = this.getSideDoneCount(order, sisi);
          if (done < order.jumlahProduk) {
            incompleteSides.push(sisi + ' (' + done + '/' + order.jumlahProduk + ')');
          }
        }

        if (incompleteSides.length > 0) {
          this.$emit('request-confirm', {
            title: 'Konfirmasi Pesanan Selesai',
            message:
              'Progres sablon untuk "' +
              order.namaPemesan +
              '" belum 100% pada sisi: ' +
              incompleteSides.join(', ') +
              '. Tetap tandai pesanan ini selesai?',
            confirmText: 'Ya, Tandai Selesai',
            variant: 'primary',
            onConfirm: async function () {
              await global.ZcpPesananService.toggleStatusSelesai(order.id, true, order);
              self.$emit('notify', {
                type: 'success',
                message: 'Pesanan "' + order.namaPemesan + '" ditandai selesai.'
              });
            }
          });
          return;
        }

        this.savingIdMap[order.id] = true;
        try {
          await global.ZcpPesananService.toggleStatusSelesai(order.id, true, order);
          this.$emit('notify', {
            type: 'success',
            message: 'Pesanan "' + order.namaPemesan + '" ditandai selesai.'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal menandai pesanan selesai.'
          });
        } finally {
          this.savingIdMap[order.id] = false;
        }
      }
    },
    template: `
      <div>
        <!-- 3 KPI Operasional -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Belum Selesai</div>
                <div class="kpi-value">{{ activeTotalCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">pending_actions</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span v-if="overdueTotalCount" style="color: var(--accent-danger); font-weight: 600;">
                {{ overdueTotalCount }} pesanan lewat deadline
              </span>
              <span v-else>Semua masih dalam batas waktu</span>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Perlu Prioritas (&le; 3 Hari)</div>
                <div class="kpi-value">{{ urgentTotalCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">schedule</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Diurutkan paling atas berdasarkan deadline terdekat
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Pesanan Selesai</div>
                <div class="kpi-value">{{ doneTotalCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">task_alt</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span class="kpi-highlight">Border hijau</span> dan dipindah ke bagian bawah
            </div>
          </div>
        </div>

        <!-- Bulk Update Bar (hanya Admin/Superadmin) -->
        <div v-if="!isKaryawan && selectedIds.length > 0" class="card bulk-bar">
          <div class="bulk-bar-info">
            <span class="badge-count">{{ selectedIds.length }} pesanan dipilih</span>
            <span class="form-hint">Atur tanggal mulai &amp; deadline sekaligus ke semua pesanan terpilih.</span>
          </div>

          <div class="bulk-bar-controls">
            <div class="bulk-date-field">
              <label>Mulai Kerjakan</label>
              <input v-model="bulkMulai" type="date" class="form-control" :disabled="bulkSaving" />
            </div>
            <div class="bulk-date-field">
              <label>Selesai Sebelum</label>
              <input v-model="bulkDeadline" type="date" class="form-control" :disabled="bulkSaving" />
            </div>
            <div class="action-group">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="bulkSaving"
                @click="applyBulkSchedule"
              >
                <span v-if="bulkSaving" class="spinner spinner-sm"></span>
                <span v-else class="material-symbols-rounded" style="font-size: 18px;">event_available</span>
                <span>Terapkan ke {{ selectedIds.length }} Pesanan</span>
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="bulkSaving"
                @click="clearSelection"
              >
                Batal
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Jadwal &amp; Progres Operasional</h2>
              <p>Pantau deadline, lakukan bulk update tanggal, dan cek progres tiap sisi sablon.</p>
            </div>

            <div class="panel-actions">
              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="searchQuery"
                  type="text"
                  class="form-control"
                  placeholder="Cari pemesan, produk, sisi..."
                  aria-label="Cari operasional"
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

              <select v-model="statusFilter" class="filter-select" aria-label="Filter operasional">
                <option value="all">Semua Pesanan</option>
                <option value="active">Belum Selesai</option>
                <option value="overdue">Lewat Deadline</option>
                <option value="unscheduled">Belum Dijadwalkan</option>
                <option value="done">Sudah Selesai</option>
              </select>

              <button
                v-if="!isKaryawan && filteredList.length"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="toggleSelectAll"
              >
                <span class="material-symbols-rounded" style="font-size: 17px;">
                  {{ allSelected ? 'deselect' : 'select_all' }}
                </span>
                <span>{{ allSelected ? 'Batal Pilih Semua' : 'Pilih Semua' }}</span>
              </button>

              <button
                v-if="!isKaryawan && activeFilteredOrders.length"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="selectAllActiveOnly"
              >
                <span>Pilih Aktif ({{ activeFilteredOrders.length }})</span>
              </button>
            </div>
          </div>

          <div v-if="loading" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Memuat data operasional...</p>
          </div>

          <div v-else-if="!filteredList.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">event_note</span>
            </div>
            <h3>{{ pesananList.length ? 'Tidak ada pesanan yang cocok' : 'Belum ada data pesanan' }}</h3>
            <p>
              {{
                pesananList.length
                  ? 'Coba ubah filter atau kata kunci pencarian di atas.'
                  : 'Tambahkan pesanan terlebih dahulu di menu Manajemen Pesanan.'
              }}
            </p>
            <button
              v-if="!pesananList.length"
              type="button"
              class="btn btn-primary"
              @click="$emit('go-pesanan')"
            >
              Buka Manajemen Pesanan
            </button>
          </div>

          <div v-else class="op-list">
            <!-- Bagian Atas: Pesanan Belum Selesai -->
            <div
              v-for="order in paginatedActiveOrders"
              :key="order.id"
              class="op-card"
              :class="{
                'is-overdue': !order.statusSelesai && deadlineBadgeMeta(order).cls === 'danger',
                'is-selected': !isKaryawan && isSelected(order.id)
              }"
            >
              <div class="op-card-main">
                <div v-if="!isKaryawan" class="op-select-col">
                  <input
                    type="checkbox"
                    class="op-checkbox"
                    :checked="isSelected(order.id)"
                    :aria-label="'Pilih pesanan ' + order.namaPemesan"
                    @change="toggleSelect(order.id)"
                  />
                </div>

                <div class="op-order-info">
                  <div class="op-order-title-row">
                    <span class="op-order-name">{{ order.namaPemesan }}</span>
                    <span class="badge-count">{{ order.jumlahProduk }} pcs</span>
                    <span class="status-badge" :class="deadlineBadgeMeta(order).cls">
                      <span class="material-symbols-rounded" style="font-size: 14px;">
                        {{ deadlineBadgeMeta(order).icon }}
                      </span>
                      <span>{{ deadlineBadgeMeta(order).text }}</span>
                    </span>
                    <button
                      v-if="order.fileDesigns && order.fileDesigns.length"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="openFilePreview(order)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 15px;">attach_file</span>
                      <span>{{ order.fileDesigns.length }} File</span>
                    </button>
                  </div>
                  <div class="op-order-sub">
                    <strong>{{ order.namaProduk }}</strong> • Expedisi: {{ order.namaExpedisi }}
                    <span v-if="order.catatan"> • {{ order.catatan }}</span>
                  </div>
                </div>

                <div class="op-schedule-col">
                  <template v-if="!isKaryawan">
                    <div class="op-date-pair">
                      <div class="op-date-field">
                        <label>Mulai Kerjakan</label>
                        <input
                          type="date"
                          class="form-control"
                          :value="getDraftDate(order.id, 'tanggalMulai')"
                          :disabled="Boolean(savingIdMap[order.id])"
                          @input="onDateInput(order, 'tanggalMulai', $event.target.value)"
                        />
                      </div>
                      <div class="op-date-field">
                        <label>Selesai Sebelum</label>
                        <input
                          type="date"
                          class="form-control"
                          :value="getDraftDate(order.id, 'tanggalDeadline')"
                          :disabled="Boolean(savingIdMap[order.id])"
                          @input="onDateInput(order, 'tanggalDeadline', $event.target.value)"
                        />
                      </div>
                    </div>
                    <button
                      v-if="dirtyMap[order.id]"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="Boolean(savingIdMap[order.id])"
                      @click="saveSingleSchedule(order)"
                    >
                      <span v-if="savingIdMap[order.id]" class="spinner spinner-sm"></span>
                      <span>Simpan Jadwal</span>
                    </button>
                  </template>
                  <div v-else class="readonly-schedule-box">
                    <span class="chip">Mulai: {{ formatDateString(order.tanggalMulai) }}</span>
                    <span class="chip">Deadline: {{ formatDateString(order.tanggalDeadline) }}</span>
                  </div>
                </div>

                <div class="op-action-col">
                  <button
                    type="button"
                    class="btn btn-success"
                    :disabled="Boolean(savingIdMap[order.id])"
                    @click="handleToggleSelesai(order)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 18px;">check_circle</span>
                    <span>Pesanan Selesai</span>
                  </button>
                </div>
              </div>

              <!-- Indikator Progres Per Sisi (Looping sisi yang dipilih pada pesanan) -->
              <div class="op-sisi-section">
                <div
                  v-for="sisi in order.namaSisi"
                  :key="sisi"
                  class="op-sisi-row"
                >
                  <div class="op-sisi-label">
                    <span class="chip">{{ sisi }}</span>
                  </div>
                  <div class="op-progress-wrap">
                    <div class="op-progress-track">
                      <div
                        class="op-progress-fill"
                        :class="{ complete: getSideDoneCount(order, sisi) >= order.jumlahProduk }"
                        :style="{ width: getSidePercent(getSideDoneCount(order, sisi), order.jumlahProduk) + '%' }"
                      ></div>
                    </div>
                  </div>
                  <div class="op-sisi-count">
                    <strong>{{ getSideDoneCount(order, sisi) }}</strong> dari {{ order.jumlahProduk }} selesai
                  </div>
                </div>
              </div>
            </div>

            <!-- Pemisah jika ada pesanan selesai -->
            <div v-if="paginatedDoneOrders.length" class="op-section-divider">
              <span>Pesanan Selesai ({{ paginatedDoneOrders.length }})</span>
            </div>

            <!-- Bagian Bawah: Pesanan Selesai (Border Hijau) -->
            <div
              v-for="order in paginatedDoneOrders"
              :key="order.id"
              class="op-card is-done"
              :class="{ 'is-selected': !isKaryawan && isSelected(order.id) }"
            >
              <div class="op-card-main">
                <div v-if="!isKaryawan" class="op-select-col">
                  <input
                    type="checkbox"
                    class="op-checkbox"
                    :checked="isSelected(order.id)"
                    :aria-label="'Pilih pesanan ' + order.namaPemesan"
                    @change="toggleSelect(order.id)"
                  />
                </div>

                <div class="op-order-info">
                  <div class="op-order-title-row">
                    <span class="op-order-name">{{ order.namaPemesan }}</span>
                    <span class="badge-count">{{ order.jumlahProduk }} pcs</span>
                    <span class="status-badge done">
                      <span class="material-symbols-rounded" style="font-size: 14px;">check_circle</span>
                      <span>Selesai</span>
                    </span>
                    <span class="completed-by-tag">
                      <span class="material-symbols-rounded" style="font-size: 14px;">person</span>
                      <span>Selesai oleh: {{ order.completedByName || 'Admin' }}</span>
                    </span>
                    <button
                      v-if="order.fileDesigns && order.fileDesigns.length"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="openFilePreview(order)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 15px;">attach_file</span>
                      <span>{{ order.fileDesigns.length }} File</span>
                    </button>
                  </div>
                  <div class="op-order-sub">
                    <strong>{{ order.namaProduk }}</strong> • Expedisi: {{ order.namaExpedisi }}
                    <span v-if="order.catatan"> • {{ order.catatan }}</span>
                  </div>
                </div>

                <div class="op-schedule-col">
                  <template v-if="!isKaryawan">
                    <div class="op-date-pair">
                      <div class="op-date-field">
                        <label>Mulai Kerjakan</label>
                        <input
                          type="date"
                          class="form-control"
                          :value="getDraftDate(order.id, 'tanggalMulai')"
                          :disabled="Boolean(savingIdMap[order.id])"
                          @input="onDateInput(order, 'tanggalMulai', $event.target.value)"
                        />
                      </div>
                      <div class="op-date-field">
                        <label>Selesai Sebelum</label>
                        <input
                          type="date"
                          class="form-control"
                          :value="getDraftDate(order.id, 'tanggalDeadline')"
                          :disabled="Boolean(savingIdMap[order.id])"
                          @input="onDateInput(order, 'tanggalDeadline', $event.target.value)"
                        />
                      </div>
                    </div>
                    <button
                      v-if="dirtyMap[order.id]"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="Boolean(savingIdMap[order.id])"
                      @click="saveSingleSchedule(order)"
                    >
                      Simpan Jadwal
                    </button>
                  </template>
                  <div v-else class="readonly-schedule-box">
                    <span class="chip">Mulai: {{ formatDateString(order.tanggalMulai) }}</span>
                    <span class="chip">Deadline: {{ formatDateString(order.tanggalDeadline) }}</span>
                  </div>
                </div>

                <div class="op-action-col">
                  <button
                    v-if="canUndoSelesai(order)"
                    type="button"
                    class="btn btn-secondary"
                    :disabled="Boolean(savingIdMap[order.id])"
                    @click="handleToggleSelesai(order)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 18px;">undo</span>
                    <span>Batal Selesai</span>
                  </button>
                  <span v-else class="form-hint">
                    Diselesaikan oleh {{ order.completedByName || 'Admin' }}
                  </span>
                </div>
              </div>

              <div class="op-sisi-section">
                <div
                  v-for="sisi in order.namaSisi"
                  :key="sisi"
                  class="op-sisi-row"
                >
                  <div class="op-sisi-label">
                    <span class="chip">{{ sisi }}</span>
                  </div>
                  <div class="op-progress-wrap">
                    <div class="op-progress-track">
                      <div
                        class="op-progress-fill complete"
                        :style="{ width: getSidePercent(getSideDoneCount(order, sisi), order.jumlahProduk) + '%' }"
                      ></div>
                    </div>
                  </div>
                  <div class="op-sisi-count">
                    <strong>{{ getSideDoneCount(order, sisi) }}</strong> dari {{ order.jumlahProduk }} selesai
                  </div>
                </div>
              </div>
            </div>
          </div>

          <table-pagination
            v-if="!loading && combinedOrderedList.length"
            :total-items="combinedOrderedList.length"
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

        <file-preview-modal
          :visible="Boolean(filePreviewOrder)"
          :title="'File Design — ' + (filePreviewOrder ? filePreviewOrder.namaPemesan : '')"
          :subtitle="filePreviewOrder ? (filePreviewOrder.namaProduk + ' • ' + (filePreviewOrder.fileDesigns || []).length + ' file') : ''"
          :files="filePreviewOrder ? filePreviewOrder.fileDesigns : []"
          @close="closeFilePreview"
        ></file-preview-modal>
      </div>
    `
  };
})(window);
