(function (global) {
  'use strict';

  global.ZcpComponents = global.ZcpComponents || {};

  var COLLECTION_LABELS = {
    pesanan: 'Pesanan',
    sablon: 'Manajemen Sablon',
    master_produk: 'Master Produk',
    master_kategori_produk: 'Master Kategori Produk',
    master_status_shopee: 'Master Status Pesanan Shopee',
    master_expedisi: 'Master Expedisi',
    master_asal_pesanan: 'Master Asal Pesanan'
  };

  var OP_LABELS = {
    CREATE: 'Tambah Baru',
    UPDATE: 'Ubah Data',
    DELETE: 'Hapus Data'
  };

  var FIELD_LABELS = {
    namaPemesan: 'Nama Pemesan',
    namaAsalPesanan: 'Asal Pesanan',
    namaProduk: 'Produk',
    namaKategori: 'Kategori Produk',
    namaTemplateSisi: 'Template Sisi',
    namaSisi: 'Daftar Sisi',
    jumlahProduk: 'Jumlah (pcs)',
    namaExpedisi: 'Expedisi',
    namaStatusShopee: 'Status Pesanan Shopee',
    namaStatus: 'Nama Status Shopee',
    namaAsal: 'Nama Asal Pesanan',
    templateSisi: 'Template Sisi',
    catatan: 'Catatan',
    anggapSablonSelesai: 'Anggap Sablon Selesai',
    tanggalMulai: 'Tanggal Mulai',
    tanggalDeadline: 'Deadline',
    statusSelesai: 'Status Selesai',
    namaSablon: 'Nama Sablon',
    jumlahPerulangan: 'Perulangan',
    perulanganChecks: 'Checklist Print',
    pesananItems: 'Pesanan Terhubung'
  };

  global.ZcpComponents.AiChatbot = {
    name: 'AiChatbot',
    props: {
      user: { type: Object, default: null },
      aiConfig: {
        type: Object,
        default: function () {
          return { geminiApiUrl: '', geminiApiKey: '' };
        }
      },
      driveReady: { type: Boolean, default: false },
      produkList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      kategoriProdukList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      expedisiList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      asalPesananList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      statusShopeeList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      pesananList: {
        type: Array,
        default: function () {
          return [];
        }
      },
      sablonList: {
        type: Array,
        default: function () {
          return [];
        }
      }
    },
    emits: ['notify', 'data-mutated', 'open-settings'],
    data: function () {
      return {
        isOpen: false,
        activeTab: 'chat',
        promptInput: '',
        sending: false,
        dragDepth: 0,
        pendingAttachments: [],
        messages: [
          {
            id: 'welcome',
            role: 'assistant',
            text:
              'Halo! Saya ZCP AI Assistant. Saya bisa membantu CRUD maupun BULK CRUD data Pesanan, Manajemen Sablon, dan Master Data, serta membaca gambar (PNG/JPG) atau PDF.\n\nContoh: "Buatkan pesanan Rompi 13 pcs" atau seret gambar/PDF nota ke kotak chat ini.',
            attachmentsMeta: [],
            pendingProposalId: null
          }
        ],
        aiLogs: [],
        logsLoaded: false,
        loadingLogs: false,
        rollingBackLogId: null,
        confirmModal: {
          visible: false,
          promptText: '',
          replySummary: '',
          operations: [],
          attachments: [],
          uploadAttachmentsToDrive: false,
          executing: false
        },
        pendingProposalCache: {},
        rollbackConfirmLog: null
      };
    },
    computed: {
      canUseAi: function () {
        var role = this.user && this.user.role;
        return role === 'superadmin' || role === 'admin';
      },
      isSuperadmin: function () {
        return Boolean(this.user && this.user.role === 'superadmin');
      },
      hasGeminiKey: function () {
        return Boolean(this.aiConfig && String(this.aiConfig.geminiApiKey || '').trim());
      },
      isDraggingOver: function () {
        return this.isOpen && this.activeTab === 'chat' && this.dragDepth > 0;
      },
      selectedOpsCount: function () {
        return (this.confirmModal.operations || []).filter(function (op) {
          return op.selected && op.valid !== false;
        }).length;
      },
      validOpsCount: function () {
        return (this.confirmModal.operations || []).filter(function (op) {
          return op.valid !== false;
        }).length;
      },
      canAttachDriveInConfirm: function () {
        if (!this.confirmModal.attachments || !this.confirmModal.attachments.length) {
          return false;
        }
        return (this.confirmModal.operations || []).some(function (op) {
          return (
            op.selected &&
            op.valid !== false &&
            (op.collection === 'pesanan' || op.collection === 'sablon') &&
            op.type !== 'DELETE'
          );
        });
      },
      quickPrompts: function () {
        return [
          'Buatkan pesanan Rompi 13 pcs',
          'Rekap pesanan yang masih proses',
          'Buatkan master produk baru'
        ];
      }
    },
    methods: {
      toggleChat: function () {
        this.isOpen = !this.isOpen;
        if (this.isOpen && this.activeTab === 'logs' && !this.logsLoaded) {
          this.loadAiLogs(false);
        }
        if (this.isOpen) {
          this.scrollChatToBottom();
        }
      },
      switchTab: function (tab) {
        this.activeTab = tab;
        this.dragDepth = 0;
        if (tab === 'logs' && !this.logsLoaded) {
          this.loadAiLogs(false);
        }
        if (tab === 'chat') {
          this.scrollChatToBottom();
        }
      },
      scrollChatToBottom: function () {
        var self = this;
        this.$nextTick(function () {
          var box = self.$refs.chatMessagesBox;
          if (box) {
            box.scrollTop = box.scrollHeight;
          }
        });
      },
      clearChat: function () {
        this.pendingAttachments = [];
        this.pendingProposalCache = {};
        this.messages = [
          {
            id: 'welcome_' + Date.now(),
            role: 'assistant',
            text:
              'Percakapan direset. Silakan kirim perintah baru atau seret gambar PNG/JPG/PDF ke sini.',
            attachmentsMeta: [],
            pendingProposalId: null
          }
        ];
      },
      applyQuickPrompt: function (text) {
        this.promptInput = text;
        var input = this.$refs.promptTextarea;
        if (input) {
          input.focus();
        }
      },
      formatFileSize: function (bytes) {
        return global.ZcpPesananService
          ? global.ZcpPesananService.formatFileSize(bytes)
          : Math.round((bytes || 0) / 1024) + ' KB';
      },
      formatTimestamp: function (ts) {
        if (!ts) return '-';
        try {
          var d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
          if (isNaN(d.getTime())) return '-';
          return new Intl.DateTimeFormat('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }).format(d);
        } catch (e) {
          return '-';
        }
      },
      getCollectionLabel: function (col) {
        return COLLECTION_LABELS[col] || col;
      },
      getOpLabel: function (type) {
        return OP_LABELS[type] || type;
      },
      getFieldLabel: function (field) {
        return FIELD_LABELS[field] || field;
      },
      triggerFilePicker: function () {
        if (this.$refs.chatFileInput) {
          this.$refs.chatFileInput.value = '';
          this.$refs.chatFileInput.click();
        }
      },
      handleFileInputChange: function (e) {
        var files = e && e.target && e.target.files;
        if (files && files.length) {
          this.enqueueFiles(files);
        }
      },
      hasFileTransfer: function (e) {
        var dt = e && e.dataTransfer;
        if (!dt || !dt.types) return false;
        for (var i = 0; i < dt.types.length; i++) {
          if (dt.types[i] === 'Files') return true;
        }
        return false;
      },
      onDragEnter: function (e) {
        if (!this.hasFileTransfer(e) || this.activeTab !== 'chat') return;
        this.dragDepth += 1;
      },
      onDragOver: function (e) {
        if (!this.hasFileTransfer(e) || this.activeTab !== 'chat') return;
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
      },
      onDragLeave: function (e) {
        if (!this.hasFileTransfer(e) || this.activeTab !== 'chat') return;
        this.dragDepth = Math.max(0, this.dragDepth - 1);
      },
      onDropFiles: function (e) {
        this.dragDepth = 0;
        if (this.activeTab !== 'chat') return;
        var files = e && e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) {
          this.enqueueFiles(files);
        }
      },
      onPaste: function (e) {
        var items = e && e.clipboardData && e.clipboardData.files;
        if (items && items.length) {
          e.preventDefault();
          this.enqueueFiles(items);
        }
      },
      enqueueFiles: async function (fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        for (var i = 0; i < files.length; i++) {
          if (this.pendingAttachments.length >= 5) {
            this.$emit('notify', {
              type: 'error',
              message: 'Maksimal 5 file lampiran dalam sekali kirim.'
            });
            break;
          }
          try {
            var parsed = await global.ZcpAiService.readChatFile(files[i]);
            this.pendingAttachments.push(parsed);
          } catch (err) {
            this.$emit('notify', {
              type: 'error',
              message: (err && err.message) || 'Gagal membaca file lampiran.'
            });
          }
        }
      },
      removePendingAttachment: function (id) {
        this.pendingAttachments = this.pendingAttachments.filter(function (a) {
          return a.id !== id;
        });
      },
      handleTextareaKeydown: function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      },
      sendMessage: async function () {
        if (this.sending) return;
        var text = String(this.promptInput || '').trim();
        var attachments = this.pendingAttachments.slice();
        if (!text && !attachments.length) return;

        if (!this.hasGeminiKey) {
          this.$emit('notify', {
            type: 'error',
            message: this.isSuperadmin
              ? 'API Key Gemini belum diisi. Silakan atur di menu Pengaturan.'
              : 'API Key Gemini belum diatur oleh Superadmin.'
          });
          return;
        }

        var userMsg = {
          id: 'u_' + Date.now(),
          role: 'user',
          text: text || '(Mengirim file lampiran untuk dianalisis)',
          attachmentsMeta: attachments.map(function (a) {
            return {
              name: a.name,
              isImage: a.isImage,
              previewDataUrl: a.previewDataUrl,
              size: a.size
            };
          })
        };

        var historySnapshot = this.messages.slice(-6).map(function (m) {
          return { role: m.role, text: m.text };
        });

        this.messages.push(userMsg);
        this.promptInput = '';
        this.pendingAttachments = [];
        this.sending = true;
        this.scrollChatToBottom();

        try {
          var result = await global.ZcpAiService.sendToGemini({
            aiConfig: this.aiConfig,
            userText: text,
            attachments: attachments,
            history: historySnapshot,
            storeContext: {
              produkList: this.produkList,
              kategoriProdukList: this.kategoriProdukList,
              expedisiList: this.expedisiList,
              asalPesananList: this.asalPesananList,
              statusShopeeList: this.statusShopeeList,
              pesananList: this.pesananList,
              sablonList: this.sablonList
            }
          });

          var proposalId = null;
          if (result.operations && result.operations.length) {
            proposalId = 'prop_' + Date.now();
            this.pendingProposalCache[proposalId] = {
              promptText: userMsg.text,
              replySummary: result.reply,
              operations: result.operations,
              attachments: attachments
            };
          }

          this.messages.push({
            id: 'a_' + Date.now(),
            role: 'assistant',
            text: result.reply,
            attachmentsMeta: [],
            pendingProposalId: proposalId,
            operationsCount: result.operations ? result.operations.length : 0,
            executed: false
          });
          this.scrollChatToBottom();

          if (proposalId) {
            this.openConfirmModal(proposalId);
          }
        } catch (err) {
          var errMsg = (err && err.message) || 'Gagal menghubungi API Gemini.';
          this.messages.push({
            id: 'err_' + Date.now(),
            role: 'assistant',
            text: 'Terjadi kendala: ' + errMsg,
            isError: true,
            attachmentsMeta: [],
            pendingProposalId: null
          });
          this.scrollChatToBottom();
          this.$emit('notify', {
            type: 'error',
            message: errMsg
          });
        } finally {
          this.sending = false;
        }
      },
      openConfirmModal: function (proposalId) {
        var cached = this.pendingProposalCache[proposalId];
        if (!cached) return;
        var clonedOps = cached.operations.map(function (op) {
          return Object.assign({}, op, {
            selected: op.valid !== false
          });
        });
        this.confirmModal = {
          visible: true,
          proposalId: proposalId,
          promptText: cached.promptText,
          replySummary: cached.replySummary,
          operations: clonedOps,
          attachments: cached.attachments || [],
          uploadAttachmentsToDrive:
            this.driveReady &&
            Boolean(cached.attachments && cached.attachments.length) &&
            clonedOps.some(function (op) {
              return (
                op.valid !== false &&
                (op.collection === 'pesanan' || op.collection === 'sablon') &&
                op.type !== 'DELETE'
              );
            }),
          executing: false
        };
      },
      closeConfirmModal: function () {
        if (this.confirmModal.executing) return;
        this.confirmModal.visible = false;
      },
      toggleAllConfirmOps: function (checked) {
        (this.confirmModal.operations || []).forEach(function (op) {
          if (op.valid !== false) {
            op.selected = Boolean(checked);
          }
        });
      },
      executeApprovedOperations: async function () {
        if (this.confirmModal.executing) return;
        var approved = (this.confirmModal.operations || []).filter(function (op) {
          return op.selected && op.valid !== false;
        });
        if (!approved.length) {
          this.$emit('notify', {
            type: 'error',
            message: 'Pilih minimal 1 operasi yang ingin dijalankan.'
          });
          return;
        }

        this.confirmModal.executing = true;
        try {
          var execRes = await global.ZcpAiService.executeOperations({
            promptText: this.confirmModal.promptText,
            summary: this.confirmModal.replySummary,
            approvedOps: approved,
            attachFiles: this.confirmModal.attachments,
            uploadAttachmentsToDrive:
              this.driveReady && this.confirmModal.uploadAttachmentsToDrive
          });

          var propId = this.confirmModal.proposalId;
          for (var i = 0; i < this.messages.length; i++) {
            if (this.messages[i].pendingProposalId === propId) {
              this.messages[i].executed = true;
              this.messages[i].pendingProposalId = null;
            }
          }
          delete this.pendingProposalCache[propId];

          this.confirmModal.visible = false;
          this.messages.push({
            id: 'done_' + Date.now(),
            role: 'assistant',
            text:
              'Selesai! ' +
              execRes.count +
              ' perubahan berhasil disimpan ke database dan tercatat di tab Log Perubahan (20 terakhir). Jika ingin mengembalikan data, Anda dapat menekan tombol Rollback di tab Log Perubahan.',
            attachmentsMeta: [],
            pendingProposalId: null
          });
          this.scrollChatToBottom();

          this.$emit('data-mutated', {
            touchedMaster: Boolean(execRes.touchedMaster)
          });
          this.$emit('notify', {
            type: 'success',
            message: execRes.count + ' operasi AI berhasil dijalankan.'
          });

          this.loadAiLogs(true);
        } catch (err) {
          this.$emit('notify', {
            type: 'error',
            message: (err && err.message) || 'Gagal menjalankan perubahan AI.'
          });
        } finally {
          this.confirmModal.executing = false;
        }
      },
      loadAiLogs: async function (silent) {
        if (!this.canUseAi) return;
        if (!silent) {
          this.loadingLogs = true;
        }
        try {
          this.aiLogs = await global.ZcpAiService.fetchAiLogs();
          this.logsLoaded = true;
        } catch (err) {
          if (!silent) {
            this.$emit('notify', {
              type: 'error',
              message: (err && err.message) || 'Gagal memuat Log Perubahan AI.'
            });
          }
        } finally {
          this.loadingLogs = false;
        }
      },
      promptRollback: function (logEntry) {
        if (!logEntry || logEntry.rolledBack || this.rollingBackLogId) return;
        var self = this;
        var changes = Array.isArray(logEntry.changes) ? logEntry.changes : [];
        var listText = changes
          .map(function (ch) {
            var verb = ch.type === 'CREATE' ? 'HAPUS' : 'PULIHKAN';
            return '[' + verb + '] ' + self.getCollectionLabel(ch.collection) + ': ' + ch.label;
          })
          .join('\n');

        var doRollback = async function () {
          self.rollingBackLogId = logEntry.id;
          try {
            var res = await global.ZcpAiService.rollbackAiLog(logEntry);
            self.$emit('data-mutated', {
              touchedMaster: Boolean(res.touchedMaster)
            });
            self.$emit('notify', {
              type: 'success',
              message:
                'Rollback berhasil! ' +
                res.count +
                ' perubahan AI telah dikembalikan ke kondisi sebelumnya.'
            });
            await self.loadAiLogs(true);
          } finally {
            self.rollingBackLogId = null;
          }
        };

        if (global.ZcpAlert && typeof global.ZcpAlert.confirm === 'function') {
          global.ZcpAlert.confirm({
            title: 'Konfirmasi Rollback Perubahan AI',
            message:
              'Kembalikan ' +
              changes.length +
              ' perubahan berikut ke kondisi sebelum dieksekusi?\n\n' +
              listText,
            confirmText: 'Ya, Rollback Sekarang',
            variant: 'danger',
            icon: 'warning',
            onConfirm: doRollback
          });
        } else {
          doRollback().catch(function (err) {
            self.$emit('notify', {
              type: 'error',
              message: (err && err.message) || 'Gagal melakukan Rollback AI.'
            });
          });
        }
      }
    },
    template: `
      <div v-if="canUseAi" class="ai-assistant-root">
        <!-- Floating Action Button (Kanan Bawah) -->
        <button
          type="button"
          class="ai-fab"
          :class="{ open: isOpen, 'needs-key': !hasGeminiKey }"
          :title="isOpen ? 'Tutup AI Assistant' : 'Buka AI Assistant (Gemini)'"
          @click="toggleChat"
        >
          <span class="material-symbols-rounded ai-fab-icon">
            {{ isOpen ? 'close' : 'smart_toy' }}
          </span>
          <span class="ai-fab-label">{{ isOpen ? 'Tutup AI' : 'AI Assistant' }}</span>
          <span v-if="!isOpen && !hasGeminiKey" class="ai-fab-dot" title="API Key belum diatur"></span>
        </button>

        <!-- Panel Chat AI Mengambang -->
        <div
          v-if="isOpen"
          class="ai-drawer"
          @dragenter.prevent="onDragEnter"
          @dragover.prevent="onDragOver"
          @dragleave="onDragLeave"
          @drop.prevent="onDropFiles"
        >
          <!-- Overlay Drag & Drop Explorer -->
          <div v-if="isDraggingOver" class="ai-drop-overlay">
            <span class="material-symbols-rounded" style="font-size: 40px;">upload_file</span>
            <div class="ai-drop-title">Lepas gambar / PDF di sini</div>
            <div class="ai-drop-sub">Mendukung PNG, JPG/JPEG, dan PDF langsung dari Explorer</div>
          </div>

          <!-- Header Drawer -->
          <div class="ai-drawer-header">
            <div class="ai-header-brand">
              <div class="ai-avatar-badge">
                <span class="material-symbols-rounded" style="font-size: 20px;">smart_toy</span>
              </div>
              <div>
                <div class="ai-header-title">ZCP AI Assistant</div>
                <div class="ai-header-sub">
                  {{ hasGeminiKey ? 'Gemini Siap • CRUD &amp; Bulk CRUD' : 'API Key Gemini belum diatur' }}
                </div>
              </div>
            </div>
            <div class="ai-header-actions">
              <button
                v-if="activeTab === 'chat'"
                type="button"
                class="btn btn-ghost btn-icon-sm"
                title="Bersihkan percakapan"
                @click="clearChat"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">delete_sweep</span>
              </button>
              <button
                v-if="activeTab === 'logs'"
                type="button"
                class="btn btn-ghost btn-icon-sm"
                title="Refresh Log Perubahan"
                :disabled="loadingLogs"
                @click="loadAiLogs(false)"
              >
                <span class="material-symbols-rounded" style="font-size: 18px;">refresh</span>
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-icon-sm"
                title="Tutup"
                @click="isOpen = false"
              >
                <span class="material-symbols-rounded" style="font-size: 19px;">close</span>
              </button>
            </div>
          </div>

          <!-- Tabs Chat vs Log Perubahan -->
          <div class="ai-drawer-tabs">
            <button
              type="button"
              class="ai-tab-btn"
              :class="{ active: activeTab === 'chat' }"
              @click="switchTab('chat')"
            >
              <span class="material-symbols-rounded" style="font-size: 16px;">forum</span>
              <span>Chat AI</span>
            </button>
            <button
              type="button"
              class="ai-tab-btn"
              :class="{ active: activeTab === 'logs' }"
              @click="switchTab('logs')"
            >
              <span class="material-symbols-rounded" style="font-size: 16px;">history</span>
              <span>Log Perubahan (20)</span>
              <span v-if="aiLogs.length" class="ai-tab-count">{{ aiLogs.length }}</span>
            </button>
          </div>

          <!-- TAB 1: CHAT AI -->
          <template v-if="activeTab === 'chat'">
            <!-- Peringatan jika API Key kosong -->
            <div v-if="!hasGeminiKey" class="ai-key-banner">
              <span class="material-symbols-rounded" style="font-size: 18px;">key_off</span>
              <div style="flex: 1;">
                <div style="font-weight: 600;">API Key Gemini Belum Diatur</div>
                <div style="font-size: 11.5px; opacity: 0.9;">
                  {{
                    isSuperadmin
                      ? 'Isi URL API &amp; API Key Gemini di menu Pengaturan agar AI dapat merespons.'
                      : 'Hubungi Superadmin untuk mengatur API Key Gemini di menu Pengaturan.'
                  }}
                </div>
              </div>
              <button
                v-if="isSuperadmin"
                type="button"
                class="btn btn-primary btn-xs"
                @click="$emit('open-settings'); isOpen = false"
              >
                Pengaturan
              </button>
            </div>

            <!-- Daftar Pesan Chat -->
            <div ref="chatMessagesBox" class="ai-messages-box">
              <div
                v-for="msg in messages"
                :key="msg.id"
                class="ai-msg-row"
                :class="msg.role"
              >
                <div class="ai-msg-bubble" :class="{ error: msg.isError }">
                  <div v-if="msg.attachmentsMeta && msg.attachmentsMeta.length" class="ai-msg-attachments">
                    <div
                      v-for="(att, aIdx) in msg.attachmentsMeta"
                      :key="aIdx"
                      class="ai-msg-att-chip"
                    >
                      <img
                        v-if="att.isImage && att.previewDataUrl"
                        :src="att.previewDataUrl"
                        :alt="att.name"
                        class="ai-msg-att-thumb"
                      />
                      <span v-else class="material-symbols-rounded" style="font-size: 18px;">picture_as_pdf</span>
                      <span class="ai-msg-att-name">{{ att.name }}</span>
                    </div>
                  </div>

                  <div class="ai-msg-text">{{ msg.text }}</div>

                  <div v-if="msg.pendingProposalId" class="ai-proposal-cta">
                    <button
                      type="button"
                      class="btn btn-primary btn-xs"
                      @click="openConfirmModal(msg.pendingProposalId)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 15px;">fact_check</span>
                      <span>Tinjau &amp; Konfirmasi ({{ msg.operationsCount }} Aksi)</span>
                    </button>
                  </div>
                  <div v-else-if="msg.executed" class="ai-proposal-done">
                    <span class="material-symbols-rounded" style="font-size: 14px;">check_circle</span>
                    <span>Perubahan telah dieksekusi</span>
                  </div>
                </div>
              </div>

              <!-- Indikator Loading Gemini -->
              <div v-if="sending" class="ai-msg-row assistant">
                <div class="ai-msg-bubble ai-typing-bubble">
                  <span class="spinner spinner-sm"></span>
                  <span>Gemini sedang menganalisis permintaan...</span>
                </div>
              </div>

              <!-- Contoh Perintah Cepat saat baru mulai -->
              <div v-if="messages.length === 1 && !sending" class="ai-quick-prompts">
                <div class="ai-quick-title">Coba perintah cepat:</div>
                <button
                  v-for="(qp, idx) in quickPrompts"
                  :key="idx"
                  type="button"
                  class="ai-quick-chip"
                  @click="applyQuickPrompt(qp)"
                >
                  {{ qp }}
                </button>
              </div>
            </div>

            <!-- Lampiran File yang siap dikirim -->
            <div v-if="pendingAttachments.length" class="ai-pending-attachments">
              <div
                v-for="att in pendingAttachments"
                :key="att.id"
                class="ai-att-preview-chip"
              >
                <img
                  v-if="att.isImage && att.previewDataUrl"
                  :src="att.previewDataUrl"
                  :alt="att.name"
                  class="ai-att-thumb"
                />
                <span v-else class="material-symbols-rounded" style="font-size: 20px; color: var(--accent-danger);">picture_as_pdf</span>
                <div class="ai-att-meta">
                  <div class="ai-att-name">{{ att.name }}</div>
                  <div class="ai-att-size">{{ formatFileSize(att.size) }}</div>
                </div>
                <button
                  type="button"
                  class="ai-att-remove"
                  title="Hapus lampiran"
                  @click="removePendingAttachment(att.id)"
                >
                  <span class="material-symbols-rounded" style="font-size: 14px;">close</span>
                </button>
              </div>
            </div>

            <!-- Input Chat -->
            <div class="ai-input-area">
              <input
                ref="chatFileInput"
                type="file"
                accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                multiple
                style="display: none;"
                @change="handleFileInputChange"
              />
              <button
                type="button"
                class="btn btn-secondary btn-icon-sm"
                title="Upload PNG, JPG, atau PDF (bisa juga drag &amp; drop / Ctrl+V)"
                :disabled="sending"
                @click="triggerFilePicker"
              >
                <span class="material-symbols-rounded" style="font-size: 19px;">attach_file</span>
              </button>
              <textarea
                ref="promptTextarea"
                v-model="promptInput"
                class="ai-textarea"
                rows="1"
                placeholder="Ketik perintah atau seret PNG/JPG/PDF ke sini..."
                :disabled="sending"
                @keydown="handleTextareaKeydown"
                @paste="onPaste"
              ></textarea>
              <button
                type="button"
                class="btn btn-primary btn-icon-sm ai-send-btn"
                title="Kirim ke Gemini"
                :disabled="sending || (!promptInput.trim() && !pendingAttachments.length)"
                @click="sendMessage"
              >
                <span v-if="sending" class="spinner spinner-sm"></span>
                <span v-else class="material-symbols-rounded" style="font-size: 19px;">send</span>
              </button>
            </div>
          </template>

          <!-- TAB 2: LOG PERUBAHAN 20 TERAKHIR + ROLLBACK -->
          <div v-else class="ai-logs-pane">
            <div class="ai-logs-info-bar">
              Menyimpan otomatis maksimal <strong>20 log perubahan terakhir</strong> (log ke-21 menghapus yang paling lama).
            </div>

            <div v-if="loadingLogs" class="ai-logs-empty">
              <div class="spinner spinner-md"></div>
              <p>Memuat riwayat perubahan AI...</p>
            </div>

            <div v-else-if="!aiLogs.length" class="ai-logs-empty">
              <span class="material-symbols-rounded" style="font-size: 36px; opacity: 0.45;">history</span>
              <div style="font-weight: 600;">Belum ada perubahan dari AI</div>
              <p>Setiap CRUD / Bulk CRUD yang disetujui melalui AI akan muncul di sini lengkap dengan tombol Rollback.</p>
            </div>

            <div v-else class="ai-logs-list">
              <div
                v-for="(log, idx) in aiLogs"
                :key="log.id"
                class="ai-log-card"
                :class="{ rolled: log.rolledBack }"
              >
                <div class="ai-log-card-top">
                  <div>
                    <div class="ai-log-meta-row">
                      <span class="ai-log-index">#{{ idx + 1 }}</span>
                      <span class="ai-log-time">{{ formatTimestamp(log.createdAt) }}</span>
                      <span
                        class="status-badge"
                        :class="log.rolledBack ? 'warn' : 'done'"
                      >
                        {{ log.rolledBack ? 'Sudah Rollback' : 'Aktif' }}
                      </span>
                    </div>
                    <div class="ai-log-actor">
                      Oleh: <strong>{{ log.actorName }}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    class="btn btn-xs"
                    :class="log.rolledBack ? 'btn-secondary' : 'btn-danger-outline'"
                    :disabled="log.rolledBack || Boolean(rollingBackLogId)"
                    @click="promptRollback(log)"
                  >
                    <span v-if="rollingBackLogId === log.id" class="spinner spinner-sm"></span>
                    <span v-else class="material-symbols-rounded" style="font-size: 14px;">undo</span>
                    <span>{{ log.rolledBack ? 'Di-rollback' : 'Rollback' }}</span>
                  </button>
                </div>

                <div v-if="log.prompt" class="ai-log-prompt">
                  "{{ log.prompt }}"
                </div>

                <div class="ai-log-changes-list">
                  <div
                    v-for="(ch, cIdx) in log.changes"
                    :key="cIdx"
                    class="ai-log-change-chip"
                  >
                    <span class="ai-op-mini-badge" :class="String(ch.type || '').toLowerCase()">
                      {{ ch.type }}
                    </span>
                    <span class="ai-col-mini">{{ getCollectionLabel(ch.collection) }}</span>
                    <span class="ai-label-mini">{{ ch.label }}</span>
                  </div>
                </div>

                <div v-if="log.rolledBack" class="ai-log-rollback-note">
                  Dikembalikan oleh {{ log.rolledBackByName || 'Admin' }} pada {{ formatTimestamp(log.rolledBackAt) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- MODAL KONFIRMASI DETAIL SEBELUM AI EKSEKUSI CRUD / BULK CRUD -->
        <div
          v-if="confirmModal.visible"
          class="modal-overlay ai-confirm-backdrop"
          @click.self="closeConfirmModal"
        >
          <div class="modal-card ai-confirm-card">
            <div class="modal-header">
              <div>
                <h2 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
                  <span class="material-symbols-rounded" style="color: var(--accent-info);">fact_check</span>
                  <span>Konfirmasi Perubahan AI</span>
                  <span class="nav-badge" style="font-size: 11px;">
                    {{ confirmModal.operations.length }} Operasi
                  </span>
                </h2>
                <p style="font-size: 12.5px; color: var(--text-secondary); margin-top: 2px;">
                  Periksa detail data yang akan diubah oleh AI sebelum disimpan ke database.
                </p>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-icon-sm"
                :disabled="confirmModal.executing"
                @click="closeConfirmModal"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>

            <div class="modal-body">
              <div class="ai-confirm-summary-box">
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 600;">Ringkasan Rencana AI</div>
                <div style="font-size: 13.5px; margin-top: 3px;">{{ confirmModal.replySummary }}</div>
              </div>

              <div class="ai-confirm-toolbar">
                <span style="font-size: 12.5px; color: var(--text-secondary);">
                  Terpilih <strong>{{ selectedOpsCount }}</strong> dari {{ validOpsCount }} operasi valid
                </span>
                <div class="chips-wrap">
                  <button type="button" class="link-btn" @click="toggleAllConfirmOps(true)">
                    Pilih Semua
                  </button>
                  <button type="button" class="link-btn" @click="toggleAllConfirmOps(false)">
                    Batal Semua
                  </button>
                </div>
              </div>

              <div class="ai-confirm-ops-list">
                <div
                  v-for="(op, idx) in confirmModal.operations"
                  :key="op.opKey"
                  class="ai-op-card"
                  :class="{ invalid: op.valid === false, unchecked: !op.selected }"
                >
                  <div class="ai-op-card-head">
                    <label class="ai-op-check-label">
                      <input
                        v-model="op.selected"
                        type="checkbox"
                        :disabled="op.valid === false || confirmModal.executing"
                      />
                      <span class="ai-op-index">#{{ idx + 1 }}</span>
                      <span class="ai-op-badge" :class="String(op.type).toLowerCase()">
                        {{ getOpLabel(op.type) }}
                      </span>
                      <span class="ai-col-badge">{{ getCollectionLabel(op.collection) }}</span>
                      <strong class="ai-op-title">{{ op.label }}</strong>
                    </label>
                  </div>

                  <div v-if="op.reason" class="ai-op-reason">
                    {{ op.reason }}
                  </div>

                  <div v-if="op.valid === false" class="ai-op-invalid-msg">
                    <span class="material-symbols-rounded" style="font-size: 16px;">error</span>
                    <span>{{ op.invalidReason }}</span>
                  </div>

                  <div v-else-if="op.detailRows && op.detailRows.length" class="ai-op-diff-table">
                    <div
                      v-for="(row, rIdx) in op.detailRows"
                      :key="rIdx"
                      class="ai-diff-row"
                    >
                      <div class="ai-diff-field">{{ getFieldLabel(row.field) }}</div>
                      <div class="ai-diff-val">
                        <template v-if="op.type === 'UPDATE'">
                          <span class="ai-val-before">{{ row.before }}</span>
                          <span class="material-symbols-rounded" style="font-size: 14px; color: var(--text-muted);">arrow_forward</span>
                          <span class="ai-val-after">{{ row.after }}</span>
                        </template>
                        <template v-else-if="op.type === 'DELETE'">
                          <span class="ai-val-delete">{{ row.before }}</span>
                        </template>
                        <template v-else>
                          <span class="ai-val-after">{{ row.after }}</span>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Opsi Upload Lampiran ke Google Drive jika ada file terlampir -->
              <div
                v-if="confirmModal.attachments && confirmModal.attachments.length"
                class="ai-drive-attach-box"
              >
                <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer;">
                  <input
                    v-model="confirmModal.uploadAttachmentsToDrive"
                    type="checkbox"
                    :disabled="!driveReady || !canAttachDriveInConfirm || confirmModal.executing"
                    style="margin-top: 3px;"
                  />
                  <div>
                    <div style="font-size: 13px; font-weight: 600;">
                      Lampirkan {{ confirmModal.attachments.length }} file upload ke Google Drive Pesanan/Sablon
                    </div>
                    <div class="form-hint">
                      {{
                        driveReady
                          ? 'File akan diunggah ke Google Drive dan otomatis tertaut di tombol Lihat File.'
                          : 'Google Drive API belum dikonfigurasi di menu Pengaturan, file hanya dibaca oleh AI.'
                      }}
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="confirmModal.executing"
                @click="closeConfirmModal"
              >
                Batal
              </button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="confirmModal.executing || selectedOpsCount === 0"
                @click="executeApprovedOperations"
              >
                <span v-if="confirmModal.executing" class="spinner spinner-sm"></span>
                <span>
                  {{
                    confirmModal.executing
                      ? 'Menjalankan...'
                      : 'Konfirmasi & Eksekusi (' + selectedOpsCount + ')'
                  }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  };
})(window);
