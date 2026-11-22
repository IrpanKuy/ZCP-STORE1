(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.ToastContainer = {
    name: 'ToastContainer',
    props: {
      toasts: {
        type: Array,
        default: function () {
          return [];
        }
      }
    },
    emits: ['dismiss'],
    methods: {
      iconFor: function (type) {
        if (type === 'success') return 'check_circle';
        if (type === 'error') return 'error';
        return 'info';
      }
    },
    template: `
      <div class="toast-container" aria-live="polite" aria-atomic="true">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast-item"
          :class="toast.type || 'info'"
          role="status"
        >
          <span class="material-symbols-rounded toast-icon">{{ iconFor(toast.type) }}</span>
          <span class="toast-msg">{{ toast.message }}</span>
          <button
            type="button"
            class="toast-close"
            aria-label="Tutup notifikasi"
            @click="$emit('dismiss', toast.id)"
          >
            <span class="material-symbols-rounded" style="font-size: 18px;">close</span>
          </button>
        </div>
      </div>
    `
  };
})(window);
