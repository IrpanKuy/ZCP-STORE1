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
      userRole: { type: String, default: 'superadmin' }
    },
    emits: ['toggle-sidebar', 'toggle-theme', 'logout'],
    computed: {
      roleLabel: function () {
        if (this.userRole === 'superadmin') return 'Superadmin';
        if (this.userRole === 'admin') return 'Admin';
        return 'Karyawan';
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
