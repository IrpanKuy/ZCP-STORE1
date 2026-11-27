(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.AppSidebar = {
    name: 'AppSidebar',
    props: {
      currentPage: { type: String, default: 'dashboard' },
      open: { type: Boolean, default: false },
      userEmail: { type: String, default: '' },
      userName: { type: String, default: '' },
      userRole: { type: String, default: 'superadmin' },
      pesananCount: { type: Number, default: 0 },
      activePesananCount: { type: Number, default: 0 },
      sablonCount: { type: Number, default: 0 },
      produkCount: { type: Number, default: 0 },
      kategoriCount: { type: Number, default: 0 },
      expedisiCount: { type: Number, default: 0 },
      asalPesananCount: { type: Number, default: 0 },
      statusShopeeCount: { type: Number, default: 0 },
      boronganBadgeCount: { type: Number, default: 0 },
      usersCount: { type: Number, default: 0 }
    },
    emits: ['navigate', 'close', 'logout'],
    computed: {
      masterTotal: function () {
        return (
          this.produkCount +
          this.kategoriCount +
          this.expedisiCount +
          this.asalPesananCount +
          this.statusShopeeCount
        );
      },
      avatarInitial: function () {
        var source = this.userName || this.userEmail;
        return source ? source.charAt(0).toUpperCase() : 'A';
      },
      roleLabel: function () {
        if (this.userRole === 'superadmin') return 'Superadmin';
        if (this.userRole === 'admin') return 'Admin';
        return 'Karyawan';
      },
      adminNavItems: function () {
        if (this.userRole !== 'superadmin') return [];
        return [
          {
            key: 'akun-karyawan',
            label: 'Akun Karyawan',
            icon: 'manage_accounts',
            badge: String(this.usersCount)
          },
          {
            key: 'log-aktivitas',
            label: 'Log Aktivitas',
            icon: 'history',
            badge: ''
          },
          {
            key: 'pengaturan',
            label: 'Pengaturan',
            icon: 'settings',
            badge: ''
          }
        ];
      },
      navItems: function () {
        return [
          {
            key: 'dashboard',
            label: 'Dashboard',
            icon: 'dashboard',
            badge: ''
          },
          {
            key: 'pesanan',
            label: 'Pesanan',
            icon: 'shopping_bag',
            badge: String(this.pesananCount)
          },
          {
            key: 'operasional',
            label: 'Operasional',
            icon: 'event_note',
            badge: String(this.activePesananCount)
          },
          {
            key: 'sablon',
            label: 'Manajemen Sablon',
            icon: 'print',
            badge: String(this.sablonCount)
          },
          {
            key: 'borongan',
            label: 'Borongan',
            icon: 'payments',
            badge: this.boronganBadgeCount > 0 ? String(this.boronganBadgeCount) : ''
          },
          {
            key: 'master-data',
            label: 'Master Data',
            icon: 'database',
            badge: String(this.masterTotal)
          }
        ];
      }
    },
    methods: {
      selectPage: function (key) {
        this.$emit('navigate', key);
        this.$emit('close');
      }
    },
    template: `
      <div>
        <div
          v-if="open"
          class="sidebar-backdrop"
          @click="$emit('close')"
        ></div>

        <aside class="sidebar" :class="{ open: open }" aria-label="Navigasi Utama">
          <div class="sidebar-header">
            <div class="sidebar-brand">
              <img src="./zcpstore.jpg" alt="Logo ZCP STORE" class="sidebar-logo" />
              <div class="sidebar-brand-text">
                <div class="sidebar-brand-name">ZCP STORE</div>
                <div class="sidebar-brand-sub">Sablon Manager</div>
              </div>
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-icon sidebar-close-btn"
              aria-label="Tutup menu"
              @click="$emit('close')"
            >
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>

          <nav class="sidebar-nav">
            <div class="sidebar-section-label">Menu Utama</div>
            <button
              v-for="item in navItems"
              :key="item.key"
              type="button"
              class="nav-item"
              :class="{ active: currentPage === item.key || (item.key === 'sablon' && currentPage === 'sablon-form') }"
              @click="selectPage(item.key)"
            >
              <span class="nav-item-left">
                <span class="material-symbols-rounded">{{ item.icon }}</span>
                <span class="nav-item-label">{{ item.label }}</span>
              </span>
              <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
            </button>

            <template v-if="adminNavItems.length">
              <div class="sidebar-section-label" style="margin-top: 12px;">Administrasi</div>
              <button
                v-for="item in adminNavItems"
                :key="item.key"
                type="button"
                class="nav-item"
                :class="{ active: currentPage === item.key }"
                @click="selectPage(item.key)"
              >
                <span class="nav-item-left">
                  <span class="material-symbols-rounded">{{ item.icon }}</span>
                  <span class="nav-item-label">{{ item.label }}</span>
                </span>
                <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
              </button>
            </template>
          </nav>

          <div class="sidebar-footer">
            <div class="admin-chip">
              <div class="admin-avatar">{{ avatarInitial }}</div>
              <div class="admin-info">
                <div class="admin-role">{{ roleLabel }}</div>
                <div class="admin-email" :title="userEmail">{{ userName || userEmail || 'admin@zcpstore' }}</div>
              </div>
            </div>

            <button
              type="button"
              class="btn btn-secondary btn-block"
              @click="$emit('logout')"
            >
              <span class="material-symbols-rounded" style="font-size: 18px;">logout</span>
              <span>Keluar</span>
            </button>
          </div>
        </aside>
      </div>
    `
  };
})(window);
