(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  var PAGE_META = {
    dashboard: {
      title: 'Dashboard Ringkasan',
      icon: 'dashboard',
      desc: 'Menampilkan ringkasan pesanan aktif, pesanan mendekati deadline, sablon dalam proses, dan pesanan selesai.'
    },
    pesanan: {
      title: 'Manajemen Pesanan',
      icon: 'shopping_bag',
      desc: 'CRUD data pesanan dengan pilihan produk & sisi dari Master Data, multi-upload file desain, dan pilihan expedisi.'
    },
    operasional: {
      title: 'Fitur Operasional',
      icon: 'event_note',
      desc: 'Penjadwalan tanggal mulai & deadline (termasuk bulk update), indikator progres sisi sablon, serta penanda pesanan selesai.'
    },
    sablon: {
      title: 'Manajemen Sablon',
      icon: 'print',
      desc: 'Input batch sablon multi-pesanan, jumlah per sisi, upload file sablon, dan child-row checklist perulangan.'
    }
  };

  global.ZcpComponents.ComingSoonView = {
    name: 'ComingSoonView',
    props: {
      pageKey: { type: String, default: 'operasional' }
    },
    emits: ['go-dashboard'],
    computed: {
      meta: function () {
        return PAGE_META[this.pageKey] || PAGE_META.operasional;
      }
    },
    template: `
      <div class="card coming-soon-card">
        <div class="coming-soon-badge">
          <span class="material-symbols-rounded" style="font-size: 16px;">construction</span>
          <span>Disiapkan untuk Tahap 3</span>
        </div>
        <div class="empty-state-icon" style="margin-bottom: 16px;">
          <span class="material-symbols-rounded">{{ meta.icon }}</span>
        </div>
        <h2>{{ meta.title }}</h2>
        <p>{{ meta.desc }}</p>
        <button type="button" class="btn btn-primary" @click="$emit('go-dashboard')">
          <span class="material-symbols-rounded" style="font-size: 18px;">arrow_back</span>
          <span>Kembali ke Dashboard</span>
        </button>
      </div>
    `
  };
})(window);
