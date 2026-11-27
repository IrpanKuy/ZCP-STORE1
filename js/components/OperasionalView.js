(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.OperasionalView = {
    name: 'OperasionalView',
    props: {
      pesananList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      sablonList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      produkList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      kategoriProdukList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      statusShopeeList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      staffList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      loading: { type: Boolean, default: false },
      userRole: { type: String, default: 'superadmin' },
      currentUserUid: { type: String, default: '' },
      hasMore: { type: Boolean, default: false },
      defaultPageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: ['notify', 'request-confirm', 'go-pesanan', 'load-more'],
    data: function () {
      return {
        searchQuery: '',
        statusFilter: 'all',
        kategoriFilter: '',
        statusShopeeFilter: '',
        currentPage: 1,
        localPageSize: this.defaultPageSize,
        selectedIds: [],
        bulkMulai: '',
        bulkDeadline: '',
        bulkSaving: false,
        bulkStatusShopeeKey: '',
        bulkStatusShopeeSaving: false,
        draftDates: {},
        dirtyMap: {},
        savingIdMap: {},
        filePreviewOrder: null,
        kontribusiModal: {
          visible: false,
          order: null,
          rows: [],
          saving: false,
          error: ''
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
      statusFilter: function () {
        this.currentPage = 1;
      },
      kategoriFilter: function () {
        this.currentPage = 1;
      },
      statusShopeeFilter: function () {
        this.currentPage = 1;
      },
      pesananList: {
        immediate: true,
        handler: function (list) {
          var nextDrafts = Object.assign({}, this.draftDates);
          var existingIds = {};
          for (var i = 0; i < list.length; i++) {
            var order = list[i];
            existingIds[order.id] = true;
            if (!this.dirtyMap[order.id]) {
              nextDrafts[order.id] = {
                tanggalMulai: order.tanggalMulai || '',
                tanggalDeadline: order.tanggalDeadline || ''
              };
            }
          }
          this.draftDates = nextDrafts;
          this.selectedIds = this.selectedIds.filter(function (id) {
            return Boolean(existingIds[id]);
          });
        }
      }
    },
    computed: {
      /**
       * Agregasi cadangan langsung dari daftar sablon yang sudah di-print
       * (memperhitungkan pembagian rata otomatis pada sisi ter-grouping).
       */
      completedSablonTotals: function () {
        var totals = {};
        for (var i = 0; i < this.sablonList.length; i++) {
          var s = this.sablonList[i];
          var checkedCount = Array.isArray(s.perulanganChecks)
            ? s.perulanganChecks.filter(Boolean).length
            : s.statusSelesai
            ? Math.max(1, parseInt(s.jumlahPerulangan, 10) || 1)
            : 0;
          if (checkedCount <= 0) continue;
          var items = Array.isArray(s.pesananItems) ? s.pesananItems : [];
          for (var j = 0; j < items.length; j++) {
            var item = items[j];
            var pid = item && item.pesananId;
            if (!pid) continue;
            if (!totals[pid]) totals[pid] = {};
            var expanded = global.ZcpSablonService.expandItemToSideTotals(item, checkedCount);
            Object.keys(expanded).forEach(function (side) {
              totals[pid][side] = global.ZcpSablonService.roundQty(
                (totals[pid][side] || 0) + (Number(expanded[side]) || 0)
              );
            });
          }
        }
        return totals;
      },
      activeTotalCount: function () {
        return this.pesananList.filter(function (o) {
          return !o.statusSelesai;
        }).length;
      },
      doneTotalCount: function () {
        return this.pesananList.filter(function (o) {
          return o.statusSelesai;
        }).length;
      },
      overdueTotalCount: function () {
        return this.pesananList.filter(function (o) {
          return !o.statusSelesai && global.ZcpPesananService.getDeadlineStatus(o) === 'overdue';
        }).length;
      },
      urgentTotalCount: function () {
        return this.pesananList.filter(function (o) {
          if (o.statusSelesai) return false;
          var st = global.ZcpPesananService.getDeadlineStatus(o);
          return st === 'overdue' || st === 'soon';
        }).length;
      },
      kategoriFilterOptions: function () {
        var map = {};
        var names = [];
        this.kategoriProdukList.forEach(function (k) {
          if (k && k.namaKategori && !map[k.namaKategori]) {
            map[k.namaKategori] = true;
            names.push(k.namaKategori);
          }
        });
        var self = this;
        this.pesananList.forEach(function (o) {
          var kName = self.resolveOrderKategoriName(o);
          if (kName && !map[kName]) {
            map[kName] = true;
            names.push(kName);
          }
        });
        return names.sort();
      },
      statusShopeeFilterOptions: function () {
        var map = {};
        var names = [];
        this.statusShopeeList.forEach(function (st) {
          if (st && st.namaStatus && !map[st.namaStatus]) {
            map[st.namaStatus] = true;
            names.push(st.namaStatus);
          }
        });
        var self = this;
        this.pesananList.forEach(function (o) {
          var sName = self.resolveOrderStatusShopeeName(o);
          if (sName && !map[sName]) {
            map[sName] = true;
            names.push(sName);
          }
        });
        return names.sort();
      },
      filteredList: function () {
        var q = this.searchQuery.trim().toLowerCase();
        var filter = this.statusFilter;
        var katFilter = this.kategoriFilter;
        var shopeeFilter = this.statusShopeeFilter;
        var self = this;

        return this.pesananList.filter(function (order) {
          var deadlineStatus = global.ZcpPesananService.getDeadlineStatus(order);
          var katName = self.resolveOrderKategoriName(order);
          var shopeeName = self.resolveOrderStatusShopeeName(order);

          if (filter === 'active' && order.statusSelesai) return false;
          if (filter === 'done' && !order.statusSelesai) return false;
          if (filter === 'overdue' && deadlineStatus !== 'overdue') return false;
          if (filter === 'unscheduled' && (order.statusSelesai || deadlineStatus !== 'unscheduled')) {
            return false;
          }
          if (katFilter && katName !== katFilter) return false;
          if (shopeeFilter === '__empty__' && shopeeName) return false;
          if (shopeeFilter && shopeeFilter !== '__empty__' && shopeeName !== shopeeFilter) {
            return false;
          }

          if (!q) return true;
          var matchPemesan = (order.namaPemesan || '').toLowerCase().indexOf(q) !== -1;
          var matchProduk = (order.namaProduk || '').toLowerCase().indexOf(q) !== -1;
          var matchKategori = katName.toLowerCase().indexOf(q) !== -1;
          var matchShopee = shopeeName.toLowerCase().indexOf(q) !== -1;
          var matchAsal = (order.namaAsalPesanan || '').toLowerCase().indexOf(q) !== -1;
          var matchExpedisi = (order.namaExpedisi || '').toLowerCase().indexOf(q) !== -1;
          var matchSisi =
            Array.isArray(order.namaSisi) &&
            order.namaSisi.some(function (s) {
              return String(s).toLowerCase().indexOf(q) !== -1;
            });

          return (
            matchPemesan ||
            matchProduk ||
            matchKategori ||
            matchShopee ||
            matchAsal ||
            matchExpedisi ||
            matchSisi
          );
        });
      },
      activeFilteredOrders: function () {
        return this.filteredList
          .filter(function (o) {
            return !o.statusSelesai;
          })
          .sort(function (a, b) {
            var aHas = Boolean(a.tanggalDeadline);
            var bHas = Boolean(b.tanggalDeadline);
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            if (aHas && bHas && a.tanggalDeadline !== b.tanggalDeadline) {
              return a.tanggalDeadline < b.tanggalDeadline ? -1 : 1;
            }
            return 0;
          });
      },
      doneFilteredOrders: function () {
        return this.filteredList.filter(function (o) {
          return o.statusSelesai;
        });
      },
      isKaryawan: function () {
        return this.userRole === 'karyawan';
      },
      isSuperadmin: function () {
        return this.userRole === 'superadmin';
      },
      combinedOrderedList: function () {
        return this.activeFilteredOrders.concat(this.doneFilteredOrders);
      },
      paginatedCombinedList: function () {
        if (this.localPageSize === 'all') return this.combinedOrderedList;
        var size = Number(this.localPageSize) || 10;
        var start = (this.currentPage - 1) * size;
        return this.combinedOrderedList.slice(start, start + size);
      },
      paginatedActiveOrders: function () {
        return this.paginatedCombinedList.filter(function (o) {
          return !o.statusSelesai;
        });
      },
      paginatedDoneOrders: function () {
        return this.paginatedCombinedList.filter(function (o) {
          return o.statusSelesai;
        });
      },
      allFilteredIds: function () {
        return this.filteredList.map(function (o) {
          return o.id;
        });
      },
      allSelected: function () {
        if (!this.filteredList.length) return false;
        var selectedMap = {};
        this.selectedIds.forEach(function (id) {
          selectedMap[id] = true;
        });
        return this.filteredList.every(function (o) {
          return Boolean(selectedMap[o.id]);
        });
      },
      kontribusiDraftTotal: function () {
        return (this.kontribusiModal.rows || []).reduce(function (sum, r) {
          return sum + Math.max(0, parseInt(r.qty, 10) || 0);
        }, 0);
      },
      kontribusiModalExceeds: function () {
        var target = Number(this.kontribusiModal.order && this.kontribusiModal.order.jumlahProduk) || 0;
        return this.kontribusiDraftTotal > target;
      }
    },
    methods: {
      isSelected: function (id) {
        return this.selectedIds.indexOf(id) !== -1;
      },
      toggleSelect: function (id) {
        var idx = this.selectedIds.indexOf(id);
        if (idx === -1) {
          this.selectedIds.push(id);
        } else {
          this.selectedIds.splice(idx, 1);
        }
      },
      toggleSelectAll: function () {
        if (this.allSelected) {
          this.selectedIds = [];
        } else {
          this.selectedIds = this.allFilteredIds.slice();
        }
      },
      selectAllActiveOnly: function () {
        this.selectedIds = this.activeFilteredOrders.map(function (o) {
          return o.id;
        });
      },
      clearSelection: function () {
        this.selectedIds = [];
      },
      getDraftDate: function (orderId, field) {
        return this.draftDates[orderId] ? this.draftDates[orderId][field] || '' : '';
      },
      onDateInput: function (order, field, val) {
        if (!this.draftDates[order.id]) {
          this.draftDates[order.id] = {
            tanggalMulai: order.tanggalMulai || '',
            tanggalDeadline: order.tanggalDeadline || ''
          };
        }
        this.draftDates[order.id][field] = val;
        this.dirtyMap[order.id] =
          this.draftDates[order.id].tanggalMulai !== (order.tanggalMulai || '') ||
          this.draftDates[order.id].tanggalDeadline !== (order.tanggalDeadline || '');
      },
      saveSingleSchedule: async function (order) {
        if (this.isKaryawan) return;
        var draft = this.draftDates[order.id] || {};
        var mulai = draft.tanggalMulai || '';
        var deadline = draft.tanggalDeadline || '';

        if (mulai && deadline && deadline < mulai) {
          this.$emit('notify', {
            type: 'error',
            message: 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'
          });
          return;
        }

        this.savingIdMap[order.id] = true;
        try {
          await global.ZcpPesananService.updateJadwal(
            order.id,
            {
              tanggalMulai: mulai,
              tanggalDeadline: deadline
            },
            order.namaPemesan
          );
          this.dirtyMap[order.id] = false;
          this.$emit('notify', {
            type: 'success',
            message: 'Jadwal pesanan "' + order.namaPemesan + '" berhasil disimpan.'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal menyimpan jadwal.'
          });
        } finally {
          this.savingIdMap[order.id] = false;
        }
      },
      applyBulkSchedule: async function () {
        if (!this.selectedIds.length) return;
        if (!this.bulkMulai && !this.bulkDeadline) {
          this.$emit('notify', {
            type: 'error',
            message: 'Isi minimal satu tanggal (Mulai atau Deadline) untuk bulk update.'
          });
          return;
        }
        if (this.bulkMulai && this.bulkDeadline && this.bulkDeadline < this.bulkMulai) {
          this.$emit('notify', {
            type: 'error',
            message: 'Tanggal deadline tidak boleh lebih awal dari tanggal mulai.'
          });
          return;
        }

        this.bulkSaving = true;
        try {
          var targetCount = this.selectedIds.length;
          var idsCopy = this.selectedIds.slice();
          await global.ZcpPesananService.bulkUpdateJadwal(idsCopy, {
            tanggalMulai: this.bulkMulai,
            tanggalDeadline: this.bulkDeadline
          });

          var self = this;
          idsCopy.forEach(function (id) {
            self.dirtyMap[id] = false;
          });

          this.selectedIds = [];
          this.bulkMulai = '';
          this.bulkDeadline = '';
          this.$emit('notify', {
            type: 'success',
            message: 'Jadwal ' + targetCount + ' pesanan berhasil diperbarui sekaligus.'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal melakukan bulk update jadwal.'
          });
        } finally {
          this.bulkSaving = false;
        }
      },
      applyBulkStatusShopee: async function () {
        if (!this.isSuperadmin || !this.selectedIds.length) return;
        if (!this.bulkStatusShopeeKey) {
          this.$emit('notify', {
            type: 'error',
            message: 'Pilih status pesanan Shopee terlebih dahulu.'
          });
          return;
        }

        var statusShopeeId = '';
        var namaStatusShopee = '';
        if (this.bulkStatusShopeeKey !== '__clear__') {
          var matched = this.statusShopeeList.find(
            function (s) {
              return s.id === this.bulkStatusShopeeKey;
            }.bind(this)
          );
          if (!matched) {
            this.$emit('notify', {
              type: 'error',
              message: 'Status pesanan Shopee tidak ditemukan.'
            });
            return;
          }
          statusShopeeId = matched.id;
          namaStatusShopee = matched.namaStatus;
        }

        this.bulkStatusShopeeSaving = true;
        try {
          var targetCount = this.selectedIds.length;
          var idsCopy = this.selectedIds.slice();
          await global.ZcpPesananService.bulkUpdateStatusShopee(idsCopy, {
            statusShopeeId: statusShopeeId,
            namaStatusShopee: namaStatusShopee
          });
          this.selectedIds = [];
          this.bulkStatusShopeeKey = '';
          this.$emit('notify', {
            type: 'success',
            message: namaStatusShopee
              ? 'Status Shopee ' + targetCount + ' pesanan diubah ke "' + namaStatusShopee + '".'
              : 'Status Shopee ' + targetCount + ' pesanan berhasil dikosongkan.'
          });
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal melakukan bulk ubah status pesanan Shopee.'
          });
        } finally {
          this.bulkStatusShopeeSaving = false;
        }
      },
      resolveOrderStatusShopeeName: function (order) {
        if (!order) return '';
        if (order.statusShopeeId) {
          for (var i = 0; i < this.statusShopeeList.length; i++) {
            if (this.statusShopeeList[i].id === order.statusShopeeId) {
              return this.statusShopeeList[i].namaStatus || order.namaStatusShopee || '';
            }
          }
        }
        return order.namaStatusShopee || '';
      },
      resolveKategoriByIdOrName: function (kategoriId, fallbackName) {
        if (kategoriId) {
          for (var i = 0; i < this.kategoriProdukList.length; i++) {
            if (this.kategoriProdukList[i].id === kategoriId) {
              return this.kategoriProdukList[i].namaKategori || fallbackName || '';
            }
          }
        }
        return fallbackName || '';
      },
      resolveOrderKategoriName: function (order) {
        if (!order) return '';
        var matchedProd = null;
        for (var i = 0; i < this.produkList.length; i++) {
          var p = this.produkList[i];
          if ((order.produkId && p.id === order.produkId) || (order.namaProduk && p.namaProduk === order.namaProduk)) {
            matchedProd = p;
            break;
          }
        }
        if (matchedProd) {
          var fromProd = this.resolveKategoriByIdOrName(matchedProd.kategoriId, matchedProd.namaKategori);
          if (fromProd) return fromProd;
        }
        return this.resolveKategoriByIdOrName(order.kategoriId, order.namaKategori);
      },
      getSideDoneCount: function (order, sisi) {
        if (order && order.anggapSablonSelesai) {
          return Number(order.jumlahProduk) || 0;
        }
        if (this.sablonList && this.sablonList.length > 0) {
          return (
            (this.completedSablonTotals[order.id] &&
              Number(this.completedSablonTotals[order.id][sisi])) ||
            0
          );
        }
        return Number(order.sisiProgress && order.sisiProgress[sisi]) || 0;
      },
      getSidePercent: function (done, target) {
        if (!target || target <= 0) return 0;
        return Math.min(100, Math.round((done / target) * 100));
      },
      getKontribusiTotal: function (order) {
        return Number(order && order.kontribusiTotal) || 0;
      },
      isKontribusiComplete: function (order) {
        return this.getKontribusiTotal(order) === (Number(order && order.jumlahProduk) || 0);
      },
      deadlineBadgeMeta: function (order) {
        if (order.statusSelesai) {
          return { cls: 'done', icon: 'check_circle', text: 'Pesanan Selesai' };
        }
        var st = global.ZcpPesananService.getDeadlineStatus(order);
        var days = global.ZcpPesananService.getDaysUntilDeadline(order.tanggalDeadline);
        if (st === 'overdue') {
          return {
            cls: 'danger',
            icon: 'warning',
            text: 'Lewat ' + Math.abs(days) + ' hari'
          };
        }
        if (st === 'soon') {
          return {
            cls: 'warn',
            icon: 'schedule',
            text: days === 0 ? 'Deadline Hari Ini' : 'Sisa ' + days + ' hari'
          };
        }
        if (st === 'normal') {
          return {
            cls: 'active',
            icon: 'event',
            text: global.ZcpPesananService.formatDateString(order.tanggalDeadline)
          };
        }
        return { cls: 'neutral', icon: 'event_busy', text: 'Belum Dijadwalkan' };
      },
      canUndoSelesai: function () {
        // Setelah pesanan selesai, HANYA Superadmin yang dapat membatalkannya
        return this.isSuperadmin;
      },
      formatDateString: function (ymd) {
        return global.ZcpPesananService.formatDateString(ymd);
      },
      openFilePreview: function (order) {
        this.filePreviewOrder = order;
      },
      closeFilePreview: function () {
        this.filePreviewOrder = null;
      },
      openKontribusiModal: function (order) {
        if (!order || order.statusSelesai) return;
        var existingMap = {};
        var existingByUid = {};
        (Array.isArray(order.kontribusi) ? order.kontribusi : []).forEach(function (k) {
          existingMap[k.uid] = Number(k.qty) || 0;
          existingByUid[k.uid] = k;
        });

        var rows = [];
        var seenUid = {};
        (this.staffList || []).forEach(function (u) {
          var uid = u.uid || u.id;
          if (!uid || seenUid[uid]) return;
          seenUid[uid] = true;
          rows.push({
            uid: uid,
            nama: u.nama || u.email || 'Karyawan',
            role: u.role || 'karyawan',
            qty: existingMap[uid] || 0
          });
        });

        // Sertakan juga akun historis di pesanan ini apabila akun tersebut sudah dinonaktifkan
        Object.keys(existingByUid).forEach(function (uid) {
          if (!seenUid[uid]) {
            var item = existingByUid[uid];
            rows.push({
              uid: uid,
              nama: item.nama || 'Karyawan',
              role: item.role || 'karyawan',
              qty: Number(item.qty) || 0
            });
          }
        });

        this.kontribusiModal = {
          visible: true,
          order: order,
          rows: rows,
          saving: false,
          error: ''
        };
      },
      closeKontribusiModal: function () {
        if (this.kontribusiModal.saving) return;
        this.kontribusiModal.visible = false;
        this.kontribusiModal.order = null;
        this.kontribusiModal.rows = [];
        this.kontribusiModal.error = '';
      },
      saveKontribusiModal: async function () {
        var order = this.kontribusiModal.order;
        if (!order || this.kontribusiModal.saving) return;

        this.kontribusiModal.error = '';
        var target = Number(order.jumlahProduk) || 0;
        var total = this.kontribusiDraftTotal;

        if (total > target) {
          var errMsg =
            'Total kontribusi karyawan (' +
            total +
            ' pcs) melebihi jumlah pesanan (' +
            target +
            ' pcs). Kurangi input terlebih dahulu.';
          this.kontribusiModal.error = errMsg;
          if (global.ZcpAlert) {
            global.ZcpAlert.error(errMsg, 'Jumlah Kontribusi Melebihi Target');
          }
          return;
        }

        this.kontribusiModal.saving = true;
        try {
          var res = await global.ZcpPesananService.updateKontribusi(
            order.id,
            this.kontribusiModal.rows,
            order
          );
          this.kontribusiModal.visible = false;
          this.$emit('notify', {
            type: 'success',
            message:
              'Kontribusi "' +
              order.namaPemesan +
              '" tersimpan (' +
              res.kontribusiTotal +
              '/' +
              target +
              ' pcs).'
          });
        } catch (err) {
          var msg = (err && err.message) || 'Gagal menyimpan kontribusi.';
          this.kontribusiModal.error = msg;
          if (global.ZcpAlert) {
            global.ZcpAlert.error(msg);
          }
        } finally {
          this.kontribusiModal.saving = false;
        }
      },
      handleToggleSelesai: async function (order) {
        var self = this;

        if (order.statusSelesai) {
          if (!this.canUndoSelesai()) {
            this.$emit('notify', {
              type: 'error',
              message: 'Hanya Superadmin yang dapat membatalkan pesanan yang sudah ditandai selesai.'
            });
            return;
          }
          this.$emit('request-confirm', {
            title: 'Batalkan Status Selesai',
            message:
              'Kembalikan pesanan "' +
              order.namaPemesan +
              '" ke daftar aktif? Data kontribusi tetap tersimpan dan masih dapat diubah.',
            confirmText: 'Ya, Kembalikan ke Aktif',
            variant: 'danger',
            onConfirm: async function () {
              await global.ZcpPesananService.toggleStatusSelesai(order.id, false, order);
              self.$emit('notify', {
                type: 'info',
                message: 'Pesanan "' + order.namaPemesan + '" dikembalikan ke daftar aktif.'
              });
            }
          });
          return;
        }

        if (!this.isKontribusiComplete(order)) {
          var cur = this.getKontribusiTotal(order);
          if (global.ZcpAlert) {
            global.ZcpAlert.warning(
              'Total kontribusi karyawan baru ' +
                cur +
                ' dari ' +
                order.jumlahProduk +
                ' pcs. Klik tombol "Atur Kontribusi" dan pastikan jumlahnya sama dengan qty pesanan sebelum menandai Selesai.',
              'Kontribusi Belum Lengkap'
            );
          } else {
            this.$emit('notify', {
              type: 'error',
              message:
                'Atur kontribusi karyawan hingga total = ' +
                order.jumlahProduk +
                ' pcs terlebih dahulu.'
            });
          }
          return;
        }

        // Bangun ringkasan kontribusi & cek sisi sablon belum 100%
        var incompleteSides = [];
        var sisiList = Array.isArray(order.namaSisi) ? order.namaSisi : [];
        for (var i = 0; i < sisiList.length; i++) {
          var sisi = sisiList[i];
          var done = this.getSideDoneCount(order, sisi);
          if (done < order.jumlahProduk) {
            incompleteSides.push(sisi + ' (' + done + '/' + order.jumlahProduk + ')');
          }
        }

        var kontribText = (order.kontribusi || [])
          .map(function (k) {
            return k.nama + ': ' + k.qty + ' pcs';
          })
          .join(', ');

        var confirmMsg =
          'Tandai pesanan "' +
          order.namaPemesan +
          '" (' +
          order.namaProduk +
          ' - ' +
          order.jumlahProduk +
          ' pcs) sebagai Selesai?\n\nKontribusi tercatat: ' +
          kontribText +
          '.' +
          (incompleteSides.length > 0
            ? '\n\nCatatan: Progres sablon belum 100% pada sisi: ' + incompleteSides.join(', ') + '.'
            : '') +
          '\n\nPerhatian: Setelah ditandai Selesai, hanya Superadmin yang dapat membatalkannya.';

        this.$emit('request-confirm', {
          title: 'Konfirmasi Pesanan Selesai',
          message: confirmMsg,
          confirmText: 'Ya, Tandai Selesai',
          variant: 'success',
          icon: 'question',
          onConfirm: async function () {
            await global.ZcpPesananService.toggleStatusSelesai(order.id, true, order);
            self.$emit('notify', {
              type: 'success',
              message: 'Pesanan "' + order.namaPemesan + '" ditandai selesai & masuk ke Borongan.'
            });
          }
        });
      }
    },
    template: `
      <div>
        <!-- 3 KPI Operasional -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Belum Selesai</div>
                <div class="kpi-value">{{ activeTotalCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">pending_actions</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span v-if="overdueTotalCount" style="color: var(--accent-danger); font-weight: 600;">
                {{ overdueTotalCount }} pesanan lewat deadline
              </span>
              <span v-else>Semua masih dalam batas waktu</span>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Perlu Prioritas (&le; 3 Hari)</div>
                <div class="kpi-value">{{ urgentTotalCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">schedule</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Diurutkan paling atas berdasarkan deadline terdekat
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Pesanan Selesai</div>
                <div class="kpi-value">{{ doneTotalCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">task_alt</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span class="kpi-highlight">Border hijau</span> dan dipindah ke bagian bawah
            </div>
          </div>
        </div>

        <!-- Bulk Update Bar (hanya Admin/Superadmin) -->
        <div v-if="!isKaryawan && selectedIds.length > 0" class="card bulk-bar">
          <div class="bulk-bar-info">
            <span class="badge-count">{{ selectedIds.length }} pesanan dipilih</span>
            <span class="form-hint">
              {{
                isSuperadmin
                  ? 'Atur jadwal mulai/deadline atau ubah status pesanan Shopee sekaligus.'
                  : 'Atur tanggal mulai &amp; deadline sekaligus ke semua pesanan terpilih.'
              }}
            </span>
          </div>

          <div class="bulk-bar-controls">
            <div class="bulk-date-field">
              <label>Mulai Kerjakan</label>
              <input v-model="bulkMulai" type="date" class="form-control" :disabled="bulkSaving || bulkStatusShopeeSaving" />
            </div>
            <div class="bulk-date-field">
              <label>Selesai Sebelum</label>
              <input v-model="bulkDeadline" type="date" class="form-control" :disabled="bulkSaving || bulkStatusShopeeSaving" />
            </div>
            <div class="action-group">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="bulkSaving || bulkStatusShopeeSaving"
                @click="applyBulkSchedule"
              >
                <span v-if="bulkSaving" class="spinner spinner-sm"></span>
                <span v-else class="material-symbols-rounded" style="font-size: 18px;">event_available</span>
                <span>Terapkan ke {{ selectedIds.length }} Pesanan</span>
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="bulkSaving || bulkStatusShopeeSaving"
                @click="clearSelection"
              >
                Batal
              </button>
            </div>
          </div>

          <div v-if="isSuperadmin" class="bulk-bar-divider"></div>

          <div v-if="isSuperadmin" class="bulk-bar-controls">
            <div class="bulk-date-field">
              <label>Status Pesanan Shopee (Superadmin)</label>
              <select
                v-model="bulkStatusShopeeKey"
                class="form-select"
                :disabled="bulkSaving || bulkStatusShopeeSaving"
                aria-label="Pilih status pesanan Shopee untuk bulk update"
              >
                <option value="" disabled>-- Pilih Status Pesanan Shopee --</option>
                <option
                  v-for="st in statusShopeeList"
                  :key="st.id"
                  :value="st.id"
                >
                  {{ st.namaStatus }}
                </option>
                <option value="__clear__">Kosongkan Status Shopee</option>
              </select>
            </div>
            <div class="action-group">
              <button
                type="button"
                class="btn btn-info-solid"
                :disabled="bulkSaving || bulkStatusShopeeSaving || !bulkStatusShopeeKey"
                @click="applyBulkStatusShopee"
              >
                <span v-if="bulkStatusShopeeSaving" class="spinner spinner-sm"></span>
                <span v-else class="material-symbols-rounded" style="font-size: 18px;">local_mall</span>
                <span>Ubah Status Shopee ({{ selectedIds.length }})</span>
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Jadwal &amp; Progres Operasional</h2>
              <p>Pantau deadline, progres sablon tiap sisi, serta atur kontribusi karyawan sebelum menyelesaikan pesanan.</p>
            </div>

            <div class="panel-actions">
              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="searchQuery"
                  type="text"
                  class="form-control"
                  placeholder="Cari pemesan, produk, asal..."
                  aria-label="Cari operasional"
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

              <select v-model="statusFilter" class="filter-select" aria-label="Filter operasional">
                <option value="all">Semua Pesanan</option>
                <option value="active">Belum Selesai</option>
                <option value="overdue">Lewat Deadline</option>
                <option value="unscheduled">Belum Dijadwalkan</option>
                <option value="done">Sudah Selesai</option>
              </select>

              <select v-model="kategoriFilter" class="filter-select" aria-label="Filter kategori">
                <option value="">Semua Kategori</option>
                <option v-for="kName in kategoriFilterOptions" :key="kName" :value="kName">
                  {{ kName }}
                </option>
              </select>

              <select v-model="statusShopeeFilter" class="filter-select" aria-label="Filter status pesanan Shopee">
                <option value="">Semua Status Shopee</option>
                <option value="__empty__">Belum Ada Status Shopee</option>
                <option v-for="sName in statusShopeeFilterOptions" :key="sName" :value="sName">
                  {{ sName }}
                </option>
              </select>

              <button
                v-if="!isKaryawan && filteredList.length"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="toggleSelectAll"
              >
                <span class="material-symbols-rounded" style="font-size: 17px;">
                  {{ allSelected ? 'deselect' : 'select_all' }}
                </span>
                <span>{{ allSelected ? 'Batal Pilih Semua' : 'Pilih Semua' }}</span>
              </button>

              <button
                v-if="!isKaryawan && activeFilteredOrders.length"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="selectAllActiveOnly"
              >
                <span>Pilih Aktif ({{ activeFilteredOrders.length }})</span>
              </button>
            </div>
          </div>

          <div v-if="loading" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Memuat data operasional...</p>
          </div>

          <div v-else-if="!filteredList.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">event_note</span>
            </div>
            <h3>{{ pesananList.length ? 'Tidak ada pesanan yang cocok' : 'Belum ada data pesanan' }}</h3>
            <p>
              {{
                pesananList.length
                  ? 'Coba ubah filter atau kata kunci pencarian di atas.'
                  : 'Tambahkan pesanan terlebih dahulu di menu Pesanan.'
              }}
            </p>
            <button
              v-if="!pesananList.length"
              type="button"
              class="btn btn-primary"
              @click="$emit('go-pesanan')"
            >
              Buka Menu Pesanan
            </button>
          </div>

          <div v-else class="op-list">
            <!-- Bagian Atas: Pesanan Belum Selesai -->
            <div
              v-for="order in paginatedActiveOrders"
              :key="order.id"
              class="op-card"
              :class="{
                'is-overdue': !order.statusSelesai && deadlineBadgeMeta(order).cls === 'danger',
                'is-selected': !isKaryawan && isSelected(order.id)
              }"
            >
              <div class="op-card-main">
                <div v-if="!isKaryawan" class="op-select-col">
                  <input
                    type="checkbox"
                    class="op-checkbox"
                    :checked="isSelected(order.id)"
                    :aria-label="'Pilih pesanan ' + order.namaPemesan"
                    @change="toggleSelect(order.id)"
                  />
                </div>

                <div class="op-order-info">
                  <div class="op-order-title-row">
                    <span class="op-order-name">{{ order.namaPemesan }}</span>
                    <span class="badge-count">{{ order.jumlahProduk }} pcs</span>
                    <span v-if="order.namaAsalPesanan" class="asal-badge">
                      <span class="material-symbols-rounded" style="font-size: 13px;">storefront</span>
                      <span>{{ order.namaAsalPesanan }}</span>
                    </span>
                    <span class="status-badge" :class="deadlineBadgeMeta(order).cls">
                      <span class="material-symbols-rounded" style="font-size: 14px;">
                        {{ deadlineBadgeMeta(order).icon }}
                      </span>
                      <span>{{ deadlineBadgeMeta(order).text }}</span>
                    </span>
                    <span v-if="order.anggapSablonSelesai" class="status-badge done">
                      <span class="material-symbols-rounded" style="font-size: 14px;">done_all</span>
                      <span>Sablon Selesai (100%)</span>
                    </span>
                    <span v-if="resolveOrderStatusShopeeName(order)" class="shopee-status-badge">
                      <span class="material-symbols-rounded" style="font-size: 13px;">local_mall</span>
                      <span>{{ resolveOrderStatusShopeeName(order) }}</span>
                    </span>
                    <button
                      v-if="order.fileDesigns && order.fileDesigns.length"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="openFilePreview(order)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 15px;">attach_file</span>
                      <span>{{ order.fileDesigns.length }} File</span>
                    </button>
                  </div>
                  <div class="op-order-sub">
                    <strong>{{ order.namaProduk }}</strong>
                    <span v-if="resolveOrderKategoriName(order)" class="kategori-badge" style="margin-left: 6px;">
                      {{ resolveOrderKategoriName(order) }}
                    </span>
                    <span v-if="order.namaTemplateSisi"> ({{ order.namaTemplateSisi }})</span>
                    • Expedisi: {{ order.namaExpedisi }}
                    <span v-if="order.catatan"> • {{ order.catatan }}</span>
                  </div>

                  <!-- Ringkasan Kontribusi Sementara -->
                  <div class="kontribusi-inline-row">
                    <span
                      class="status-badge"
                      :class="isKontribusiComplete(order) ? 'done' : 'warn'"
                    >
                      <span class="material-symbols-rounded" style="font-size: 14px;">group</span>
                      <span>Kontribusi: {{ getKontribusiTotal(order) }}/{{ order.jumlahProduk }} pcs</span>
                    </span>
                    <span
                      v-for="k in order.kontribusi"
                      :key="k.uid"
                      class="chip"
                    >
                      {{ k.nama }}: <strong>{{ k.qty }} pcs</strong>
                    </span>
                  </div>
                </div>

                <div class="op-schedule-col">
                  <template v-if="!isKaryawan">
                    <div class="op-date-pair">
                      <div class="op-date-field">
                        <label>Mulai Kerjakan</label>
                        <input
                          type="date"
                          class="form-control"
                          :value="getDraftDate(order.id, 'tanggalMulai')"
                          :disabled="Boolean(savingIdMap[order.id])"
                          @input="onDateInput(order, 'tanggalMulai', $event.target.value)"
                        />
                      </div>
                      <div class="op-date-field">
                        <label>Selesai Sebelum</label>
                        <input
                          type="date"
                          class="form-control"
                          :value="getDraftDate(order.id, 'tanggalDeadline')"
                          :disabled="Boolean(savingIdMap[order.id])"
                          @input="onDateInput(order, 'tanggalDeadline', $event.target.value)"
                        />
                      </div>
                    </div>
                    <button
                      v-if="dirtyMap[order.id]"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="Boolean(savingIdMap[order.id])"
                      @click="saveSingleSchedule(order)"
                    >
                      <span v-if="savingIdMap[order.id]" class="spinner spinner-sm"></span>
                      <span>Simpan Jadwal</span>
                    </button>
                  </template>
                  <div v-else class="readonly-schedule-box">
                    <span class="chip">Mulai: {{ formatDateString(order.tanggalMulai) }}</span>
                    <span class="chip">Deadline: {{ formatDateString(order.tanggalDeadline) }}</span>
                  </div>
                </div>

                <div class="op-action-col op-action-stack">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    :disabled="Boolean(savingIdMap[order.id])"
                    @click="openKontribusiModal(order)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 18px;">group</span>
                    <span>Atur Kontribusi</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-success"
                    :disabled="Boolean(savingIdMap[order.id]) || !isKontribusiComplete(order)"
                    :title="
                      isKontribusiComplete(order)
                        ? 'Tandai pesanan selesai'
                        : 'Total kontribusi harus sama dengan qty pesanan (' + order.jumlahProduk + ' pcs)'
                    "
                    @click="handleToggleSelesai(order)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 18px;">check_circle</span>
                    <span>Pesanan Selesai</span>
                  </button>
                  <span v-if="!isKontribusiComplete(order)" class="form-hint" style="text-align: right;">
                    Kontribusi {{ getKontribusiTotal(order) }}/{{ order.jumlahProduk }} pcs
                  </span>
                </div>
              </div>

              <!-- Indikator Progres Per Sisi -->
              <div class="op-sisi-section">
                <div
                  v-for="sisi in order.namaSisi"
                  :key="sisi"
                  class="op-sisi-row"
                >
                  <div class="op-sisi-label">
                    <span class="chip">{{ sisi }}</span>
                  </div>
                  <div class="op-progress-wrap">
                    <div class="op-progress-track">
                      <div
                        class="op-progress-fill"
                        :class="{ complete: getSideDoneCount(order, sisi) >= order.jumlahProduk }"
                        :style="{ width: getSidePercent(getSideDoneCount(order, sisi), order.jumlahProduk) + '%' }"
                      ></div>
                    </div>
                  </div>
                  <div class="op-sisi-count">
                    <strong>{{ getSideDoneCount(order, sisi) }}/{{ order.jumlahProduk }}</strong> selesai
                  </div>
                </div>
              </div>
            </div>

            <!-- Pemisah jika ada pesanan selesai -->
            <div v-if="paginatedDoneOrders.length" class="op-section-divider">
              <span>Pesanan Selesai ({{ paginatedDoneOrders.length }})</span>
            </div>

            <!-- Bagian Bawah: Pesanan Selesai (Border Hijau) -->
            <div
              v-for="order in paginatedDoneOrders"
              :key="order.id"
              class="op-card is-done"
              :class="{ 'is-selected': !isKaryawan && isSelected(order.id) }"
            >
              <div class="op-card-main">
                <div v-if="!isKaryawan" class="op-select-col">
                  <input
                    type="checkbox"
                    class="op-checkbox"
                    :checked="isSelected(order.id)"
                    :aria-label="'Pilih pesanan ' + order.namaPemesan"
                    @change="toggleSelect(order.id)"
                  />
                </div>

                <div class="op-order-info">
                  <div class="op-order-title-row">
                    <span class="op-order-name">{{ order.namaPemesan }}</span>
                    <span class="badge-count">{{ order.jumlahProduk }} pcs</span>
                    <span v-if="order.namaAsalPesanan" class="asal-badge">
                      <span class="material-symbols-rounded" style="font-size: 13px;">storefront</span>
                      <span>{{ order.namaAsalPesanan }}</span>
                    </span>
                    <span class="status-badge done">
                      <span class="material-symbols-rounded" style="font-size: 14px;">check_circle</span>
                      <span>Selesai</span>
                    </span>
                    <span v-if="order.anggapSablonSelesai" class="status-badge done">
                      <span class="material-symbols-rounded" style="font-size: 14px;">done_all</span>
                      <span>Sablon Selesai (100%)</span>
                    </span>
                    <span v-if="resolveOrderStatusShopeeName(order)" class="shopee-status-badge">
                      <span class="material-symbols-rounded" style="font-size: 13px;">local_mall</span>
                      <span>{{ resolveOrderStatusShopeeName(order) }}</span>
                    </span>
                    <span class="completed-by-tag">
                      <span class="material-symbols-rounded" style="font-size: 14px;">person</span>
                      <span>Selesai oleh: {{ order.completedByName || 'Admin' }}</span>
                    </span>
                    <button
                      v-if="order.fileDesigns && order.fileDesigns.length"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="openFilePreview(order)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 15px;">attach_file</span>
                      <span>{{ order.fileDesigns.length }} File</span>
                    </button>
                  </div>
                  <div class="op-order-sub">
                    <strong>{{ order.namaProduk }}</strong>
                    <span v-if="resolveOrderKategoriName(order)" class="kategori-badge" style="margin-left: 6px;">
                      {{ resolveOrderKategoriName(order) }}
                    </span>
                    <span v-if="order.namaTemplateSisi"> ({{ order.namaTemplateSisi }})</span>
                    • Expedisi: {{ order.namaExpedisi }}
                    <span v-if="order.catatan"> • {{ order.catatan }}</span>
                  </div>

                  <div v-if="order.kontribusi && order.kontribusi.length" class="kontribusi-inline-row">
                    <span class="form-hint" style="font-weight: 600;">Kontribusi:</span>
                    <span
                      v-for="k in order.kontribusi"
                      :key="k.uid"
                      class="chip"
                    >
                      {{ k.nama }}: <strong>{{ k.qty }} pcs</strong>
                    </span>
                  </div>
                </div>

                <div class="op-schedule-col">
                  <template v-if="!isKaryawan">
                    <div class="op-date-pair">
                      <div class="op-date-field">
                        <label>Mulai Kerjakan</label>
                        <input
                          type="date"
                          class="form-control"
                          :value="getDraftDate(order.id, 'tanggalMulai')"
                          :disabled="Boolean(savingIdMap[order.id])"
                          @input="onDateInput(order, 'tanggalMulai', $event.target.value)"
                        />
                      </div>
                      <div class="op-date-field">
                        <label>Selesai Sebelum</label>
                        <input
                          type="date"
                          class="form-control"
                          :value="getDraftDate(order.id, 'tanggalDeadline')"
                          :disabled="Boolean(savingIdMap[order.id])"
                          @input="onDateInput(order, 'tanggalDeadline', $event.target.value)"
                        />
                      </div>
                    </div>
                    <button
                      v-if="dirtyMap[order.id]"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="Boolean(savingIdMap[order.id])"
                      @click="saveSingleSchedule(order)"
                    >
                      Simpan Jadwal
                    </button>
                  </template>
                  <div v-else class="readonly-schedule-box">
                    <span class="chip">Mulai: {{ formatDateString(order.tanggalMulai) }}</span>
                    <span class="chip">Deadline: {{ formatDateString(order.tanggalDeadline) }}</span>
                  </div>
                </div>

                <div class="op-action-col op-action-stack">
                  <button
                    v-if="canUndoSelesai(order)"
                    type="button"
                    class="btn btn-secondary"
                    :disabled="Boolean(savingIdMap[order.id])"
                    @click="handleToggleSelesai(order)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 18px;">undo</span>
                    <span>Batal Selesai</span>
                  </button>
                  <span v-else class="form-hint" style="text-align: right;">
                    Selesai oleh {{ order.completedByName || 'Admin' }}. Hanya Superadmin yang dapat membatalkan.
                  </span>
                </div>
              </div>

              <div class="op-sisi-section">
                <div
                  v-for="sisi in order.namaSisi"
                  :key="sisi"
                  class="op-sisi-row"
                >
                  <div class="op-sisi-label">
                    <span class="chip">{{ sisi }}</span>
                  </div>
                  <div class="op-progress-wrap">
                    <div class="op-progress-track">
                      <div
                        class="op-progress-fill complete"
                        :style="{ width: getSidePercent(getSideDoneCount(order, sisi), order.jumlahProduk) + '%' }"
                      ></div>
                    </div>
                  </div>
                  <div class="op-sisi-count">
                    <strong>{{ getSideDoneCount(order, sisi) }}/{{ order.jumlahProduk }}</strong> selesai
                  </div>
                </div>
              </div>
            </div>
          </div>

          <table-pagination
            v-if="!loading && combinedOrderedList.length"
            :total-items="combinedOrderedList.length"
            :current-page="currentPage"
            :page-size="localPageSize"
            @update:current-page="currentPage = $event"
            @update:page-size="localPageSize = $event"
          ></table-pagination>

          <div
            v-if="hasMore && !loading"
            style="padding: 12px 20px; border-top: 1px solid var(--border-color); text-align: center;"
          >
            <button type="button" class="btn btn-secondary btn-sm" @click="$emit('load-more')">
              <span>Muat Pesanan Lebih Lama (+150)</span>
            </button>
          </div>
        </div>

        <!-- Modal Atur Kontribusi Karyawan -->
        <div
          v-if="kontribusiModal.visible && kontribusiModal.order"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeKontribusiModal"
        >
          <div class="modal-card">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">Atur Kontribusi Produksi</h3>
                <div class="form-hint">
                  {{ kontribusiModal.order.namaPemesan }} — {{ kontribusiModal.order.namaProduk }} (Target: {{ kontribusiModal.order.jumlahProduk }} pcs)
                </div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                :disabled="kontribusiModal.saving"
                aria-label="Tutup modal"
                @click="closeKontribusiModal"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>

            <form @submit.prevent="saveKontribusiModal">
              <div class="modal-body">
                <div v-if="kontribusiModal.error" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ kontribusiModal.error }}</div>
                </div>

                <div
                  class="kontribusi-summary-bar"
                  :class="{
                    over: kontribusiModalExceeds,
                    complete: !kontribusiModalExceeds && kontribusiDraftTotal === kontribusiModal.order.jumlahProduk
                  }"
                >
                  <div>
                    <div style="font-size: 12px; opacity: 0.85;">Total Qty Kontribusi Terinput</div>
                    <div style="font-size: 18px; font-weight: 700;">
                      {{ kontribusiDraftTotal }} / {{ kontribusiModal.order.jumlahProduk }} pcs
                    </div>
                  </div>
                  <div style="text-align: right; font-size: 12.5px; font-weight: 600;">
                    <span v-if="kontribusiModalExceeds">
                      Melebihi +{{ kontribusiDraftTotal - kontribusiModal.order.jumlahProduk }} pcs!
                    </span>
                    <span v-else-if="kontribusiDraftTotal === kontribusiModal.order.jumlahProduk">
                      Lengkap! Pesanan siap ditandai Selesai
                    </span>
                    <span v-else>
                      Sisa belum terinput: {{ kontribusiModal.order.jumlahProduk - kontribusiDraftTotal }} pcs
                    </span>
                  </div>
                </div>

                <div class="form-hint" style="margin-bottom: 10px;">
                  Anda dapat menyimpan kontribusi bertahap di tengah proses pengerjaan. Tombol "Pesanan Selesai" aktif jika total qty sama dengan jumlah pesanan.
                </div>

                <div v-if="!kontribusiModal.rows.length" class="empty-state" style="padding: 24px 12px;">
                  <p style="margin: 0;">Belum ada akun Admin atau Karyawan aktif. Superadmin dapat menambahkannya di menu Akun Karyawan.</p>
                </div>

                <div v-else class="kontribusi-list">
                  <div
                    v-for="row in kontribusiModal.rows"
                    :key="row.uid"
                    class="kontribusi-row"
                  >
                    <div class="kontribusi-staff-info">
                      <strong>{{ row.nama }}</strong>
                      <span class="role-badge" :class="row.role">{{ row.role }}</span>
                    </div>
                    <div class="kontribusi-qty-wrap">
                      <input
                        v-model.number="row.qty"
                        type="number"
                        min="0"
                        :max="kontribusiModal.order.jumlahProduk"
                        step="1"
                        class="form-control kontribusi-qty-input"
                        :disabled="kontribusiModal.saving"
                      />
                      <span class="form-hint">pcs</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="kontribusiModal.saving"
                  @click="closeKontribusiModal"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="kontribusiModal.saving || kontribusiModalExceeds || !kontribusiModal.rows.length"
                >
                  <span v-if="kontribusiModal.saving" class="spinner spinner-sm"></span>
                  <span>{{ kontribusiModal.saving ? 'Menyimpan...' : 'Simpan Kontribusi' }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <file-preview-modal
          :visible="Boolean(filePreviewOrder)"
          :title="'File Design — ' + (filePreviewOrder ? filePreviewOrder.namaPemesan : '')"
          :subtitle="filePreviewOrder ? (filePreviewOrder.namaProduk + ' • ' + (filePreviewOrder.fileDesigns || []).length + ' file') : ''"
          :files="filePreviewOrder ? filePreviewOrder.fileDesigns : []"
          @close="closeFilePreview"
        ></file-preview-modal>
      </div>
    `
  };
})(window);
