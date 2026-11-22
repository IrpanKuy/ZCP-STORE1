(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  var sisiCounter = 1;
  function makeSisiRow(value) {
    sisiCounter += 1;
    return { id: sisiCounter, value: value || '' };
  }

  global.ZcpComponents.MasterProdukPanel = {
    name: 'MasterProdukPanel',
    props: {
      produkList: {
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
        namaProduk: '',
        sisiRows: [makeSisiRow('')],
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
        if (!q) return this.produkList;
        return this.produkList.filter(function (item) {
          var matchNama = (item.namaProduk || '').toLowerCase().indexOf(q) !== -1;
          var matchSisi =
            Array.isArray(item.namaSisi) &&
            item.namaSisi.some(function (sisi) {
              return String(sisi).toLowerCase().indexOf(q) !== -1;
            });
          return matchNama || matchSisi;
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
        this.namaProduk = '';
        this.sisiRows = [makeSisiRow('Depan'), makeSisiRow('Belakang')];
        this.formError = '';
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.produkNameInput) {
            this.$refs.produkNameInput.focus();
          }
        });
      },
      openEditModal: function (item) {
        this.editingId = item.id;
        this.namaProduk = item.namaProduk || '';
        var rows = Array.isArray(item.namaSisi) && item.namaSisi.length
          ? item.namaSisi.map(function (s) {
              return makeSisiRow(s);
            })
          : [makeSisiRow('')];
        this.sisiRows = rows;
        this.formError = '';
        this.modalOpen = true;
        this.$nextTick(function () {
          if (this.$refs.produkNameInput) {
            this.$refs.produkNameInput.focus();
          }
        });
      },
      closeModal: function () {
        if (this.saving) return;
        this.modalOpen = false;
      },
      addSisiRow: function () {
        this.sisiRows.push(makeSisiRow(''));
        this.$nextTick(function () {
          var inputs = this.$refs.sisiInputRefs;
          if (Array.isArray(inputs) && inputs.length) {
            inputs[inputs.length - 1].focus();
          }
        });
      },
      removeSisiRow: function (idx) {
        if (this.sisiRows.length <= 1) return;
        this.sisiRows.splice(idx, 1);
      },
      saveProduk: async function () {
        this.formError = '';
        var cleanProduk = this.namaProduk.trim();
        if (!cleanProduk) {
          this.formError = 'Nama produk wajib diisi.';
          return;
        }

        var duplicateProduk = this.produkList.some(
          function (item) {
            return (
              item.id !== this.editingId &&
              (item.namaProduk || '').trim().toLowerCase() === cleanProduk.toLowerCase()
            );
          }.bind(this)
        );
        if (duplicateProduk) {
          this.formError = 'Nama produk "' + cleanProduk + '" sudah terdaftar.';
          return;
        }

        var rawSides = this.sisiRows
          .map(function (row) {
            return (row.value || '').trim();
          })
          .filter(Boolean);

        if (!rawSides.length) {
          this.formError = 'Minimal masukkan 1 nama sisi produk.';
          return;
        }

        var seenSides = {};
        for (var i = 0; i < rawSides.length; i++) {
          var lowerSide = rawSides[i].toLowerCase();
          if (seenSides[lowerSide]) {
            this.formError = 'Nama sisi "' + rawSides[i] + '" tidak boleh duplikat.';
            return;
          }
          seenSides[lowerSide] = true;
        }

        this.saving = true;
        try {
          if (this.editingId) {
            await global.ZcpMasterService.updateProduk(this.editingId, {
              namaProduk: cleanProduk,
              namaSisi: rawSides
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Produk "' + cleanProduk + '" berhasil diperbarui.'
            });
          } else {
            await global.ZcpMasterService.addProduk({
              namaProduk: cleanProduk,
              namaSisi: rawSides
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Produk "' + cleanProduk + '" berhasil ditambahkan.'
            });
          }
          this.modalOpen = false;
          this.$emit('changed');
        } catch (err) {
          this.formError = err && err.message ? err.message : 'Gagal menyimpan data produk.';
        } finally {
          this.saving = false;
        }
      },
      confirmDelete: function (item) {
        var self = this;
        this.$emit('request-confirm', {
          title: 'Hapus Produk',
          message:
            'Hapus produk "' +
            item.namaProduk +
            '" beserta daftar sisinya? Pesanan lama yang sudah tersimpan tetap aman.',
          confirmText: 'Hapus Produk',
          variant: 'danger',
          onConfirm: async function () {
            await global.ZcpMasterService.deleteProduk(item.id, item.namaProduk);
            self.$emit('changed');
            self.$emit('notify', {
              type: 'success',
              message: 'Produk "' + item.namaProduk + '" berhasil dihapus.'
            });
          }
        });
      }
    },
    template: `
      <div class="card">
        <div class="panel-toolbar">
          <div class="panel-heading">
            <h2>Master Data Produk</h2>
            <p>Atur daftar produk beserta pilihan sisi sablon secara dinamis.</p>
          </div>

          <div class="panel-actions">
            <div class="search-box">
              <span class="material-symbols-rounded input-icon">search</span>
              <input
                v-model="searchQuery"
                type="text"
                class="form-control"
                placeholder="Cari produk atau sisi..."
                aria-label="Cari produk"
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
              <span>Tambah Produk</span>
            </button>
          </div>
        </div>

        <div v-if="loading" class="empty-state">
          <div class="spinner spinner-lg" style="margin-bottom: 12px;"></div>
          <p>Memuat data produk...</p>
        </div>

        <div v-else-if="!filteredList.length" class="empty-state">
          <div class="empty-state-icon">
            <span class="material-symbols-rounded">checkroom</span>
          </div>
          <h3>{{ searchQuery ? 'Produk tidak ditemukan' : 'Belum ada Master Produk' }}</h3>
          <p>
            {{
              searchQuery
                ? 'Coba kata kunci pencarian lain atau bersihkan filter.'
                : 'Tambahkan produk pertama (misalnya Kaos, Hoodie, Totebag) beserta daftar sisi sablonnya.'
            }}
          </p>
          <button v-if="!searchQuery" type="button" class="btn btn-primary" @click="openAddModal">
            <span class="material-symbols-rounded" style="font-size: 19px;">add</span>
            <span>Tambah Produk Pertama</span>
          </button>
        </div>

        <div v-else class="table-container">
          <table class="data-table responsive-table">
            <thead>
              <tr>
                <th class="col-no">No</th>
                <th>Nama Produk</th>
                <th>Daftar Sisi</th>
                <th>Jumlah Sisi</th>
                <th>Dibuat</th>
                <th class="col-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in paginatedList" :key="item.id">
                <td class="col-no" data-label="No">
                  {{ (localPageSize === 'all' ? 0 : (currentPage - 1) * Number(localPageSize)) + index + 1 }}
                </td>
                <td data-label="Nama Produk">
                  <div class="item-title-cell">
                    <span class="item-mini-icon">
                      <span class="material-symbols-rounded" style="font-size: 18px;">checkroom</span>
                    </span>
                    <span>{{ item.namaProduk }}</span>
                  </div>
                </td>
                <td class="sisi-cell" data-label="Daftar Sisi">
                  <div class="chips-wrap">
                    <span
                      v-for="(sisi, sIdx) in item.namaSisi"
                      :key="sIdx"
                      class="chip"
                    >
                      {{ sisi }}
                    </span>
                  </div>
                </td>
                <td data-label="Jumlah Sisi">
                  <span class="badge-count">{{ item.namaSisi.length }} sisi</span>
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

        <!-- Modal Tambah / Edit Produk -->
        <div
          v-if="modalOpen"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeModal"
        >
          <div class="modal-card">
            <div class="modal-header">
              <h3 class="modal-title">
                {{ editingId ? 'Edit Master Produk' : 'Tambah Master Produk' }}
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

            <form @submit.prevent="saveProduk">
              <div class="modal-body">
                <div v-if="formError" class="alert alert-danger" role="alert">
                  <span class="material-symbols-rounded">error</span>
                  <div>{{ formError }}</div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="produk-nama">
                    Nama Produk <span class="required">*</span>
                  </label>
                  <input
                    id="produk-nama"
                    ref="produkNameInput"
                    v-model="namaProduk"
                    type="text"
                    class="form-control"
                    placeholder="Contoh: Kaos Combed 30s, Hoodie Fleece, Totebag"
                    :disabled="saving"
                    required
                  />
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">
                    Daftar Nama Sisi <span class="required">*</span>
                  </label>
                  <span class="form-hint" style="margin-bottom: 8px;">
                    Tambah atau kurangi sisi dengan fleksibel (tekan Enter untuk menambah baris sisi).
                  </span>

                  <div class="dynamic-list">
                    <div
                      v-for="(row, idx) in sisiRows"
                      :key="row.id"
                      class="dynamic-row"
                    >
                      <span class="dynamic-index">{{ idx + 1 }}</span>
                      <input
                        ref="sisiInputRefs"
                        v-model="row.value"
                        type="text"
                        class="form-control"
                        placeholder="Contoh: Depan / Belakang / Lengan Kiri"
                        :disabled="saving"
                        @keydown.enter.prevent="addSisiRow"
                      />
                      <button
                        type="button"
                        class="dynamic-remove-btn"
                        :disabled="saving || sisiRows.length <= 1"
                        title="Hapus sisi ini"
                        aria-label="Hapus sisi"
                        @click="removeSisiRow(idx)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 19px;">delete</span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    class="btn btn-secondary add-side-btn"
                    :disabled="saving"
                    @click="addSisiRow"
                  >
                    <span class="material-symbols-rounded" style="font-size: 19px;">add_circle</span>
                    <span>Tambah Sisi</span>
                  </button>
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
                  <span>{{ saving ? 'Menyimpan...' : (editingId ? 'Simpan Perubahan' : 'Simpan Produk') }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `
  };
})(window);
