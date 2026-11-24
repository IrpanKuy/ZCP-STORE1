(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.MasterDataView = {
    name: 'MasterDataView',
    components: {
      MasterProdukPanel: global.ZcpComponents.MasterProdukPanel,
      MasterExpedisiPanel: global.ZcpComponents.MasterExpedisiPanel,
      MasterAsalPesananPanel: global.ZcpComponents.MasterAsalPesananPanel
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
      asalPesananList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      loadingProduk: { type: Boolean, default: false },
      loadingExpedisi: { type: Boolean, default: false },
      loadingAsalPesanan: { type: Boolean, default: false },
      defaultPageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: [
      'notify',
      'request-confirm',
      'refresh-produk',
      'refresh-expedisi',
      'refresh-asal-pesanan'
    ],
    data: function () {
      return {
        activeTab: 'produk'
      };
    },
    computed: {
      totalTemplateCount: function () {
        return this.produkList.reduce(function (sum, item) {
          var tpls =
            global.ZcpMasterService && global.ZcpMasterService.normalizeTemplateSisiList
              ? global.ZcpMasterService.normalizeTemplateSisiList(
                  item.templateSisi,
                  item.namaSisi
                )
              : Array.isArray(item.templateSisi)
              ? item.templateSisi
              : [];
          return sum + tpls.length;
        }, 0);
      }
    },
    template: `
      <div>
        <div class="kpi-grid kpi-grid-4">
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
                <div class="kpi-label">Template Sisi</div>
                <div class="kpi-value">{{ totalTemplateCount }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">layers</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Template sisi siap dipilih pada pesanan
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

          <div class="kpi-card">
            <div class="kpi-top">
              <div>
                <div class="kpi-label">Asal Pesanan</div>
                <div class="kpi-value">{{ asalPesananList.length }}</div>
              </div>
              <div class="kpi-icon-box">
                <span class="material-symbols-rounded">storefront</span>
              </div>
            </div>
            <div class="kpi-divider"></div>
            <div class="kpi-footer">
              Saluran masuk pesanan (Offline/Marketplace)
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

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'asal-pesanan'"
            class="tab-btn"
            :class="{ active: activeTab === 'asal-pesanan' }"
            @click="activeTab = 'asal-pesanan'"
          >
            <span class="material-symbols-rounded" style="font-size: 19px;">storefront</span>
            <span>Master Asal Pesanan</span>
            <span class="tab-count">{{ asalPesananList.length }}</span>
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
          v-else-if="activeTab === 'expedisi'"
          :expedisi-list="expedisiList"
          :loading="loadingExpedisi"
          :default-page-size="defaultPageSize"
          @notify="$emit('notify', $event)"
          @request-confirm="$emit('request-confirm', $event)"
          @changed="$emit('refresh-expedisi')"
        ></master-expedisi-panel>

        <master-asal-pesanan-panel
          v-else
          :asal-pesanan-list="asalPesananList"
          :loading="loadingAsalPesanan"
          :default-page-size="defaultPageSize"
          @notify="$emit('notify', $event)"
          @request-confirm="$emit('request-confirm', $event)"
          @changed="$emit('refresh-asal-pesanan')"
        ></master-asal-pesanan-panel>
      </div>
    `
  };
})(window);
