(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.MasterStatusShopeePanel = {
    name: 'MasterStatusShopeePanel',
    props: {
      statusShopeeList: {
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
        namaStatus: '',
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
        if (!q) return this.statusShopeeList;
        return this.statusShopeeList.filter(function (item) {
          return (item.namaStatus || '').toLowerCase().indexOf(q) !== -1;
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
        this.namaStatus = '';
        this.formError = '';
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.statusNameInput) {
            this.$refs.statusNameInput.focus();
          }
        });
      },
      openEditModal: function (item) {
        this.editingId = item.id;
        this.namaStatus = item.namaStatus || '';
        this.formError = '';
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.statusNameInput) {
            this.$refs.statusNameInput.focus();
          }
        });
      },
      closeModal: function () {
        if (this.saving) return;
        this.modalOpen = false;
      },
      saveStatus: async function () {
        this.formError = '';
        var cleanName = this.namaStatus.trim();
        if (!cleanName) {
          this.formError = 'Nama status pesanan Shopee wajib diisi.';
          return;
        }

        var duplicate = this.statusShopeeList.some(
          function (item) {
            return (
              item.id !== this.editingId &&
              (item.namaStatus || '').trim().toLowerCase() === cleanName.toLowerCase()
            );
          }.bind(this)
        );
        if (duplicate) {
          this.formError = 'Status "' + cleanName + '" sudah terdaftar.';
          return;
        }

        this.saving = true;
        try {
          if (this.editingId) {
            await global.ZcpMasterService.updateStatusShopee(this.editingId, {
              namaStatus: cleanName
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Status pesanan Shopee "' + cleanName + '" berhasil diperbarui.'
            });
          } else {
            await global.ZcpMasterService.addStatusShopee({
              namaStatus: cleanName
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Status pesanan Shopee "' + cleanName + '" berhasil ditambahkan.'
            });
          }
          this.modalOpen = false;
          this.$emit('changed');
        } catch (err) {
          this.formError =
            err && err.message ? err.message : 'Gagal menyimpan status pesanan Shopee.';
        } finally {
          this.saving = false;
        }
      },
      confirmDelete: function (item) {
        var self = this;
        this.$emit('request-confirm', {
          title: 'Hapus Status Pesanan Shopee',
          message:
            'Hapus status "' +
            item.namaStatus +
            '" dari master data? Pesanan lama yang sudah memakai status ini tetap menyimpannya.',
          confirmText: 'Hapus Status',
          variant: 'danger',
          onConfirm: async function () {
            await global.ZcpMasterService.deleteStatusShopee(item.id, item.namaStatus);
            self.$emit('changed');
            self.$emit('notify', {
              type: 'success',
              message: 'Status pesanan Shopee "' + item.namaStatus + '" berhasil dihapus.'
            });
          }
        });
      }
    },
    template: `
      <div class="card">
        <div class="panel-toolbar">
          <div class="panel-heading">
            <h2>Master Status Pesanan Shopee</h2>
            <p>Atur daftar status pesanan Shopee seperti Pesanan Belum Diproses, Telah Diproses, dan lainnya.</p>
          </div>

          <div class="panel-actions">
            <div class="search-box">
              <span class="material-symbols-rounded input-icon">search</span>
              <input
                v-model="searchQuery"
                type="text"
                class="form-control"
                placeholder="Cari status Shopee..."
                aria-label="Cari status pesanan Shopee"
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
              <span>Tambah Status</span>
            </button>
          </div>
        </div>

        <div v-if="loading" class="empty-state">
          <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
          <p>Memuat data status pesanan Shopee...</p>
        </div>

        <div v-else-if="!filteredList.length" class="empty-state">
          <div class="empty-state-icon">
            <span class="material-symbols-rounded">local_mall</span>
          </div>
          <h3>{{ searchQuery ? 'Status tidak ditemukan' : 'Belum ada Status Pesanan Shopee' }}</h3>
          <p>
            {{
              searchQuery
                ? 'Coba kata kunci pencarian lain atau bersihkan filter.'
                : 'Tambahkan status seperti Pesanan Belum Diproses, Telah Diproses, Menunggu Pickup, atau Dikirim.'
            }}
          </p>
          <button v-if="!searchQuery" type="button" class="btn btn-primary" @click="openAddModal">
            <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
            <span>Tambah Status Pertama</span>
          </button>
        </div>

        <div v-else class="table-container">
          <table class="data-table responsive-table">
            <thead>
              <tr>
                <th class="col-no">No</th>
                <th>Nama Status Shopee</th>
                <th>Dibuat</th>
                <th class="col-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in paginatedList" :key="item.id">
                <td class="col-no" data-label="No">
                  {{ (localPageSize === 'all' ? 0 : (currentPage - 1) * Number(localPageSize)) + index + 1 }}
                </td>
                <td data-label="Nama Status Shopee">
                  <div class="item-title-cell">
                    <span class="item-mini-icon">
                      <span class="material-symbols-rounded" style="font-size: 18px;">local_mall</span>
                    </span>
                    <span>{{ item.namaStatus }}</span>
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

        <!-- Modal Tambah / Edit Status Pesanan Shopee -->
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
                {{ editingId ? 'Edit Status Pesanan Shopee' : 'Tambah Status Pesanan Shopee' }}
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

            <form @submit.prevent="saveStatus">
              <div class="modal-body">
                <div v-if="formError" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ formError }}</div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" for="status-shopee-nama">
                    Nama Status Shopee <span class="required">*</span>
                  </label>
                  <input
                    id="status-shopee-nama"
                    ref="statusNameInput"
                    v-model="namaStatus"
                    type="text"
                    class="form-control"
                    placeholder="Contoh: Pesanan Belum Diproses, Telah Diproses"
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
                  <span>{{ saving ? 'Menyimpan...' : (editingId ? 'Simpan Perubahan' : 'Simpan Status') }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `
  };
})(window);
