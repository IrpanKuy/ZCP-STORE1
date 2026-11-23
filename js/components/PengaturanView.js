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
      aiConfig: {
        type: Object,
        default: function () {
          return {
            geminiApiUrl:
              (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_GEMINI_URL) ||
              'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
            geminiApiKey: ''
          };
        }
      },
      theme: { type: String, default: 'light' }
    },
    emits: ['notify', 'toggle-theme', 'profile-updated', 'settings-updated', 'ai-config-updated'],
    data: function () {
      var defaultGeminiUrl =
        (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_GEMINI_URL) ||
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
      return {
        selectedPageSize: this.defaultPageSize,
        savingSettings: false,
        superadminName: (this.userProfile && this.userProfile.nama) || '',
        savingProfile: false,
        geminiApiUrl: (this.aiConfig && this.aiConfig.geminiApiUrl) || defaultGeminiUrl,
        geminiApiKey: (this.aiConfig && this.aiConfig.geminiApiKey) || '',
        showGeminiKey: false,
        savingAiConfig: false,
        testingGemini: false,
        geminiTestStatus: null
      };
    },
    watch: {
      defaultPageSize: function (val) {
        this.selectedPageSize = val;
      },
      aiConfig: {
        deep: true,
        handler: function (val) {
          var defaultGeminiUrl =
            (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_GEMINI_URL) ||
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
          if (val) {
            this.geminiApiUrl = val.geminiApiUrl || defaultGeminiUrl;
            this.geminiApiKey = val.geminiApiKey || '';
          }
        }
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
      },
      resetDefaultGeminiUrl: function () {
        this.geminiApiUrl =
          (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_GEMINI_URL) ||
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
      },
      saveAiConfig: async function () {
        var url = (this.geminiApiUrl || '').trim();
        var key = (this.geminiApiKey || '').trim();
        if (url && !/^https?:\/\//i.test(url)) {
          this.$emit('notify', {
            type: 'error',
            message: 'URL API Gemini harus diawali http:// atau https://.'
          });
          return;
        }
        this.savingAiConfig = true;
        try {
          var saved = await global.ZcpSettingsService.updateAiConfig({
            geminiApiUrl: url,
            geminiApiKey: key
          });
          this.geminiApiUrl = saved.geminiApiUrl;
          this.geminiApiKey = saved.geminiApiKey;
          this.$emit('ai-config-updated', saved);
          this.$emit('notify', {
            type: 'success',
            message: 'Konfigurasi API Gemini berhasil disimpan.'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal menyimpan konfigurasi API Gemini.'
          });
        } finally {
          this.savingAiConfig = false;
        }
      },
      testAiConnection: async function () {
        this.testingGemini = true;
        this.geminiTestStatus = null;
        try {
          var reply = await global.ZcpAiService.testGeminiConnection({
            geminiApiUrl: (this.geminiApiUrl || '').trim(),
            geminiApiKey: (this.geminiApiKey || '').trim()
          });
          this.geminiTestStatus = {
            type: 'success',
            text: 'Koneksi berhasil! Respons Gemini: ' + reply
          };
          this.$emit('notify', {
            type: 'success',
            message: 'Koneksi ke API Gemini berhasil.'
          });
        } catch (err) {
          var msg = (err && err.message) || 'Koneksi ke API Gemini gagal.';
          this.geminiTestStatus = {
            type: 'error',
            text: msg
          };
          this.$emit('notify', {
            type: 'error',
            message: msg
          });
        } finally {
          this.testingGemini = false;
        }
      }
    },
    template: `
      <div class="settings-grid">
        <div style="display: flex; flex-direction: column; gap: 16px;">
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

          <!-- Kartu Konfigurasi AI Gemini -->
          <div class="card">
            <div class="card-header-simple">
              <div>
                <h2>Konfigurasi AI Chatbot (Gemini)</h2>
                <p>Hubungkan asisten AI Chatbot dengan URL Endpoint &amp; API Key Gemini.</p>
              </div>
              <span class="material-symbols-rounded" style="color: var(--accent-info);">smart_toy</span>
            </div>
            <form class="card-body" @submit.prevent="saveAiConfig">
              <div class="form-group">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                  <label class="form-label" for="gemini-api-url" style="margin-bottom: 0;">
                    URL API Gemini
                  </label>
                  <button
                    type="button"
                    class="link-btn"
                    @click="resetDefaultGeminiUrl"
                  >
                    Pakai URL Default
                  </button>
                </div>
                <input
                  id="gemini-api-url"
                  v-model="geminiApiUrl"
                  type="url"
                  class="form-control"
                  style="margin-top: 6px;"
                  placeholder="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
                  :disabled="savingAiConfig || testingGemini"
                  required
                />
                <div class="form-hint">
                  Mendukung endpoint resmi Google Gemini (:generateContent) atau URL proxy/gateway kompatibel.
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="gemini-api-key">API Key Gemini</label>
                <div style="position: relative; display: flex; align-items: center;">
                  <input
                    id="gemini-api-key"
                    v-model="geminiApiKey"
                    :type="showGeminiKey ? 'text' : 'password'"
                    class="form-control"
                    style="padding-right: 44px;"
                    placeholder="AIza..."
                    autocomplete="off"
                    :disabled="savingAiConfig || testingGemini"
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon-sm"
                    style="position: absolute; right: 6px;"
                    :title="showGeminiKey ? 'Sembunyikan API Key' : 'Lihat API Key'"
                    @click="showGeminiKey = !showGeminiKey"
                  >
                    <span class="material-symbols-rounded" style="font-size: 18px;">
                      {{ showGeminiKey ? 'visibility_off' : 'visibility' }}
                    </span>
                  </button>
                </div>
                <div class="form-hint">
                  Disimpan aman di Firestore (hanya Superadmin &amp; Admin dapat mengakses AI Assistant).
                </div>
              </div>

              <div
                v-if="geminiTestStatus"
                class="ai-config-status"
                :class="geminiTestStatus.type"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">
                  {{ geminiTestStatus.type === 'success' ? 'check_circle' : 'error' }}
                </span>
                <span>{{ geminiTestStatus.text }}</span>
              </div>

              <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="savingAiConfig || testingGemini"
                  @click="testAiConnection"
                >
                  <span v-if="testingGemini" class="spinner spinner-sm"></span>
                  <span v-else class="material-symbols-rounded" style="font-size: 17px;">network_check</span>
                  <span>{{ testingGemini ? 'Menguji...' : 'Tes Koneksi' }}</span>
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="savingAiConfig || testingGemini"
                >
                  <span v-if="savingAiConfig" class="spinner spinner-sm"></span>
                  <span>{{ savingAiConfig ? 'Menyimpan...' : 'Simpan Konfigurasi AI' }}</span>
                </button>
              </div>
            </form>
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
