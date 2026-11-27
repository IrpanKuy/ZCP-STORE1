/**
 * Service Firestore & Firebase Auth untuk Manajemen Akun Karyawan / Admin / Superadmin
 */
(function (global) {
  'use strict';

  var USERS_COLLECTION = 'users';

  function getDbOrThrow() {
    var db = global.ZcpFirebase && global.ZcpFirebase.getDb();
    if (!db) {
      throw new Error('Firebase belum dikonfigurasi.');
    }
    return db;
  }

  function normalizeBoronganPerSisi(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') {
      return isFinite(val) ? Math.max(0, Math.round(val)) : 0;
    }
    var cleaned = String(val).replace(/[^\d-]/g, '');
    var num = parseInt(cleaned, 10);
    return isFinite(num) ? Math.max(0, num) : 0;
  }

  function mapAuthCreateError(err) {
    var code = err && err.code ? err.code : '';
    if (code === 'auth/email-already-in-use') {
      return 'Email tersebut sudah terdaftar di Firebase Authentication.';
    }
    if (code === 'auth/invalid-email') {
      return 'Format email tidak valid.';
    }
    if (code === 'auth/weak-password') {
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Login Email/Password belum diaktifkan di Firebase Console.';
    }
    return (err && err.message) || 'Gagal membuat akun di Firebase Authentication.';
  }

  global.ZcpUserService = {
    getUserProfile: async function (authUser) {
      if (!authUser || !authUser.uid) return null;
      var db = getDbOrThrow();
      var doc = await db.collection(USERS_COLLECTION).doc(authUser.uid).get();
      var email = authUser.email || '';
      var fallbackName = email ? email.split('@')[0] : 'Superadmin';

      if (!doc.exists) {
        return {
          uid: authUser.uid,
          email: email,
          nama: fallbackName,
          role: 'superadmin',
          active: true,
          boronganPerSisi: 0,
          isImplicitSuperadmin: true
        };
      }

      var data = doc.data() || {};
      return {
        uid: authUser.uid,
        email: data.email || email,
        nama: data.nama || fallbackName,
        role: data.role || 'karyawan',
        active: data.active !== false,
        boronganPerSisi: normalizeBoronganPerSisi(data.boronganPerSisi),
        isImplicitSuperadmin: false
      };
    },

    fetchUsers: async function () {
      var db = getDbOrThrow();
      var snapshot = await db.collection(USERS_COLLECTION).orderBy('createdAt', 'desc').get();
      return snapshot.docs.map(function (doc) {
        var data = doc.data() || {};
        return {
          uid: doc.id,
          nama: data.nama || '',
          email: data.email || '',
          role: data.role || 'karyawan',
          active: data.active !== false,
          boronganPerSisi: normalizeBoronganPerSisi(data.boronganPerSisi),
          createdByName: data.createdByName || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        };
      });
    },

    subscribeUsers: function (onData, onError) {
      var db = getDbOrThrow();
      return db
        .collection(USERS_COLLECTION)
        .orderBy('createdAt', 'desc')
        .onSnapshot(
          function (snapshot) {
            var list = snapshot.docs.map(function (doc) {
              var data = doc.data() || {};
              return {
                uid: doc.id,
                nama: data.nama || '',
                email: data.email || '',
                role: data.role || 'karyawan',
                active: data.active !== false,
                boronganPerSisi: normalizeBoronganPerSisi(data.boronganPerSisi),
                createdByName: data.createdByName || '',
                createdAt: data.createdAt || null,
                updatedAt: data.updatedAt || null
              };
            });
            onData(list);
          },
          function (error) {
            if (typeof onError === 'function') {
              onError(error);
            }
          }
        );
    },

    createEmployeeAccount: async function (payload) {
      var db = getDbOrThrow();
      var secondaryAuth = global.ZcpFirebase && global.ZcpFirebase.getSecondaryAuth();
      if (!secondaryAuth) {
        throw new Error('Firebase Auth sekunder tidak tersedia.');
      }

      var nama = (payload.nama || '').trim();
      var email = (payload.email || '').trim().toLowerCase();
      var password = String(payload.password || '');
      var role = payload.role === 'admin' ? 'admin' : 'karyawan';
      var boronganPerSisi = normalizeBoronganPerSisi(payload.boronganPerSisi);

      if (!nama) throw new Error('Nama lengkap wajib diisi.');
      if (!email) throw new Error('Email wajib diisi.');
      if (password.length < 6) {
        throw new Error('Kata sandi minimal 6 karakter.');
      }

      var cred;
      try {
        cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
      } catch (err) {
        throw new Error(mapAuthCreateError(err));
      }

      var newUid = cred && cred.user && cred.user.uid;
      if (!newUid) {
        throw new Error('Gagal mendapatkan UID akun baru.');
      }

      var actor =
        (global.ZcpActivityLogService && global.ZcpActivityLogService.getCurrentActor()) || {};

      try {
        await db.collection(USERS_COLLECTION).doc(newUid).set({
          uid: newUid,
          nama: nama,
          email: email,
          role: role,
          active: true,
          boronganPerSisi: boronganPerSisi,
          createdByUid: actor.uid || '',
          createdByName: actor.nama || actor.email || 'Superadmin',
          createdAt: global.ZcpFirebase.serverTimestamp(),
          updatedAt: global.ZcpFirebase.serverTimestamp()
        });
      } finally {
        try {
          await secondaryAuth.signOut();
        } catch (e) {
          // Abaikan error signOut sekunder
        }
      }

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'CREATE',
          module: 'Akun Karyawan',
          targetName: nama,
          details:
            'Membuat akun ' +
            role +
            ' (' +
            email +
            '), Borongan/sisi: Rp ' +
            boronganPerSisi.toLocaleString('id-ID')
        });
      }

      return {
        uid: newUid,
        nama: nama,
        email: email,
        role: role,
        boronganPerSisi: boronganPerSisi
      };
    },

    updateUserAccount: async function (uid, payload) {
      var db = getDbOrThrow();
      if (!uid) throw new Error('UID akun tidak valid.');

      var nama = (payload.nama || '').trim();
      if (!nama) throw new Error('Nama lengkap wajib diisi.');

      var role =
        payload.role === 'superadmin'
          ? 'superadmin'
          : payload.role === 'admin'
            ? 'admin'
            : 'karyawan';
      var active = payload.active !== false;

      var updateData = {
        nama: nama,
        role: role,
        active: active,
        updatedAt: global.ZcpFirebase.serverTimestamp()
      };

      var hasRate = payload.boronganPerSisi !== undefined;
      var boronganPerSisi = 0;
      if (hasRate) {
        boronganPerSisi = normalizeBoronganPerSisi(payload.boronganPerSisi);
        updateData.boronganPerSisi = boronganPerSisi;
      }

      await db.collection(USERS_COLLECTION).doc(uid).update(updateData);

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Akun Karyawan',
          targetName: nama,
          details:
            'Role: ' +
            role +
            ', Status: ' +
            (active ? 'Aktif' : 'Nonaktif') +
            (hasRate ? ', Borongan/sisi: Rp ' + boronganPerSisi.toLocaleString('id-ID') : '')
        });
      }
    },

    saveOwnSuperadminProfile: async function (uid, payload) {
      var db = getDbOrThrow();
      if (!uid) throw new Error('UID tidak valid.');
      var nama = (payload.nama || '').trim();
      if (!nama) throw new Error('Nama tampilan wajib diisi.');

      await db.collection(USERS_COLLECTION).doc(uid).set(
        {
          uid: uid,
          nama: nama,
          email: String(payload.email || ''),
          role: 'superadmin',
          active: true,
          updatedAt: global.ZcpFirebase.serverTimestamp()
        },
        { merge: true }
      );

      if (global.ZcpActivityLogService) {
        await global.ZcpActivityLogService.logActivity({
          action: 'UPDATE',
          module: 'Pengaturan',
          targetName: nama,
          details: 'Memperbarui nama tampilan Superadmin'
        });
      }
    }
  };
})(window);
