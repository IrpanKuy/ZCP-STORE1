(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.MasterAsalPesananPanel = {
    name: 'MasterAsalPesananPanel',
    props: {
      asalPesananList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      loading: { type: Boolean, default: false },
      defaultPageSize: {
        type: [Number, String],
        default: 10
      }
    },
    emits: ['notify', 'request-confirm', 'changed'],
    data: function () {
      return {
        searchQuery: '',
        currentPage: 1,
        localPageSize: this.defaultPageSize,
        modalOpen: false,
        editingId: null,
        namaAsal: '',
        formError: '',
        saving: false
      };
    },
    watch: {
      defaultPageSize: function (val) {
        this.localPageSize = val;
        this.currentPage = 1;
      },
      searchQuery: function () {
        this.currentPage = 1;
      }
    },
    computed: {
      filteredList: function () {
        var q = this.searchQuery.trim().toLowerCase();
        if (!q) return this.asalPesananList;
        return this.asalPesananList.filter(function (item) {
          return (item.namaAsal || '').toLowerCase().indexOf(q) !== -1;
        });
      },
      paginatedList: function () {
        if (this.localPageSize === 'all') return this.filteredList;
        var size = Number(this.localPageSize) || 10;
        var start = (this.currentPage - 1) * size;
        return this.filteredList.slice(start, start + size);
      }
    },
    methods: {
      formatDate: function (ts) {
        return global.ZcpMasterService.formatDate(ts);
      },
      openAddModal: function () {
        this.editingId = null;
        this.namaAsal = '';
        this.formError = '';
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.asalNameInput) {
            this.$refs.asalNameInput.focus();
          }
        });
      },
      openEditModal: function (item) {
        this.editingId = item.id;
        this.namaAsal = item.namaAsal || '';
        this.formError = '';
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.asalNameInput) {
            this.$refs.asalNameInput.focus();
          }
        });
      },
      closeModal: function () {
        if (this.saving) return;
        this.modalOpen = false;
      },
      saveAsalPesanan: async function () {
        this.formError = '';
        var cleanName = this.namaAsal.trim();
        if (!cleanName) {
          this.formError = 'Nama asal pesanan wajib diisi.';
          return;
        }

        var duplicate = this.asalPesananList.some(
          function (item) {
            return (
              item.id !== this.editingId &&
              (item.namaAsal || '').trim().toLowerCase() === cleanName.toLowerCase()
            );
          }.bind(this)
        );
        if (duplicate) {
          this.formError = 'Asal pesanan "' + cleanName + '" sudah terdaftar.';
          return;
        }

        this.saving = true;
        try {
          if (this.editingId) {
            await global.ZcpMasterService.updateAsalPesanan(this.editingId, {
              namaAsal: cleanName
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Asal pesanan "' + cleanName + '" berhasil diperbarui.'
            });
          } else {
            await global.ZcpMasterService.addAsalPesanan({
              namaAsal: cleanName
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Asal pesanan "' + cleanName + '" berhasil ditambahkan.'
            });
          }
          this.modalOpen = false;
          this.$emit('changed');
        } catch (err) {
          this.formError = err && err.message ? err.message : 'Gagal menyimpan data asal pesanan.';
        } finally {
          this.saving = false;
        }
      },
      confirmDelete: function (item) {
        var self = this;
        this.$emit('request-confirm', {
          title: 'Hapus Asal Pesanan',
          message:
            'Hapus asal pesanan "' +
            item.namaAsal +
            '" dari master data? Pesanan lama tetap menyimpan riwayat asal pesanannya.',
          confirmText: 'Hapus Asal Pesanan',
          variant: 'danger',
          onConfirm: async function () {
            await global.ZcpMasterService.deleteAsalPesanan(item.id, item.namaAsal);
            self.$emit('changed');
            self.$emit('notify', {
              type: 'success',
              message: 'Asal pesanan "' + item.namaAsal + '" berhasil dihapus.'
            });
          }
        });
      }
    },
    template: `
      <div class="card">
        <div class="panel-toolbar">
          <div class="panel-heading">
            <h2>Master Data Asal Pesanan</h2>
            <p>Daftar sumber pesanan pelanggan seperti Offline, Shopee, Tokopedia, atau WhatsApp.</p>
          </div>

          <div class="panel-actions">
            <div class="search-box">
              <span class="material-symbols-rounded input-icon">search</span>
              <input
                v-model="searchQuery"
                type="text"
                class="form-control"
                placeholder="Cari asal pesanan..."
                aria-label="Cari asal pesanan"
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

            <button type="button" class="btn btn-primary" @click="openAddModal">
              <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
              <span>Tambah Asal Pesanan</span>
            </button>
          </div>
        </div>

        <div v-if="loading" class="empty-state">
          <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
          <p>Memuat data asal pesanan...</p>
        </div>

        <div v-else-if="!filteredList.length" class="empty-state">
          <div class="empty-state-icon">
            <span class="material-symbols-rounded">storefront</span>
          </div>
          <h3>{{ searchQuery ? 'Asal pesanan tidak ditemukan' : 'Belum ada Master Asal Pesanan' }}</h3>
          <p>
            {{
              searchQuery
                ? 'Coba kata kunci pencarian lain atau bersihkan filter.'
                : 'Tambahkan daftar asal pesanan seperti Offline, Shopee, Tokopedia, atau TikTok Shop.'
            }}
          </p>
          <button v-if="!searchQuery" type="button" class="btn btn-primary" @click="openAddModal">
            <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
            <span>Tambah Asal Pesanan Pertama</span>
          </button>
        </div>

        <div v-else class="table-container">
          <table class="data-table responsive-table">
            <thead>
              <tr>
                <th class="col-no">No</th>
                <th>Nama Asal Pesanan</th>
                <th>Dibuat</th>
                <th class="col-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in paginatedList" :key="item.id">
                <td class="col-no" data-label="No">
                  {{ (localPageSize === 'all' ? 0 : (currentPage - 1) * Number(localPageSize)) + index + 1 }}
                </td>
                <td data-label="Nama Asal Pesanan">
                  <div class="item-title-cell">
                    <span class="item-mini-icon">
                      <span class="material-symbols-rounded" style="font-size: 18px;">storefront</span>
                    </span>
                    <span>{{ item.namaAsal }}</span>
                  </div>
                </td>
                <td data-label="Dibuat">{{ formatDate(item.createdAt) }}</td>
                <td class="col-actions" data-label="Aksi">
                  <div class="action-group">
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="openEditModal(item)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 16px;">edit</span>
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-danger btn-sm"
                      @click="confirmDelete(item)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 16px;">delete</span>
                      <span>Hapus</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <table-pagination
          v-if="!loading && filteredList.length"
          :total-items="filteredList.length"
          :current-page="currentPage"
          :page-size="localPageSize"
          @update:current-page="currentPage = $event"
          @update:page-size="localPageSize = $event"
        ></table-pagination>

        <!-- Modal Tambah / Edit Asal Pesanan -->
        <div
          v-if="modalOpen"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeModal"
        >
          <div class="modal-card" style="max-width: 460px;">
            <div class="modal-header">
              <h3 class="modal-title">
                {{ editingId ? 'Edit Asal Pesanan' : 'Tambah Asal Pesanan' }}
              </h3>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                :disabled="saving"
                aria-label="Tutup modal"
                @click="closeModal"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>

            <form @submit.prevent="saveAsalPesanan">
              <div class="modal-body">
                <div v-if="formError" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ formError }}</div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" for="asal-pesanan-nama">
                    Nama Asal Pesanan <span class="required">*</span>
                  </label>
                  <input
                    id="asal-pesanan-nama"
                    ref="asalNameInput"
                    v-model="namaAsal"
                    type="text"
                    class="form-control"
                    placeholder="Contoh: Offline, Shopee, Tokopedia"
                    :disabled="saving"
                    required
                  />
                </div>
              </div>

              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="saving"
                  @click="closeModal"
                >
                  Batal
                </button>
                <button type="submit" class="btn btn-primary" :disabled="saving">
                  <span v-if="saving" class="spinner spinner-sm"></span>
                  <span>{{ saving ? 'Menyimpan...' : (editingId ? 'Simpan Perubahan' : 'Simpan Asal Pesanan') }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `
  };
})(window);
