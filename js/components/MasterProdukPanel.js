(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  var seqCounter = 1;
  function makeSideRow(value) {
    seqCounter += 1;
    return { id: 'side_' + seqCounter, value: value || '' };
  }

  function makeTemplateRow(namaTemplate, sideValues, persistentId) {
    seqCounter += 1;
    var sideRows =
      Array.isArray(sideValues) && sideValues.length
        ? sideValues.map(function (v) {
            return makeSideRow(v);
          })
        : [makeSideRow('Depan'), makeSideRow('Belakang')];

    return {
      localId: 'tpl_' + seqCounter,
      id: persistentId || 'tpl_' + Date.now() + '_' + seqCounter,
      namaTemplate: namaTemplate || '',
      sisiRows: sideRows
    };
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
        templateRows: [makeTemplateRow('')],
        formError: '',
        saving: false,
        detailModalOpen: false,
        detailProduk: null
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
          var matchTpl =
            Array.isArray(item.templateSisi) &&
            item.templateSisi.some(function (tpl) {
              return (tpl.namaTemplate || '').toLowerCase().indexOf(q) !== -1;
            });
          return matchNama || matchSisi || matchTpl;
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
      getNormalizedTemplates: function (item) {
        if (global.ZcpMasterService && global.ZcpMasterService.normalizeTemplateSisiList) {
          return global.ZcpMasterService.normalizeTemplateSisiList(
            item && item.templateSisi,
            item && item.namaSisi
          );
        }
        return Array.isArray(item && item.templateSisi) ? item.templateSisi : [];
      },
      openAddModal: function () {
        this.editingId = null;
        this.namaProduk = '';
        this.templateRows = [makeTemplateRow('', ['Depan', 'Belakang'])];
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
        var normalizedTpls = this.getNormalizedTemplates(item);
        this.templateRows = normalizedTpls.length
          ? normalizedTpls.map(function (tpl) {
              return makeTemplateRow(tpl.namaTemplate, tpl.sisiList, tpl.id);
            })
          : [makeTemplateRow('', ['Depan', 'Belakang'])];
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
      openDetailModal: function (item) {
        this.detailProduk = item;
        this.detailModalOpen = true;
      },
      closeDetailModal: function () {
        this.detailModalOpen = false;
        this.detailProduk = null;
      },
      editFromDetailModal: function () {
        var target = this.detailProduk;
        this.closeDetailModal();
        if (target) {
          this.openEditModal(target);
        }
      },
      addTemplateRow: function () {
        this.templateRows.push(makeTemplateRow('', ['Depan', 'Belakang']));
      },
      removeTemplateRow: function (idx) {
        if (this.templateRows.length <= 1) return;
        this.templateRows.splice(idx, 1);
      },
      addSisiRow: function (tpl) {
        tpl.sisiRows.push(makeSideRow(''));
      },
      removeSisiRow: function (tpl, idx) {
        if (tpl.sisiRows.length <= 1) return;
        tpl.sisiRows.splice(idx, 1);
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

        var seenTemplates = {};
        var cleanTemplates = [];

        for (var t = 0; t < this.templateRows.length; t++) {
          var tpl = this.templateRows[t];
          var tplName = (tpl.namaTemplate || '').trim();
          if (!tplName) {
            this.formError = 'Nama template sisi ke-' + (t + 1) + ' wajib diisi.';
            return;
          }
          var tplLower = tplName.toLowerCase();
          if (seenTemplates[tplLower]) {
            this.formError = 'Nama template sisi "' + tplName + '" tidak boleh duplikat.';
            return;
          }
          seenTemplates[tplLower] = true;

          var sideMap = {};
          var rawSides = [];
          var seenSides = {};
          for (var s = 0; s < tpl.sisiRows.length; s++) {
            var sr = tpl.sisiRows[s];
            var sideVal = (sr.value || '').trim();
            if (!sideVal) continue;
            var sideLower = sideVal.toLowerCase();
            if (seenSides[sideLower]) {
              this.formError =
                'Nama sisi "' + sideVal + '" duplikat pada template "' + tplName + '".';
              return;
            }
            seenSides[sideLower] = true;
            sideMap[sr.id] = sideVal;
            rawSides.push(sideVal);
          }

          if (!rawSides.length) {
            this.formError = 'Template "' + tplName + '" wajib memiliki minimal 1 sisi.';
            return;
          }

          cleanTemplates.push({
            id: tpl.id,
            namaTemplate: tplName,
            sisiList: rawSides
          });
        }

        this.saving = true;
        try {
          if (this.editingId) {
            await global.ZcpMasterService.updateProduk(this.editingId, {
              namaProduk: cleanProduk,
              templateSisi: cleanTemplates
            });
            this.$emit('notify', {
              type: 'success',
              message: 'Produk "' + cleanProduk + '" berhasil diperbarui.'
            });
          } else {
            await global.ZcpMasterService.addProduk({
              namaProduk: cleanProduk,
              templateSisi: cleanTemplates
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
            '" beserta seluruh template sisinya? Pesanan lama yang sudah tersimpan tetap aman.',
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
              <p>Atur daftar produk beserta template sisi dan daftar sisinya secara dinamis.</p>
            </div>

          <div class="panel-actions">
            <div class="search-box">
              <span class="material-symbols-rounded input-icon">search</span>
              <input
                v-model="searchQuery"
                type="text"
                class="form-control"
                placeholder="Cari produk, template, atau sisi..."
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
                : 'Tambahkan produk pertama (misalnya Kaos, Payung, Hoodie) beserta template sisi dan groupingnya.'
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
                  <th>Template Sisi</th>
                  <th>Jumlah Template</th>
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
                <td data-label="Template Sisi">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="openDetailModal(item)"
                  >
                    <span class="material-symbols-rounded" style="font-size: 16px;">layers</span>
                    <span>Lihat Template ({{ getNormalizedTemplates(item).length }})</span>
                  </button>
                </td>
                <td data-label="Jumlah Template">
                  <span class="badge-count">{{ getNormalizedTemplates(item).length }} template</span>
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

        <!-- Modal Tambah / Edit Produk (Template Sisi + Sisi + Grouping) -->
        <div
          v-if="modalOpen"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeModal"
        >
          <div class="modal-card modal-lg">
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
                    placeholder="Contoh: Kaos Combed 30s, Payung Lipat, Rompi"
                    :disabled="saving"
                    required
                  />
                </div>

                <div class="sisi-header-row" style="margin-bottom: 10px;">
                  <div>
                    <label class="form-label" style="margin-bottom: 2px;">
                      Template Sisi &amp; Daftar Sisi <span class="required">*</span>
                    </label>
                    <div class="form-hint">
                      Buat satu atau beberapa template sisi (mis. "2 Logo + A6" atau "Standar"), lalu atur daftar sisinya.
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="saving"
                    @click="addTemplateRow"
                  >
                    <span class="material-symbols-rounded" style="font-size: 17px;">add</span>
                    <span>Tambah Template Sisi</span>
                  </button>
                </div>

                <div class="template-builder-list">
                  <div
                    v-for="(tpl, tIdx) in templateRows"
                    :key="tpl.localId"
                    class="template-card"
                  >
                    <div class="template-card-head">
                      <span class="badge-count">Template #{{ tIdx + 1 }}</span>
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        style="color: var(--accent-danger);"
                        :disabled="saving || templateRows.length <= 1"
                        @click="removeTemplateRow(tIdx)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">delete</span>
                        <span>Hapus Template</span>
                      </button>
                    </div>

                    <div class="form-group">
                      <label class="form-label">
                        Nama Template Sisi <span class="required">*</span>
                      </label>
                      <input
                        v-model="tpl.namaTemplate"
                        type="text"
                        class="form-control"
                        placeholder="Contoh: 2 Logo + A6, atau 4 Sisi Semua Design Sama"
                        :disabled="saving"
                        required
                      />
                    </div>

                    <!-- Daftar Sisi Dinamis pada Template ini -->
                    <div class="form-group">
                      <label class="form-label">
                        Daftar Sisi pada Template Ini <span class="required">*</span>
                      </label>
                      <div class="dynamic-list">
                        <div
                          v-for="(row, sIdx) in tpl.sisiRows"
                          :key="row.id"
                          class="dynamic-row"
                        >
                          <span class="dynamic-index">{{ sIdx + 1 }}</span>
                          <input
                            v-model="row.value"
                            type="text"
                            class="form-control"
                            placeholder="Contoh: Depan Kanan / Depan Kiri / Belakang / Sisi 1"
                            :disabled="saving"
                            @keydown.enter.prevent="addSisiRow(tpl)"
                          />
                          <button
                            type="button"
                            class="dynamic-remove-btn"
                            :disabled="saving || tpl.sisiRows.length <= 1"
                            title="Hapus sisi ini"
                            aria-label="Hapus sisi"
                            @click="removeSisiRow(tpl, sIdx)"
                          >
                            <span class="material-symbols-rounded" style="font-size: 19px;">delete</span>
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm add-side-btn"
                        :disabled="saving"
                        @click="addSisiRow(tpl)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 17px;">add_circle</span>
                        <span>Tambah Sisi</span>
                      </button>
                    </div>
                  </div>
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

        <!-- Modal Detail Lengkap Template Sisi & Grouping -->
        <div
          v-if="detailModalOpen && detailProduk"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeDetailModal"
        >
          <div class="modal-card modal-lg">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">Template Sisi — {{ detailProduk.namaProduk }}</h3>
                <div class="form-hint">
                  {{ getNormalizedTemplates(detailProduk).length }} template sisi terdaftar
                </div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                aria-label="Tutup detail template"
                @click="closeDetailModal"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>

            <div class="modal-body">
              <div class="template-builder-list">
                <div
                  v-for="(tpl, tIdx) in getNormalizedTemplates(detailProduk)"
                  :key="tpl.id || tIdx"
                  class="template-card"
                >
                  <div class="template-card-head">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <span class="badge-count">#{{ tIdx + 1 }}</span>
                      <strong style="font-size: 14.5px;">{{ tpl.namaTemplate }}</strong>
                    </div>
                    <span class="chip">{{ tpl.sisiList.length }} sisi</span>
                  </div>

                  <div style="margin-bottom: 4px;">
                    <div class="form-hint" style="margin-bottom: 5px; font-weight: 600;">Daftar Sisi:</div>
                    <div class="chips-wrap">
                      <span v-for="(sisi, sIdx) in tpl.sisiList" :key="sIdx" class="chip">
                        {{ sisi }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                @click="editFromDetailModal"
              >
                <span class="material-symbols-rounded" style="font-size: 16px;">edit</span>
                <span>Edit Produk Ini</span>
              </button>
              <button type="button" class="btn btn-primary" @click="closeDetailModal">
                Tutup
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  };
})(window);
