(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.ConfirmModal = {
    name: 'ConfirmModal',
    props: {
      visible: { type: Boolean, default: false },
      title: { type: String, default: 'Konfirmasi' },
      message: { type: String, default: 'Apakah Anda yakin ingin melanjutkan?' },
      confirmText: { type: String, default: 'Ya, Lanjutkan' },
      cancelText: { type: String, default: 'Batal' },
      variant: { type: String, default: 'danger' },
      loading: { type: Boolean, default: false }
    },
    emits: ['confirm', 'cancel'],
    mounted: function () {
      window.addEventListener('keydown', this.handleKeydown);
    },
    beforeUnmount: function () {
      window.removeEventListener('keydown', this.handleKeydown);
    },
    methods: {
      handleKeydown: function (event) {
        if (event.key === 'Escape' && this.visible && !this.loading) {
          this.$emit('cancel');
        }
      },
      onBackdropClick: function () {
        if (!this.loading) {
          this.$emit('cancel');
        }
      }
    },
    template: `
      <div
        v-if="visible"
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="onBackdropClick"
      >
        <div class="modal-card" style="max-width: 440px;">
          <div class="modal-header">
            <h3 class="modal-title">{{ title }}</h3>
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              :disabled="loading"
              aria-label="Tutup dialog"
              @click="$emit('cancel')"
            >
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>
          <div class="modal-body">
            <p style="margin: 0; color: var(--text-secondary);">{{ message }}</p>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="loading"
              @click="$emit('cancel')"
            >
              {{ cancelText }}
            </button>
            <button
              type="button"
              class="btn"
              :class="variant === 'danger' ? 'btn-danger' : 'btn-primary'"
              :disabled="loading"
              @click="$emit('confirm')"
            >
              <span v-if="loading" class="spinner spinner-sm"></span>
              <span>{{ loading ? 'Memproses...' : confirmText }}</span>
            </button>
          </div>
        </div>
      </div>
    `
  };
})(window);
