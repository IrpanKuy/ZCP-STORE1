(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.PengaturanView = {
    name: 'PengaturanView',
    props: {
      defaultPageSize: {
        type: [Number, String],
        default: 10
      },
      userProfile: {
        type: Object,
        default: function () {
          return { uid: '', email: '', nama: '', role: 'superadmin' };
        }
      },
      theme: { type: String, default: 'light' }
    },
    emits: ['notify', 'toggle-theme', 'profile-updated', 'settings-updated'],
    data: function () {
      return {
        selectedPageSize: this.defaultPageSize,
        savingSettings: false,
        superadminName: (this.userProfile && this.userProfile.nama) || '',
        savingProfile: false
      };
    },
    watch: {
      defaultPageSize: function (val) {
        this.selectedPageSize = val;
      },
      userProfile: {
        deep: true,
        handler: function (val) {
          if (val && val.nama) {
            this.superadminName = val.nama;
          }
        }
      }
    },
    computed: {
      pageOptions: function () {
        return [
          { value: 10, label: '10 baris', desc: 'Tampilan ringkas standar' },
          { value: 20, label: '20 baris', desc: 'Seimbang untuk layar desktop' },
          { value: 50, label: '50 baris', desc: 'Cocok untuk daftar panjang' },
          { value: 'all', label: 'Semua', desc: 'Tampilkan seluruh data sekaligus' }
        ];
      }
    },
    methods: {
      saveSettings: async function () {
        this.savingSettings = true;
        try {
          await global.ZcpSettingsService.updateSettings({
            defaultPageSize: this.selectedPageSize
          });
          this.$emit('settings-updated', this.selectedPageSize);
          this.$emit('notify', {
            type: 'success',
            message:
              'Default pagination tabel berhasil disimpan (' +
              (this.selectedPageSize === 'all' ? 'Semua data' : this.selectedPageSize + ' baris') +
              ').'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal menyimpan pengaturan.'
          });
        } finally {
          this.savingSettings = false;
        }
      },
      saveProfileName: async function () {
        var clean = (this.superadminName || '').trim();
        if (!clean) {
          this.$emit('notify', {
            type: 'error',
            message: 'Nama tampilan Superadmin wajib diisi.'
          });
          return;
        }

        this.savingProfile = true;
        try {
          await global.ZcpUserService.saveOwnSuperadminProfile(this.userProfile.uid, {
            nama: clean,
            email: this.userProfile.email
          });
          this.$emit('profile-updated', clean);
          this.$emit('notify', {
            type: 'success',
            message: 'Nama tampilan Superadmin berhasil disimpan.'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal menyimpan profil.'
          });
        } finally {
          this.savingProfile = false;
        }
      }
    },
    template: `
      <div class="settings-grid">
        <!-- Kartu Default Pagination -->
        <div class="card">
          <div class="card-header-simple">
            <div>
              <h2>Default Pagination Tabel</h2>
              <p>Atur jumlah baris bawaan di seluruh tabel (dapat diubah langsung per tabel).</p>
            </div>
            <span class="material-symbols-rounded" style="color: var(--text-muted);">table_rows</span>
          </div>
          <div class="card-body">
            <div class="setting-option-grid">
              <label
                v-for="opt in pageOptions"
                :key="String(opt.value)"
                class="setting-option-card"
                :class="{ selected: selectedPageSize === opt.value }"
              >
                <input
                  type="radio"
                  name="default-page-size"
                  :value="opt.value"
                  v-model="selectedPageSize"
                />
                <div>
                  <div class="setting-option-title">{{ opt.label }}</div>
                  <div class="form-hint">{{ opt.desc }}</div>
                </div>
              </label>
            </div>

            <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="savingSettings"
                @click="saveSettings"
              >
                <span v-if="savingSettings" class="spinner spinner-sm"></span>
                <span>{{ savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Kartu Profil Superadmin & Tema -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div class="card">
            <div class="card-header-simple">
              <div>
                <h2>Profil Superadmin</h2>
                <p>Nama ini muncul pada label "Selesai oleh..." dan Log Aktivitas.</p>
              </div>
              <span class="role-badge superadmin">Superadmin</span>
            </div>
            <form class="card-body" @submit.prevent="saveProfileName">
              <div class="form-group">
                <label class="form-label" for="superadmin-email">Email Akun</label>
                <input
                  id="superadmin-email"
                  type="text"
                  class="form-control"
                  :value="userProfile.email"
                  disabled
                />
              </div>
              <div class="form-group">
                <label class="form-label" for="superadmin-nama">Nama Tampilan</label>
                <input
                  id="superadmin-nama"
                  v-model="superadminName"
                  type="text"
                  class="form-control"
                  placeholder="Contoh: Owner ZCP"
                  :disabled="savingProfile"
                  required
                />
              </div>
              <div style="display: flex; justify-content: flex-end;">
                <button type="submit" class="btn btn-primary" :disabled="savingProfile">
                  <span v-if="savingProfile" class="spinner spinner-sm"></span>
                  <span>{{ savingProfile ? 'Menyimpan...' : 'Simpan Nama' }}</span>
                </button>
              </div>
            </form>
          </div>

          <div class="card">
            <div class="card-header-simple">
              <div>
                <h2>Tampilan Aplikasi</h2>
                <p>Sesuaikan tema terang atau gelap pada perangkat ini.</p>
              </div>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                @click="$emit('toggle-theme')"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">
                  {{ theme === 'dark' ? 'light_mode' : 'dark_mode' }}
                </span>
                <span>{{ theme === 'dark' ? 'Light Mode' : 'Dark Mode' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  };
})(window);
