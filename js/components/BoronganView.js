(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  var MONTH_NAMES_ID = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember'
  ];

  var SHORT_MONTH_NAMES_ID = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des'
  ];

  var DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function toYmd(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function toYm(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1);
  }

  function firstDayOfMonthYmd(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-01';
  }

  function parseYmdLocal(ymd) {
    if (!ymd || typeof ymd !== 'string') return null;
    var parts = ymd.split('-');
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (!y || !m || !d) return null;
    var dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function shiftYmd(ymd, deltaDays) {
    var d = parseYmdLocal(ymd) || new Date();
    d.setDate(d.getDate() + deltaDays);
    return toYmd(d);
  }

  function shiftYm(ym, deltaMonths) {
    var parts = String(ym || '').split('-');
    var y = parseInt(parts[0], 10) || new Date().getFullYear();
    var m = parseInt(parts[1], 10) || new Date().getMonth() + 1;
    var d = new Date(y, m - 1 + deltaMonths, 1);
    return toYm(d);
  }

  function toIsoWeekString(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    var yearStart = new Date(d.getFullYear(), 0, 1);
    var weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getFullYear() + '-W' + pad2(weekNo);
  }

  function getIsoWeekRange(weekStr) {
    var m = /^(\d{4})-W(\d{2})$/.exec(String(weekStr || ''));
    if (!m) return null;
    var year = parseInt(m[1], 10);
    var week = parseInt(m[2], 10);
    if (!year || !week) return null;
    var jan4 = new Date(year, 0, 4, 0, 0, 0, 0);
    var jan4Day = jan4.getDay() || 7;
    var week1Monday = new Date(year, 0, 4 - (jan4Day - 1), 0, 0, 0, 0);
    var start = new Date(week1Monday.getTime());
    start.setDate(week1Monday.getDate() + (week - 1) * 7);
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
    return { start: start, end: end, week: week, year: year };
  }

  function shiftIsoWeek(weekStr, deltaWeeks) {
    var range = getIsoWeekRange(weekStr);
    var base = range ? new Date(range.start.getTime()) : new Date();
    base.setDate(base.getDate() + deltaWeeks * 7);
    return toIsoWeekString(base);
  }

  function extractJsDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') {
      var td = ts.toDate();
      return td && !isNaN(td.getTime()) ? td : null;
    }
    if (typeof ts === 'object' && typeof ts.seconds === 'number') {
      var sd = new Date(ts.seconds * 1000);
      return !isNaN(sd.getTime()) ? sd : null;
    }
    var d = ts instanceof Date ? ts : new Date(ts);
    return !isNaN(d.getTime()) ? d : null;
  }

  function formatShortDate(date) {
    return date.getDate() + ' ' + SHORT_MONTH_NAMES_ID[date.getMonth()] + ' ' + date.getFullYear();
  }

  global.ZcpComponents.BoronganView = {
    name: 'BoronganView',
    props: {
      pesananList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      requestsList: {
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
      usersList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      user: {
        type: Object,
        default: function () {
          return { uid: '', email: '', nama: '', role: 'karyawan', boronganPerSisi: 0 };
        }
      },
      loading: { type: Boolean, default: false },
      loadingRequests: { type: Boolean, default: false },
      defaultPageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: ['notify', 'request-confirm'],
    data: function () {
      var now = new Date();
      return {
        activeTab: 'borongan',
        timeFilterMode: 'all',
        filterDay: toYmd(now),
        filterWeek: toIsoWeekString(now),
        filterMonth: toYm(now),
        filterRangeStart: firstDayOfMonthYmd(now),
        filterRangeEnd: toYmd(now),
        searchQuery: '',
        staffFilter: '',
        gajiSearch: '',
        gajiOnlyActiveWork: false,
        requestSearch: '',
        requestStatusFilter: 'all',
        currentPage: 1,
        gajiPage: 1,
        requestPage: 1,
        localPageSize: this.defaultPageSize,
        gajiPageSize: this.defaultPageSize,
        requestPageSize: this.defaultPageSize,
        busyRequestId: null,
        changeModal: {
          visible: false,
          order: null,
          rows: [],
          alasan: '',
          saving: false,
          error: ''
        }
      };
    },
    watch: {
      defaultPageSize: function (val) {
        this.localPageSize = val;
        this.gajiPageSize = val;
        this.requestPageSize = val;
        this.currentPage = 1;
        this.gajiPage = 1;
        this.requestPage = 1;
      },
      timeFilterMode: function () {
        this.currentPage = 1;
        this.gajiPage = 1;
      },
      filterDay: function () {
        this.currentPage = 1;
        this.gajiPage = 1;
      },
      filterWeek: function () {
        this.currentPage = 1;
        this.gajiPage = 1;
      },
      filterMonth: function () {
        this.currentPage = 1;
        this.gajiPage = 1;
      },
      filterRangeStart: function () {
        this.currentPage = 1;
        this.gajiPage = 1;
      },
      filterRangeEnd: function () {
        this.currentPage = 1;
        this.gajiPage = 1;
      },
      searchQuery: function () {
        this.currentPage = 1;
      },
      staffFilter: function () {
        this.currentPage = 1;
      },
      gajiSearch: function () {
        this.gajiPage = 1;
      },
      gajiOnlyActiveWork: function () {
        this.gajiPage = 1;
      },
      requestSearch: function () {
        this.requestPage = 1;
      },
      requestStatusFilter: function () {
        this.requestPage = 1;
      }
    },
    computed: {
      isSuperadmin: function () {
        return Boolean(this.user && this.user.role === 'superadmin');
      },
      currentUid: function () {
        return (this.user && this.user.uid) || '';
      },
      usersByUidMap: function () {
        var map = {};
        if (this.user && this.user.uid) {
          map[this.user.uid] = this.user;
        }
        (this.staffList || []).forEach(function (u) {
          var uid = u && (u.uid || u.id);
          if (uid) map[uid] = u;
        });
        (this.usersList || []).forEach(function (u) {
          var uid = u && (u.uid || u.id);
          if (uid) map[uid] = u;
        });
        return map;
      },
      pesananByIdMap: function () {
        var map = {};
        (this.pesananList || []).forEach(function (p) {
          if (p && p.id) map[p.id] = p;
        });
        return map;
      },
      pendingByOrderMap: function () {
        var map = {};
        (this.requestsList || []).forEach(function (r) {
          if (r && r.status === 'pending' && r.pesananId) {
            map[r.pesananId] = r;
          }
        });
        return map;
      },
      activeQuickPreset: function () {
        if (this.timeFilterMode === 'all') return 'all';
        var now = new Date();
        var today = toYmd(now);
        if (this.timeFilterMode === 'day') {
          if (this.filterDay === today) return 'today';
          if (this.filterDay === shiftYmd(today, -1)) return 'yesterday';
        } else if (this.timeFilterMode === 'week') {
          var thisWeek = toIsoWeekString(now);
          if (this.filterWeek === thisWeek) return 'this_week';
          if (this.filterWeek === shiftIsoWeek(thisWeek, -1)) return 'last_week';
        } else if (this.timeFilterMode === 'month') {
          var thisMonth = toYm(now);
          if (this.filterMonth === thisMonth) return 'this_month';
          if (this.filterMonth === shiftYm(thisMonth, -1)) return 'last_month';
        }
        return '';
      },
      activeTimeRange: function () {
        var mode = this.timeFilterMode;
        if (mode === 'day') {
          var d = parseYmdLocal(this.filterDay) || new Date();
          var startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
          var endDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
          return {
            start: startDay,
            end: endDay,
            label: DAY_NAMES_ID[d.getDay()] + ', ' + formatShortDate(d)
          };
        }
        if (mode === 'week') {
          var wk = getIsoWeekRange(this.filterWeek) || getIsoWeekRange(toIsoWeekString(new Date()));
          return {
            start: wk.start,
            end: wk.end,
            label:
              'Minggu ke-' +
              wk.week +
              ' (' +
              formatShortDate(wk.start) +
              ' – ' +
              formatShortDate(wk.end) +
              ')'
          };
        }
        if (mode === 'month') {
          var parts = String(this.filterMonth || '').split('-');
          var now = new Date();
          var y = parseInt(parts[0], 10) || now.getFullYear();
          var m = parseInt(parts[1], 10) || now.getMonth() + 1;
          var startMonth = new Date(y, m - 1, 1, 0, 0, 0, 0);
          var endMonth = new Date(y, m, 0, 23, 59, 59, 999);
          return {
            start: startMonth,
            end: endMonth,
            label: MONTH_NAMES_ID[m - 1] + ' ' + y
          };
        }
        if (mode === 'range') {
          var s = parseYmdLocal(this.filterRangeStart);
          var e = parseYmdLocal(this.filterRangeEnd);
          if (!s && !e) {
            return { start: null, end: null, label: 'Semua Waktu' };
          }
          if (s && e && s.getTime() > e.getTime()) {
            var tmp = s;
            s = e;
            e = tmp;
          }
          var startRange = s
            ? new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0)
            : null;
          var endRange = e
            ? new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999)
            : null;
          var lbl =
            startRange && endRange
              ? formatShortDate(startRange) + ' – ' + formatShortDate(endRange)
              : startRange
                ? 'Mulai ' + formatShortDate(startRange)
                : 'Sampai ' + formatShortDate(endRange);
          return { start: startRange, end: endRange, label: lbl };
        }
        return { start: null, end: null, label: 'Semua Waktu' };
      },
      /**
       * Pesanan selesai yang memiliki data kontribusi dan boleh dilihat oleh user saat ini.
       */
      visibleBoronganOrders: function () {
        var uid = this.currentUid;
        var isSuper = this.isSuperadmin;
        return (this.pesananList || []).filter(function (order) {
          if (!order || !order.statusSelesai) return false;
          var kontrib = Array.isArray(order.kontribusi) ? order.kontribusi : [];
          if (!kontrib.length) return false;
          if (isSuper) return true;
          return kontrib.some(function (k) {
            return k && k.uid === uid;
          });
        });
      },
      timeFilteredBoronganOrders: function () {
        var range = this.activeTimeRange;
        if (!range.start && !range.end) return this.visibleBoronganOrders;
        var startMs = range.start ? range.start.getTime() : null;
        var endMs = range.end ? range.end.getTime() : null;
        return this.visibleBoronganOrders.filter(function (order) {
          var dt = extractJsDate(order.completedAt || order.updatedAt || order.createdAt);
          if (!dt) return false;
          var ms = dt.getTime();
          if (startMs !== null && ms < startMs) return false;
          if (endMs !== null && ms > endMs) return false;
          return true;
        });
      },
      staffFilterOptions: function () {
        var map = {};
        var list = [];
        this.timeFilteredBoronganOrders.forEach(function (order) {
          (order.kontribusi || []).forEach(function (k) {
            if (k && k.uid && !map[k.uid]) {
              map[k.uid] = true;
              list.push({ uid: k.uid, nama: k.nama || k.uid });
            }
          });
        });
        return list.sort(function (a, b) {
          return a.nama.localeCompare(b.nama);
        });
      },
      filteredBoronganOrders: function () {
        var q = this.searchQuery.trim().toLowerCase();
        var sf = this.staffFilter;
        return this.timeFilteredBoronganOrders.filter(function (order) {
          if (sf) {
            var hasStaff = (order.kontribusi || []).some(function (k) {
              return k.uid === sf;
            });
            if (!hasStaff) return false;
          }
          if (!q) return true;
          var matchOrder =
            (order.namaPemesan || '').toLowerCase().indexOf(q) !== -1 ||
            (order.namaProduk || '').toLowerCase().indexOf(q) !== -1 ||
            (order.namaAsalPesanan || '').toLowerCase().indexOf(q) !== -1 ||
            (order.completedByName || '').toLowerCase().indexOf(q) !== -1;
          var matchStaff = (order.kontribusi || []).some(function (k) {
            return (k.nama || '').toLowerCase().indexOf(q) !== -1;
          });
          return matchOrder || matchStaff;
        });
      },
      paginatedBoronganOrders: function () {
        if (this.localPageSize === 'all') return this.filteredBoronganOrders;
        var size = Number(this.localPageSize) || 10;
        var start = (this.currentPage - 1) * size;
        return this.filteredBoronganOrders.slice(start, start + size);
      },
      employeeStatsList: function () {
        var self = this;
        var isSuper = this.isSuperadmin;
        var myUid = this.currentUid;
        var usersMap = this.usersByUidMap;
        var statsByUid = {};

        function ensureEntry(uid, fallbackName, fallbackRole) {
          if (!statsByUid[uid]) {
            var userObj = usersMap[uid] || null;
            statsByUid[uid] = {
              uid: uid,
              nama: (userObj && userObj.nama) || fallbackName || 'Karyawan',
              role: (userObj && userObj.role) || fallbackRole || 'karyawan',
              active: userObj ? userObj.active !== false : true,
              boronganPerSisi: Math.max(0, Math.round(Number(userObj && userObj.boronganPerSisi) || 0)),
              orderIds: {},
              orderCount: 0,
              totalQty: 0,
              totalSisi: 0,
              totalGaji: 0
            };
          }
          return statsByUid[uid];
        }

        this.timeFilteredBoronganOrders.forEach(function (order) {
          var sisiCount = self.getOrderSisiCount(order);
          (order.kontribusi || []).forEach(function (k) {
            if (!k || !k.uid) return;
            if (!isSuper && k.uid !== myUid) return;
            var qty = Math.max(0, parseInt(k.qty, 10) || 0);
            if (qty <= 0) return;
            var entry = ensureEntry(k.uid, k.nama, k.role);
            if (!entry.orderIds[order.id]) {
              entry.orderIds[order.id] = true;
              entry.orderCount += 1;
            }
            entry.totalQty += qty;
            entry.totalSisi += qty * sisiCount;
          });
        });

        if (isSuper) {
          (this.staffList || []).forEach(function (u) {
            var uid = u && (u.uid || u.id);
            if (uid) ensureEntry(uid, u.nama, u.role);
          });
        } else if (myUid) {
          ensureEntry(myUid, this.user && this.user.nama, this.user && this.user.role);
        }

        return Object.keys(statsByUid)
          .map(function (uid) {
            var item = statsByUid[uid];
            item.totalGaji = item.totalSisi * item.boronganPerSisi;
            return item;
          })
          .sort(function (a, b) {
            if (b.totalSisi !== a.totalSisi) return b.totalSisi - a.totalSisi;
            if (b.totalGaji !== a.totalGaji) return b.totalGaji - a.totalGaji;
            return (a.nama || '').localeCompare(b.nama || '');
          });
      },
      employeeSisiSummaryCards: function () {
        var isSuper = this.isSuperadmin;
        return this.employeeStatsList.filter(function (row) {
          if (!isSuper) return true;
          return row.totalSisi > 0 || row.totalQty > 0;
        });
      },
      filteredGajiRows: function () {
        var q = this.gajiSearch.trim().toLowerCase();
        var onlyWork = this.isSuperadmin && this.gajiOnlyActiveWork;
        return this.employeeStatsList.filter(function (row) {
          if (onlyWork && row.totalSisi <= 0) return false;
          if (!q) return true;
          return (
            (row.nama || '').toLowerCase().indexOf(q) !== -1 ||
            (row.role || '').toLowerCase().indexOf(q) !== -1
          );
        });
      },
      paginatedGajiRows: function () {
        if (this.gajiPageSize === 'all') return this.filteredGajiRows;
        var size = Number(this.gajiPageSize) || 10;
        var start = (this.gajiPage - 1) * size;
        return this.filteredGajiRows.slice(start, start + size);
      },
      gajiGrandTotals: function () {
        return this.filteredGajiRows.reduce(
          function (acc, row) {
            acc.totalQty += row.totalQty;
            acc.totalSisi += row.totalSisi;
            acc.totalGaji += row.totalGaji;
            return acc;
          },
          { totalQty: 0, totalSisi: 0, totalGaji: 0 }
        );
      },
      hasMissingTarif: function () {
        return this.filteredGajiRows.some(function (row) {
          return row.totalSisi > 0 && row.boronganPerSisi <= 0;
        });
      },
      myTotalPcsCount: function () {
        var uid = this.currentUid;
        var isSuper = this.isSuperadmin;
        return this.timeFilteredBoronganOrders.reduce(function (sum, order) {
          if (isSuper) {
            return sum + (Number(order.jumlahProduk) || 0);
          }
          var mine = (order.kontribusi || []).find(function (k) {
            return k.uid === uid;
          });
          return sum + (mine ? Number(mine.qty) || 0 : 0);
        }, 0);
      },
      kpiTotalSisiCount: function () {
        return this.employeeStatsList.reduce(function (sum, row) {
          return sum + row.totalSisi;
        }, 0);
      },
      kpiTotalGajiAmount: function () {
        return this.employeeStatsList.reduce(function (sum, row) {
          return sum + row.totalGaji;
        }, 0);
      },
      visibleRequests: function () {
        var uid = this.currentUid;
        var isSuper = this.isSuperadmin;
        return (this.requestsList || []).filter(function (req) {
          if (isSuper) return true;
          return Array.isArray(req.involvedUids) && req.involvedUids.indexOf(uid) !== -1;
        });
      },
      pendingRequestsCount: function () {
        return this.visibleRequests.filter(function (r) {
          return r.status === 'pending';
        }).length;
      },
      filteredRequests: function () {
        var q = this.requestSearch.trim().toLowerCase();
        var st = this.requestStatusFilter;
        return this.visibleRequests.filter(function (req) {
          if (st !== 'all' && req.status !== st) return false;
          if (!q) return true;
          return (
            (req.namaPemesan || '').toLowerCase().indexOf(q) !== -1 ||
            (req.namaProduk || '').toLowerCase().indexOf(q) !== -1 ||
            (req.requestedByName || '').toLowerCase().indexOf(q) !== -1 ||
            (req.completedByName || '').toLowerCase().indexOf(q) !== -1 ||
            (req.alasan || '').toLowerCase().indexOf(q) !== -1
          );
        });
      },
      paginatedRequests: function () {
        if (this.requestPageSize === 'all') return this.filteredRequests;
        var size = Number(this.requestPageSize) || 10;
        var start = (this.requestPage - 1) * size;
        return this.filteredRequests.slice(start, start + size);
      },
      changeDraftTotal: function () {
        return (this.changeModal.rows || []).reduce(function (sum, r) {
          return sum + Math.max(0, parseInt(r.qty, 10) || 0);
        }, 0);
      },
      changeTargetQty: function () {
        return Number(this.changeModal.order && this.changeModal.order.jumlahProduk) || 0;
      },
      changeModalSisiCount: function () {
        return this.getOrderSisiCount(this.changeModal.order);
      },
      changeDraftTotalSisi: function () {
        return this.changeDraftTotal * this.changeModalSisiCount;
      },
      changeTargetSisi: function () {
        return this.changeTargetQty * this.changeModalSisiCount;
      }
    },
    methods: {
      getOrderSisiCount: function (order) {
        return Array.isArray(order && order.namaSisi) ? order.namaSisi.length : 0;
      },
      getRequestSisiCount: function (req) {
        if (!req) return 0;
        var linked = req.pesananId ? this.pesananByIdMap[req.pesananId] : null;
        return this.getOrderSisiCount(linked);
      },
      formatRupiah: function (amount) {
        var num = Math.max(0, Math.round(Number(amount) || 0));
        return 'Rp ' + num.toLocaleString('id-ID');
      },
      applyQuickTime: function (preset) {
        var now = new Date();
        var today = toYmd(now);
        if (preset === 'all') {
          this.timeFilterMode = 'all';
        } else if (preset === 'today') {
          this.timeFilterMode = 'day';
          this.filterDay = today;
        } else if (preset === 'yesterday') {
          this.timeFilterMode = 'day';
          this.filterDay = shiftYmd(today, -1);
        } else if (preset === 'this_week') {
          this.timeFilterMode = 'week';
          this.filterWeek = toIsoWeekString(now);
        } else if (preset === 'last_week') {
          this.timeFilterMode = 'week';
          this.filterWeek = shiftIsoWeek(toIsoWeekString(now), -1);
        } else if (preset === 'this_month') {
          this.timeFilterMode = 'month';
          this.filterMonth = toYm(now);
        } else if (preset === 'last_month') {
          this.timeFilterMode = 'month';
          this.filterMonth = shiftYm(toYm(now), -1);
        }
      },
      stepTimePeriod: function (delta) {
        if (this.timeFilterMode === 'day') {
          this.filterDay = shiftYmd(this.filterDay, delta);
        } else if (this.timeFilterMode === 'week') {
          this.filterWeek = shiftIsoWeek(this.filterWeek, delta);
        } else if (this.timeFilterMode === 'month') {
          this.filterMonth = shiftYm(this.filterMonth, delta);
        }
      },
      toggleStaffFilterFromCard: function (uid) {
        if (!this.isSuperadmin) return;
        this.staffFilter = this.staffFilter === uid ? '' : uid;
      },
      formatDateTime: function (ts) {
        if (!ts) return 'Baru saja';
        var d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      },
      getMyQtyInOrder: function (order) {
        var uid = this.currentUid;
        var found = (order.kontribusi || []).find(function (k) {
          return k.uid === uid;
        });
        return found ? Number(found.qty) || 0 : 0;
      },
      getMySisiInOrder: function (order) {
        return this.getMyQtyInOrder(order) * this.getOrderSisiCount(order);
      },
      canRequestChange: function (order) {
        if (!order || !order.statusSelesai) return false;
        var kontrib = Array.isArray(order.kontribusi) ? order.kontribusi : [];
        if (kontrib.length < 2) return false;
        // Yang mengklik pesanan selesai di operasional tidak dapat mengajukan perubahan
        if (order.completedByUid && order.completedByUid === this.currentUid) return false;
        if (this.pendingByOrderMap[order.id]) return false;
        return true;
      },
      cannotRequestReason: function (order) {
        if (!order) return '';
        if (this.pendingByOrderMap[order.id]) {
          return 'Ada pengajuan menunggu persetujuan';
        }
        if ((order.kontribusi || []).length < 2) {
          return 'Minimal 2 karyawan kontribusi';
        }
        if (order.completedByUid && order.completedByUid === this.currentUid) {
          return 'Penyelesai pesanan tidak dapat mengajukan';
        }
        return '';
      },
      canApproveOrReject: function (req) {
        if (!req || req.status !== 'pending') return false;
        if (this.isSuperadmin) return true;
        return Boolean(req.completedByUid && req.completedByUid === this.currentUid);
      },
      requestStatusMeta: function (status) {
        if (status === 'approved') return { cls: 'done', label: 'Disetujui', icon: 'check_circle' };
        if (status === 'rejected') return { cls: 'danger', label: 'Ditolak', icon: 'cancel' };
        return { cls: 'warn', label: 'Menunggu Persetujuan', icon: 'hourglass_top' };
      },
      openChangeModal: function (order) {
        if (!this.canRequestChange(order)) return;
        var existingMap = {};
        var existingByUid = {};
        (order.kontribusi || []).forEach(function (k) {
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

        this.changeModal = {
          visible: true,
          order: order,
          rows: rows,
          alasan: '',
          saving: false,
          error: ''
        };
      },
      closeChangeModal: function () {
        if (this.changeModal.saving) return;
        this.changeModal.visible = false;
        this.changeModal.order = null;
        this.changeModal.rows = [];
        this.changeModal.alasan = '';
        this.changeModal.error = '';
      },
      submitChangeRequest: async function () {
        var order = this.changeModal.order;
        if (!order || this.changeModal.saving) return;
        this.changeModal.error = '';

        var target = Number(order.jumlahProduk) || 0;
        var total = this.changeDraftTotal;
        if (total !== target) {
          var msg =
            'Total kontribusi baru (' +
            total +
            ' pcs) harus sama persis dengan jumlah pesanan (' +
            target +
            ' pcs).';
          this.changeModal.error = msg;
          if (global.ZcpAlert) {
            global.ZcpAlert.error(msg, 'Total Kontribusi Tidak Sesuai');
          }
          return;
        }

        this.changeModal.saving = true;
        try {
          await global.ZcpBoronganService.createChangeRequest({
            order: order,
            newKontribusi: this.changeModal.rows,
            alasan: this.changeModal.alasan
          });
          this.changeModal.visible = false;
          this.$emit('notify', {
            type: 'success',
            message:
              'Pengajuan perubahan kontribusi untuk "' +
              order.namaPemesan +
              '" berhasil dikirim dan menunggu persetujuan.'
          });
        } catch (err) {
          var errMsg = (err && err.message) || 'Gagal mengajukan perubahan kontribusi.';
          this.changeModal.error = errMsg;
          if (global.ZcpAlert) {
            global.ZcpAlert.error(errMsg);
          }
        } finally {
          this.changeModal.saving = false;
        }
      },
      handleApproveRequest: function (req) {
        if (!this.canApproveOrReject(req) || this.busyRequestId) return;
        var self = this;
        var summaryBaru = (req.newKontribusi || [])
          .map(function (k) {
            return k.nama + ': ' + k.qty + ' pcs';
          })
          .join(', ');

        this.$emit('request-confirm', {
          title: 'Setujui Perubahan Kontribusi',
          message:
            'Setujui perubahan kontribusi pesanan "' +
            req.namaPemesan +
            '" (' +
            req.namaProduk +
            ') dari ' +
            req.requestedByName +
            '?\n\nKontribusi baru: ' +
            summaryBaru,
          confirmText: 'Ya, Setujui',
          variant: 'success',
          icon: 'question',
          onConfirm: async function () {
            self.busyRequestId = req.id;
            try {
              await global.ZcpBoronganService.approveChangeRequest(req);
              self.$emit('notify', {
                type: 'success',
                message: 'Pengajuan perubahan kontribusi berhasil disetujui & data borongan diperbarui.'
              });
            } finally {
              self.busyRequestId = null;
            }
          }
        });
      },
      handleRejectRequest: async function (req) {
        if (!this.canApproveOrReject(req) || this.busyRequestId) return;
        var self = this;
        if (global.ZcpAlert && typeof global.ZcpAlert.prompt === 'function') {
          await global.ZcpAlert.prompt({
            title: 'Tolak Pengajuan Perubahan',
            message:
              'Tolak pengajuan perubahan kontribusi dari ' +
              (req.requestedByName || 'karyawan') +
              ' untuk pesanan "' +
              req.namaPemesan +
              '"?',
            inputLabel: 'Alasan Penolakan (Opsional)',
            inputPlaceholder: 'Contoh: Jumlah sudah sesuai dengan catatan produksi...',
            confirmText: 'Tolak Pengajuan',
            variant: 'danger',
            onConfirm: async function (note) {
              self.busyRequestId = req.id;
              try {
                await global.ZcpBoronganService.rejectChangeRequest(req, note);
                self.$emit('notify', {
                  type: 'info',
                  message: 'Pengajuan perubahan kontribusi telah ditolak.'
                });
              } finally {
                self.busyRequestId = null;
              }
            }
          });
          return;
        }

        this.$emit('request-confirm', {
          title: 'Tolak Pengajuan Perubahan',
          message: 'Tolak pengajuan perubahan kontribusi dari ' + req.requestedByName + '?',
          confirmText: 'Ya, Tolak',
          variant: 'danger',
          onConfirm: async function () {
            await global.ZcpBoronganService.rejectChangeRequest(req, '');
            self.$emit('notify', {
              type: 'info',
              message: 'Pengajuan perubahan kontribusi ditolak.'
            });
          }
        });
      }
    },
    template: `
      <div>
        <!-- 4 KPI Borongan (mengikuti filter waktu) -->
        <div class="kpi-grid kpi-grid-4">
          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Pesanan Borongan</div>
                <div class="kpi-value">{{ timeFilteredBoronganOrders.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">receipt_long</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              {{ activeTimeRange.label }}
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">{{ isSuperadmin ? 'Total Sisi Diselesaikan' : 'Total Sisi Saya' }}</div>
                <div class="kpi-value">
                  {{ kpiTotalSisiCount.toLocaleString('id-ID') }}
                  <span style="font-size: 14px; font-weight: 600;">sisi</span>
                </div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">layers</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Total {{ myTotalPcsCount.toLocaleString('id-ID') }} pcs (&Sigma; qty &times; jumlah sisi)
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">{{ isSuperadmin ? 'Total Gaji Borongan' : 'Gaji Borongan Saya' }}</div>
                <div class="kpi-value" style="font-size: 22px;">{{ formatRupiah(kpiTotalGajiAmount) }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">account_balance_wallet</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Total Sisi &times; Tarif / Sisi ({{ activeTimeRange.label }})
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Pengajuan Perubahan Pending</div>
                <div class="kpi-value">{{ pendingRequestsCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">pending_actions</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Menunggu persetujuan penyelesai pesanan / Superadmin
            </div>
          </div>
        </div>

        <!-- Bar Filter Waktu Lengkap (Hari / Minggu / Bulan / Rentang / Semua) -->
        <div class="card borongan-time-bar">
          <div class="borongan-time-top">
            <div class="time-mode-pills" role="group" aria-label="Mode filter waktu">
              <button
                type="button"
                class="time-pill"
                :class="{ active: timeFilterMode === 'all' }"
                @click="timeFilterMode = 'all'"
              >
                Semua Waktu
              </button>
              <button
                type="button"
                class="time-pill"
                :class="{ active: timeFilterMode === 'day' }"
                @click="timeFilterMode = 'day'"
              >
                Harian
              </button>
              <button
                type="button"
                class="time-pill"
                :class="{ active: timeFilterMode === 'week' }"
                @click="timeFilterMode = 'week'"
              >
                Mingguan
              </button>
              <button
                type="button"
                class="time-pill"
                :class="{ active: timeFilterMode === 'month' }"
                @click="timeFilterMode = 'month'"
              >
                Bulanan
              </button>
              <button
                type="button"
                class="time-pill"
                :class="{ active: timeFilterMode === 'range' }"
                @click="timeFilterMode = 'range'"
              >
                Rentang Tanggal
              </button>
            </div>

            <div class="time-quick-chips">
              <button
                type="button"
                class="time-quick-btn"
                :class="{ active: activeQuickPreset === 'today' }"
                @click="applyQuickTime('today')"
              >
                Hari Ini
              </button>
              <button
                type="button"
                class="time-quick-btn"
                :class="{ active: activeQuickPreset === 'yesterday' }"
                @click="applyQuickTime('yesterday')"
              >
                Kemarin
              </button>
              <button
                type="button"
                class="time-quick-btn"
                :class="{ active: activeQuickPreset === 'this_week' }"
                @click="applyQuickTime('this_week')"
              >
                Minggu Ini
              </button>
              <button
                type="button"
                class="time-quick-btn"
                :class="{ active: activeQuickPreset === 'last_week' }"
                @click="applyQuickTime('last_week')"
              >
                Minggu Lalu
              </button>
              <button
                type="button"
                class="time-quick-btn"
                :class="{ active: activeQuickPreset === 'this_month' }"
                @click="applyQuickTime('this_month')"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                class="time-quick-btn"
                :class="{ active: activeQuickPreset === 'last_month' }"
                @click="applyQuickTime('last_month')"
              >
                Bulan Lalu
              </button>
            </div>
          </div>

          <div class="borongan-time-bottom">
            <div v-if="timeFilterMode === 'day'" class="time-picker-row">
              <button
                type="button"
                class="btn btn-secondary btn-sm btn-icon-sq"
                title="Hari sebelumnya"
                @click="stepTimePeriod(-1)"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">chevron_left</span>
              </button>
              <input
                v-model="filterDay"
                type="date"
                class="form-control time-input"
                aria-label="Pilih tanggal"
              />
              <button
                type="button"
                class="btn btn-secondary btn-sm btn-icon-sq"
                title="Hari berikutnya"
                @click="stepTimePeriod(1)"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">chevron_right</span>
              </button>
            </div>

            <div v-else-if="timeFilterMode === 'week'" class="time-picker-row">
              <button
                type="button"
                class="btn btn-secondary btn-sm btn-icon-sq"
                title="Minggu sebelumnya"
                @click="stepTimePeriod(-1)"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">chevron_left</span>
              </button>
              <input
                v-model="filterWeek"
                type="week"
                class="form-control time-input"
                aria-label="Pilih minggu"
              />
              <button
                type="button"
                class="btn btn-secondary btn-sm btn-icon-sq"
                title="Minggu berikutnya"
                @click="stepTimePeriod(1)"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">chevron_right</span>
              </button>
            </div>

            <div v-else-if="timeFilterMode === 'month'" class="time-picker-row">
              <button
                type="button"
                class="btn btn-secondary btn-sm btn-icon-sq"
                title="Bulan sebelumnya"
                @click="stepTimePeriod(-1)"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">chevron_left</span>
              </button>
              <input
                v-model="filterMonth"
                type="month"
                class="form-control time-input"
                aria-label="Pilih bulan"
              />
              <button
                type="button"
                class="btn btn-secondary btn-sm btn-icon-sq"
                title="Bulan berikutnya"
                @click="stepTimePeriod(1)"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">chevron_right</span>
              </button>
            </div>

            <div v-else-if="timeFilterMode === 'range'" class="time-picker-row">
              <input
                v-model="filterRangeStart"
                type="date"
                class="form-control time-input"
                aria-label="Tanggal mulai"
              />
              <span class="form-hint" style="font-weight: 600;">s/d</span>
              <input
                v-model="filterRangeEnd"
                type="date"
                class="form-control time-input"
                aria-label="Tanggal akhir"
              />
            </div>

            <div v-else class="form-hint">
              Menampilkan akumulasi seluruh pesanan borongan selesai tanpa batas tanggal.
            </div>

            <div class="time-period-badge">
              <span class="material-symbols-rounded" style="font-size: 15px;">calendar_month</span>
              <span>Periode: <strong>{{ activeTimeRange.label }}</strong></span>
              <button
                v-if="timeFilterMode !== 'all'"
                type="button"
                class="time-reset-link"
                @click="applyQuickTime('all')"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <!-- Tabs Borongan -->
        <div class="tabs-bar" role="tablist" aria-label="Menu Borongan">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'borongan'"
            class="tab-btn"
            :class="{ active: activeTab === 'borongan' }"
            @click="activeTab = 'borongan'"
          >
            <span class="material-symbols-rounded" style="font-size: 19px;">payments</span>
            <span>Data Borongan</span>
            <span class="tab-count">{{ timeFilteredBoronganOrders.length }}</span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'gaji'"
            class="tab-btn"
            :class="{ active: activeTab === 'gaji' }"
            @click="activeTab = 'gaji'"
          >
            <span class="material-symbols-rounded" style="font-size: 19px;">account_balance_wallet</span>
            <span>Gaji Borongan</span>
            <span class="tab-count">{{ employeeStatsList.length }}</span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'pengajuan'"
            class="tab-btn"
            :class="{ active: activeTab === 'pengajuan' }"
            @click="activeTab = 'pengajuan'"
          >
            <span class="material-symbols-rounded" style="font-size: 19px;">rule</span>
            <span>Daftar Pengajuan Perubahan</span>
            <span class="tab-count">{{ pendingRequestsCount || visibleRequests.length }}</span>
          </button>
        </div>

        <!-- TAB 1: DATA BORONGAN -->
        <div v-if="activeTab === 'borongan'" class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Data Borongan &amp; Total Sisi Karyawan</h2>
              <p>
                {{
                  isSuperadmin
                    ? 'Menampilkan total sisi yang dikerjakan setiap karyawan dan riwayat pesanan pada periode ' + activeTimeRange.label + '.'
                    : 'Menampilkan total sisi dan pesanan selesai Anda pada periode ' + activeTimeRange.label + '.'
                }}
              </p>
            </div>

            <div class="panel-actions">
              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="searchQuery"
                  type="text"
                  class="form-control"
                  placeholder="Cari pemesan, produk, karyawan..."
                  aria-label="Cari data borongan"
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

              <select
                v-if="isSuperadmin"
                v-model="staffFilter"
                class="filter-select"
                aria-label="Filter karyawan"
              >
                <option value="">Semua Karyawan</option>
                <option v-for="st in staffFilterOptions" :key="st.uid" :value="st.uid">
                  {{ st.nama }}
                </option>
              </select>
            </div>
          </div>

          <!-- Ringkasan Total Sisi per Karyawan -->
          <div v-if="!loading && employeeSisiSummaryCards.length" class="borongan-sisi-summary-section">
            <div class="borongan-sisi-summary-head">
              <span class="borongan-sisi-summary-title">
                <span class="material-symbols-rounded" style="font-size: 17px;">layers</span>
                <span>Total Sisi per Karyawan ({{ activeTimeRange.label }})</span>
              </span>
              <span v-if="isSuperadmin && staffFilter" class="form-hint">
                Filter aktif: klik kartu lagi atau pilih Semua Karyawan untuk reset
              </span>
              <span v-else-if="isSuperadmin" class="form-hint">
                Klik kartu karyawan untuk memfilter tabel pesanan
              </span>
            </div>

            <div class="borongan-sisi-cards">
              <button
                v-for="emp in employeeSisiSummaryCards"
                :key="'sum_' + emp.uid"
                type="button"
                class="borongan-sisi-card"
                :class="{
                  'is-filtered': staffFilter === emp.uid,
                  'is-clickable': isSuperadmin
                }"
                @click="toggleStaffFilterFromCard(emp.uid)"
              >
                <div class="borongan-sisi-card-top">
                  <span class="borongan-sisi-emp-name">{{ emp.nama }}</span>
                  <span class="role-badge" :class="emp.role">{{ emp.role }}</span>
                </div>
                <div class="borongan-sisi-val">
                  {{ emp.totalSisi.toLocaleString('id-ID') }} <span>sisi</span>
                </div>
                <div class="borongan-sisi-meta">
                  <span>{{ emp.totalQty.toLocaleString('id-ID') }} pcs</span>
                  <span>&bull;</span>
                  <span>{{ emp.orderCount }} pesanan</span>
                </div>
              </button>
            </div>
          </div>

          <div v-if="loading" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Memuat data borongan...</p>
          </div>

          <div v-else-if="!filteredBoronganOrders.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">payments</span>
            </div>
            <h3>
              {{
                (searchQuery || staffFilter || timeFilterMode !== 'all')
                  ? 'Data borongan tidak ditemukan pada filter ini'
                  : 'Belum ada data borongan'
              }}
            </h3>
            <p>
              {{
                (searchQuery || staffFilter || timeFilterMode !== 'all')
                  ? 'Coba ubah rentang waktu, filter karyawan, atau kata kunci pencarian.'
                  : 'Data muncul otomatis setelah pesanan diatur kontribusinya dan ditandai Selesai di menu Operasional.'
              }}
            </p>
          </div>

          <div v-else class="table-container">
            <table class="data-table responsive-table">
              <thead>
                <tr>
                  <th class="col-no">No</th>
                  <th>Pesanan &amp; Produk</th>
                  <th>Kontribusi Karyawan (Qty &amp; Sisi)</th>
                  <th v-if="!isSuperadmin">Kontribusi Saya</th>
                  <th>Diselesaikan Oleh</th>
                  <th>Tanggal Selesai</th>
                  <th class="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(order, index) in paginatedBoronganOrders" :key="order.id">
                  <td class="col-no" data-label="No">
                    {{ (localPageSize === 'all' ? 0 : (currentPage - 1) * Number(localPageSize)) + index + 1 }}
                  </td>
                  <td data-label="Pesanan & Produk">
                    <div style="font-weight: 700;">{{ order.namaPemesan }}</div>
                    <div class="form-hint" style="margin-top: 2px;">
                      {{ order.namaProduk }} &bull;
                      <strong>{{ order.jumlahProduk }} pcs</strong> &times;
                      <strong>{{ getOrderSisiCount(order) }} sisi</strong> =
                      <strong>{{ (Number(order.jumlahProduk) || 0) * getOrderSisiCount(order) }} sisi</strong>
                      <span v-if="order.namaAsalPesanan"> &bull; {{ order.namaAsalPesanan }}</span>
                    </div>
                  </td>
                  <td class="sisi-cell" data-label="Kontribusi Karyawan">
                    <div class="chips-wrap">
                      <span
                        v-for="k in order.kontribusi"
                        :key="k.uid"
                        class="chip"
                        :class="{ 'is-me-chip': k.uid === currentUid }"
                      >
                        {{ k.nama }}: <strong>{{ k.qty }} pcs</strong>
                        <span class="chip-sisi-sub">
                          ({{ (Number(k.qty) || 0) * getOrderSisiCount(order) }} sisi)
                        </span>
                      </span>
                    </div>
                  </td>
                  <td v-if="!isSuperadmin" data-label="Kontribusi Saya">
                    <div class="chips-wrap">
                      <span class="badge-count">{{ getMyQtyInOrder(order) }} pcs</span>
                      <span class="gaji-sisi-badge">{{ getMySisiInOrder(order) }} sisi</span>
                    </div>
                  </td>
                  <td data-label="Diselesaikan Oleh">
                    <span class="completed-by-tag">
                      <span class="material-symbols-rounded" style="font-size: 14px;">person</span>
                      <span>{{ order.completedByName || 'Admin' }}</span>
                    </span>
                  </td>
                  <td data-label="Tanggal Selesai">
                    {{ formatDateTime(order.completedAt || order.updatedAt) }}
                  </td>
                  <td class="col-actions" data-label="Aksi">
                    <button
                      v-if="canRequestChange(order)"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="openChangeModal(order)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 16px;">edit_note</span>
                      <span>Ajukan Perubahan</span>
                    </button>
                    <span
                      v-else-if="pendingByOrderMap[order.id]"
                      class="status-badge warn"
                    >
                      <span class="material-symbols-rounded" style="font-size: 14px;">hourglass_top</span>
                      <span>Menunggu Persetujuan</span>
                    </span>
                    <span v-else class="form-hint">
                      {{ cannotRequestReason(order) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <table-pagination
            v-if="!loading && filteredBoronganOrders.length"
            :total-items="filteredBoronganOrders.length"
            :current-page="currentPage"
            :page-size="localPageSize"
            @update:current-page="currentPage = $event"
            @update:page-size="localPageSize = $event"
          ></table-pagination>
        </div>

        <!-- TAB 2: GAJI BORONGAN -->
        <div v-else-if="activeTab === 'gaji'" class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Gaji Borongan Karyawan</h2>
              <p>
                Periode: <strong>{{ activeTimeRange.label }}</strong> &bull; Rumus: Total Sisi Dikerjakan &times; Tarif Borongan per Sisi.
              </p>
            </div>

            <div class="panel-actions" v-if="isSuperadmin">
              <label class="gaji-filter-check">
                <input v-model="gajiOnlyActiveWork" type="checkbox" />
                <span>Hanya yang ada sisi (&gt; 0)</span>
              </label>

              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="gajiSearch"
                  type="text"
                  class="form-control"
                  placeholder="Cari nama karyawan..."
                  aria-label="Cari gaji karyawan"
                />
                <button
                  v-if="gajiSearch"
                  type="button"
                  class="input-action-btn"
                  aria-label="Hapus pencarian"
                  @click="gajiSearch = ''"
                >
                  <span class="material-symbols-rounded" style="font-size: 18px;">close</span>
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="!loading && hasMissingTarif"
            class="alert alert-warning"
            style="margin: 14px 20px 0;"
            role="status"
          >
            <span class="material-symbols-rounded">info</span>
            <div>
              Sebagian karyawan masih memiliki tarif borongan <strong>Rp 0 / sisi</strong>.
              {{
                isSuperadmin
                  ? 'Atur nominal Borongan per Sisi pada menu Akun Karyawan agar total gaji terhitung.'
                  : 'Hubungi Superadmin untuk mengatur tarif Borongan per Sisi akun Anda.'
              }}
            </div>
          </div>

          <div v-if="loading" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Menghitung gaji borongan...</p>
          </div>

          <div v-else-if="!filteredGajiRows.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">account_balance_wallet</span>
            </div>
            <h3>Tidak ada data gaji borongan</h3>
            <p>
              {{
                (gajiSearch || gajiOnlyActiveWork || timeFilterMode !== 'all')
                  ? 'Tidak ada karyawan yang cocok dengan filter waktu atau pencarian saat ini.'
                  : 'Belum ada data karyawan atau pesanan borongan yang selesai.'
              }}
            </p>
          </div>

          <div v-else class="table-container">
            <table class="data-table responsive-table">
              <thead>
                <tr>
                  <th class="col-no">No</th>
                  <th>Karyawan</th>
                  <th>Pesanan</th>
                  <th>Total Qty</th>
                  <th>Total Sisi</th>
                  <th>Borongan / Sisi</th>
                  <th>Total Gaji Borongan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in paginatedGajiRows" :key="row.uid">
                  <td class="col-no" data-label="No">
                    {{ (gajiPageSize === 'all' ? 0 : (gajiPage - 1) * Number(gajiPageSize)) + index + 1 }}
                  </td>
                  <td data-label="Karyawan">
                    <div class="item-title-cell">
                      <span class="item-mini-icon">
                        <span class="material-symbols-rounded" style="font-size: 18px;">person</span>
                      </span>
                      <div>
                        <div style="font-weight: 700;">{{ row.nama }}</div>
                        <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                          <span class="role-badge" :class="row.role">{{ row.role }}</span>
                          <span v-if="!row.active" class="status-badge danger">Nonaktif</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Pesanan">
                    <span>{{ row.orderCount }} pesanan</span>
                  </td>
                  <td data-label="Total Qty">
                    <span class="badge-count">{{ row.totalQty.toLocaleString('id-ID') }} pcs</span>
                  </td>
                  <td data-label="Total Sisi">
                    <span class="gaji-sisi-badge">
                      {{ row.totalSisi.toLocaleString('id-ID') }} sisi
                    </span>
                  </td>
                  <td data-label="Borongan / Sisi">
                    <span v-if="row.boronganPerSisi > 0">
                      <strong>{{ formatRupiah(row.boronganPerSisi) }}</strong>
                      <span class="form-hint"> / sisi</span>
                    </span>
                    <span v-else class="form-hint">Rp 0 / sisi</span>
                  </td>
                  <td data-label="Total Gaji Borongan">
                    <span class="gaji-amount" :class="{ 'is-zero': row.totalGaji <= 0 }">
                      {{ formatRupiah(row.totalGaji) }}
                    </span>
                    <div v-if="row.totalSisi > 0 && row.boronganPerSisi > 0" class="form-hint" style="margin-top: 2px;">
                      {{ row.totalSisi.toLocaleString('id-ID') }} sisi &times; {{ formatRupiah(row.boronganPerSisi) }}
                    </div>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="gaji-total-row">
                  <td colspan="3" style="font-weight: 700;">
                    Total ({{ activeTimeRange.label }})
                  </td>
                  <td data-label="Total Qty">
                    <strong>{{ gajiGrandTotals.totalQty.toLocaleString('id-ID') }} pcs</strong>
                  </td>
                  <td data-label="Total Sisi">
                    <span class="gaji-sisi-badge">
                      {{ gajiGrandTotals.totalSisi.toLocaleString('id-ID') }} sisi
                    </span>
                  </td>
                  <td></td>
                  <td data-label="Total Gaji Borongan">
                    <span class="gaji-amount">{{ formatRupiah(gajiGrandTotals.totalGaji) }}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <table-pagination
            v-if="!loading && filteredGajiRows.length"
            :total-items="filteredGajiRows.length"
            :current-page="gajiPage"
            :page-size="gajiPageSize"
            @update:current-page="gajiPage = $event"
            @update:page-size="gajiPageSize = $event"
          ></table-pagination>
        </div>

        <!-- TAB 3: DAFTAR PENGAJUAN PERUBAHAN KONTRIBUSI -->
        <div v-else-if="activeTab === 'pengajuan'" class="card">
          <div class="panel-toolbar">
            <div class="panel-heading">
              <h2>Daftar Pengajuan Perubahan Kontribusi</h2>
              <p>Hanya menampilkan pengajuan yang melibatkan akun Anda (Superadmin melihat seluruh pengajuan). Persetujuan dilakukan oleh penyelesai pesanan atau Superadmin.</p>
            </div>

            <div class="panel-actions">
              <div class="search-box">
                <span class="material-symbols-rounded input-icon">search</span>
                <input
                  v-model="requestSearch"
                  type="text"
                  class="form-control"
                  placeholder="Cari pemesan, pengaju, alasan..."
                  aria-label="Cari pengajuan perubahan"
                />
                <button
                  v-if="requestSearch"
                  type="button"
                  class="input-action-btn"
                  aria-label="Hapus pencarian"
                  @click="requestSearch = ''"
                >
                  <span class="material-symbols-rounded" style="font-size: 18px;">close</span>
                </button>
              </div>

              <select v-model="requestStatusFilter" class="filter-select" aria-label="Filter status pengajuan">
                <option value="all">Semua Status</option>
                <option value="pending">Menunggu Persetujuan</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
              </select>
            </div>
          </div>

          <div v-if="loadingRequests" class="empty-state">
            <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
            <p>Memuat daftar pengajuan...</p>
          </div>

          <div v-else-if="!filteredRequests.length" class="empty-state">
            <div class="empty-state-icon">
              <span class="material-symbols-rounded">rule</span>
            </div>
            <h3>{{ (requestSearch || requestStatusFilter !== 'all') ? 'Pengajuan tidak ditemukan' : 'Belum ada pengajuan perubahan' }}</h3>
            <p>
              {{
                (requestSearch || requestStatusFilter !== 'all')
                  ? 'Coba ubah filter status atau kata kunci pencarian.'
                  : 'Pengajuan perubahan kontribusi yang melibatkan Anda akan muncul di sini.'
              }}
            </p>
          </div>

          <div v-else class="table-container">
            <table class="data-table responsive-table">
              <thead>
                <tr>
                  <th class="col-no">No</th>
                  <th>Pesanan &amp; Pengaju</th>
                  <th>Perubahan Kontribusi</th>
                  <th>Alasan Perubahan</th>
                  <th>Penyetuju</th>
                  <th>Status</th>
                  <th class="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(req, index) in paginatedRequests" :key="req.id">
                  <td class="col-no" data-label="No">
                    {{ (requestPageSize === 'all' ? 0 : (requestPage - 1) * Number(requestPageSize)) + index + 1 }}
                  </td>
                  <td data-label="Pesanan & Pengaju">
                    <div style="font-weight: 700;">{{ req.namaPemesan }}</div>
                    <div class="form-hint">
                      {{ req.namaProduk }} &bull; {{ req.jumlahProduk }} pcs
                      <span v-if="getRequestSisiCount(req) > 0">
                        ({{ getRequestSisiCount(req) }} sisi)
                      </span>
                    </div>
                    <div class="form-hint" style="margin-top: 4px;">
                      Pengaju: <strong>{{ req.requestedByName }}</strong> &bull; {{ formatDateTime(req.createdAt) }}
                    </div>
                  </td>
                  <td class="sisi-cell" data-label="Perubahan Kontribusi">
                    <div class="borongan-diff-block">
                      <div class="borongan-diff-row">
                        <span class="form-hint" style="min-width: 58px;">Lama:</span>
                        <div class="chips-wrap">
                          <span v-for="k in req.oldKontribusi" :key="'old_' + k.uid" class="chip">
                            {{ k.nama }}: {{ k.qty }} pcs
                            <span v-if="getRequestSisiCount(req) > 0" class="chip-sisi-sub">
                              ({{ (Number(k.qty) || 0) * getRequestSisiCount(req) }} sisi)
                            </span>
                          </span>
                        </div>
                      </div>
                      <div class="borongan-diff-row">
                        <span class="form-hint" style="min-width: 58px; color: var(--accent-info); font-weight: 600;">Usulan:</span>
                        <div class="chips-wrap">
                          <span
                            v-for="k in req.newKontribusi"
                            :key="'new_' + k.uid"
                            class="chip"
                            :class="{ 'is-me-chip': k.uid === currentUid }"
                          >
                            {{ k.nama }}: <strong>{{ k.qty }} pcs</strong>
                            <span v-if="getRequestSisiCount(req) > 0" class="chip-sisi-sub">
                              ({{ (Number(k.qty) || 0) * getRequestSisiCount(req) }} sisi)
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Alasan">
                    <span v-if="req.alasan" style="font-size: 13px;">{{ req.alasan }}</span>
                    <span v-else class="form-hint">(Tidak ada alasan)</span>
                    <div v-if="req.reviewNote" class="form-hint" style="margin-top: 4px; color: var(--accent-danger);">
                      Catatan penolakan: {{ req.reviewNote }}
                    </div>
                  </td>
                  <td data-label="Penyetuju">
                    <div style="font-size: 13px; font-weight: 600;">{{ req.completedByName || 'Superadmin' }}</div>
                    <div v-if="req.reviewedByName" class="form-hint">
                      Diproses: {{ req.reviewedByName }}
                    </div>
                  </td>
                  <td data-label="Status">
                    <span class="status-badge" :class="requestStatusMeta(req.status).cls">
                      <span class="material-symbols-rounded" style="font-size: 14px;">
                        {{ requestStatusMeta(req.status).icon }}
                      </span>
                      <span>{{ requestStatusMeta(req.status).label }}</span>
                    </span>
                  </td>
                  <td class="col-actions" data-label="Aksi">
                    <div v-if="canApproveOrReject(req)" class="action-group">
                      <button
                        type="button"
                        class="btn btn-success btn-sm"
                        :disabled="busyRequestId === req.id"
                        @click="handleApproveRequest(req)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">check</span>
                        <span>Setujui</span>
                      </button>
                      <button
                        type="button"
                        class="btn btn-danger btn-sm"
                        :disabled="busyRequestId === req.id"
                        @click="handleRejectRequest(req)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">close</span>
                        <span>Tolak</span>
                      </button>
                    </div>
                    <span v-else class="form-hint">
                      {{
                        req.status === 'pending'
                          ? 'Menunggu ' + (req.completedByName || 'Superadmin')
                          : formatDateTime(req.reviewedAt)
                      }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <table-pagination
            v-if="!loadingRequests && filteredRequests.length"
            :total-items="filteredRequests.length"
            :current-page="requestPage"
            :page-size="requestPageSize"
            @update:current-page="requestPage = $event"
            @update:page-size="requestPageSize = $event"
          ></table-pagination>
        </div>

        <!-- Modal Ajukan Perubahan Kontribusi -->
        <div
          v-if="changeModal.visible && changeModal.order"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeChangeModal"
        >
          <div class="modal-card">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">Ajukan Perubahan Kontribusi</h3>
                <div class="form-hint">
                  {{ changeModal.order.namaPemesan }} — {{ changeModal.order.namaProduk }}
                  ({{ changeTargetQty }} pcs &times; {{ changeModalSisiCount }} sisi = <strong>{{ changeTargetSisi }} sisi</strong>)
                </div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                :disabled="changeModal.saving"
                aria-label="Tutup modal"
                @click="closeChangeModal"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>

            <form @submit.prevent="submitChangeRequest">
              <div class="modal-body">
                <div v-if="changeModal.error" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ changeModal.error }}</div>
                </div>

                <div
                  class="kontribusi-summary-bar"
                  :class="{
                    over: changeDraftTotal > changeTargetQty,
                    complete: changeDraftTotal === changeTargetQty
                  }"
                >
                  <div class="kontribusi-summary-metrics">
                    <div>
                      <div style="font-size: 11.5px; opacity: 0.85;">Usulan Qty</div>
                      <div style="font-size: 16px; font-weight: 700;">
                        {{ changeDraftTotal }} / {{ changeTargetQty }} pcs
                      </div>
                    </div>
                    <div class="kontribusi-summary-divider"></div>
                    <div>
                      <div style="font-size: 11.5px; opacity: 0.85;">Total Sisi ({{ changeModalSisiCount }} sisi / pcs)</div>
                      <div style="font-size: 18px; font-weight: 800;">
                        {{ changeDraftTotalSisi }} / {{ changeTargetSisi }} sisi
                      </div>
                    </div>
                  </div>
                  <div style="text-align: right; font-size: 12.5px; font-weight: 600;">
                    <span v-if="changeDraftTotal === changeTargetQty">Total sesuai target</span>
                    <span v-else-if="changeDraftTotal > changeTargetQty">
                      Kelebihan +{{ changeDraftTotal - changeTargetQty }} pcs
                    </span>
                    <span v-else>
                      Kurang {{ changeTargetQty - changeDraftTotal }} pcs
                    </span>
                  </div>
                </div>

                <div class="kontribusi-list" style="margin-bottom: 14px;">
                  <div
                    v-for="row in changeModal.rows"
                    :key="row.uid"
                    class="kontribusi-row"
                  >
                    <div class="kontribusi-staff-info">
                      <strong>{{ row.nama }}</strong>
                      <span class="role-badge" :class="row.role">{{ row.role }}</span>
                    </div>
                    <div class="kontribusi-qty-wrap">
                      <span
                        class="kontribusi-sisi-calc"
                        :class="{ 'is-active': (parseInt(row.qty, 10) || 0) > 0 }"
                      >
                        <template v-if="(parseInt(row.qty, 10) || 0) > 0">
                          {{ Math.max(0, parseInt(row.qty, 10) || 0) }} &times; {{ changeModalSisiCount }} =
                          <strong>{{ Math.max(0, parseInt(row.qty, 10) || 0) * changeModalSisiCount }} sisi</strong>
                        </template>
                        <template v-else>0 sisi</template>
                      </span>
                      <input
                        v-model.number="row.qty"
                        type="number"
                        min="0"
                        :max="changeTargetQty"
                        step="1"
                        class="form-control kontribusi-qty-input"
                        :disabled="changeModal.saving"
                      />
                      <span class="form-hint">pcs</span>
                    </div>
                  </div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" for="borongan-alasan">
                    Alasan Perubahan (Opsional)
                  </label>
                  <textarea
                    id="borongan-alasan"
                    v-model="changeModal.alasan"
                    class="form-textarea"
                    placeholder="Contoh: Salah ketik pembagian qty antara karyawan 1 dan karyawan 2..."
                    :disabled="changeModal.saving"
                  ></textarea>
                </div>
              </div>

              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="changeModal.saving"
                  @click="closeChangeModal"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="changeModal.saving || changeDraftTotal !== changeTargetQty"
                >
                  <span v-if="changeModal.saving" class="spinner spinner-sm"></span>
                  <span>{{ changeModal.saving ? 'Mengirim...' : 'Ajukan Perubahan' }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `
  };
})(window);
