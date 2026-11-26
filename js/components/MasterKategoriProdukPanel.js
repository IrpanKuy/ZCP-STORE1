(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.MasterKategoriProdukPanel = {
    name: 'MasterKategoriProdukPanel',
    props: {
      kategoriList: {
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
        namaKategori: '',
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
        if (!q) return this.kategoriList;
        return this.kategoriList.filter(function (item) {
          return (item.namaKategori || '').toLowerCase().indexOf(q) !== -1;
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
        this.namaKategori = '';
        this.formError = '';
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.kategoriNameInput) {
            this.$refs.kategoriNameInput.focus();
          }
        });
      },
      openEditModal: function (item) {
        this.editingId = item.id;
        this.namaKategori = item.namaKategori || '';
        this.formError = '';
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.kategoriNameInput) {
            this.$refs.kategoriNameInput.focus();
          }
        });
      },
      closeModal: function () {
        if (this.saving) return;
        this.modalOpen = false;
      },
      saveKategori: async function () {
        this.formError = '';
        var cleanName = this.namaKategori.trim();
        if (!cleanName) {
          this.formError = 'Nama kategori produk wajib diisi.';
          return;
        }

        var duplicate = this.kategoriList.some(
          function (item) {
            return (
              item.id !== this.editingId &&
              (item.namaKategori || '').trim().toLowerCase() === cleanName.toLowerCase()
            );
          }.bind(this)
        );
        if (duplicate) {
          this.formError = 'Kategori produk "' + cleanName + '" sudah terdaftar.';
          return;
        }

        this.saving = true;
        try {
          if (this.editingId) {
            await global.ZcpMasterService.updateKategoriProduk(this.editingId, {
              namaKategori: cleanName
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Kategori produk "' + cleanName + '" berhasil diperbarui.'
            });
          } else {
            await global.ZcpMasterService.addKategoriProduk({
              namaKategori: cleanName
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Kategori produk "' + cleanName + '" berhasil ditambahkan.'
            });
          }
          this.modalOpen = false;
          this.$emit('changed');
        } catch (err) {
          this.formError = err && err.message ? err.message : 'Gagal menyimpan kategori produk.';
        } finally {
          this.saving = false;
        }
      },
      confirmDelete: function (item) {
        var self = this;
        this.$emit('request-confirm', {
          title: 'Hapus Kategori Produk',
          message:
            'Hapus kategori "' +
            item.namaKategori +
            '" dari master data? Produk yang sudah terhubung tetap menyimpan nama kategori lamanya.',
          confirmText: 'Hapus Kategori',
          variant: 'danger',
          onConfirm: async function () {
            await global.ZcpMasterService.deleteKategoriProduk(item.id, item.namaKategori);
            self.$emit('changed');
            self.$emit('notify', {
              type: 'success',
              message: 'Kategori produk "' + item.namaKategori + '" berhasil dihapus.'
            });
          }
        });
      }
    },
    template: `
      <div class="card">
        <div class="panel-toolbar">
          <div class="panel-heading">
            <h2>Master Kategori Produk</h2>
            <p>Kelompokkan jenis produk seperti Payung, Rompi, Hoodie, atau Kaos untuk memudahkan filter data.</p>
          </div>

          <div class="panel-actions">
            <div class="search-box">
              <span class="material-symbols-rounded input-icon">search</span>
              <input
                v-model="searchQuery"
                type="text"
                class="form-control"
                placeholder="Cari kategori produk..."
                aria-label="Cari kategori produk"
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
              <span>Tambah Kategori</span>
            </button>
          </div>
        </div>

        <div v-if="loading" class="empty-state">
          <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
          <p>Memuat data kategori produk...</p>
        </div>

        <div v-else-if="!filteredList.length" class="empty-state">
          <div class="empty-state-icon">
            <span class="material-symbols-rounded">category</span>
          </div>
          <h3>{{ searchQuery ? 'Kategori produk tidak ditemukan' : 'Belum ada Kategori Produk' }}</h3>
          <p>
            {{
              searchQuery
                ? 'Coba kata kunci pencarian lain atau bersihkan filter.'
                : 'Tambahkan kategori produk seperti Payung, Rompi, Hoodie, atau Kaos.'
            }}
          </p>
          <button v-if="!searchQuery" type="button" class="btn btn-primary" @click="openAddModal">
            <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
            <span>Tambah Kategori Pertama</span>
          </button>
        </div>

        <div v-else class="table-container">
          <table class="data-table responsive-table">
            <thead>
              <tr>
                <th class="col-no">No</th>
                <th>Nama Kategori</th>
                <th>Dibuat</th>
                <th class="col-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in paginatedList" :key="item.id">
                <td class="col-no" data-label="No">
                  {{ (localPageSize === 'all' ? 0 : (currentPage - 1) * Number(localPageSize)) + index + 1 }}
                </td>
                <td data-label="Nama Kategori">
                  <div class="item-title-cell">
                    <span class="item-mini-icon">
                      <span class="material-symbols-rounded" style="font-size: 18px;">category</span>
                    </span>
                    <span>{{ item.namaKategori }}</span>
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

        <!-- Modal Tambah / Edit Kategori Produk -->
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
                {{ editingId ? 'Edit Kategori Produk' : 'Tambah Kategori Produk' }}
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

            <form @submit.prevent="saveKategori">
              <div class="modal-body">
                <div v-if="formError" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ formError }}</div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" for="kategori-produk-nama">
                    Nama Kategori Produk <span class="required">*</span>
                  </label>
                  <input
                    id="kategori-produk-nama"
                    ref="kategoriNameInput"
                    v-model="namaKategori"
                    type="text"
                    class="form-control"
                    placeholder="Contoh: Payung, Rompi, Hoodie"
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
                  <span>{{ saving ? 'Menyimpan...' : (editingId ? 'Simpan Perubahan' : 'Simpan Kategori') }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `
  };
})(window);
