(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  var ACTION_LABELS = {
    CREATE: { label: 'Tambah', cls: 'done' },
    UPDATE: { label: 'Ubah', cls: 'active' },
    DELETE: { label: 'Hapus', cls: 'danger' },
    BULK_UPDATE: { label: 'Bulk Update', cls: 'active' },
    COMPLETE: { label: 'Selesai', cls: 'done' },
    UNDO_COMPLETE: { label: 'Batal Selesai', cls: 'warn' },
    CHECK_PRINT: { label: 'Print ✓', cls: 'done' },
    UNCHECK_PRINT: { label: 'Batal Print', cls: 'warn' },
    ROLLBACK: { label: 'Rollback AI', cls: 'warn' }
  };

  global.ZcpComponents.ActivityLogView = {
    name: 'ActivityLogView',
    props: {
      logsList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      usersList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      loading: { type: Boolean, default: false },
      hasMore: { type: Boolean, default: false },
      loadingMore: { type: Boolean, default: false },
      defaultPageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: ['refresh', 'load-more'],
    data: function () {
      return {
        searchQuery: '',
        accountFilter: '',
        moduleFilter: '',
        actionFilter: '',
        currentPage: 1,
        localPageSize: this.defaultPageSize
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
      accountFilter: function () {
        this.currentPage = 1;
      },
      moduleFilter: function () {
        this.currentPage = 1;
      },
      actionFilter: function () {
        this.currentPage = 1;
      }
    },
    computed: {
      accountOptions: function () {
        var map = {};
        this.usersList.forEach(function (u) {
          if (u.uid && !map[u.uid]) {
            map[u.uid] = {
              uid: u.uid,
              label: (u.nama || u.email) + ' (' + u.role + ')'
            };
          }
        });
        this.logsList.forEach(function (l) {
          if (l.actorUid && !map[l.actorUid]) {
            map[l.actorUid] = {
              uid: l.actorUid,
              label: (l.actorName || l.actorEmail || l.actorUid) + ' (' + (l.actorRole || 'akun') + ')'
            };
          }
        });
        return Object.keys(map)
          .map(function (k) {
            return map[k];
          })
          .sort(function (a, b) {
            return a.label.localeCompare(b.label);
          });
      },
      moduleOptions: function () {
        var seen = {};
        var list = [];
        this.logsList.forEach(function (l) {
          if (l.module && !seen[l.module]) {
            seen[l.module] = true;
            list.push(l.module);
          }
        });
        return list.sort();
      },
      todayCount: function () {
        var now = new Date();
        var y = now.getFullYear();
        var m = now.getMonth();
        var d = now.getDate();
        return this.logsList.filter(function (l) {
          if (!l.createdAt || typeof l.createdAt.toDate !== 'function') return false;
          var dt = l.createdAt.toDate();
          return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
        }).length;
      },
      uniqueActorsCount: function () {
        var map = {};
        this.logsList.forEach(function (l) {
          if (l.actorUid) map[l.actorUid] = true;
        });
        return Object.keys(map).length;
      },
      filteredList: function () {
        var q = this.searchQuery.trim().toLowerCase();
        var acc = this.accountFilter;
        var mod = this.moduleFilter;
        var act = this.actionFilter;

        return this.logsList.filter(function (l) {
          if (acc && l.actorUid !== acc) return false;
          if (mod && l.module !== mod) return false;
          if (act && l.action !== act) return false;
          if (!q) return true;
          return (
            (l.actorName || '').toLowerCase().indexOf(q) !== -1 ||
            (l.actorEmail || '').toLowerCase().indexOf(q) !== -1 ||
            (l.module || '').toLowerCase().indexOf(q) !== -1 ||
            (l.targetName || '').toLowerCase().indexOf(q) !== -1 ||
            (l.details || '').toLowerCase().indexOf(q) !== -1
          );
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
      formatDateTime: function (ts) {
        return global.ZcpActivityLogService
          ? global.ZcpActivityLogService.formatDateTime(ts)
          : '-';
      },
      actionMeta: function (action) {
        return ACTION_LABELS[action] || { label: action || 'Aktivitas', cls: 'neutral' };
      }
    },
    template: `
      <div>
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Total Log Tercatat</div>
                <div class="kpi-value">{{ logsList.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">history</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">Dimuat saat menu dibuka (hemat kuota Firestore)</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Aktivitas Hari Ini</div>
                <div class="kpi-value">{{ todayCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">today</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">Perubahan data &amp; status sepanjang hari ini</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Akun Beraktivitas</div>
                <div class="kpi-value">{{ uniqueActorsCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">groups</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">Gunakan filter akun untuk melacak per pengguna</div>
          </div>
        </div>

        <div class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Log Aktivitas</h2>
              <p>Catatan lengkap aktivitas CRUD, jadwal, dan checklist print seluruh akun.</p>
            </div>

            <div class="panel-actions">
              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="searchQuery"
                  type="text"
                  class="form-control"
                  placeholder="Cari target, detail, akun..."
                  aria-label="Cari log aktivitas"
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

              <select v-model="accountFilter" class="filter-select" aria-label="Filter akun">
                <option value="">Semua Akun</option>
                <option v-for="acc in accountOptions" :key="acc.uid" :value="acc.uid">
                  {{ acc.label }}
                </option>
              </select>

              <select v-model="moduleFilter" class="filter-select" aria-label="Filter modul">
                <option value="">Semua Modul</option>
                <option v-for="m in moduleOptions" :key="m" :value="m">{{ m }}</option>
              </select>

              <select v-model="actionFilter" class="filter-select" aria-label="Filter aksi">
                <option value="">Semua Aksi</option>
                <option value="CREATE">Tambah</option>
                <option value="UPDATE">Ubah</option>
                <option value="DELETE">Hapus</option>
                <option value="BULK_UPDATE">Bulk Update</option>
                <option value="CHECK_PRINT">Print ✓</option>
                <option value="UNCHECK_PRINT">Batal Print</option>
                <option value="COMPLETE">Selesai</option>
                <option value="UNDO_COMPLETE">Batal Selesai</option>
                <option value="ROLLBACK">Rollback AI</option>
              </select>

              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="loading"
                @click="$emit('refresh')"
              >
                <span class="material-symbols-rounded" style="font-size: 17px;">refresh</span>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div v-if="loading" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Memuat log aktivitas...</p>
          </div>

          <div v-else-if="!filteredList.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">history</span>
            </div>
            <h3>{{ (searchQuery || accountFilter || moduleFilter || actionFilter) ? 'Log tidak ditemukan' : 'Belum ada aktivitas tercatat' }}</h3>
            <p>Setiap perubahan data oleh Superadmin, Admin, maupun Karyawan akan tercatat otomatis di sini.</p>
          </div>

          <div v-else class="table-container">
            <table class="data-table responsive-table">
              <thead>
                <tr>
                  <th class="col-no">No</th>
                  <th>Waktu</th>
                  <th>Akun</th>
                  <th>Modul</th>
                  <th>Aksi</th>
                  <th>Target &amp; Detail</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(log, index) in paginatedList" :key="log.id">
                  <td class="col-no" data-label="No">
                    {{ (localPageSize === 'all' ? 0 : (currentPage - 1) * Number(localPageSize)) + index + 1 }}
                  </td>
                  <td data-label="Waktu" style="white-space: nowrap; font-size: 12.5px;">
                    {{ formatDateTime(log.createdAt) }}
                  </td>
                  <td data-label="Akun">
                    <div style="font-weight: 600;">{{ log.actorName || log.actorEmail }}</div>
                    <div class="chips-wrap" style="margin-top: 3px; align-items: center;">
                      <span class="role-badge" :class="log.actorRole">{{ log.actorRole }}</span>
                      <span class="form-hint">{{ log.actorEmail }}</span>
                    </div>
                  </td>
                  <td data-label="Modul">
                    <span class="chip">{{ log.module }}</span>
                  </td>
                  <td data-label="Aksi">
                    <span class="status-badge" :class="actionMeta(log.action).cls">
                      {{ actionMeta(log.action).label }}
                    </span>
                  </td>
                  <td data-label="Target & Detail">
                    <div style="font-weight: 600;">{{ log.targetName }}</div>
                    <div v-if="log.details" class="form-hint">{{ log.details }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <table-pagination
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
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="loadingMore"
              @click="$emit('load-more')"
            >
              <span v-if="loadingMore" class="spinner spinner-sm"></span>
              <span>{{ loadingMore ? 'Memuat...' : 'Muat 100 Log Lebih Lama' }}</span>
            </button>
          </div>
        </div>
      </div>
    `
  };
})(window);
