(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.DashboardView = {
    name: 'DashboardView',
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
      sablonList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      loading: { type: Boolean, default: false },
      driveReady: { type: Boolean, default: false }
    },
    emits: ['navigate'],
    computed: {
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
      activeOrders: function () {
        return this.pesananList.filter(function (o) {
          return !o.statusSelesai;
        });
      },
      doneOrders: function () {
        return this.pesananList.filter(function (o) {
          return o.statusSelesai;
        });
      },
      activePcs: function () {
        return this.activeOrders.reduce(function (sum, o) {
          return sum + (Number(o.jumlahProduk) || 0);
        }, 0);
      },
      deadlineAlerts: function () {
        return this.activeOrders.filter(function (o) {
          var status = global.ZcpPesananService.getDeadlineStatus(o);
          return status === 'overdue' || status === 'soon';
        });
      },
      overdueCount: function () {
        return this.activeOrders.filter(function (o) {
          return global.ZcpPesananService.getDeadlineStatus(o) === 'overdue';
        }).length;
      },
      unscheduledCount: function () {
        return this.activeOrders.filter(function (o) {
          return global.ZcpPesananService.getDeadlineStatus(o) === 'unscheduled';
        }).length;
      },
      completionRate: function () {
        if (!this.pesananList.length) return 0;
        return Math.round((this.doneOrders.length / this.pesananList.length) * 100);
      },
      totalSisiMaster: function () {
        return this.produkList.reduce(function (sum, p) {
          return sum + (Array.isArray(p.namaSisi) ? p.namaSisi.length : 0);
        }, 0);
      },
      produkStats: function () {
        var map = {};
        this.pesananList.forEach(function (o) {
          var name = o.namaProduk || 'Lainnya';
          if (!map[name]) {
            map[name] = { name: name, count: 0, pcs: 0 };
          }
          map[name].count += 1;
          map[name].pcs += Number(o.jumlahProduk) || 0;
        });
        var rows = Object.keys(map)
          .map(function (k) {
            return map[k];
          })
          .sort(function (a, b) {
            return b.count - a.count;
          })
          .slice(0, 5);
        var max = rows.length ? rows[0].count : 1;
        return rows.map(function (r) {
          return Object.assign({}, r, {
            percent: Math.round((r.count / max) * 100)
          });
        });
      },
      expedisiStats: function () {
        var map = {};
        this.pesananList.forEach(function (o) {
          var name = o.namaExpedisi || 'Lainnya';
          if (!map[name]) {
            map[name] = { name: name, count: 0 };
          }
          map[name].count += 1;
        });
        var rows = Object.keys(map)
          .map(function (k) {
            return map[k];
          })
          .sort(function (a, b) {
            return b.count - a.count;
          })
          .slice(0, 5);
        var max = rows.length ? rows[0].count : 1;
        return rows.map(function (r) {
          return Object.assign({}, r, {
            percent: Math.round((r.count / max) * 100)
          });
        });
      },
      recentOrders: function () {
        return this.pesananList.slice(0, 6);
      }
    },
    template: `
      <div>
        <!-- 4 KPI Cards ala Material Dashboard -->
        <div class="kpi-grid-4">
          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Pesanan Aktif</div>
                <div class="kpi-value">{{ activeOrders.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">pending_actions</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span class="kpi-highlight">{{ activePcs }} pcs</span> dalam antrean produksi
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Mendekati Deadline</div>
                <div class="kpi-value">{{ deadlineAlerts.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">schedule</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span v-if="overdueCount">{{ overdueCount }} lewat deadline</span>
              <span v-else>{{ unscheduledCount }} belum dijadwalkan</span>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Pesanan Selesai</div>
                <div class="kpi-value">{{ doneOrders.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">task_alt</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span class="kpi-highlight">{{ completionRate }}%</span> tingkat penyelesaian
            </div>
          </div>

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
              {{ produkList.length }} produk • {{ expedisiList.length }} expedisi
            </div>
          </div>
        </div>

        <!-- Bar Analytics -->
        <div class="dashboard-grid-2">
          <div class="card">
            <div class="card-header-simple">
              <div>
                <h2>Pesanan per Produk</h2>
                <p>Distribusi pesanan berdasarkan jenis produk (Top 5)</p>
              </div>
              <span class="material-symbols-rounded" style="color: var(--text-muted);">checkroom</span>
            </div>
            <div class="card-body">
              <div v-if="!produkStats.length" class="empty-state" style="padding: 24px 12px;">
                <p style="margin: 0;">Belum ada data pesanan untuk ditampilkan.</p>
              </div>
              <div v-else class="bar-list">
                <div v-for="row in produkStats" :key="row.name">
                  <div class="bar-item-head">
                    <span class="bar-item-name">{{ row.name }}</span>
                    <span class="bar-item-meta">{{ row.count }} order ({{ row.pcs }} pcs)</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: row.percent + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header-simple">
              <div>
                <h2>Pesanan per Expedisi</h2>
                <p>Jasa kirim paling sering dipilih (Top 5)</p>
              </div>
              <span class="material-symbols-rounded" style="color: var(--text-muted);">local_shipping</span>
            </div>
            <div class="card-body">
              <div v-if="!expedisiStats.length" class="empty-state" style="padding: 24px 12px;">
                <p style="margin: 0;">Belum ada data expedisi pesanan.</p>
              </div>
              <div v-else class="bar-list">
                <div v-for="row in expedisiStats" :key="row.name">
                  <div class="bar-item-head">
                    <span class="bar-item-name">{{ row.name }}</span>
                    <span class="bar-item-meta">{{ row.count }} order</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: row.percent + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pesanan Terbaru & Status Sistem -->
        <div class="dashboard-bottom-grid">
          <div class="card">
            <div class="card-header-simple">
              <div>
                <h2>Pesanan Terbaru</h2>
                <p>6 pesanan terakhir yang masuk ke sistem</p>
              </div>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                @click="$emit('navigate', 'pesanan')"
              >
                <span>Lihat Semua</span>
                <span class="material-symbols-rounded" style="font-size: 16px;">arrow_forward</span>
              </button>
            </div>

            <div v-if="loading" class="empty-state" style="padding: 32px;">
              <div class="spinner spinner-lg" style="margin-bottom: 10px;"></div>
              <p style="margin: 0;">Memuat pesanan terbaru...</p>
            </div>

            <div v-else-if="!recentOrders.length" class="empty-state" style="padding: 36px 20px;">
              <div class="empty-state-icon">
                <span class="material-symbols-rounded">shopping_bag</span>
              </div>
              <h3>Belum ada pesanan</h3>
              <p>Mulai buat pesanan baru di menu Manajemen Pesanan.</p>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                @click="$emit('navigate', 'pesanan')"
              >
                Buat Pesanan
              </button>
            </div>

            <div v-else class="table-container">
              <table class="data-table responsive-table">
                <thead>
                  <tr>
                    <th>Pemesan</th>
                    <th>Produk &amp; Sisi</th>
                    <th>Jumlah</th>
                    <th>Expedisi</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="order in recentOrders" :key="order.id">
                    <td data-label="Pemesan" style="font-weight: 600;">{{ order.namaPemesan }}</td>
                    <td class="sisi-cell" data-label="Produk & Sisi">
                      <div style="font-weight: 600; margin-bottom: 4px;">{{ order.namaProduk }}</div>
                      <div class="chips-wrap">
                        <span v-for="(sisi, sIdx) in order.namaSisi" :key="sIdx" class="chip">
                          {{ sisi }}
                        </span>
                      </div>
                    </td>
                    <td data-label="Jumlah">
                      <span class="badge-count">{{ order.jumlahProduk }} pcs</span>
                    </td>
                    <td data-label="Expedisi">
                      <span class="chip">{{ order.namaExpedisi }}</span>
                    </td>
                    <td data-label="Status">
                      <span class="status-badge" :class="order.statusSelesai ? 'done' : 'active'">
                        {{ order.statusSelesai ? 'Selesai' : 'Diproses' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="card-header-simple">
              <div>
                <h2>Ringkasan &amp; Akses Cepat</h2>
                <p>Ringkasan data &amp; pintasan menu</p>
              </div>
            </div>
            <div class="card-body">
              <div class="status-list">
                <div class="status-row">
                  <span class="status-row-left">
                    <span class="material-symbols-rounded" style="font-size: 18px; color: var(--text-muted);">print</span>
                    <span>Manajemen Sablon</span>
                  </span>
                  <span style="font-weight: 600;">
                    {{ activeSablonCount }} proses • {{ doneSablonCount }} selesai
                  </span>
                </div>

                <div class="status-row">
                  <span class="status-row-left">
                    <span class="material-symbols-rounded" style="font-size: 18px; color: var(--text-muted);">database</span>
                    <span>Master Data</span>
                  </span>
                  <span style="font-weight: 600;">
                    {{ produkList.length }} produk • {{ totalSisiMaster }} sisi
                  </span>
                </div>
              </div>

              <div class="quick-actions-grid">
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  @click="$emit('navigate', 'pesanan')"
                >
                  <span class="material-symbols-rounded" style="font-size: 17px;">shopping_bag</span>
                  <span>Pesanan</span>
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="$emit('navigate', 'master-data')"
                >
                  <span class="material-symbols-rounded" style="font-size: 17px;">database</span>
                  <span>Master Data</span>
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="$emit('navigate', 'operasional')"
                >
                  <span class="material-symbols-rounded" style="font-size: 17px;">event_note</span>
                  <span>Operasional</span>
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="$emit('navigate', 'sablon')"
                >
                  <span class="material-symbols-rounded" style="font-size: 17px;">print</span>
                  <span>Sablon</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  };
})(window);
