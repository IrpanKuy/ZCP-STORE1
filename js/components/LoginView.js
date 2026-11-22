(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  var AUTH_ERROR_MESSAGES = {
    'auth/invalid-credential': 'Email atau kata sandi salah.',
    'auth/wrong-password': 'Kata sandi yang Anda masukkan salah.',
    'auth/user-not-found': 'Akun admin dengan email tersebut tidak ditemukan.',
    'auth/invalid-email': 'Format alamat email tidak valid.',
    'auth/too-many-requests': 'Terlalu banyak percobaan login gagal. Coba lagi beberapa menit lagi.',
    'auth/network-request-failed': 'Koneksi jaringan bermasalah. Periksa koneksi internet Anda.',
    'auth/user-disabled': 'Akun admin ini dinonaktifkan di Firebase Console.'
  };

  global.ZcpComponents.LoginView = {
    name: 'LoginView',
    props: {
      firebaseReady: { type: Boolean, default: false },
      theme: { type: String, default: 'light' }
    },
    emits: ['toggle-theme', 'notify'],
    data: function () {
      return {
        email: '',
        password: '',
        showPassword: false,
        submitting: false,
        errorMsg: ''
      };
    },
    computed: {
      supportsTextSecurity: function () {
        return (
          typeof CSS !== 'undefined' &&
          typeof CSS.supports === 'function' &&
          CSS.supports('-webkit-text-security', 'disc')
        );
      }
    },
    methods: {
      handleLogin: async function () {
        this.errorMsg = '';

        if (!this.firebaseReady) {
          this.errorMsg = 'Firebase belum dikonfigurasi. Lengkapi js/firebase-config.js terlebih dahulu.';
          return;
        }

        var emailClean = this.email.trim();
        if (!emailClean || !this.password) {
          this.errorMsg = 'Email dan kata sandi wajib diisi.';
          return;
        }

        var auth = global.ZcpFirebase && global.ZcpFirebase.getAuth();
        if (!auth) {
          this.errorMsg = 'Layanan Firebase Auth tidak tersedia.';
          return;
        }

        this.submitting = true;
        try {
          await auth.signInWithEmailAndPassword(emailClean, this.password);
          this.$emit('notify', {
            type: 'success',
            message: 'Login berhasil. Selamat datang di ZCP STORE!'
          });
        } catch (err) {
          var code = err && err.code ? err.code : '';
          this.errorMsg =
            AUTH_ERROR_MESSAGES[code] ||
            (err && err.message ? err.message : 'Gagal masuk ke aplikasi. Coba lagi.');
        } finally {
          this.submitting = false;
        }
      }
    },
    template: `
      <div class="login-page">
        <button
          type="button"
          class="btn btn-secondary login-theme-toggle"
          @click="$emit('toggle-theme')"
          :title="theme === 'dark' ? 'Aktifkan Light Mode' : 'Aktifkan Dark Mode'"
        >
          <span class="material-symbols-rounded">
            {{ theme === 'dark' ? 'light_mode' : 'dark_mode' }}
          </span>
          <span class="theme-label">{{ theme === 'dark' ? 'Light' : 'Dark' }}</span>
        </button>

        <div class="login-card">
          <div class="login-brand">
            <div class="login-logo-frame">
              <img src="./zcpstore.jpg" alt="Logo ZCP STORE" />
            </div>
            <h1 class="login-title">ZCP STORE</h1>
            <p class="login-subtitle">Panel Admin Manajemen Sablon</p>
          </div>

          <div v-if="!firebaseReady" class="alert alert-warning" role="alert">
            <span class="material-symbols-rounded">warning</span>
            <div>
              <strong>Firebase belum dikonfigurasi.</strong>
              <div>
                Isi kredensial project Firebase Anda pada file
                <code>js/firebase-config.js</code> agar fitur login dapat digunakan.
              </div>
            </div>
          </div>

          <div v-if="errorMsg" class="alert alert-danger" role="alert">
            <span class="material-symbols-rounded">error</span>
            <div>{{ errorMsg }}</div>
          </div>

          <form @submit.prevent="handleLogin" autocomplete="off" novalidate>
            <div class="form-group">
              <label class="form-label" for="login-email">
                Email Admin <span class="required">*</span>
              </label>
              <div class="input-wrapper">
                <span class="material-symbols-rounded input-icon">mail</span>
                <input
                  id="login-email"
                  v-model="email"
                  type="text"
                  inputmode="email"
                  class="form-control has-left-icon"
                  placeholder="admin@zcpstore.com"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                  :disabled="submitting"
                  required
                />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="login-password">
                Kata Sandi <span class="required">*</span>
              </label>
              <div class="input-wrapper">
                <span class="material-symbols-rounded input-icon">lock</span>
                <input
                  id="login-password"
                  v-model="password"
                  :type="(supportsTextSecurity || showPassword) ? 'text' : 'password'"
                  class="form-control has-left-icon has-right-action"
                  :class="{ 'password-masked': supportsTextSecurity && !showPassword }"
                  placeholder="Masukkan kata sandi"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                  data-lpignore="true"
                  data-1p-ignore
                  :disabled="submitting"
                  required
                />
                <button
                  type="button"
                  class="input-action-btn"
                  :aria-label="showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'"
                  @click="showPassword = !showPassword"
                >
                  <span class="material-symbols-rounded" style="font-size: 20px;">
                    {{ showPassword ? 'visibility_off' : 'visibility' }}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              class="btn btn-primary btn-block"
              :disabled="submitting || !firebaseReady"
            >
              <span v-if="submitting" class="spinner spinner-sm"></span>
              <span v-else class="material-symbols-rounded" style="font-size: 19px;">login</span>
              <span>{{ submitting ? 'Memverifikasi...' : 'Masuk sebagai Admin' }}</span>
            </button>
          </form>

          <div class="login-footer-note">
            Akun admin hanya dibuat langsung melalui Firebase Authentication Console.
          </div>
        </div>
      </div>
    `
  };
})(window);
