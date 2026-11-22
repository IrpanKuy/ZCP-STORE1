(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.FilePreviewModal = {
    name: 'FilePreviewModal',
    props: {
      visible: { type: Boolean, default: false },
      title: { type: String, default: 'File Lampiran' },
      subtitle: { type: String, default: '' },
      files: {
        type: Array,
        default: function () {
          return [];
        }
      }
    },
    emits: ['close'],
    data: function () {
      return {
        lightboxFile: null
      };
    },
    watch: {
      visible: function (val) {
        if (!val) {
          this.lightboxFile = null;
        }
      }
    },
    mounted: function () {
      window.addEventListener('keydown', this.handleKeydown);
    },
    beforeUnmount: function () {
      window.removeEventListener('keydown', this.handleKeydown);
    },
    methods: {
      formatFileSize: function (bytes) {
        return global.ZcpPesananService
          ? global.ZcpPesananService.formatFileSize(bytes)
          : String(bytes || 0) + ' B';
      },
      getPreviewUrl: function (file) {
        if (!file) return '';
        return (
          file.previewUrl ||
          (file.fileId ? 'https://drive.google.com/thumbnail?id=' + file.fileId + '&sz=w1000' : '')
        );
      },
      openLightbox: function (file) {
        this.lightboxFile = file;
      },
      closeLightbox: function () {
        this.lightboxFile = null;
      },
      handleClose: function () {
        this.lightboxFile = null;
        this.$emit('close');
      },
      handleKeydown: function (event) {
        if (event.key === 'Escape') {
          if (this.lightboxFile) {
            this.closeLightbox();
          } else if (this.visible) {
            this.handleClose();
          }
        }
      }
    },
    template: `
      <div>
        <div
          v-if="visible"
          class="modal-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="handleClose"
        >
          <div class="modal-card modal-lg">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">{{ title }}</h3>
                <div v-if="subtitle" class="form-hint">{{ subtitle }}</div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                aria-label="Tutup galeri"
                @click="handleClose"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
            <div class="modal-body">
              <div class="file-gallery-grid">
                <div
                  v-for="(file, fIdx) in files"
                  :key="file.fileId || fIdx"
                  class="file-gallery-card"
                >
                  <div
                    class="file-gallery-media"
                    title="Klik untuk memperbesar"
                    @click="openLightbox(file)"
                  >
                    <img
                      v-if="file.mimeType !== 'application/pdf' && file.previewUrl"
                      :src="file.previewUrl"
                      :alt="file.originalName"
                      referrerpolicy="no-referrer"
                    />
                    <span
                      v-else
                      class="material-symbols-rounded"
                      style="font-size: 48px; color: var(--accent-danger);"
                    >
                      picture_as_pdf
                    </span>
                  </div>
                  <div class="file-gallery-body">
                    <div class="file-name" :title="file.originalName">
                      {{ file.originalName || file.fileName }}
                    </div>
                    <div class="file-size">{{ formatFileSize(file.size) }}</div>
                    <div class="file-gallery-actions">
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        @click="openLightbox(file)"
                      >
                        <span class="material-symbols-rounded" style="font-size: 16px;">zoom_in</span>
                        <span>Lihat</span>
                      </button>
                      <a
                        v-if="file.viewUrl"
                        :href="file.viewUrl"
                        target="_blank"
                        rel="noopener"
                        class="btn btn-secondary btn-sm"
                      >
                        Drive
                      </a>
                      <a
                        v-if="file.downloadUrl"
                        :href="file.downloadUrl"
                        target="_blank"
                        rel="noopener"
                        class="btn btn-secondary btn-sm"
                      >
                        Unduh
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" @click="handleClose">
                Tutup
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="lightboxFile"
          class="modal-overlay lightbox-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="closeLightbox"
        >
          <div class="modal-card lightbox-card">
            <div class="modal-header">
              <div style="min-width: 0;">
                <h3 class="modal-title" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  {{ lightboxFile.originalName || lightboxFile.fileName }}
                </h3>
                <div class="form-hint">{{ formatFileSize(lightboxFile.size) }}</div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                aria-label="Tutup tampilan besar"
                @click="closeLightbox"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
            <div class="lightbox-body">
              <img
                v-if="lightboxFile.mimeType !== 'application/pdf'"
                :src="getPreviewUrl(lightboxFile)"
                :alt="lightboxFile.originalName"
                referrerpolicy="no-referrer"
                class="lightbox-img"
              />
              <iframe
                v-else
                :src="lightboxFile.previewUrl"
                class="lightbox-pdf"
                title="Preview PDF"
              ></iframe>
            </div>
            <div class="modal-footer">
              <a
                v-if="lightboxFile.viewUrl"
                :href="lightboxFile.viewUrl"
                target="_blank"
                rel="noopener"
                class="btn btn-secondary btn-sm"
              >
                Buka di Drive
              </a>
              <a
                v-if="lightboxFile.downloadUrl"
                :href="lightboxFile.downloadUrl"
                target="_blank"
                rel="noopener"
                class="btn btn-primary btn-sm"
              >
                Unduh
              </a>
              <button type="button" class="btn btn-secondary btn-sm" @click="closeLightbox">
                Tutup
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  };
})(window);
