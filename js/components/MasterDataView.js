(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.MasterDataView = {
    name: 'MasterDataView',
    components: {
      MasterProdukPanel: global.ZcpComponents.MasterProdukPanel,
      MasterExpedisiPanel: global.ZcpComponents.MasterExpedisiPanel
    },
    props: {
      produkList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      expedisiList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      loadingProduk: { type: Boolean, default: false },
      loadingExpedisi: { type: Boolean, default: false },
      defaultPageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: ['notify', 'request-confirm', 'refresh-produk', 'refresh-expedisi'],
    data: function () {
      return {
        activeTab: 'produk'
      };
    },
    computed: {
      totalSisi: function () {
        return this.produkList.reduce(function (sum, item) {
          return sum + (Array.isArray(item.namaSisi) ? item.namaSisi.length : 0);
        }, 0);
      }
    },
    template: `
      <div>
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Total Produk</div>
                <div class="kpi-value">{{ produkList.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">checkroom</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span class="kpi-highlight">Aktif</span> di master data produk
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Total Sisi Terdaftar</div>
                <div class="kpi-value">{{ totalSisi }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">layers</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Opsi sisi untuk dipilih pada pesanan
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Total Expedisi</div>
                <div class="kpi-value">{{ expedisiList.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">local_shipping</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              <span class="kpi-highlight">Siap pakai</span> untuk pengiriman order
            </div>
          </div>
        </div>

        <div class="tabs-bar" role="tablist" aria-label="Kategori Master Data">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'produk'"
            class="tab-btn"
            :class="{ active: activeTab === 'produk' }"
            @click="activeTab = 'produk'"
          >
            <span class="material-symbols-rounded" style="font-size: 19px;">checkroom</span>
            <span>Master Produk</span>
            <span class="tab-count">{{ produkList.length }}</span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'expedisi'"
            class="tab-btn"
            :class="{ active: activeTab === 'expedisi' }"
            @click="activeTab = 'expedisi'"
          >
            <span class="material-symbols-rounded" style="font-size: 19px;">local_shipping</span>
            <span>Master Expedisi</span>
            <span class="tab-count">{{ expedisiList.length }}</span>
          </button>
        </div>

        <master-produk-panel
          v-if="activeTab === 'produk'"
          :produk-list="produkList"
          :loading="loadingProduk"
          :default-page-size="defaultPageSize"
          @notify="$emit('notify', $event)"
          @request-confirm="$emit('request-confirm', $event)"
          @changed="$emit('refresh-produk')"
        ></master-produk-panel>

        <master-expedisi-panel
          v-else
          :expedisi-list="expedisiList"
          :loading="loadingExpedisi"
          :default-page-size="defaultPageSize"
          @notify="$emit('notify', $event)"
          @request-confirm="$emit('request-confirm', $event)"
          @changed="$emit('refresh-expedisi')"
        ></master-expedisi-panel>
      </div>
    `
  };
})(window);
