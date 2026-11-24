/**
 * Wrapper SweetAlert2 Global untuk Toast, Alert, Konfirmasi, dan Prompt
 */
(function (global) {
  'use strict';

  function isDarkTheme() {
    return (
      typeof document !== 'undefined' &&
      document.documentElement &&
      document.documentElement.dataset &&
      document.documentElement.dataset.theme === 'dark'
    );
  }

  function themeProps() {
    if (isDarkTheme()) {
      return {
        background: '#1e293b',
        color: '#f1f5f9'
      };
    }
    return {
      background: '#ffffff',
      color: '#0f172a'
    };
  }

  function mapToastIcon(type) {
    if (type === 'success' || type === 'error' || type === 'warning' || type === 'info') {
      return type;
    }
    return 'info';
  }

  function mapConfirmButtonColor(variant) {
    if (variant === 'danger') return '#dc2626';
    if (variant === 'success') return '#059669';
    return '#2563eb';
  }

  global.ZcpAlert = {
    toast: function (payload) {
      var opts =
        payload && typeof payload === 'object'
          ? payload
          : { type: 'info', message: String(payload || '') };
      var icon = mapToastIcon(opts.type);
      var msg = opts.message || '';

      if (global.Swal && typeof global.Swal.fire === 'function') {
        var theme = themeProps();
        return global.Swal.fire({
          toast: true,
          position: 'top-end',
          icon: icon,
          title: opts.title || msg,
          text: opts.title ? msg : '',
          showConfirmButton: false,
          timer: Number(opts.timer) || 3800,
          timerProgressBar: true,
          background: theme.background,
          color: theme.color,
          didOpen: function (toastEl) {
            toastEl.addEventListener('mouseenter', global.Swal.stopTimer);
            toastEl.addEventListener('mouseleave', global.Swal.resumeTimer);
          }
        });
      }

      if (global.console && typeof global.console.log === 'function') {
        global.console.log('[' + icon.toUpperCase() + ']', msg);
      }
      return Promise.resolve();
    },

    alert: function (options) {
      var opts =
        options && typeof options === 'object'
          ? options
          : { icon: 'info', message: String(options || '') };
      if (global.Swal && typeof global.Swal.fire === 'function') {
        var theme = themeProps();
        return global.Swal.fire({
          icon: opts.icon || 'info',
          title: opts.title || 'Informasi',
          text: opts.html ? undefined : opts.message || '',
          html: opts.html || undefined,
          confirmButtonText: opts.confirmText || 'OK',
          confirmButtonColor: mapConfirmButtonColor(opts.variant || 'primary'),
          background: theme.background,
          color: theme.color
        });
      }
      if (typeof global.alert === 'function') {
        global.alert((opts.title ? opts.title + ': ' : '') + (opts.message || ''));
      }
      return Promise.resolve({ isConfirmed: true });
    },

    error: function (message, title) {
      return this.alert({
        icon: 'error',
        title: title || 'Terjadi Kesalahan',
        message: message,
        variant: 'danger'
      });
    },

    success: function (message, title) {
      return this.alert({
        icon: 'success',
        title: title || 'Berhasil',
        message: message,
        variant: 'success'
      });
    },

    warning: function (message, title) {
      return this.alert({
        icon: 'warning',
        title: title || 'Perhatian',
        message: message,
        variant: 'primary'
      });
    },

    info: function (message, title) {
      return this.alert({
        icon: 'info',
        title: title || 'Informasi',
        message: message,
        variant: 'primary'
      });
    },

    confirm: function (options) {
      var opts = options || {};
      var variant = opts.variant || 'danger';
      var icon = opts.icon || (variant === 'danger' ? 'warning' : 'question');

      if (global.Swal && typeof global.Swal.fire === 'function') {
        var theme = themeProps();
        return global.Swal.fire({
          icon: icon,
          title: opts.title || 'Konfirmasi',
          text: opts.html ? undefined : opts.message || 'Apakah Anda yakin ingin melanjutkan?',
          html: opts.html || undefined,
          showCancelButton: true,
          confirmButtonText: opts.confirmText || 'Ya, Lanjutkan',
          cancelButtonText: opts.cancelText || 'Batal',
          confirmButtonColor: mapConfirmButtonColor(variant),
          cancelButtonColor: '#64748b',
          reverseButtons: true,
          background: theme.background,
          color: theme.color,
          showLoaderOnConfirm: typeof opts.onConfirm === 'function',
          allowOutsideClick: function () {
            return !global.Swal.isLoading();
          },
          preConfirm:
            typeof opts.onConfirm === 'function'
              ? async function () {
                  try {
                    return await opts.onConfirm();
                  } catch (err) {
                    global.Swal.showValidationMessage(
                      (err && err.message) || 'Terjadi kesalahan saat memproses aksi.'
                    );
                    return false;
                  }
                }
              : undefined
        });
      }

      var ok = typeof global.confirm === 'function' ? global.confirm(opts.message || '') : true;
      if (ok && typeof opts.onConfirm === 'function') {
        return Promise.resolve(opts.onConfirm()).then(function () {
          return { isConfirmed: true };
        });
      }
      return Promise.resolve({ isConfirmed: ok });
    },

    prompt: function (options) {
      var opts = options || {};
      if (global.Swal && typeof global.Swal.fire === 'function') {
        var theme = themeProps();
        return global.Swal.fire({
          icon: opts.icon || 'question',
          title: opts.title || 'Masukkan Catatan',
          text: opts.message || '',
          input: opts.input || 'textarea',
          inputLabel: opts.inputLabel || '',
          inputPlaceholder: opts.inputPlaceholder || '',
          showCancelButton: true,
          confirmButtonText: opts.confirmText || 'Kirim',
          cancelButtonText: opts.cancelText || 'Batal',
          confirmButtonColor: mapConfirmButtonColor(opts.variant || 'danger'),
          cancelButtonColor: '#64748b',
          reverseButtons: true,
          background: theme.background,
          color: theme.color,
          showLoaderOnConfirm: typeof opts.onConfirm === 'function',
          allowOutsideClick: function () {
            return !global.Swal.isLoading();
          },
          preConfirm:
            typeof opts.onConfirm === 'function'
              ? async function (value) {
                  try {
                    return await opts.onConfirm(value);
                  } catch (err) {
                    global.Swal.showValidationMessage(
                      (err && err.message) || 'Terjadi kesalahan saat memproses aksi.'
                    );
                    return false;
                  }
                }
              : undefined
        });
      }

      var val = typeof global.prompt === 'function' ? global.prompt(opts.message || '') : '';
      return Promise.resolve({ isConfirmed: val !== null, value: val || '' });
    }
  };
})(window);
