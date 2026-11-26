(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.AppNavbar = {
    name: 'AppNavbar',
    props: {
      pageTitle: { type: String, default: 'Master Data' },
      breadcrumb: { type: String, default: 'Master Data' },
      theme: { type: String, default: 'light' },
      userEmail: { type: String, default: '' },
      userName: { type: String, default: '' },
      userRole: { type: String, default: 'superadmin' },
      currentPage: { type: String, default: '' },
      sablonAiQueue: { type: Object, default: null }
    },
    emits: ['toggle-sidebar', 'toggle-theme', 'logout', 'open-sablon-form', 'dismiss-ai-queue'],
    computed: {
      roleLabel: function () {
        if (this.userRole === 'superadmin') return 'Superadmin';
        if (this.userRole === 'admin') return 'Admin';
        return 'Karyawan';
      },
      showAiProgress: function () {
        var q = this.sablonAiQueue;
        if (!q) return false;
        if (q.status === 'running') return true;
        if (
          (q.status === 'done' || q.status === 'error') &&
          !q.dismissedFromNavbar &&
          this.currentPage !== 'sablon-form'
        ) {
          return true;
        }
        return false;
      },
      aiStatusShortLabel: function () {
        var q = this.sablonAiQueue;
        if (!q) return '';
        if (q.status === 'running') {
          if (q.retryCountdown > 0) {
            return 'Retry AI (' + q.retryAttempt + '/' + q.maxRetries + ') • ' + q.retryCountdown + 's';
          }
          if (q.totalInQueue > 1) {
            return 'Isi Sisi AI • ' + q.currentPos + '/' + q.totalInQueue + ' (' + q.percent + '%)';
          }
          return 'Isi Sisi AI • ' + q.percent + '%';
        }
        if (q.status === 'done') {
          return 'AI Selesai • Klik untuk Lihat';
        }
        if (q.status === 'error') {
          return 'Queue AI Berhenti • Cek';
        }
        return '';
      }
    },
    template: `
      <header class="top-navbar">
        <div class="navbar-left">
          <button
            type="button"
            class="btn btn-secondary btn-icon menu-toggle-btn"
            aria-label="Buka menu navigasi"
            @click="$emit('toggle-sidebar')"
          >
            <span class="material-symbols-rounded">menu</span>
          </button>

          <div>
            <div class="breadcrumb-text">
              Pages / <strong>{{ breadcrumb }}</strong>
            </div>
            <h1 class="page-title">{{ pageTitle }}</h1>
          </div>
        </div>

        <div class="navbar-actions">
          <button
            v-if="showAiProgress"
            type="button"
            class="navbar-ai-progress"
            :class="{
              'is-done': sablonAiQueue.status === 'done',
              'is-error': sablonAiQueue.status === 'error',
              'is-retrying': sablonAiQueue.retryCountdown > 0
            }"
            :title="(sablonAiQueue.stageText || 'Proses Isi Sisi Otomatis') + ' — Klik untuk kembali ke halaman Buat Sablon'"
            @click="$emit('open-sablon-form')"
          >
            <span v-if="sablonAiQueue.status === 'running'" class="spinner spinner-sm"></span>
            <span
              v-else
              class="material-symbols-rounded"
              style="font-size: 18px;"
            >
              {{ sablonAiQueue.status === 'error' ? 'error' : 'check_circle' }}
            </span>

            <div class="navbar-ai-content">
              <div class="navbar-ai-title">{{ aiStatusShortLabel }}</div>
              <div class="navbar-ai-sub">{{ sablonAiQueue.stageText }}</div>
              <div class="navbar-ai-bar-track">
                <div
                  class="navbar-ai-bar-fill"
                  :style="{ width: Math.max(4, Math.min(100, Number(sablonAiQueue.percent) || 0)) + '%' }"
                ></div>
              </div>
            </div>

            <span
              v-if="sablonAiQueue.status === 'done' || sablonAiQueue.status === 'error'"
              class="navbar-ai-dismiss"
              role="button"
              tabindex="0"
              aria-label="Tutup notifikasi progres AI"
              title="Tutup"
              @click.stop="$emit('dismiss-ai-queue')"
            >
              <span class="material-symbols-rounded" style="font-size: 15px;">close</span>
            </span>
          </button>

          <button
            type="button"
            class="btn btn-secondary theme-toggle-btn"
            :title="theme === 'dark' ? 'Beralih ke Light Mode' : 'Beralih ke Dark Mode'"
            @click="$emit('toggle-theme')"
          >
            <span class="material-symbols-rounded" style="font-size: 19px;">
              {{ theme === 'dark' ? 'light_mode' : 'dark_mode' }}
            </span>
            <span class="theme-label">{{ theme === 'dark' ? 'Light Mode' : 'Dark Mode' }}</span>
          </button>

          <div v-if="userEmail" class="navbar-user-pill" :title="userEmail">
            <span class="role-badge" :class="userRole">{{ roleLabel }}</span>
            <span>{{ userName || userEmail }}</span>
          </div>

          <button
            type="button"
            class="btn btn-secondary btn-icon"
            title="Keluar dari akun"
            aria-label="Keluar"
            @click="$emit('logout')"
          >
            <span class="material-symbols-rounded" style="font-size: 19px;">logout</span>
          </button>
        </div>
      </header>
    `
  };
})(window);
