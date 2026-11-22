(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.MasterExpedisiPanel = {
    name: 'MasterExpedisiPanel',
    props: {
      expedisiList: {
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
        namaExpedisi: '',
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
        if (!q) return this.expedisiList;
        return this.expedisiList.filter(function (item) {
          return (item.namaExpedisi || '').toLowerCase().indexOf(q) !== -1;
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
        this.namaExpedisi = '';
        this.formError = '';
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.expedisiNameInput) {
            this.$refs.expedisiNameInput.focus();
          }
        });
      },
      openEditModal: function (item) {
        this.editingId = item.id;
        this.namaExpedisi = item.namaExpedisi || '';
        this.formError = '';
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.expedisiNameInput) {
            this.$refs.expedisiNameInput.focus();
          }
        });
      },
      closeModal: function () {
        if (this.saving) return;
        this.modalOpen = false;
      },
      saveExpedisi: async function () {
        this.formError = '';
        var cleanName = this.namaExpedisi.trim();
        if (!cleanName) {
          this.formError = 'Nama expedisi wajib diisi.';
          return;
        }

        var duplicate = this.expedisiList.some(
          function (item) {
            return (
              item.id !== this.editingId &&
              (item.namaExpedisi || '').trim().toLowerCase() === cleanName.toLowerCase()
            );
          }.bind(this)
        );
        if (duplicate) {
          this.formError = 'Expedisi "' + cleanName + '" sudah terdaftar.';
          return;
        }

        this.saving = true;
        try {
          if (this.editingId) {
            await global.ZcpMasterService.updateExpedisi(this.editingId, {
              namaExpedisi: cleanName
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Expedisi "' + cleanName + '" berhasil diperbarui.'
            });
          } else {
            await global.ZcpMasterService.addExpedisi({
              namaExpedisi: cleanName
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Expedisi "' + cleanName + '" berhasil ditambahkan.'
            });
          }
          this.modalOpen = false;
          this.$emit('changed');
        } catch (err) {
          this.formError = err && err.message ? err.message : 'Gagal menyimpan data expedisi.';
        } finally {
          this.saving = false;
        }
      },
      confirmDelete: function (item) {
        var self = this;
        this.$emit('request-confirm', {
          title: 'Hapus Expedisi',
          message:
            'Hapus expedisi "' +
            item.namaExpedisi +
            '" dari master data? Pesanan lama tetap menyimpan riwayat expedisinya.',
          confirmText: 'Hapus Expedisi',
          variant: 'danger',
          onConfirm: async function () {
            await global.ZcpMasterService.deleteExpedisi(item.id, item.namaExpedisi);
            self.$emit('changed');
            self.$emit('notify', {
              type: 'success',
              message: 'Expedisi "' + item.namaExpedisi + '" berhasil dihapus.'
            });
          }
        });
      }
    },
    template: `
      <div class="card">
        <div class="panel-toolbar">
          <div class="panel-heading">
            <h2>Master Data Expedisi</h2>
            <p>Daftar jasa pengiriman yang digunakan pada data pesanan.</p>
          </div>

          <div class="panel-actions">
            <div class="search-box">
              <span class="material-symbols-rounded input-icon">search</span>
              <input
                v-model="searchQuery"
                type="text"
                class="form-control"
                placeholder="Cari nama expedisi..."
                aria-label="Cari expedisi"
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
              <span>Tambah Expedisi</span>
            </button>
          </div>
        </div>

        <div v-if="loading" class="empty-state">
          <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
          <p>Memuat data expedisi...</p>
        </div>

        <div v-else-if="!filteredList.length" class="empty-state">
          <div class="empty-state-icon">
            <span class="material-symbols-rounded">local_shipping</span>
          </div>
          <h3>{{ searchQuery ? 'Expedisi tidak ditemukan' : 'Belum ada Master Expedisi' }}</h3>
          <p>
            {{
              searchQuery
                ? 'Coba kata kunci pencarian lain atau bersihkan filter.'
                : 'Tambahkan daftar expedisi seperti J&T, SPX, JNE, SiCepat, atau Ambil Sendiri.'
            }}
          </p>
          <button v-if="!searchQuery" type="button" class="btn btn-primary" @click="openAddModal">
            <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
            <span>Tambah Expedisi Pertama</span>
          </button>
        </div>

        <div v-else class="table-container">
          <table class="data-table responsive-table">
            <thead>
              <tr>
                <th class="col-no">No</th>
                <th>Nama Expedisi</th>
                <th>Dibuat</th>
                <th class="col-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in paginatedList" :key="item.id">
                <td class="col-no" data-label="No">
                  {{ (localPageSize === 'all' ? 0 : (currentPage - 1) * Number(localPageSize)) + index + 1 }}
                </td>
                <td data-label="Nama Expedisi">
                  <div class="item-title-cell">
                    <span class="item-mini-icon">
                      <span class="material-symbols-rounded" style="font-size: 18px;">local_shipping</span>
                    </span>
                    <span>{{ item.namaExpedisi }}</span>
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

        <!-- Modal Tambah / Edit Expedisi -->
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
                {{ editingId ? 'Edit Master Expedisi' : 'Tambah Master Expedisi' }}
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

            <form @submit.prevent="saveExpedisi">
              <div class="modal-body">
                <div v-if="formError" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ formError }}</div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" for="expedisi-nama">
                    Nama Expedisi <span class="required">*</span>
                  </label>
                  <input
                    id="expedisi-nama"
                    ref="expedisiNameInput"
                    v-model="namaExpedisi"
                    type="text"
                    class="form-control"
                    placeholder="Contoh: J&T Express, SPX, JNE"
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
                  <span>{{ saving ? 'Menyimpan...' : (editingId ? 'Simpan Perubahan' : 'Simpan Expedisi') }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `
  };
})(window);
