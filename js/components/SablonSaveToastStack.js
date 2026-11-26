(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  global.ZcpComponents.SablonSaveToastStack = {
    name: 'SablonSaveToastStack',
    props: {
      jobs: {
        type: Array,
        default: function () {
          return [];
        }
      }
    },
    emits: ['dismiss'],
    methods: {
      badgeTextFor: function (job) {
        if (!job) return '';
        if (job.status === 'queued') return 'Antrian';
        if (job.status === 'running') return Math.max(0, Math.min(100, Number(job.percent) || 0)) + '%';
        if (job.status === 'done') return 'Selesai';
        if (job.status === 'error') return 'Gagal';
        return '';
      }
    },
    template: `
      <div v-if="jobs && jobs.length" class="sablon-save-toast-stack" aria-live="polite" aria-atomic="false">
        <div
          v-for="job in jobs"
          :key="job.id"
          class="save-toast-card"
          :class="'is-' + (job.status || 'queued')"
          role="status"
        >
          <div class="save-toast-head">
            <div class="save-toast-title-wrap">
              <span v-if="job.status === 'running'" class="spinner spinner-sm"></span>
              <span
                v-else
                class="material-symbols-rounded save-toast-icon"
              >
                {{
                  job.status === 'done'
                    ? 'check_circle'
                    : job.status === 'error'
                    ? 'error'
                    : 'schedule'
                }}
              </span>
              <div class="save-toast-title" :title="job.title">
                {{ job.title }}
              </div>
            </div>

            <div class="save-toast-head-right">
              <span class="save-toast-badge">{{ badgeTextFor(job) }}</span>
              <button
                v-if="job.status === 'done' || job.status === 'error'"
                type="button"
                class="save-toast-close"
                aria-label="Tutup notifikasi"
                title="Tutup"
                @click="$emit('dismiss', job.id)"
              >
                <span class="material-symbols-rounded" style="font-size: 16px;">close</span>
              </button>
            </div>
          </div>

          <div class="save-toast-body">{{ job.stageText }}</div>

          <div v-if="job.status !== 'error'" class="save-toast-progress-track">
            <div
              class="save-toast-progress-fill"
              :class="'is-' + job.status"
              :style="{ width: Math.max(job.status === 'queued' ? 8 : 4, Math.min(100, Number(job.percent) || 0)) + '%' }"
            ></div>
          </div>
        </div>
      </div>
    `
  };
})(window);
