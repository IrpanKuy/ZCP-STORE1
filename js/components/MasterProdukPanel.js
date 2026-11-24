(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  var seqCounter = 1;
  function makeSideRow(value) {
    seqCounter += 1;
    return { id: 'side_' + seqCounter, value: value || '' };
  }

  function makeGroupingRow(namaGrouping, selectedSideIds, persistentId) {
    seqCounter += 1;
    return {
      localId: 'grp_' + seqCounter,
      id: persistentId || 'grp_' + Date.now() + '_' + seqCounter,
      namaGrouping: namaGrouping || '',
      selectedSideIds: Array.isArray(selectedSideIds) ? selectedSideIds.slice() : []
    };
  }

  function makeTemplateRow(namaTemplate, sideValues, rawGroupings, persistentId) {
    seqCounter += 1;
    var sideRows =
      Array.isArray(sideValues) && sideValues.length
        ? sideValues.map(function (v) {
            return makeSideRow(v);
          })
        : [makeSideRow('Depan'), makeSideRow('Belakang')];

    var nameToSideId = {};
    sideRows.forEach(function (sr) {
      var clean = String(sr.value || '').trim().toLowerCase();
      if (clean && !nameToSideId[clean]) {
        nameToSideId[clean] = sr.id;
      }
    });

    var groupings = Array.isArray(rawGroupings)
      ? rawGroupings.map(function (g) {
          var matchedIds = (Array.isArray(g.sisi) ? g.sisi : [])
            .map(function (name) {
              return nameToSideId[String(name || '').trim().toLowerCase()] || '';
            })
            .filter(Boolean);
          return makeGroupingRow(g.namaGrouping || '', matchedIds, g.id);
        })
      : [];

    return {
      localId: 'tpl_' + seqCounter,
      id: persistentId || 'tpl_' + Date.now() + '_' + seqCounter,
      namaTemplate: namaTemplate || '',
      sisiRows: sideRows,
      groupings: groupings
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
        this.templateRows = [makeTemplateRow('', ['Depan', 'Belakang'], [])];
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
              return makeTemplateRow(tpl.namaTemplate, tpl.sisiList, tpl.groupings, tpl.id);
            })
          : [makeTemplateRow('', ['Depan', 'Belakang'], [])];
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
      addTemplateRow: function () {
        this.templateRows.push(makeTemplateRow('', ['Depan', 'Belakang'], []));
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
        var removed = tpl.sisiRows.splice(idx, 1)[0];
        if (removed && Array.isArray(tpl.groupings)) {
          tpl.groupings.forEach(function (g) {
            g.selectedSideIds = (g.selectedSideIds || []).filter(function (id) {
              return id !== removed.id;
            });
          });
        }
      },
      addGroupingRow: function (tpl) {
        tpl.groupings.push(makeGroupingRow('', []));
      },
      removeGroupingRow: function (tpl, gIdx) {
        tpl.groupings.splice(gIdx, 1);
      },
      isSideInGrouping: function (grp, sideId) {
        return Array.isArray(grp.selectedSideIds) && grp.selectedSideIds.indexOf(sideId) !== -1;
      },
      toggleSideInGrouping: function (grp, sideId) {
        if (!Array.isArray(grp.selectedSideIds)) {
          grp.selectedSideIds = [];
        }
        var idx = grp.selectedSideIds.indexOf(sideId);
        if (idx === -1) {
          grp.selectedSideIds.push(sideId);
        } else {
          grp.selectedSideIds.splice(idx, 1);
        }
      },
      selectAllSidesForGrouping: function (tpl, grp) {
        grp.selectedSideIds = (tpl.sisiRows || [])
          .filter(function (s) {
            return String(s.value || '').trim() !== '';
          })
          .map(function (s) {
            return s.id;
          });
      },
      clearGroupingSides: function (grp) {
        grp.selectedSideIds = [];
      },
      getGroupingPreviewNames: function (tpl, grp) {
        var sideMap = {};
        (tpl.sisiRows || []).forEach(function (sr) {
          var v = String(sr.value || '').trim();
          if (v) sideMap[sr.id] = v;
        });
        return (grp.selectedSideIds || [])
          .map(function (id) {
            return sideMap[id] || '';
          })
          .filter(Boolean);
      },
      getOverlappingSideNames: function (tpl) {
        var counts = {};
        var overlaps = [];
        var sideMap = {};
        (tpl.sisiRows || []).forEach(function (sr) {
          var v = String(sr.value || '').trim();
          if (v) sideMap[sr.id] = v;
        });
        (tpl.groupings || []).forEach(function (grp) {
          (grp.selectedSideIds || []).forEach(function (id) {
            var name = sideMap[id];
            if (!name) return;
            counts[id] = (counts[id] || 0) + 1;
            if (counts[id] === 2) {
              overlaps.push(name);
            }
          });
        });
        return overlaps;
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

          var cleanGroupings = [];
          var rawGrps = Array.isArray(tpl.groupings) ? tpl.groupings : [];
          for (var g = 0; g < rawGrps.length; g++) {
            var grp = rawGrps[g];
            var gName = (grp.namaGrouping || '').trim();
            if (!gName) {
              this.formError =
                'Nama grouping ke-' + (g + 1) + ' pada template "' + tplName + '" wajib diisi.';
              return;
            }
            var gSides = (grp.selectedSideIds || [])
              .map(function (id) {
                return sideMap[id] || '';
              })
              .filter(Boolean);
            if (!gSides.length) {
              this.formError =
                'Pilih minimal 1 sisi untuk grouping "' + gName + '" pada template "' + tplName + '".';
              return;
            }
            cleanGroupings.push({
              id: grp.id,
              namaGrouping: gName,
              sisi: gSides
            });
          }

          cleanTemplates.push({
            id: tpl.id,
            namaTemplate: tplName,
            sisiList: rawSides,
            groupings: cleanGroupings
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
            <p>Atur daftar produk, template sisi, daftar sisi, dan grouping desain sablon yang sama.</p>
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
                <th>Template Sisi &amp; Grouping</th>
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
                <td class="sisi-cell" data-label="Template Sisi">
                  <div class="template-summary-stack">
                    <div
                      v-for="tpl in getNormalizedTemplates(item)"
                      :key="tpl.id"
                      class="template-summary-item"
                    >
                      <div class="template-summary-title">
                        <strong>{{ tpl.namaTemplate }}</strong>
                        <span class="form-hint">({{ tpl.sisiList.length }} sisi)</span>
                      </div>
                      <div class="chips-wrap" style="margin-top: 4px;">
                        <span v-for="(sisi, sIdx) in tpl.sisiList" :key="sIdx" class="chip">
                          {{ sisi }}
                        </span>
                      </div>
                      <div v-if="tpl.groupings && tpl.groupings.length" class="chips-wrap" style="margin-top: 5px;">
                        <span
                          v-for="grp in tpl.groupings"
                          :key="grp.id"
                          class="grouping-chip"
                        >
                          <span class="material-symbols-rounded" style="font-size: 13px;">workspaces</span>
                          <span>{{ grp.namaGrouping }}: {{ grp.sisi.join(' + ') }}</span>
                        </span>
                      </div>
                    </div>
                  </div>
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
                      Template Sisi, Daftar Sisi &amp; Grouping <span class="required">*</span>
                    </label>
                    <div class="form-hint">
                      Buat satu atau beberapa template sisi (mis. "2 Logo + A6" atau "4 Sisi Semua Design Sama"), lalu atur sisi &amp; grouping opsional.
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

                    <!-- Grouping Sisi Opsional -->
                    <div class="grouping-section">
                      <div class="sisi-header-row" style="margin-bottom: 8px;">
                        <div>
                          <div class="form-label" style="margin-bottom: 0; font-size: 13px;">
                            Grouping Design Sama (Opsional)
                          </div>
                          <div class="form-hint">
                            Gabungkan beberapa sisi yang memiliki desain sablon sama agar di Manajemen Sablon cukup diinput 1 kali dan hasilnya dibagi rata.
                          </div>
                        </div>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          :disabled="saving"
                          @click="addGroupingRow(tpl)"
                        >
                          <span class="material-symbols-rounded" style="font-size: 16px;">workspaces</span>
                          <span>Tambah Grouping</span>
                        </button>
                      </div>

                      <div
                        v-if="getOverlappingSideNames(tpl).length"
                        class="alert alert-warning"
                        style="margin-bottom: 8px; font-size: 12px;"
                      >
                        <span class="material-symbols-rounded" style="font-size: 18px;">info</span>
                        <div>
                          Sisi <strong>{{ getOverlappingSideNames(tpl).join(', ') }}</strong> masuk ke lebih dari 1 grouping pada template ini. Pastikan pengisian jumlah sablon tidak melebihi target.
                        </div>
                      </div>

                      <div v-if="!tpl.groupings.length" class="form-hint">
                        Belum ada grouping. Jika tiap sisi desainnya berbeda, tidak perlu membuat grouping.
                      </div>

                      <div v-else class="grouping-list">
                        <div
                          v-for="(grp, gIdx) in tpl.groupings"
                          :key="grp.localId"
                          class="grouping-card"
                        >
                          <div class="grouping-card-head">
                            <span class="badge-count">Grouping #{{ gIdx + 1 }}</span>
                            <button
                              type="button"
                              class="btn btn-ghost btn-sm"
                              style="color: var(--accent-danger);"
                              :disabled="saving"
                              @click="removeGroupingRow(tpl, gIdx)"
                            >
                              <span class="material-symbols-rounded" style="font-size: 16px;">delete</span>
                              <span>Hapus</span>
                            </button>
                          </div>

                          <div class="form-group" style="margin-bottom: 10px;">
                            <label class="form-label" style="font-size: 12.5px;">
                              Nama Grouping <span class="required">*</span>
                            </label>
                            <input
                              v-model="grp.namaGrouping"
                              type="text"
                              class="form-control"
                              placeholder="Contoh: Semua sisi design sama"
                              :disabled="saving"
                            />
                          </div>

                          <div class="sisi-header-row" style="margin-bottom: 6px;">
                            <label class="form-label" style="margin-bottom: 0; font-size: 12.5px;">
                              Pilih Sisi dalam Grouping <span class="required">*</span>
                            </label>
                            <div class="sisi-mini-actions">
                              <button
                                type="button"
                                class="link-btn"
                                :disabled="saving"
                                @click="selectAllSidesForGrouping(tpl, grp)"
                              >
                                Pilih Semua
                              </button>
                              <button
                                type="button"
                                class="link-btn"
                                :disabled="saving"
                                @click="clearGroupingSides(grp)"
                              >
                                Reset
                              </button>
                            </div>
                          </div>

                          <div class="sisi-selector-grid">
                            <label
                              v-for="sr in tpl.sisiRows.filter(function (x) { return String(x.value || '').trim() !== ''; })"
                              :key="sr.id"
                              class="sisi-option"
                              :class="{ selected: isSideInGrouping(grp, sr.id) }"
                            >
                              <input
                                type="checkbox"
                                :checked="isSideInGrouping(grp, sr.id)"
                                :disabled="saving"
                                @change="toggleSideInGrouping(grp, sr.id)"
                              />
                              <span>{{ sr.value }}</span>
                            </label>
                          </div>

                          <div
                            v-if="getGroupingPreviewNames(tpl, grp).length"
                            class="grouping-preview-pill"
                          >
                            Tampilan di Manajemen Sablon:
                            <strong>{{ getGroupingPreviewNames(tpl, grp).join(' + ') }}</strong>
                            <span>(dibagi rata ke {{ getGroupingPreviewNames(tpl, grp).length }} sisi)</span>
                          </div>
                        </div>
                      </div>
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
      </div>
    `
  };
})(window);
