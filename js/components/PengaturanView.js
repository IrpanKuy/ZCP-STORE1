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
      driveConfig: {
        type: Object,
        default: function () {
          return {
            clientId: '',
            clientSecret: '',
            refreshToken: '',
            accessToken: '',
            rootFolderId: '',
            rootFolderName:
              (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_DRIVE_ROOT_FOLDER) ||
              'ZCP_STORE_FILES'
          };
        }
      },
      theme: { type: String, default: 'light' }
    },
    emits: [
      'notify',
      'toggle-theme',
      'profile-updated',
      'settings-updated',
      'ai-config-updated',
      'drive-config-updated'
    ],
    data: function () {
      var defaultGeminiUrl =
        (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_GEMINI_URL) ||
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
      var defaultDriveRoot =
        (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_DRIVE_ROOT_FOLDER) ||
        'ZCP_STORE_FILES';
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
        geminiTestStatus: null,
        driveClientId: (this.driveConfig && this.driveConfig.clientId) || '',
        driveClientSecret: (this.driveConfig && this.driveConfig.clientSecret) || '',
        driveRefreshToken: (this.driveConfig && this.driveConfig.refreshToken) || '',
        driveAccessToken: (this.driveConfig && this.driveConfig.accessToken) || '',
        driveRootFolderId: (this.driveConfig && this.driveConfig.rootFolderId) || '',
        driveRootFolderName: (this.driveConfig && this.driveConfig.rootFolderName) || defaultDriveRoot,
        showDriveSecret: false,
        showDriveRefreshToken: false,
        showDriveAccessToken: false,
        savingDriveConfig: false,
        testingDrive: false,
        driveTestStatus: null
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
      driveConfig: {
        deep: true,
        handler: function (val) {
          var defaultDriveRoot =
            (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_DRIVE_ROOT_FOLDER) ||
            'ZCP_STORE_FILES';
          if (val) {
            this.driveClientId = val.clientId || '';
            this.driveClientSecret = val.clientSecret || '';
            this.driveRefreshToken = val.refreshToken || '';
            this.driveAccessToken = val.accessToken || '';
            this.driveRootFolderId = val.rootFolderId || '';
            this.driveRootFolderName = val.rootFolderName || defaultDriveRoot;
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
      },
      formatDriveBytes: function (bytes) {
        var n = Number(bytes) || 0;
        if (n >= 1024 * 1024 * 1024) {
          return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        }
        if (n >= 1024 * 1024) {
          return (n / (1024 * 1024)).toFixed(1) + ' MB';
        }
        if (n >= 1024) {
          return (n / 1024).toFixed(0) + ' KB';
        }
        return n + ' B';
      },
      buildDrivePayloadFromForm: function () {
        var extractFn =
          global.ZcpSettingsService && global.ZcpSettingsService.extractDriveFolderId;
        var rawFolder = (this.driveRootFolderId || '').trim();
        var defaultRoot =
          (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_DRIVE_ROOT_FOLDER) ||
          'ZCP_STORE_FILES';
        return {
          clientId: (this.driveClientId || '').trim(),
          clientSecret: (this.driveClientSecret || '').trim(),
          refreshToken: (this.driveRefreshToken || '').trim(),
          accessToken: (this.driveAccessToken || '').trim(),
          rootFolderId: extractFn ? extractFn(rawFolder) : rawFolder,
          rootFolderName: (this.driveRootFolderName || '').trim() || defaultRoot
        };
      },
      saveDriveConfig: async function () {
        var payload = this.buildDrivePayloadFromForm();
        var hasAnyOAuth = Boolean(payload.clientId || payload.clientSecret || payload.refreshToken);
        var hasAllOAuth = Boolean(payload.clientId && payload.clientSecret && payload.refreshToken);

        if (hasAnyOAuth && !hasAllOAuth) {
          this.$emit('notify', {
            type: 'error',
            message:
              'Untuk mode otomatis permanen, lengkapi Client ID, Client Secret, dan Refresh Token sekaligus.'
          });
          return;
        }

        this.savingDriveConfig = true;
        try {
          var saved = await global.ZcpSettingsService.updateDriveConfig(payload);
          this.driveClientId = saved.clientId;
          this.driveClientSecret = saved.clientSecret;
          this.driveRefreshToken = saved.refreshToken;
          this.driveAccessToken = saved.accessToken;
          this.driveRootFolderId = saved.rootFolderId;
          this.driveRootFolderName = saved.rootFolderName;
          this.$emit('drive-config-updated', saved);
          this.$emit('notify', {
            type: 'success',
            message: 'Konfigurasi Google Drive API berhasil disimpan.'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal menyimpan konfigurasi Google Drive API.'
          });
        } finally {
          this.savingDriveConfig = false;
        }
      },
      testDriveConnection: async function () {
        this.testingDrive = true;
        this.driveTestStatus = null;
        try {
          var payload = this.buildDrivePayloadFromForm();
          var res = await global.ZcpDriveService.testConnection(payload);
          var msg =
            'Terhubung ke ' +
            (res.email || res.displayName || 'Google Drive') +
            ' • Folder: ' +
            res.folderName +
            (res.limitBytes
              ? ' • Terpakai: ' +
                this.formatDriveBytes(res.usageBytes) +
                ' / ' +
                this.formatDriveBytes(res.limitBytes)
              : '') +
            (res.authMode === 'manual_token'
              ? ' (Access Token Manual)'
              : ' (Auto-Refresh OAuth)');
          this.driveTestStatus = {
            type: 'success',
            text: msg
          };
          this.$emit('notify', {
            type: 'success',
            message: 'Koneksi ke Google Drive API berhasil.'
          });
        } catch (err) {
          var errMsg = (err && err.message) || 'Koneksi ke Google Drive API gagal.';
          this.driveTestStatus = {
            type: 'error',
            text: errMsg
          };
          this.$emit('notify', {
            type: 'error',
            message: errMsg
          });
        } finally {
          this.testingDrive = false;
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

        <!-- Kartu Google Drive API, Profil Superadmin & Tema -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div class="card">
            <div class="card-header-simple">
              <div>
                <h2>Konfigurasi Google Drive API (Maks. 100 MB)</h2>
                <p>Upload file desain &amp; sablon langsung ke Google Drive API v3 tanpa Apps Script dan tanpa login Google user.</p>
              </div>
              <span class="material-symbols-rounded" style="color: var(--accent-info);">cloud_upload</span>
            </div>
            <form class="card-body" @submit.prevent="saveDriveConfig">
              <div class="form-group">
                <label class="form-label" for="drive-client-id">OAuth Client ID</label>
                <input
                  id="drive-client-id"
                  v-model="driveClientId"
                  type="text"
                  class="form-control"
                  placeholder="1234567890-xxxx.apps.googleusercontent.com"
                  autocomplete="off"
                  :disabled="savingDriveConfig || testingDrive"
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="drive-client-secret">OAuth Client Secret</label>
                <div style="position: relative; display: flex; align-items: center;">
                  <input
                    id="drive-client-secret"
                    v-model="driveClientSecret"
                    :type="showDriveSecret ? 'text' : 'password'"
                    class="form-control"
                    style="padding-right: 44px;"
                    placeholder="GOCSPX-..."
                    autocomplete="off"
                    :disabled="savingDriveConfig || testingDrive"
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon-sm"
                    style="position: absolute; right: 6px;"
                    :title="showDriveSecret ? 'Sembunyikan Client Secret' : 'Lihat Client Secret'"
                    @click="showDriveSecret = !showDriveSecret"
                  >
                    <span class="material-symbols-rounded" style="font-size: 18px;">
                      {{ showDriveSecret ? 'visibility_off' : 'visibility' }}
                    </span>
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="drive-refresh-token">OAuth Refresh Token (Permanen)</label>
                <div style="position: relative; display: flex; align-items: center;">
                  <input
                    id="drive-refresh-token"
                    v-model="driveRefreshToken"
                    :type="showDriveRefreshToken ? 'text' : 'password'"
                    class="form-control"
                    style="padding-right: 44px;"
                    placeholder="1//04..."
                    autocomplete="off"
                    :disabled="savingDriveConfig || testingDrive"
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon-sm"
                    style="position: absolute; right: 6px;"
                    :title="showDriveRefreshToken ? 'Sembunyikan Refresh Token' : 'Lihat Refresh Token'"
                    @click="showDriveRefreshToken = !showDriveRefreshToken"
                  >
                    <span class="material-symbols-rounded" style="font-size: 18px;">
                      {{ showDriveRefreshToken ? 'visibility_off' : 'visibility' }}
                    </span>
                  </button>
                </div>
                <div class="form-hint">
                  Browser otomatis menukar Refresh Token menjadi Access Token saat upload/hapus file. Drive toko menjadi pemilik penuh (akses edit &amp; hapus).
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="drive-root-folder">URL / ID Folder Root Drive (Opsional)</label>
                <input
                  id="drive-root-folder"
                  v-model="driveRootFolderId"
                  type="text"
                  class="form-control"
                  placeholder="Tempel URL folder Google Drive atau ID folder (kosongkan = otomatis buat ZCP_STORE_FILES)"
                  :disabled="savingDriveConfig || testingDrive"
                />
                <div class="form-hint">
                  Bisa menempel URL folder Drive langsung; sistem otomatis mengambil ID foldernya.
                </div>
              </div>

              <details style="margin-bottom: 12px;">
                <summary style="cursor: pointer; font-size: 12.5px; font-weight: 600; color: var(--text-secondary);">
                  Opsi Lain: Access Token Manual (Tes Cepat / Berlaku ~1 Jam)
                </summary>
                <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
                  <label class="form-label" for="drive-access-token">Access Token Manual (Opsional)</label>
                  <div style="position: relative; display: flex; align-items: center;">
                    <input
                      id="drive-access-token"
                      v-model="driveAccessToken"
                      :type="showDriveAccessToken ? 'text' : 'password'"
                      class="form-control"
                      style="padding-right: 44px;"
                      placeholder="ya29.a0..."
                      autocomplete="off"
                      :disabled="savingDriveConfig || testingDrive"
                    />
                    <button
                      type="button"
                      class="btn btn-ghost btn-icon-sm"
                      style="position: absolute; right: 6px;"
                      :title="showDriveAccessToken ? 'Sembunyikan Access Token' : 'Lihat Access Token'"
                      @click="showDriveAccessToken = !showDriveAccessToken"
                    >
                      <span class="material-symbols-rounded" style="font-size: 18px;">
                        {{ showDriveAccessToken ? 'visibility_off' : 'visibility' }}
                      </span>
                    </button>
                  </div>
                  <div class="form-hint">
                    Dipakai hanya jika Client ID / Client Secret / Refresh Token dikosongkan.
                  </div>
                </div>
              </details>

              <details style="margin-bottom: 12px;">
                <summary style="cursor: pointer; font-size: 12.5px; font-weight: 600; color: var(--accent-info);">
                  Panduan Setup 1x untuk Mendapatkan Client ID, Secret &amp; Refresh Token
                </summary>
                <ol style="margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: var(--text-secondary); line-height: 1.55;">
                  <li>Buka Google Cloud Console &rarr; aktifkan <strong>Google Drive API</strong>.</li>
                  <li>Masuk ke <strong>OAuth consent screen</strong> (External) lalu klik <strong>Publish App</strong> agar Refresh Token tidak kadaluarsa tiap 7 hari.</li>
                  <li>Buka <strong>Credentials &rarr; Create OAuth Client ID (Web application)</strong>, isi Authorized redirect URI: <code>https://developers.google.com/oauthplayground</code>, lalu salin <strong>Client ID</strong> &amp; <strong>Client Secret</strong>.</li>
                  <li>Buka <code>https://developers.google.com/oauthplayground</code> &rarr; klik ikon gerigi &rarr; centang <strong>Use your own OAuth credentials</strong> &rarr; masukkan Client ID &amp; Client Secret.</li>
                  <li>Pilih scope <code>https://www.googleapis.com/auth/drive</code> &rarr; klik <strong>Authorize APIs</strong> dan login pakai <strong>akun Google toko</strong> &rarr; klik <strong>Exchange authorization code for tokens</strong> &rarr; salin <strong>Refresh token</strong> ke form ini.</li>
                </ol>
              </details>

              <div
                v-if="driveTestStatus"
                class="ai-config-status"
                :class="driveTestStatus.type"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">
                  {{ driveTestStatus.type === 'success' ? 'check_circle' : 'error' }}
                </span>
                <span>{{ driveTestStatus.text }}</span>
              </div>

              <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="savingDriveConfig || testingDrive"
                  @click="testDriveConnection"
                >
                  <span v-if="testingDrive" class="spinner spinner-sm"></span>
                  <span v-else class="material-symbols-rounded" style="font-size: 17px;">network_check</span>
                  <span>{{ testingDrive ? 'Menguji...' : 'Tes Koneksi Drive' }}</span>
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="savingDriveConfig || testingDrive"
                >
                  <span v-if="savingDriveConfig" class="spinner spinner-sm"></span>
                  <span>{{ savingDriveConfig ? 'Menyimpan...' : 'Simpan Konfigurasi Drive' }}</span>
                </button>
              </div>
            </form>
          </div>

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
