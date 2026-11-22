(function (global) {
  'use strict';

  var SUPERADMIN_ONLY_PAGES = ['akun-karyawan', 'log-aktivitas', 'pengaturan'];

  var PAGE_TITLES = {
    'master-data': { title: 'Master Data', breadcrumb: 'Master Data' },
    dashboard: { title: 'Dashboard', breadcrumb: 'Dashboard' },
    pesanan: { title: 'Pesanan', breadcrumb: 'Pesanan' },
    operasional: { title: 'Operasional', breadcrumb: 'Operasional' },
    sablon: { title: 'Manajemen Sablon', breadcrumb: 'Manajemen Sablon' },
    'akun-karyawan': { title: 'Akun Karyawan', breadcrumb: 'Akun Karyawan' },
    'log-aktivitas': { title: 'Log Aktivitas', breadcrumb: 'Log Aktivitas' },
    pengaturan: { title: 'Pengaturan', breadcrumb: 'Pengaturan' }
  };

  var toastSeq = 0;

  function detectInitialTheme() {
    try {
      var saved = localStorage.getItem('zcp_theme');
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
      if (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (e) {
      // Abaikan jika storage tidak tersedia
    }
    return 'light';
  }

  var app = Vue.createApp({
    components: {
      ToastContainer: global.ZcpComponents.ToastContainer,
      ConfirmModal: global.ZcpComponents.ConfirmModal,
      LoginView: global.ZcpComponents.LoginView,
      AppSidebar: global.ZcpComponents.AppSidebar,
      AppNavbar: global.ZcpComponents.AppNavbar,
      DashboardView: global.ZcpComponents.DashboardView,
      PesananView: global.ZcpComponents.PesananView,
      OperasionalView: global.ZcpComponents.OperasionalView,
      SablonView: global.ZcpComponents.SablonView,
      MasterDataView: global.ZcpComponents.MasterDataView,
      AkunKaryawanView: global.ZcpComponents.AkunKaryawanView,
      ActivityLogView: global.ZcpComponents.ActivityLogView,
      PengaturanView: global.ZcpComponents.PengaturanView,
      ComingSoonView: global.ZcpComponents.ComingSoonView
    },
    data: function () {
      return {
        firebaseReady: Boolean(global.ZcpFirebase && global.ZcpFirebase.isConfigured()),
        driveReady: Boolean(global.ZcpDriveConfig && global.ZcpDriveConfig.isConfigured()),
        authLoading: true,
        user: null,
        currentPage: 'dashboard',
        defaultPageSize: 10,
        theme: detectInitialTheme(),
        sidebarOpen: false,
        toasts: [],
        confirmState: {
          visible: false,
          title: 'Konfirmasi',
          message: '',
          confirmText: 'Ya, Lanjutkan',
          variant: 'danger',
          loading: false,
          onConfirm: null
        },
        produkList: [],
        expedisiList: [],
        pesananList: [],
        sablonList: [],
        usersList: [],
        logsList: [],
        loadingProduk: false,
        loadingExpedisi: false,
        loadingPesanan: false,
        loadingSablon: false,
        loadingUsers: false,
        loadingLogs: false,
        loadingMoreLogs: false,
        usersLoaded: false,
        logsLoaded: false,
        lastLogDoc: null,
        hasMoreLogs: false,
        pesananLimit: 150,
        hasMorePesanan: false,
        sablonLimit: 150,
        hasMoreSablon: false,
        unsubAuth: null,
        unsubPesanan: null,
        unsubSablon: null
      };
    },
    computed: {
      activePageMeta: function () {
        return PAGE_TITLES[this.currentPage] || PAGE_TITLES['master-data'];
      },
      activePesananCount: function () {
        return this.pesananList.filter(function (o) {
          return !o.statusSelesai;
        }).length;
      },
      activeSablonCount: function () {
        return this.sablonList.filter(function (s) {
          return !s.statusSelesai;
        }).length;
      }
    },
    watch: {
      theme: {
        immediate: true,
        handler: function (val) {
          document.documentElement.dataset.theme = val;
          try {
            localStorage.setItem('zcp_theme', val);
          } catch (e) {
            // Abaikan jika storage diblokir
          }
        }
      }
    },
    mounted: function () {
      this.initAuthListener();
    },
    beforeUnmount: function () {
      this.cleanupMasterSubscriptions();
      if (typeof this.unsubAuth === 'function') {
        this.unsubAuth();
        this.unsubAuth = null;
      }
    },
    methods: {
      toggleTheme: function () {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
      },
      addToast: function (payload) {
        var id = ++toastSeq;
        var message = (payload && payload.message) || String(payload || '');
        var type = (payload && payload.type) || 'info';
        var self = this;
        this.toasts.push({ id: id, message: message, type: type });
        setTimeout(function () {
          self.dismissToast(id);
        }, 4000);
      },
      dismissToast: function (id) {
        this.toasts = this.toasts.filter(function (t) {
          return t.id !== id;
        });
      },
      openConfirm: function (options) {
        this.confirmState = {
          visible: true,
          title: options.title || 'Konfirmasi',
          message: options.message || 'Apakah Anda yakin?',
          confirmText: options.confirmText || 'Ya, Lanjutkan',
          variant: options.variant || 'danger',
          loading: false,
          onConfirm: options.onConfirm || null
        };
      },
      closeConfirm: function () {
        if (this.confirmState.loading) return;
        this.confirmState.visible = false;
        this.confirmState.onConfirm = null;
      },
      executeConfirm: async function () {
        var handler = this.confirmState.onConfirm;
        if (typeof handler !== 'function') {
          this.confirmState.visible = false;
          return;
        }
        this.confirmState.loading = true;
        try {
          await handler();
          this.confirmState.visible = false;
          this.confirmState.onConfirm = null;
        } catch (err) {
          this.addToast({
            type: 'error',
            message: (err && err.message) || 'Terjadi kesalahan saat memproses aksi.'
          });
        } finally {
          this.confirmState.loading = false;
        }
      },
      navigatePage: function (pageKey) {
        if (
          SUPERADMIN_ONLY_PAGES.indexOf(pageKey) !== -1 &&
          (!this.user || this.user.role !== 'superadmin')
        ) {
          this.addToast({
            type: 'error',
            message: 'Menu ini hanya dapat diakses oleh Superadmin.'
          });
          return;
        }
        this.currentPage = pageKey;

        // Lazy load khusus menu administrasi agar kuota Read Firestore hemat saat awal login
        if (this.user && this.user.role === 'superadmin') {
          if (pageKey === 'akun-karyawan' && !this.usersLoaded) {
            this.loadUsers(false);
          } else if (pageKey === 'log-aktivitas') {
            if (!this.usersLoaded) {
              this.loadUsers(false);
            }
            if (!this.logsLoaded) {
              this.loadLogs(true);
            }
          }
        }
      },
      onProfileUpdated: function (newName) {
        if (this.user) {
          this.user.nama = newName;
          if (global.ZcpActivityLogService) {
            global.ZcpActivityLogService.setCurrentActor(this.user);
          }
        }
      },
      onSettingsUpdated: function (newPageSize) {
        this.defaultPageSize = newPageSize;
      },
      initAuthListener: function () {
        if (!this.firebaseReady) {
          this.authLoading = false;
          return;
        }
        var auth = global.ZcpFirebase.getAuth();
        var self = this;
        this.unsubAuth = auth.onAuthStateChanged(
          async function (authUser) {
            if (!authUser) {
              self.user = null;
              if (global.ZcpActivityLogService) {
                global.ZcpActivityLogService.setCurrentActor(null);
              }
              self.cleanupMasterSubscriptions();
              self.authLoading = false;
              return;
            }

            try {
              var profile = await global.ZcpUserService.getUserProfile(authUser);
              if (profile && profile.active === false) {
                await auth.signOut();
                self.user = null;
                self.cleanupMasterSubscriptions();
                self.authLoading = false;
                self.addToast({
                  type: 'error',
                  message: 'Akun Anda telah dinonaktifkan oleh Superadmin.'
                });
                return;
              }

              self.user = profile;
              if (global.ZcpActivityLogService) {
                global.ZcpActivityLogService.setCurrentActor(profile);
              }

              if (
                profile.role !== 'superadmin' &&
                SUPERADMIN_ONLY_PAGES.indexOf(self.currentPage) !== -1
              ) {
                self.currentPage = 'dashboard';
              }

              self.authLoading = false;
              self.startMasterSubscriptions(profile.role);
            } catch (err) {
              self.authLoading = false;
              self.addToast({
                type: 'error',
                message: (err && err.message) || 'Gagal memuat profil pengguna.'
              });
            }
          },
          function (err) {
            self.authLoading = false;
            self.addToast({
              type: 'error',
              message: (err && err.message) || 'Gagal memeriksa status login.'
            });
          }
        );
      },
      startMasterSubscriptions: async function () {
        this.cleanupMasterSubscriptions();
        var self = this;

        // Ambil 1x via .get() untuk data konfigurasi & master yang jarang berubah
        this.loadMasterProduk();
        this.loadMasterExpedisi();
        global.ZcpSettingsService.fetchSettings()
          .then(function (cfg) {
            self.defaultPageSize = cfg.defaultPageSize;
          })
          .catch(function () {
            // Gunakan default 10 jika gagal membaca pengaturan
          });

        this.subscribePesananList();
        this.subscribeSablonList();
      },
      loadMasterProduk: async function () {
        this.loadingProduk = true;
        try {
          this.produkList = await global.ZcpMasterService.fetchProduk();
        } catch (err) {
          this.addToast({
            type: 'error',
            message: 'Gagal memuat Master Produk: ' + ((err && err.message) || 'Akses ditolak')
          });
        } finally {
          this.loadingProduk = false;
        }
      },
      loadMasterExpedisi: async function () {
        this.loadingExpedisi = true;
        try {
          this.expedisiList = await global.ZcpMasterService.fetchExpedisi();
        } catch (err) {
          this.addToast({
            type: 'error',
            message: 'Gagal memuat Master Expedisi: ' + ((err && err.message) || 'Akses ditolak')
          });
        } finally {
          this.loadingExpedisi = false;
        }
      },
      subscribePesananList: function () {
        if (typeof this.unsubPesanan === 'function') {
          this.unsubPesanan();
          this.unsubPesanan = null;
        }
        var self = this;
        this.loadingPesanan = true;
        this.unsubPesanan = global.ZcpPesananService.subscribePesanan(
          function (list, hasMore) {
            self.pesananList = list;
            self.hasMorePesanan = Boolean(hasMore);
            self.loadingPesanan = false;
          },
          function (err) {
            self.loadingPesanan = false;
            self.addToast({
              type: 'error',
              message: 'Gagal memuat Pesanan: ' + ((err && err.message) || 'Akses ditolak')
            });
          },
          this.pesananLimit
        );
      },
      subscribeSablonList: function () {
        if (typeof this.unsubSablon === 'function') {
          this.unsubSablon();
          this.unsubSablon = null;
        }
        var self = this;
        this.loadingSablon = true;
        this.unsubSablon = global.ZcpSablonService.subscribeSablon(
          function (list, hasMore) {
            self.sablonList = list;
            self.hasMoreSablon = Boolean(hasMore);
            self.loadingSablon = false;
          },
          function (err) {
            self.loadingSablon = false;
            self.addToast({
              type: 'error',
              message: 'Gagal memuat Manajemen Sablon: ' + ((err && err.message) || 'Akses ditolak')
            });
          },
          this.sablonLimit
        );
      },
      loadMorePesanan: function () {
        this.pesananLimit += 150;
        this.subscribePesananList();
      },
      loadMoreSablon: function () {
        this.sablonLimit += 150;
        this.subscribeSablonList();
      },
      loadUsers: async function (force) {
        if (!this.user || this.user.role !== 'superadmin') return;
        if (this.loadingUsers && !force) return;
        this.loadingUsers = true;
        try {
          this.usersList = await global.ZcpUserService.fetchUsers();
          this.usersLoaded = true;
        } catch (err) {
          this.addToast({
            type: 'error',
            message: 'Gagal memuat Akun Karyawan: ' + ((err && err.message) || 'Akses ditolak')
          });
        } finally {
          this.loadingUsers = false;
        }
      },
      loadLogs: async function (reset) {
        if (!this.user || this.user.role !== 'superadmin') return;
        var isReset = reset !== false;
        if (isReset) {
          this.loadingLogs = true;
          this.lastLogDoc = null;
        } else {
          if (!this.hasMoreLogs || this.loadingMoreLogs) return;
          this.loadingMoreLogs = true;
        }

        try {
          var res = await global.ZcpActivityLogService.fetchLogs({
            limitCount: 100,
            startAfterDoc: isReset ? null : this.lastLogDoc
          });
          if (isReset) {
            this.logsList = res.items;
            this.logsLoaded = true;
          } else {
            this.logsList = this.logsList.concat(res.items);
          }
          this.lastLogDoc = res.lastDoc;
          this.hasMoreLogs = Boolean(res.hasMore);
        } catch (err) {
          this.addToast({
            type: 'error',
            message: 'Gagal memuat Log Aktivitas: ' + ((err && err.message) || 'Akses ditolak')
          });
        } finally {
          this.loadingLogs = false;
          this.loadingMoreLogs = false;
        }
      },
      cleanupMasterSubscriptions: function () {
        if (typeof this.unsubPesanan === 'function') {
          this.unsubPesanan();
          this.unsubPesanan = null;
        }
        if (typeof this.unsubSablon === 'function') {
          this.unsubSablon();
          this.unsubSablon = null;
        }
        this.produkList = [];
        this.expedisiList = [];
        this.pesananList = [];
        this.sablonList = [];
        this.usersList = [];
        this.logsList = [];
        this.usersLoaded = false;
        this.logsLoaded = false;
        this.lastLogDoc = null;
        this.hasMoreLogs = false;
        this.hasMorePesanan = false;
        this.hasMoreSablon = false;
        this.pesananLimit = 150;
        this.sablonLimit = 150;
        this.loadingProduk = false;
        this.loadingExpedisi = false;
        this.loadingPesanan = false;
        this.loadingSablon = false;
        this.loadingUsers = false;
        this.loadingLogs = false;
        this.loadingMoreLogs = false;
      },
      requestLogout: function () {
        var self = this;
        this.openConfirm({
          title: 'Keluar dari Aplikasi',
          message: 'Apakah Anda yakin ingin keluar dari sesi admin ZCP STORE?',
          confirmText: 'Keluar',
          variant: 'primary',
          onConfirm: async function () {
            var auth = global.ZcpFirebase && global.ZcpFirebase.getAuth();
            if (auth) {
              await auth.signOut();
            }
            self.sidebarOpen = false;
            self.addToast({
              type: 'info',
              message: 'Anda telah keluar dari aplikasi.'
            });
          }
        });
      }
    }
  });

  app.component('table-pagination', global.ZcpComponents.TablePagination);
  app.component('file-preview-modal', global.ZcpComponents.FilePreviewModal);
  app.mount('#app');
})(window);
