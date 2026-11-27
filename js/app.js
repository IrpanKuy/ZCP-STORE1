(function (global) {
  'use strict';

  var SUPERADMIN_ONLY_PAGES = ['akun-karyawan', 'log-aktivitas', 'pengaturan'];

  var PAGE_TITLES = {
    'master-data': { title: 'Master Data', breadcrumb: 'Master Data' },
    dashboard: { title: 'Dashboard', breadcrumb: 'Dashboard' },
    pesanan: { title: 'Pesanan', breadcrumb: 'Pesanan' },
    operasional: { title: 'Operasional', breadcrumb: 'Operasional' },
    sablon: { title: 'Manajemen Sablon', breadcrumb: 'Manajemen Sablon' },
    'sablon-form': { title: 'Buat Data Sablon', breadcrumb: 'Manajemen Sablon / Buat Sablon' },
    borongan: { title: 'Borongan', breadcrumb: 'Borongan' },
    'akun-karyawan': { title: 'Akun Karyawan', breadcrumb: 'Akun Karyawan' },
    'log-aktivitas': { title: 'Log Aktivitas', breadcrumb: 'Log Aktivitas' },
    pengaturan: { title: 'Pengaturan', breadcrumb: 'Pengaturan' }
  };

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
      LoginView: global.ZcpComponents.LoginView,
      AppSidebar: global.ZcpComponents.AppSidebar,
      AppNavbar: global.ZcpComponents.AppNavbar,
      DashboardView: global.ZcpComponents.DashboardView,
      PesananView: global.ZcpComponents.PesananView,
      OperasionalView: global.ZcpComponents.OperasionalView,
      SablonView: global.ZcpComponents.SablonView,
      SablonFormView: global.ZcpComponents.SablonFormView,
      BoronganView: global.ZcpComponents.BoronganView,
      MasterDataView: global.ZcpComponents.MasterDataView,
      AkunKaryawanView: global.ZcpComponents.AkunKaryawanView,
      ActivityLogView: global.ZcpComponents.ActivityLogView,
      PengaturanView: global.ZcpComponents.PengaturanView,
      AiChatbot: global.ZcpComponents.AiChatbot,
      SablonSaveToastStack: global.ZcpComponents.SablonSaveToastStack,
      ComingSoonView: global.ZcpComponents.ComingSoonView
    },
    data: function () {
      return {
        firebaseReady: Boolean(global.ZcpFirebase && global.ZcpFirebase.isConfigured()),
        authLoading: true,
        user: null,
        currentPage: 'dashboard',
        defaultPageSize: 10,
        aiConfig: {
          geminiApiUrl:
            (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_GEMINI_URL) ||
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
          geminiApiKey: ''
        },
        driveConfig: {
          clientId: '',
          clientSecret: '',
          refreshToken: '',
          accessToken: '',
          rootFolderId: '',
          rootFolderName:
            (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_DRIVE_ROOT_FOLDER) ||
            'ZCP_STORE_FILES'
        },
        theme: detectInitialTheme(),
        sidebarOpen: false,
        produkList: [],
        kategoriProdukList: [],
        expedisiList: [],
        asalPesananList: [],
        statusShopeeList: [],
        pesananList: [],
        sablonList: [],
        boronganRequestsList: [],
        usersList: [],
        logsList: [],
        loadingProduk: false,
        loadingKategoriProduk: false,
        loadingExpedisi: false,
        loadingAsalPesanan: false,
        loadingStatusShopee: false,
        loadingPesanan: false,
        loadingSablon: false,
        loadingBoronganRequests: false,
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
        unsubSablon: null,
        unsubBoronganRequests: null,
        sablonFormState: global.ZcpSablonQueueService.formState,
        sablonAiQueue: global.ZcpSablonQueueService.aiQueue,
        sablonSaveJobs: global.ZcpSablonQueueService.saveJobs
      };
    },
    computed: {
      driveReady: function () {
        var c = this.driveConfig || {};
        return Boolean((c.clientId && c.clientSecret && c.refreshToken) || c.accessToken);
      },
      activePageMeta: function () {
        if (this.currentPage === 'sablon-form' && this.sablonFormState.mode === 'edit') {
          return { title: 'Edit Data Sablon', breadcrumb: 'Manajemen Sablon / Edit Sablon' };
        }
        return PAGE_TITLES[this.currentPage] || PAGE_TITLES['master-data'];
      },
      hasUnsavedSablonDrafts: function () {
        return Boolean(
          global.ZcpSablonQueueService && global.ZcpSablonQueueService.hasUnsavedCreateDrafts()
        );
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
      },
      staffList: function () {
        return this.usersList.filter(function (u) {
          return u.active !== false && (u.role === 'admin' || u.role === 'karyawan');
        });
      },
      pendingBoronganCount: function () {
        var uid = this.user && this.user.uid;
        var isSuper = this.user && this.user.role === 'superadmin';
        if (!uid) return 0;
        return this.boronganRequestsList.filter(function (r) {
          if (r.status !== 'pending') return false;
          if (isSuper) return true;
          return Array.isArray(r.involvedUids) && r.involvedUids.indexOf(uid) !== -1;
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
        if (global.ZcpAlert && typeof global.ZcpAlert.toast === 'function') {
          global.ZcpAlert.toast(payload);
        }
      },
      openConfirm: function (options) {
        if (global.ZcpAlert && typeof global.ZcpAlert.confirm === 'function') {
          global.ZcpAlert.confirm(options);
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
        if (pageKey === 'sablon-form' && this.user && this.user.role === 'karyawan') {
          this.addToast({
            type: 'error',
            message: 'Karyawan tidak memiliki akses untuk membuat atau mengedit data sablon.'
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
      onAiConfigUpdated: function (cfg) {
        var defaultUrl =
          (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_GEMINI_URL) ||
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
        this.aiConfig = {
          geminiApiUrl: (cfg && cfg.geminiApiUrl) || defaultUrl,
          geminiApiKey: (cfg && cfg.geminiApiKey) || ''
        };
      },
      onDriveConfigUpdated: function (cfg) {
        var defaultRoot =
          (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_DRIVE_ROOT_FOLDER) ||
          'ZCP_STORE_FILES';
        var nextCfg = {
          clientId: (cfg && cfg.clientId) || '',
          clientSecret: (cfg && cfg.clientSecret) || '',
          refreshToken: (cfg && cfg.refreshToken) || '',
          accessToken: (cfg && cfg.accessToken) || '',
          rootFolderId: (cfg && cfg.rootFolderId) || '',
          rootFolderName: (cfg && cfg.rootFolderName) || defaultRoot
        };
        this.driveConfig = nextCfg;
        if (global.ZcpDriveService && typeof global.ZcpDriveService.setConfig === 'function') {
          global.ZcpDriveService.setConfig(nextCfg);
        }
      },
      onAiDataMutated: function (info) {
        if (info && info.touchedMaster) {
          this.loadMasterProduk();
          this.loadMasterKategoriProduk();
          this.loadMasterExpedisi();
          this.loadMasterAsalPesanan();
          this.loadMasterStatusShopee();
        }
      },
      openCreateSablonPage: function () {
        if (this.user && this.user.role === 'karyawan') return;
        if (this.sablonFormState.mode === 'edit' && !this.sablonAiQueue.running) {
          global.ZcpSablonQueueService.resetToCreate();
        }
        this.navigatePage('sablon-form');
      },
      openEditSablonPage: function (sablon) {
        if ((this.user && this.user.role === 'karyawan') || !sablon) return;
        if (
          global.ZcpSablonQueueService &&
          typeof global.ZcpSablonQueueService.isSablonIdInSaveQueue === 'function' &&
          global.ZcpSablonQueueService.isSablonIdInSaveQueue(sablon.id)
        ) {
          if (global.ZcpAlert) {
            global.ZcpAlert.warning(
              'Data sablon ini sedang dalam proses simpan di latar belakang. Tunggu hingga selesai sebelum mengedit lagi.'
            );
          }
          return;
        }
        if (this.sablonAiQueue.running) {
          if (global.ZcpAlert) {
            global.ZcpAlert.warning(
              'Tunggu atau hentikan antrian Isi Sisi Otomatis terlebih dahulu sebelum mengedit data sablon.'
            );
          }
          return;
        }
        var pMap = {};
        for (var i = 0; i < this.pesananList.length; i++) {
          pMap[this.pesananList[i].id] = this.pesananList[i];
        }
        global.ZcpSablonQueueService.loadForEdit(sablon, pMap);
        this.navigatePage('sablon-form');
      },
      openSablonFormFromNavbar: function () {
        this.navigatePage('sablon-form');
      },
      dismissSablonAiQueue: function () {
        if (global.ZcpSablonQueueService) {
          global.ZcpSablonQueueService.dismissNavbarStatus();
        }
      },
      dismissSablonSaveJob: function (jobId) {
        if (global.ZcpSablonQueueService) {
          global.ZcpSablonQueueService.dismissSaveJob(jobId);
        }
      },
      runSablonAiSingle: function (draftLocalId) {
        var self = this;
        global.ZcpSablonQueueService.runAiQueue([draftLocalId], {
          queueMode: 'single',
          getAiConfig: function () {
            return self.aiConfig;
          },
          getDriveReady: function () {
            return self.driveReady;
          },
          getPesananList: function () {
            return self.pesananList;
          },
          getSablonList: function () {
            return self.sablonList;
          },
          notify: function (payload) {
            self.addToast(payload);
          }
        });
      },
      runSablonAiAll: function () {
        var self = this;
        var ids = this.sablonFormState.drafts
          .filter(function (d) {
            return global.ZcpSablonQueueService.draftHasSablonFiles(d);
          })
          .map(function (d) {
            return d.localId;
          });
        global.ZcpSablonQueueService.runAiQueue(ids, {
          queueMode: 'all',
          getAiConfig: function () {
            return self.aiConfig;
          },
          getDriveReady: function () {
            return self.driveReady;
          },
          getPesananList: function () {
            return self.pesananList;
          },
          getSablonList: function () {
            return self.sablonList;
          },
          notify: function (payload) {
            self.addToast(payload);
          }
        });
      },
      stopSablonAiQueue: function () {
        global.ZcpSablonQueueService.stopAiQueue();
      },
      onSablonFormSaved: function () {
        this.navigatePage('sablon');
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
      startMasterSubscriptions: async function (role) {
        this.cleanupMasterSubscriptions();
        var self = this;

        // Ambil 1x via .get() untuk data konfigurasi & master yang jarang berubah
        this.loadMasterProduk();
        this.loadMasterKategoriProduk();
        this.loadMasterExpedisi();
        this.loadMasterAsalPesanan();
        this.loadMasterStatusShopee();
        this.loadUsers(false);
        global.ZcpSettingsService.fetchSettings()
          .then(function (cfg) {
            self.defaultPageSize = cfg.defaultPageSize;
          })
          .catch(function () {
            // Gunakan default 10 jika gagal membaca pengaturan
          });

        if (role === 'superadmin' || role === 'admin') {
          global.ZcpSettingsService.fetchAiConfig()
            .then(function (aiCfg) {
              self.aiConfig = aiCfg;
            })
            .catch(function () {
              // Abaikan jika aturan AI config belum terbit atau belum diisi
            });

          global.ZcpSettingsService.fetchDriveConfig()
            .then(function (driveCfg) {
              self.onDriveConfigUpdated(driveCfg);
            })
            .catch(function () {
              // Abaikan jika aturan Drive config belum terbit atau belum diisi
            });
        }

        this.subscribePesananList();
        this.subscribeSablonList();
        this.subscribeBoronganRequestsList();
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
      loadMasterKategoriProduk: async function () {
        this.loadingKategoriProduk = true;
        try {
          this.kategoriProdukList = await global.ZcpMasterService.fetchKategoriProduk();
        } catch (err) {
          this.addToast({
            type: 'error',
            message:
              'Gagal memuat Master Kategori Produk: ' + ((err && err.message) || 'Akses ditolak')
          });
        } finally {
          this.loadingKategoriProduk = false;
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
      loadMasterAsalPesanan: async function () {
        this.loadingAsalPesanan = true;
        try {
          this.asalPesananList = await global.ZcpMasterService.fetchAsalPesanan();
        } catch (err) {
          this.addToast({
            type: 'error',
            message:
              'Gagal memuat Master Asal Pesanan: ' + ((err && err.message) || 'Akses ditolak')
          });
        } finally {
          this.loadingAsalPesanan = false;
        }
      },
      loadMasterStatusShopee: async function () {
        this.loadingStatusShopee = true;
        try {
          this.statusShopeeList = await global.ZcpMasterService.fetchStatusShopee();
        } catch (err) {
          this.addToast({
            type: 'error',
            message:
              'Gagal memuat Master Status Pesanan Shopee: ' +
              ((err && err.message) || 'Akses ditolak')
          });
        } finally {
          this.loadingStatusShopee = false;
        }
      },
      subscribeBoronganRequestsList: function () {
        if (typeof this.unsubBoronganRequests === 'function') {
          this.unsubBoronganRequests();
          this.unsubBoronganRequests = null;
        }
        if (!this.user || !global.ZcpBoronganService) return;
        var self = this;
        this.loadingBoronganRequests = true;
        this.unsubBoronganRequests = global.ZcpBoronganService.subscribeRequests(
          this.user,
          function (list) {
            self.boronganRequestsList = list;
            self.loadingBoronganRequests = false;
          },
          function () {
            self.loadingBoronganRequests = false;
          }
        );
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
        if (!this.user) return;
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
        if (typeof this.unsubBoronganRequests === 'function') {
          this.unsubBoronganRequests();
          this.unsubBoronganRequests = null;
        }
        if (global.ZcpSablonQueueService) {
          global.ZcpSablonQueueService.cleanupOnLogout();
        }
        this.produkList = [];
        this.kategoriProdukList = [];
        this.expedisiList = [];
        this.asalPesananList = [];
        this.statusShopeeList = [];
        this.pesananList = [];
        this.sablonList = [];
        this.boronganRequestsList = [];
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
        this.loadingKategoriProduk = false;
        this.loadingExpedisi = false;
        this.loadingAsalPesanan = false;
        this.loadingStatusShopee = false;
        this.loadingPesanan = false;
        this.loadingSablon = false;
        this.loadingBoronganRequests = false;
        this.loadingUsers = false;
        this.loadingLogs = false;
        this.loadingMoreLogs = false;
        this.aiConfig = {
          geminiApiUrl:
            (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_GEMINI_URL) ||
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
          geminiApiKey: ''
        };
        this.driveConfig = {
          clientId: '',
          clientSecret: '',
          refreshToken: '',
          accessToken: '',
          rootFolderId: '',
          rootFolderName:
            (global.ZcpSettingsService && global.ZcpSettingsService.DEFAULT_DRIVE_ROOT_FOLDER) ||
            'ZCP_STORE_FILES'
        };
        if (global.ZcpDriveService && typeof global.ZcpDriveService.setConfig === 'function') {
          global.ZcpDriveService.setConfig(null);
        }
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
