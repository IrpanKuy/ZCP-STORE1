(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.AkunKaryawanView = {
    name: 'AkunKaryawanView',
    props: {
      usersList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      currentUserUid: { type: String, default: '' },
      loading: { type: Boolean, default: false },
      defaultPageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: ['notify', 'request-confirm', 'refresh'],
    data: function () {
      return {
        searchQuery: '',
        roleFilter: 'all',
        currentPage: 1,
        localPageSize: this.defaultPageSize,
        modalOpen: false,
        editingUser: null,
        saving: false,
        formError: '',
        showPassword: false,
        form: {
          nama: '',
          email: '',
          password: '',
          role: 'karyawan',
          active: true,
          boronganPerSisi: 0
        }
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
      roleFilter: function () {
        this.currentPage = 1;
      }
    },
    computed: {
      supportsTextSecurity: function () {
        return (
          typeof CSS !== 'undefined' &&
          typeof CSS.supports === 'function' &&
          CSS.supports('-webkit-text-security', 'disc')
        );
      },
      adminCount: function () {
        return this.usersList.filter(function (u) {
          return u.role === 'admin';
        }).length;
      },
      karyawanCount: function () {
        return this.usersList.filter(function (u) {
          return u.role === 'karyawan';
        }).length;
      },
      filteredList: function () {
        var q = this.searchQuery.trim().toLowerCase();
        var rf = this.roleFilter;
        return this.usersList.filter(function (u) {
          if (rf !== 'all' && u.role !== rf) return false;
          if (!q) return true;
          return (
            (u.nama || '').toLowerCase().indexOf(q) !== -1 ||
            (u.email || '').toLowerCase().indexOf(q) !== -1 ||
            (u.role || '').toLowerCase().indexOf(q) !== -1
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
      formatDate: function (ts) {
        return global.ZcpMasterService ? global.ZcpMasterService.formatDate(ts) : '-';
      },
      formatRupiah: function (amount) {
        var num = Math.max(0, Math.round(Number(amount) || 0));
        return 'Rp ' + num.toLocaleString('id-ID');
      },
      roleLabel: function (role) {
        if (role === 'superadmin') return 'Superadmin';
        if (role === 'admin') return 'Admin';
        return 'Karyawan';
      },
      openAddModal: function () {
        this.editingUser = null;
        this.formError = '';
        this.showPassword = false;
        this.form = {
          nama: '',
          email: '',
          password: '',
          role: 'karyawan',
          active: true,
          boronganPerSisi: 0
        };
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.namaInput) {
            this.$refs.namaInput.focus();
          }
        });
      },
      openEditModal: function (user) {
        this.editingUser = user;
        this.formError = '';
        this.form = {
          nama: user.nama || '',
          email: user.email || '',
          password: '',
          role: user.role || 'karyawan',
          active: user.active !== false,
          boronganPerSisi: Number(user.boronganPerSisi) || 0
        };
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.namaInput) {
            this.$refs.namaInput.focus();
          }
        });
      },
      closeModal: function () {
        if (this.saving) return;
        this.modalOpen = false;
      },
      saveAccount: async function () {
        this.formError = '';
        var nama = (this.form.nama || '').trim();
        if (!nama) {
          this.formError = 'Nama lengkap wajib diisi.';
          return;
        }
        var tarif = Math.max(0, Math.round(Number(this.form.boronganPerSisi) || 0));

        if (!this.editingUser) {
          var email = (this.form.email || '').trim();
          var pass = String(this.form.password || '');
          if (!email) {
            this.formError = 'Email login wajib diisi.';
            return;
          }
          if (pass.length < 6) {
            this.formError = 'Kata sandi minimal 6 karakter.';
            return;
          }

          this.saving = true;
          try {
            await global.ZcpUserService.createEmployeeAccount({
              nama: nama,
              email: email,
              password: pass,
              role: this.form.role,
              boronganPerSisi: tarif
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Akun "' + nama + '" (' + this.roleLabel(this.form.role) + ') berhasil dibuat.'
            });
            this.$emit('refresh');
            this.modalOpen = false;
          } catch (err) {
            this.formError = (err && err.message) || 'Gagal membuat akun baru.';
          } finally {
            this.saving = false;
          }
          return;
        }

        this.saving = true;
        try {
          await global.ZcpUserService.updateUserAccount(this.editingUser.uid, {
            nama: nama,
            role: this.editingUser.uid === this.currentUserUid ? 'superadmin' : this.form.role,
            active: this.editingUser.uid === this.currentUserUid ? true : this.form.active,
            boronganPerSisi: tarif
          });
          this.$emit('notify', {
            type: 'success',
            message: 'Data akun "' + nama + '" berhasil diperbarui.'
          });
          this.$emit('refresh');
          this.modalOpen = false;
        } catch (err) {
          this.formError = (err && err.message) || 'Gagal memperbarui data akun.';
        } finally {
          this.saving = false;
        }
      },
      toggleActiveStatus: function (user) {
        if (user.uid === this.currentUserUid) return;
        var nextActive = user.active === false;
        var self = this;
        this.$emit('request-confirm', {
          title: nextActive ? 'Aktifkan Akun' : 'Nonaktifkan Akun',
          message:
            (nextActive ? 'Aktifkan kembali akun "' : 'Nonaktifkan akun "') +
            user.nama +
            '" (' +
            user.email +
            ')?',
          confirmText: nextActive ? 'Aktifkan' : 'Nonaktifkan',
          variant: nextActive ? 'primary' : 'danger',
          onConfirm: async function () {
            await global.ZcpUserService.updateUserAccount(user.uid, {
              nama: user.nama,
              role: user.role,
              active: nextActive,
              boronganPerSisi: Number(user.boronganPerSisi) || 0
            });
            self.$emit('notify', {
              type: nextActive ? 'success' : 'info',
              message:
                'Akun "' + user.nama + '" ' + (nextActive ? 'diaktifkan.' : 'dinonaktifkan.')
            });
            self.$emit('refresh');
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
                <div class="kpi-label">Total Akun Terdaftar</div>
                <div class="kpi-value">{{ usersList.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">group</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">Dikelola khusus oleh Superadmin</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Akses Admin</div>
                <div class="kpi-value">{{ adminCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">admin_panel_settings</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">Akses penuh operasional, pesanan, sablon &amp; master</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Akses Karyawan</div>
                <div class="kpi-value">{{ karyawanCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">badge</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">Fokus eksekusi produksi &amp; checklist sablon</div>
          </div>
        </div>

        <div class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Akun Karyawan &amp; Admin</h2>
              <p>Buat akun login baru dan tentukan hak akses Admin atau Karyawan.</p>
            </div>

            <div class="panel-actions">
              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="searchQuery"
                  type="text"
                  class="form-control"
                  placeholder="Cari nama atau email..."
                  aria-label="Cari akun"
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

              <select v-model="roleFilter" class="filter-select" aria-label="Filter role">
                <option value="all">Semua Role</option>
                <option value="admin">Admin</option>
                <option value="karyawan">Karyawan</option>
                <option value="superadmin">Superadmin</option>
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

              <button type="button" class="btn btn-primary" @click="openAddModal">
                <span class="material-symbols-rounded" style="font-size: 19px;">person_add</span>
                <span>Buat Akun Karyawan</span>
              </button>
            </div>
          </div>

          <div v-if="loading" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Memuat daftar akun...</p>
          </div>

          <div v-else-if="!filteredList.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">manage_accounts</span>
            </div>
            <h3>{{ (searchQuery || roleFilter !== 'all') ? 'Akun tidak ditemukan' : 'Belum ada akun karyawan' }}</h3>
            <p>
              {{
                (searchQuery || roleFilter !== 'all')
                  ? 'Coba ubah filter role atau kata kunci pencarian.'
                  : 'Klik "Buat Akun Karyawan" untuk menambahkan akun Admin atau Karyawan pertama.'
              }}
            </p>
            <button
              v-if="!(searchQuery || roleFilter !== 'all')"
              type="button"
              class="btn btn-primary"
              @click="openAddModal"
            >
              <span class="material-symbols-rounded" style="font-size: 19px;">person_add</span>
              <span>Buat Akun Pertama</span>
            </button>
          </div>

          <div v-else class="table-container">
            <table class="data-table responsive-table">
              <thead>
                <tr>
                  <th class="col-no">No</th>
                  <th>Nama</th>
                  <th>Email</th>
                  <th>Role Akses</th>
                  <th>Borongan / Sisi</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th class="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(u, index) in paginatedList" :key="u.uid">
                  <td class="col-no" data-label="No">
                    {{ (localPageSize === 'all' ? 0 : (currentPage - 1) * Number(localPageSize)) + index + 1 }}
                  </td>
                  <td data-label="Nama">
                    <div class="item-title-cell">
                      <span class="item-mini-icon">
                        <span class="material-symbols-rounded" style="font-size: 18px;">person</span>
                      </span>
                      <span>{{ u.nama }}</span>
                    </div>
                  </td>
                  <td data-label="Email">{{ u.email }}</td>
                  <td data-label="Role Akses">
                    <span class="role-badge" :class="u.role">{{ roleLabel(u.role) }}</span>
                  </td>
                  <td data-label="Borongan / Sisi">
                    <span v-if="u.boronganPerSisi > 0" class="gaji-rate-text">
                      <strong>{{ formatRupiah(u.boronganPerSisi) }}</strong>
                      <span class="form-hint" style="margin-left: 3px;">/ sisi</span>
                    </span>
                    <span v-else class="form-hint">Rp 0 / sisi</span>
                  </td>
                  <td data-label="Status">
                    <span class="status-badge" :class="u.active !== false ? 'done' : 'danger'">
                      {{ u.active !== false ? 'Aktif' : 'Nonaktif' }}
                    </span>
                  </td>
                  <td data-label="Dibuat">{{ formatDate(u.createdAt) }}</td>
                  <td class="col-actions" data-label="Aksi">
                    <div class="action-group">
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        @click="openEditModal(u)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">edit</span>
                        <span>Edit</span>
                      </button>
                      <button
                        v-if="u.uid !== currentUserUid && u.role !== 'superadmin'"
                        type="button"
                        class="btn btn-sm"
                        :class="u.active !== false ? 'btn-danger' : 'btn-success'"
                        @click="toggleActiveStatus(u)"
                      >
                        <span>{{ u.active !== false ? 'Nonaktifkan' : 'Aktifkan' }}</span>
                      </button>
                    </div>
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
        </div>

        <!-- Modal Buat / Edit Akun -->
        <div
          v-if="modalOpen"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeModal"
        >
          <div class="modal-card">
            <div class="modal-header">
              <h3 class="modal-title">
                {{ editingUser ? 'Edit Akun' : 'Buat Akun Karyawan Baru' }}
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

            <form @submit.prevent="saveAccount" autocomplete="off">
              <div class="modal-body">
                <div v-if="formError" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ formError }}</div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="akun-nama">
                    Nama Lengkap <span class="required">*</span>
                  </label>
                  <input
                    id="akun-nama"
                    ref="namaInput"
                    v-model="form.nama"
                    type="text"
                    class="form-control"
                    placeholder="Contoh: Andi (Operator Sablon)"
                    :disabled="saving"
                    required
                  />
                </div>

                <div class="form-group">
                  <label class="form-label" for="akun-email">
                    Email Login <span class="required">*</span>
                  </label>
                  <input
                    id="akun-email"
                    v-model="form.email"
                    type="text"
                    inputmode="email"
                    class="form-control"
                    placeholder="andi@zcpstore.com"
                    autocomplete="off"
                    :disabled="saving || Boolean(editingUser)"
                    required
                  />
                </div>

                <div v-if="!editingUser" class="form-group">
                  <label class="form-label" for="akun-password">
                    Kata Sandi Awal (min. 6 karakter) <span class="required">*</span>
                  </label>
                  <div class="input-wrapper">
                    <input
                      id="akun-password"
                      v-model="form.password"
                      :type="(supportsTextSecurity || showPassword) ? 'text' : 'password'"
                      class="form-control has-right-action"
                      :class="{ 'password-masked': supportsTextSecurity && !showPassword }"
                      placeholder="Minimal 6 karakter"
                      autocomplete="off"
                      data-lpignore="true"
                      :disabled="saving"
                      required
                    />
                    <button
                      type="button"
                      class="input-action-btn"
                      :aria-label="showPassword ? 'Sembunyikan' : 'Lihat'"
                      @click="showPassword = !showPassword"
                    >
                      <span class="material-symbols-rounded" style="font-size: 20px;">
                        {{ showPassword ? 'visibility_off' : 'visibility' }}
                      </span>
                    </button>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="akun-borongan-sisi">
                    Tarif Borongan per Sisi (Rp)
                  </label>
                  <div class="input-prefix-wrap">
                    <span class="input-prefix-label">Rp</span>
                    <input
                      id="akun-borongan-sisi"
                      v-model.number="form.boronganPerSisi"
                      type="number"
                      min="0"
                      step="100"
                      class="form-control"
                      placeholder="Contoh: 1500"
                      :disabled="saving"
                    />
                  </div>
                  <span class="form-hint" style="margin-top: 6px; display: block;">
                    Tarif saat ini: <strong>{{ formatRupiah(form.boronganPerSisi || 0) }} / sisi</strong>. Digunakan untuk menghitung Gaji Borongan (Total Sisi &times; Tarif per Sisi).
                  </span>
                </div>

                <div
                  v-if="!editingUser || (editingUser.uid !== currentUserUid && editingUser.role !== 'superadmin')"
                  class="form-group"
                  style="margin-bottom: 0;"
                >
                  <label class="form-label" for="akun-role">
                    Hak Akses <span class="required">*</span>
                  </label>
                  <select id="akun-role" v-model="form.role" class="form-select" :disabled="saving">
                    <option value="karyawan">Karyawan</option>
                    <option value="admin">Admin</option>
                  </select>
                  <span class="form-hint" style="margin-top: 6px;">
                    <template v-if="form.role === 'admin'">
                      <strong>Admin:</strong> Akses penuh ke Dashboard, Pesanan, Operasional, Manajemen Sablon, dan Master Data (tanpa menu Pengaturan, Log Aktivitas, dan Buat Akun Karyawan).
                    </template>
                    <template v-else>
                      <strong>Karyawan:</strong> Read-only di Pesanan, tidak bisa atur rentang tanggal di Operasional, tidak bisa buat/edit/hapus Sablon, dan hanya bisa klik Batal Selesai untuk tugas yang diselesaikannya sendiri.
                    </template>
                  </span>
                </div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" :disabled="saving" @click="closeModal">
                  Batal
                </button>
                <button type="submit" class="btn btn-primary" :disabled="saving">
                  <span v-if="saving" class="spinner spinner-sm"></span>
                  <span>{{ saving ? 'Menyimpan...' : (editingUser ? 'Simpan Perubahan' : 'Buat Akun') }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `
  };
})(window);
