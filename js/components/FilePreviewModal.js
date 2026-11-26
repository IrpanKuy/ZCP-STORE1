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
      isPdf: function (file) {
        if (!file) return false;
        return file.mimeType === 'application/pdf';
      },
      getFullWidthImageUrl: function (file) {
        if (!file) return '';
        if (file.fileId) {
          return 'https://drive.google.com/thumbnail?id=' + file.fileId + '&sz=w1600';
        }
        return file.previewUrl || '';
      },
      getPdfUrl: function (file) {
        if (!file) return '';
        return (
          file.previewUrl ||
          (file.fileId ? 'https://drive.google.com/file/d/' + file.fileId + '/preview' : '')
        );
      },
      getDownloadUrl: function (file) {
        if (!file) return '';
        return (
          file.downloadUrl ||
          (file.fileId
            ? 'https://drive.google.com/uc?export=download&id=' + file.fileId
            : file.previewUrl || '')
        );
      },
      handleClose: function () {
        this.$emit('close');
      },
      handleKeydown: function (event) {
        if (event.key === 'Escape' && this.visible) {
          this.handleClose();
        }
      }
    },
    template: `
      <div
        v-if="visible"
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="handleClose"
      >
        <div class="modal-card file-viewer-modal">
          <div class="modal-header">
            <div style="min-width: 0;">
              <h3 class="modal-title" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {{ title }}
              </h3>
              <div v-if="subtitle" class="form-hint">{{ subtitle }}</div>
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              aria-label="Tutup tampilan desain"
              @click="handleClose"
            >
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>

          <div class="modal-body file-viewer-body">
            <div v-if="!files || !files.length" class="empty-state" style="padding: 36px 16px;">
              <div class="empty-state-icon">
                <span class="material-symbols-rounded">image_not_supported</span>
              </div>
              <h3>Belum ada file</h3>
              <p>Tidak ada file desain yang terlampir.</p>
            </div>

            <div v-else class="file-viewer-stack">
              <div
                v-for="(file, fIdx) in files"
                :key="file.fileId || file.localId || fIdx"
                class="file-viewer-item"
              >
                <a
                  v-if="getDownloadUrl(file)"
                  :href="getDownloadUrl(file)"
                  :download="file.originalName || file.fileName || file.name || 'design'"
                  target="_blank"
                  rel="noopener"
                  class="file-viewer-download-btn"
                  title="Unduh file"
                  aria-label="Unduh file"
                >
                  <span class="material-symbols-rounded">download</span>
                </a>

                <img
                  v-if="!isPdf(file)"
                  :src="getFullWidthImageUrl(file)"
                  :alt="file.originalName || file.fileName || file.name || 'File Design'"
                  referrerpolicy="no-referrer"
                  class="file-viewer-img"
                />
                <iframe
                  v-else
                  :src="getPdfUrl(file)"
                  class="file-viewer-pdf"
                  title="Preview PDF"
                ></iframe>

                <div class="file-viewer-caption">
                  <span class="file-viewer-name" :title="file.originalName || file.fileName || file.name">
                    {{ file.originalName || file.fileName || file.name || ('File #' + (fIdx + 1)) }}
                  </span>
                  <span v-if="file.size" class="file-size">
                    {{ formatFileSize(file.size) }}
                  </span>
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
    `
  };
})(window);
