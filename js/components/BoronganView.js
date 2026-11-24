(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.BoronganView = {
    name: 'BoronganView',
    props: {
      pesananList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      requestsList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      staffList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      user: {
        type: Object,
        default: function () {
          return { uid: '', email: '', nama: '', role: 'karyawan' };
        }
      },
      loading: { type: Boolean, default: false },
      loadingRequests: { type: Boolean, default: false },
      defaultPageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: ['notify', 'request-confirm'],
    data: function () {
      return {
        activeTab: 'borongan',
        searchQuery: '',
        staffFilter: '',
        requestSearch: '',
        requestStatusFilter: 'all',
        currentPage: 1,
        requestPage: 1,
        localPageSize: this.defaultPageSize,
        requestPageSize: this.defaultPageSize,
        busyRequestId: null,
        changeModal: {
          visible: false,
          order: null,
          rows: [],
          alasan: '',
          saving: false,
          error: ''
        }
      };
    },
    watch: {
      defaultPageSize: function (val) {
        this.localPageSize = val;
        this.requestPageSize = val;
        this.currentPage = 1;
        this.requestPage = 1;
      },
      searchQuery: function () {
        this.currentPage = 1;
      },
      staffFilter: function () {
        this.currentPage = 1;
      },
      requestSearch: function () {
        this.requestPage = 1;
      },
      requestStatusFilter: function () {
        this.requestPage = 1;
      }
    },
    computed: {
      isSuperadmin: function () {
        return Boolean(this.user && this.user.role === 'superadmin');
      },
      currentUid: function () {
        return (this.user && this.user.uid) || '';
      },
      pendingByOrderMap: function () {
        var map = {};
        (this.requestsList || []).forEach(function (r) {
          if (r && r.status === 'pending' && r.pesananId) {
            map[r.pesananId] = r;
          }
        });
        return map;
      },
      /**
       * Pesanan selesai yang memiliki data kontribusi dan boleh dilihat oleh user saat ini.
       */
      visibleBoronganOrders: function () {
        var uid = this.currentUid;
        var isSuper = this.isSuperadmin;
        return (this.pesananList || []).filter(function (order) {
          if (!order || !order.statusSelesai) return false;
          var kontrib = Array.isArray(order.kontribusi) ? order.kontribusi : [];
          if (!kontrib.length) return false;
          if (isSuper) return true;
          return kontrib.some(function (k) {
            return k && k.uid === uid;
          });
        });
      },
      staffFilterOptions: function () {
        var map = {};
        var list = [];
        this.visibleBoronganOrders.forEach(function (order) {
          (order.kontribusi || []).forEach(function (k) {
            if (k && k.uid && !map[k.uid]) {
              map[k.uid] = true;
              list.push({ uid: k.uid, nama: k.nama || k.uid });
            }
          });
        });
        return list.sort(function (a, b) {
          return a.nama.localeCompare(b.nama);
        });
      },
      filteredBoronganOrders: function () {
        var q = this.searchQuery.trim().toLowerCase();
        var sf = this.staffFilter;
        return this.visibleBoronganOrders.filter(function (order) {
          if (sf) {
            var hasStaff = (order.kontribusi || []).some(function (k) {
              return k.uid === sf;
            });
            if (!hasStaff) return false;
          }
          if (!q) return true;
          var matchOrder =
            (order.namaPemesan || '').toLowerCase().indexOf(q) !== -1 ||
            (order.namaProduk || '').toLowerCase().indexOf(q) !== -1 ||
            (order.namaAsalPesanan || '').toLowerCase().indexOf(q) !== -1 ||
            (order.completedByName || '').toLowerCase().indexOf(q) !== -1;
          var matchStaff = (order.kontribusi || []).some(function (k) {
            return (k.nama || '').toLowerCase().indexOf(q) !== -1;
          });
          return matchOrder || matchStaff;
        });
      },
      paginatedBoronganOrders: function () {
        if (this.localPageSize === 'all') return this.filteredBoronganOrders;
        var size = Number(this.localPageSize) || 10;
        var start = (this.currentPage - 1) * size;
        return this.filteredBoronganOrders.slice(start, start + size);
      },
      myTotalPcsCount: function () {
        var uid = this.currentUid;
        var isSuper = this.isSuperadmin;
        return this.visibleBoronganOrders.reduce(function (sum, order) {
          if (isSuper) {
            return sum + (Number(order.jumlahProduk) || 0);
          }
          var mine = (order.kontribusi || []).find(function (k) {
            return k.uid === uid;
          });
          return sum + (mine ? Number(mine.qty) || 0 : 0);
        }, 0);
      },
      visibleRequests: function () {
        var uid = this.currentUid;
        var isSuper = this.isSuperadmin;
        return (this.requestsList || []).filter(function (req) {
          if (isSuper) return true;
          return Array.isArray(req.involvedUids) && req.involvedUids.indexOf(uid) !== -1;
        });
      },
      pendingRequestsCount: function () {
        return this.visibleRequests.filter(function (r) {
          return r.status === 'pending';
        }).length;
      },
      filteredRequests: function () {
        var q = this.requestSearch.trim().toLowerCase();
        var st = this.requestStatusFilter;
        return this.visibleRequests.filter(function (req) {
          if (st !== 'all' && req.status !== st) return false;
          if (!q) return true;
          return (
            (req.namaPemesan || '').toLowerCase().indexOf(q) !== -1 ||
            (req.namaProduk || '').toLowerCase().indexOf(q) !== -1 ||
            (req.requestedByName || '').toLowerCase().indexOf(q) !== -1 ||
            (req.completedByName || '').toLowerCase().indexOf(q) !== -1 ||
            (req.alasan || '').toLowerCase().indexOf(q) !== -1
          );
        });
      },
      paginatedRequests: function () {
        if (this.requestPageSize === 'all') return this.filteredRequests;
        var size = Number(this.requestPageSize) || 10;
        var start = (this.requestPage - 1) * size;
        return this.filteredRequests.slice(start, start + size);
      },
      changeDraftTotal: function () {
        return (this.changeModal.rows || []).reduce(function (sum, r) {
          return sum + Math.max(0, parseInt(r.qty, 10) || 0);
        }, 0);
      },
      changeTargetQty: function () {
        return Number(this.changeModal.order && this.changeModal.order.jumlahProduk) || 0;
      }
    },
    methods: {
      formatDateTime: function (ts) {
        if (!ts) return 'Baru saja';
        var d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      },
      getMyQtyInOrder: function (order) {
        var uid = this.currentUid;
        var found = (order.kontribusi || []).find(function (k) {
          return k.uid === uid;
        });
        return found ? Number(found.qty) || 0 : 0;
      },
      canRequestChange: function (order) {
        if (!order || !order.statusSelesai) return false;
        var kontrib = Array.isArray(order.kontribusi) ? order.kontribusi : [];
        if (kontrib.length < 2) return false;
        // Yang mengklik pesanan selesai di operasional tidak dapat mengajukan perubahan
        if (order.completedByUid && order.completedByUid === this.currentUid) return false;
        if (this.pendingByOrderMap[order.id]) return false;
        return true;
      },
      cannotRequestReason: function (order) {
        if (!order) return '';
        if (this.pendingByOrderMap[order.id]) {
          return 'Ada pengajuan menunggu persetujuan';
        }
        if ((order.kontribusi || []).length < 2) {
          return 'Minimal 2 karyawan kontribusi';
        }
        if (order.completedByUid && order.completedByUid === this.currentUid) {
          return 'Penyelesai pesanan tidak dapat mengajukan';
        }
        return '';
      },
      canApproveOrReject: function (req) {
        if (!req || req.status !== 'pending') return false;
        if (this.isSuperadmin) return true;
        return Boolean(req.completedByUid && req.completedByUid === this.currentUid);
      },
      requestStatusMeta: function (status) {
        if (status === 'approved') return { cls: 'done', label: 'Disetujui', icon: 'check_circle' };
        if (status === 'rejected') return { cls: 'danger', label: 'Ditolak', icon: 'cancel' };
        return { cls: 'warn', label: 'Menunggu Persetujuan', icon: 'hourglass_top' };
      },
      openChangeModal: function (order) {
        if (!this.canRequestChange(order)) return;
        var existingMap = {};
        var existingByUid = {};
        (order.kontribusi || []).forEach(function (k) {
          existingMap[k.uid] = Number(k.qty) || 0;
          existingByUid[k.uid] = k;
        });

        var rows = [];
        var seenUid = {};
        (this.staffList || []).forEach(function (u) {
          var uid = u.uid || u.id;
          if (!uid || seenUid[uid]) return;
          seenUid[uid] = true;
          rows.push({
            uid: uid,
            nama: u.nama || u.email || 'Karyawan',
            role: u.role || 'karyawan',
            qty: existingMap[uid] || 0
          });
        });

        Object.keys(existingByUid).forEach(function (uid) {
          if (!seenUid[uid]) {
            var item = existingByUid[uid];
            rows.push({
              uid: uid,
              nama: item.nama || 'Karyawan',
              role: item.role || 'karyawan',
              qty: Number(item.qty) || 0
            });
          }
        });

        this.changeModal = {
          visible: true,
          order: order,
          rows: rows,
          alasan: '',
          saving: false,
          error: ''
        };
      },
      closeChangeModal: function () {
        if (this.changeModal.saving) return;
        this.changeModal.visible = false;
        this.changeModal.order = null;
        this.changeModal.rows = [];
        this.changeModal.alasan = '';
        this.changeModal.error = '';
      },
      submitChangeRequest: async function () {
        var order = this.changeModal.order;
        if (!order || this.changeModal.saving) return;
        this.changeModal.error = '';

        var target = Number(order.jumlahProduk) || 0;
        var total = this.changeDraftTotal;
        if (total !== target) {
          var msg =
            'Total kontribusi baru (' +
            total +
            ' pcs) harus sama persis dengan jumlah pesanan (' +
            target +
            ' pcs).';
          this.changeModal.error = msg;
          if (global.ZcpAlert) {
            global.ZcpAlert.error(msg, 'Total Kontribusi Tidak Sesuai');
          }
          return;
        }

        this.changeModal.saving = true;
        try {
          await global.ZcpBoronganService.createChangeRequest({
            order: order,
            newKontribusi: this.changeModal.rows,
            alasan: this.changeModal.alasan
          });
          this.changeModal.visible = false;
          this.$emit('notify', {
            type: 'success',
            message:
              'Pengajuan perubahan kontribusi untuk "' +
              order.namaPemesan +
              '" berhasil dikirim dan menunggu persetujuan.'
          });
        } catch (err) {
          var errMsg = (err && err.message) || 'Gagal mengajukan perubahan kontribusi.';
          this.changeModal.error = errMsg;
          if (global.ZcpAlert) {
            global.ZcpAlert.error(errMsg);
          }
        } finally {
          this.changeModal.saving = false;
        }
      },
      handleApproveRequest: function (req) {
        if (!this.canApproveOrReject(req) || this.busyRequestId) return;
        var self = this;
        var summaryBaru = (req.newKontribusi || [])
          .map(function (k) {
            return k.nama + ': ' + k.qty + ' pcs';
          })
          .join(', ');

        this.$emit('request-confirm', {
          title: 'Setujui Perubahan Kontribusi',
          message:
            'Setujui perubahan kontribusi pesanan "' +
            req.namaPemesan +
            '" (' +
            req.namaProduk +
            ') dari ' +
            req.requestedByName +
            '?\n\nKontribusi baru: ' +
            summaryBaru,
          confirmText: 'Ya, Setujui',
          variant: 'success',
          icon: 'question',
          onConfirm: async function () {
            self.busyRequestId = req.id;
            try {
              await global.ZcpBoronganService.approveChangeRequest(req);
              self.$emit('notify', {
                type: 'success',
                message: 'Pengajuan perubahan kontribusi berhasil disetujui & data borongan diperbarui.'
              });
            } finally {
              self.busyRequestId = null;
            }
          }
        });
      },
      handleRejectRequest: async function (req) {
        if (!this.canApproveOrReject(req) || this.busyRequestId) return;
        var self = this;
        if (global.ZcpAlert && typeof global.ZcpAlert.prompt === 'function') {
          await global.ZcpAlert.prompt({
            title: 'Tolak Pengajuan Perubahan',
            message:
              'Tolak pengajuan perubahan kontribusi dari ' +
              (req.requestedByName || 'karyawan') +
              ' untuk pesanan "' +
              req.namaPemesan +
              '"?',
            inputLabel: 'Alasan Penolakan (Opsional)',
            inputPlaceholder: 'Contoh: Jumlah sudah sesuai dengan catatan produksi...',
            confirmText: 'Tolak Pengajuan',
            variant: 'danger',
            onConfirm: async function (note) {
              self.busyRequestId = req.id;
              try {
                await global.ZcpBoronganService.rejectChangeRequest(req, note);
                self.$emit('notify', {
                  type: 'info',
                  message: 'Pengajuan perubahan kontribusi telah ditolak.'
                });
              } finally {
                self.busyRequestId = null;
              }
            }
          });
          return;
        }

        this.$emit('request-confirm', {
          title: 'Tolak Pengajuan Perubahan',
          message: 'Tolak pengajuan perubahan kontribusi dari ' + req.requestedByName + '?',
          confirmText: 'Ya, Tolak',
          variant: 'danger',
          onConfirm: async function () {
            await global.ZcpBoronganService.rejectChangeRequest(req, '');
            self.$emit('notify', {
              type: 'info',
              message: 'Pengajuan perubahan kontribusi ditolak.'
            });
          }
        });
      }
    },
    template: `
      <div>
        <!-- 3 KPI Borongan -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Pesanan Borongan Tercatat</div>
                <div class="kpi-value">{{ visibleBoronganOrders.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">payments</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              {{ isSuperadmin ? 'Seluruh pesanan selesai dengan kontribusi' : 'Pesanan selesai dengan kontribusi Anda' }}
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">{{ isSuperadmin ? 'Total Qty Produksi' : 'Total Kontribusi Saya' }}</div>
                <div class="kpi-value">{{ myTotalPcsCount }} <span style="font-size: 14px; font-weight: 600;">pcs</span></div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">inventory_2</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Akumulasi qty dari pesanan yang telah diselesaikan
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Pengajuan Perubahan Pending</div>
                <div class="kpi-value">{{ pendingRequestsCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">pending_actions</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Menunggu persetujuan penyelesai pesanan / Superadmin
            </div>
          </div>
        </div>

        <!-- Tabs Borongan -->
        <div class="tabs-bar" role="tablist" aria-label="Menu Borongan">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'borongan'"
            class="tab-btn"
            :class="{ active: activeTab === 'borongan' }"
            @click="activeTab = 'borongan'"
          >
            <span class="material-symbols-rounded" style="font-size: 19px;">payments</span>
            <span>Data Borongan</span>
            <span class="tab-count">{{ visibleBoronganOrders.length }}</span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'pengajuan'"
            class="tab-btn"
            :class="{ active: activeTab === 'pengajuan' }"
            @click="activeTab = 'pengajuan'"
          >
            <span class="material-symbols-rounded" style="font-size: 19px;">rule</span>
            <span>Daftar Pengajuan Perubahan</span>
            <span class="tab-count">{{ pendingRequestsCount || visibleRequests.length }}</span>
          </button>
        </div>

        <!-- TAB 1: DATA BORONGAN -->
        <div v-if="activeTab === 'borongan'" class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Data Borongan Karyawan</h2>
              <p>
                {{
                  isSuperadmin
                    ? 'Seluruh riwayat kontribusi karyawan pada pesanan selesai.'
                    : 'Menampilkan pesanan selesai yang memiliki hubungan kontribusi dengan Anda.'
                }}
              </p>
            </div>

            <div class="panel-actions">
              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="searchQuery"
                  type="text"
                  class="form-control"
                  placeholder="Cari pemesan, produk, karyawan..."
                  aria-label="Cari data borongan"
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

              <select
                v-if="isSuperadmin"
                v-model="staffFilter"
                class="filter-select"
                aria-label="Filter karyawan"
              >
                <option value="">Semua Karyawan</option>
                <option v-for="st in staffFilterOptions" :key="st.uid" :value="st.uid">
                  {{ st.nama }}
                </option>
              </select>
            </div>
          </div>

          <div v-if="loading" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Memuat data borongan...</p>
          </div>

          <div v-else-if="!filteredBoronganOrders.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">payments</span>
            </div>
            <h3>{{ (searchQuery || staffFilter) ? 'Data borongan tidak ditemukan' : 'Belum ada data borongan' }}</h3>
            <p>
              {{
                (searchQuery || staffFilter)
                  ? 'Coba ubah filter atau kata kunci pencarian.'
                  : 'Data muncul otomatis setelah pesanan diatur kontribusinya dan ditandai Selesai di menu Operasional.'
              }}
            </p>
          </div>

          <div v-else class="table-container">
            <table class="data-table responsive-table">
              <thead>
                <tr>
                  <th class="col-no">No</th>
                  <th>Pesanan &amp; Produk</th>
                  <th>Kontribusi Karyawan</th>
                  <th v-if="!isSuperadmin">Kontribusi Saya</th>
                  <th>Diselesaikan Oleh</th>
                  <th>Tanggal Selesai</th>
                  <th class="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(order, index) in paginatedBoronganOrders" :key="order.id">
                  <td class="col-no" data-label="No">
                    {{ (localPageSize === 'all' ? 0 : (currentPage - 1) * Number(localPageSize)) + index + 1 }}
                  </td>
                  <td data-label="Pesanan & Produk">
                    <div style="font-weight: 700;">{{ order.namaPemesan }}</div>
                    <div class="form-hint" style="margin-top: 2px;">
                      {{ order.namaProduk }} • <strong>{{ order.jumlahProduk }} pcs</strong>
                      <span v-if="order.namaAsalPesanan"> • {{ order.namaAsalPesanan }}</span>
                    </div>
                  </td>
                  <td class="sisi-cell" data-label="Kontribusi Karyawan">
                    <div class="chips-wrap">
                      <span
                        v-for="k in order.kontribusi"
                        :key="k.uid"
                        class="chip"
                        :class="{ 'is-me-chip': k.uid === currentUid }"
                      >
                        {{ k.nama }}: <strong>{{ k.qty }} pcs</strong>
                      </span>
                    </div>
                  </td>
                  <td v-if="!isSuperadmin" data-label="Kontribusi Saya">
                    <span class="badge-count">{{ getMyQtyInOrder(order) }} pcs</span>
                  </td>
                  <td data-label="Diselesaikan Oleh">
                    <span class="completed-by-tag">
                      <span class="material-symbols-rounded" style="font-size: 14px;">person</span>
                      <span>{{ order.completedByName || 'Admin' }}</span>
                    </span>
                  </td>
                  <td data-label="Tanggal Selesai">
                    {{ formatDateTime(order.completedAt || order.updatedAt) }}
                  </td>
                  <td class="col-actions" data-label="Aksi">
                    <button
                      v-if="canRequestChange(order)"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="openChangeModal(order)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 16px;">edit_note</span>
                      <span>Ajukan Perubahan</span>
                    </button>
                    <span
                      v-else-if="pendingByOrderMap[order.id]"
                      class="status-badge warn"
                    >
                      <span class="material-symbols-rounded" style="font-size: 14px;">hourglass_top</span>
                      <span>Menunggu Persetujuan</span>
                    </span>
                    <span v-else class="form-hint">
                      {{ cannotRequestReason(order) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <table-pagination
            v-if="!loading && filteredBoronganOrders.length"
            :total-items="filteredBoronganOrders.length"
            :current-page="currentPage"
            :page-size="localPageSize"
            @update:current-page="currentPage = $event"
            @update:page-size="localPageSize = $event"
          ></table-pagination>
        </div>

        <!-- TAB 2: DAFTAR PENGAJUAN PERUBAHAN KONTRIBUSI -->
        <div v-else class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Daftar Pengajuan Perubahan Kontribusi</h2>
              <p>Hanya menampilkan pengajuan yang melibatkan akun Anda (Superadmin melihat seluruh pengajuan). Persetujuan dilakukan oleh penyelesai pesanan atau Superadmin.</p>
            </div>

            <div class="panel-actions">
              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="requestSearch"
                  type="text"
                  class="form-control"
                  placeholder="Cari pemesan, pengaju, alasan..."
                  aria-label="Cari pengajuan perubahan"
                />
                <button
                  v-if="requestSearch"
                  type="button"
                  class="input-action-btn"
                  aria-label="Hapus pencarian"
                  @click="requestSearch = ''"
                >
                  <span class="material-symbols-rounded" style="font-size: 18px;">close</span>
                </button>
              </div>

              <select v-model="requestStatusFilter" class="filter-select" aria-label="Filter status pengajuan">
                <option value="all">Semua Status</option>
                <option value="pending">Menunggu Persetujuan</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
              </select>
            </div>
          </div>

          <div v-if="loadingRequests" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Memuat daftar pengajuan...</p>
          </div>

          <div v-else-if="!filteredRequests.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">rule</span>
            </div>
            <h3>{{ (requestSearch || requestStatusFilter !== 'all') ? 'Pengajuan tidak ditemukan' : 'Belum ada pengajuan perubahan' }}</h3>
            <p>
              {{
                (requestSearch || requestStatusFilter !== 'all')
                  ? 'Coba ubah filter status atau kata kunci pencarian.'
                  : 'Pengajuan perubahan kontribusi yang melibatkan Anda akan muncul di sini.'
              }}
            </p>
          </div>

          <div v-else class="table-container">
            <table class="data-table responsive-table">
              <thead>
                <tr>
                  <th class="col-no">No</th>
                  <th>Pesanan &amp; Pengaju</th>
                  <th>Perubahan Kontribusi</th>
                  <th>Alasan Perubahan</th>
                  <th>Penyetuju</th>
                  <th>Status</th>
                  <th class="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(req, index) in paginatedRequests" :key="req.id">
                  <td class="col-no" data-label="No">
                    {{ (requestPageSize === 'all' ? 0 : (requestPage - 1) * Number(requestPageSize)) + index + 1 }}
                  </td>
                  <td data-label="Pesanan & Pengaju">
                    <div style="font-weight: 700;">{{ req.namaPemesan }}</div>
                    <div class="form-hint">{{ req.namaProduk }} • {{ req.jumlahProduk }} pcs</div>
                    <div class="form-hint" style="margin-top: 4px;">
                      Pengaju: <strong>{{ req.requestedByName }}</strong> • {{ formatDateTime(req.createdAt) }}
                    </div>
                  </td>
                  <td class="sisi-cell" data-label="Perubahan Kontribusi">
                    <div class="borongan-diff-block">
                      <div class="borongan-diff-row">
                        <span class="form-hint" style="min-width: 58px;">Lama:</span>
                        <div class="chips-wrap">
                          <span v-for="k in req.oldKontribusi" :key="'old_' + k.uid" class="chip">
                            {{ k.nama }}: {{ k.qty }} pcs
                          </span>
                        </div>
                      </div>
                      <div class="borongan-diff-row">
                        <span class="form-hint" style="min-width: 58px; color: var(--accent-info); font-weight: 600;">Usulan:</span>
                        <div class="chips-wrap">
                          <span
                            v-for="k in req.newKontribusi"
                            :key="'new_' + k.uid"
                            class="chip"
                            :class="{ 'is-me-chip': k.uid === currentUid }"
                          >
                            {{ k.nama }}: <strong>{{ k.qty }} pcs</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Alasan">
                    <span v-if="req.alasan" style="font-size: 13px;">{{ req.alasan }}</span>
                    <span v-else class="form-hint">(Tidak ada alasan)</span>
                    <div v-if="req.reviewNote" class="form-hint" style="margin-top: 4px; color: var(--accent-danger);">
                      Catatan penolakan: {{ req.reviewNote }}
                    </div>
                  </td>
                  <td data-label="Penyetuju">
                    <div style="font-size: 13px; font-weight: 600;">{{ req.completedByName || 'Superadmin' }}</div>
                    <div v-if="req.reviewedByName" class="form-hint">
                      Diproses: {{ req.reviewedByName }}
                    </div>
                  </td>
                  <td data-label="Status">
                    <span class="status-badge" :class="requestStatusMeta(req.status).cls">
                      <span class="material-symbols-rounded" style="font-size: 14px;">
                        {{ requestStatusMeta(req.status).icon }}
                      </span>
                      <span>{{ requestStatusMeta(req.status).label }}</span>
                    </span>
                  </td>
                  <td class="col-actions" data-label="Aksi">
                    <div v-if="canApproveOrReject(req)" class="action-group">
                      <button
                        type="button"
                        class="btn btn-success btn-sm"
                        :disabled="busyRequestId === req.id"
                        @click="handleApproveRequest(req)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">check</span>
                        <span>Setujui</span>
                      </button>
                      <button
                        type="button"
                        class="btn btn-danger btn-sm"
                        :disabled="busyRequestId === req.id"
                        @click="handleRejectRequest(req)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">close</span>
                        <span>Tolak</span>
                      </button>
                    </div>
                    <span v-else class="form-hint">
                      {{
                        req.status === 'pending'
                          ? 'Menunggu ' + (req.completedByName || 'Superadmin')
                          : formatDateTime(req.reviewedAt)
                      }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <table-pagination
            v-if="!loadingRequests && filteredRequests.length"
            :total-items="filteredRequests.length"
            :current-page="requestPage"
            :page-size="requestPageSize"
            @update:current-page="requestPage = $event"
            @update:page-size="requestPageSize = $event"
          ></table-pagination>
        </div>

        <!-- Modal Ajukan Perubahan Kontribusi -->
        <div
          v-if="changeModal.visible && changeModal.order"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeChangeModal"
        >
          <div class="modal-card">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">Ajukan Perubahan Kontribusi</h3>
                <div class="form-hint">
                  {{ changeModal.order.namaPemesan }} — {{ changeModal.order.namaProduk }} ({{ changeTargetQty }} pcs)
                </div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                :disabled="changeModal.saving"
                aria-label="Tutup modal"
                @click="closeChangeModal"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>

            <form @submit.prevent="submitChangeRequest">
              <div class="modal-body">
                <div v-if="changeModal.error" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ changeModal.error }}</div>
                </div>

                <div
                  class="kontribusi-summary-bar"
                  :class="{
                    over: changeDraftTotal > changeTargetQty,
                    complete: changeDraftTotal === changeTargetQty
                  }"
                >
                  <div>
                    <div style="font-size: 12px; opacity: 0.85;">Total Usulan Kontribusi Baru</div>
                    <div style="font-size: 18px; font-weight: 700;">
                      {{ changeDraftTotal }} / {{ changeTargetQty }} pcs
                    </div>
                  </div>
                  <div style="text-align: right; font-size: 12.5px; font-weight: 600;">
                    <span v-if="changeDraftTotal === changeTargetQty">Total sesuai target</span>
                    <span v-else-if="changeDraftTotal > changeTargetQty">
                      Kelebihan +{{ changeDraftTotal - changeTargetQty }} pcs
                    </span>
                    <span v-else>
                      Kurang {{ changeTargetQty - changeDraftTotal }} pcs
                    </span>
                  </div>
                </div>

                <div class="kontribusi-list" style="margin-bottom: 14px;">
                  <div
                    v-for="row in changeModal.rows"
                    :key="row.uid"
                    class="kontribusi-row"
                  >
                    <div class="kontribusi-staff-info">
                      <strong>{{ row.nama }}</strong>
                      <span class="role-badge" :class="row.role">{{ row.role }}</span>
                    </div>
                    <div class="kontribusi-qty-wrap">
                      <input
                        v-model.number="row.qty"
                        type="number"
                        min="0"
                        :max="changeTargetQty"
                        step="1"
                        class="form-control kontribusi-qty-input"
                        :disabled="changeModal.saving"
                      />
                      <span class="form-hint">pcs</span>
                    </div>
                  </div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" for="borongan-alasan">
                    Alasan Perubahan (Opsional)
                  </label>
                  <textarea
                    id="borongan-alasan"
                    v-model="changeModal.alasan"
                    class="form-textarea"
                    placeholder="Contoh: Salah ketik pembagian qty antara karyawan 1 dan karyawan 2..."
                    :disabled="changeModal.saving"
                  ></textarea>
                </div>
              </div>

              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="changeModal.saving"
                  @click="closeChangeModal"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="changeModal.saving || changeDraftTotal !== changeTargetQty"
                >
                  <span v-if="changeModal.saving" class="spinner spinner-sm"></span>
                  <span>{{ changeModal.saving ? 'Mengirim...' : 'Ajukan Perubahan' }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `
  };
})(window);
