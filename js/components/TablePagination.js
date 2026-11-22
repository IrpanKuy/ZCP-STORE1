(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.TablePagination = {
    name: 'TablePagination',
    props: {
      totalItems: { type: Number, default: 0 },
      currentPage: { type: Number, default: 1 },
      pageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: ['update:current-page', 'update:page-size'],
    watch: {
      totalPages: function (val) {
        if (this.currentPage > val) {
          this.$emit('update:current-page', Math.max(1, val));
        }
      }
    },
    computed: {
      isAll: function () {
        return this.pageSize === 'all';
      },
      numericSize: function () {
        if (this.isAll) return Math.max(1, this.totalItems);
        var n = Number(this.pageSize);
        return n > 0 ? n : 10;
      },
      totalPages: function () {
        if (this.isAll || this.totalItems <= 0) return 1;
        return Math.max(1, Math.ceil(this.totalItems / this.numericSize));
      },
      safePage: function () {
        return Math.min(Math.max(1, this.currentPage), this.totalPages);
      },
      startItem: function () {
        if (this.totalItems <= 0) return 0;
        if (this.isAll) return 1;
        return (this.safePage - 1) * this.numericSize + 1;
      },
      endItem: function () {
        if (this.totalItems <= 0) return 0;
        if (this.isAll) return this.totalItems;
        return Math.min(this.totalItems, this.safePage * this.numericSize);
      },
      visiblePages: function () {
        var total = this.totalPages;
        var curr = this.safePage;
        var pages = [];
        var start = Math.max(1, curr - 2);
        var end = Math.min(total, curr + 2);
        if (end - start < 4) {
          if (start === 1) {
            end = Math.min(total, start + 4);
          } else if (end === total) {
            start = Math.max(1, end - 4);
          }
        }
        for (var i = start; i <= end; i++) {
          pages.push(i);
        }
        return pages;
      }
    },
    methods: {
      onSizeChange: function (event) {
        var raw = event && event.target ? event.target.value : '10';
        var nextSize = raw === 'all' ? 'all' : Number(raw);
        this.$emit('update:page-size', nextSize);
        this.$emit('update:current-page', 1);
      },
      goToPage: function (p) {
        if (p < 1 || p > this.totalPages || p === this.safePage) return;
        this.$emit('update:current-page', p);
      }
    },
    template: `
      <div v-if="totalItems > 0" class="pagination-bar">
        <div class="pagination-left">
          <span class="pagination-info">
            Menampilkan <strong>{{ startItem }}-{{ endItem }}</strong> dari <strong>{{ totalItems }}</strong> data
          </span>
          <label class="pagination-size-label">
            <span>Tampilkan:</span>
            <select
              class="filter-select pagination-select"
              :value="String(pageSize)"
              aria-label="Jumlah data per halaman"
              @change="onSizeChange"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="all">Semua</option>
            </select>
          </label>
        </div>

        <div v-if="!isAll && totalPages > 1" class="pagination-controls">
          <button
            type="button"
            class="page-btn"
            :disabled="safePage <= 1"
            aria-label="Halaman sebelumnya"
            @click="goToPage(safePage - 1)"
          >
            <span class="material-symbols-rounded" style="font-size: 18px;">chevron_left</span>
          </button>

          <button
            v-for="p in visiblePages"
            :key="p"
            type="button"
            class="page-btn"
            :class="{ active: p === safePage }"
            @click="goToPage(p)"
          >
            {{ p }}
          </button>

          <button
            type="button"
            class="page-btn"
            :disabled="safePage >= totalPages"
            aria-label="Halaman berikutnya"
            @click="goToPage(safePage + 1)"
          >
            <span class="material-symbols-rounded" style="font-size: 18px;">chevron_right</span>
          </button>
        </div>
      </div>
    `
  };
})(window);
