aku punya usaha sablon bernama ZCP STORE, aku ingin membuat webapp untuk manajemen sablonku, jadi aku ingin setiap pesanan bisa dilihat
apakah pesanan ini sudah dibuatkan sablonnya atau tidak, dan tambahan fitur operasional yang mencatata pesanan dan deadline pesanan, app
ini menggukanan backend firebase, Jadi buatkan juga rules untuk meengatur akses untuk login, dan untuk membuat akun caranya ke firebase
auth untuk membuat akun sendiri. dan hanya ada 1 role yaitu admin, dan untuk logo app, ada di zcpstore.jpg, dan untuk refrensi design ada di material-dashboard.jpg, dan terdapat fitur untuk light mode dark mode.
berikut detail fiturnya:

1. master data

- berisi Master data produk yang isinya data nama produk dan nama sisi dengan tambahan fitur dynamic input yang datanya bisa ditambah kurangi
  dengan flexibel
- berisi Master data expedisi yang isinya nama expedisi

2. Manajemen pesanan
   -Crud pesanan
   -isi data pesanan adalah, Nama pemesan, nama produk(select berdasarkan data produk di master data), multiple select nama sisi(banyaknya select
   tergantung banyaknya nama sisi yang diinput di master data produk yang bersangkutan) , jumlah produk, file Design(bisa lebih dari 1),
   expedisi(select berdasarkan data master data Expedisi seperti jnt, spx), catatan(opsional)

3. Fitur Operasional
   -semua data pesanan muncul disini, lalu admin bisa atur tanggal mulai kerjakan, dan tanggal harus selesai sebelum, admin harus bisa bulk update
   untuk mengatur tanggal mulai selesai ke banyak pesanan, agar semua pesanan bisa diatur untuk tanggal mulai selesai dengan cepat.
   -lalu dibawah data pesanan ada indikator jumlah sablon sisi sudah dibuat “10 dari 20 selesai”, logikanya pada setiap pesanan akan muncul
   row nama sisi yang berasal dari looping daftar nama sisi di master data > produk, kemudian angka “0 dari 20 selesai”, angka 0 akan
   bertambah jika pesanan bersangkutan di manajemen sablon sudah selesai.
   -data tabel: akan ada tombol untuk atur pesanan selesai, jika diklik border tabel jadi warna hijau dan pesanan akan langsung ke row bagian
   bawah, row atas hanya untuk pesanan yang belum selesai

4. Fitur manajemen sablon
   -disini akan ada crud sablon.
   -terdapat input nama sablon, dynamic input select pesanan(bisa search), dan input jumlah sablon dibuat tiap sisi(jika nama sisi ada 3, artinya ada 3 input jumlah untuk setiap nama sisi), dan upload file sablon, support png jpg pdf, dan input number jumlah perulangan(jika input 3 maka di tabel akan ada 3 kolom yang perlu di checklist), dan catatan(opsional)
   -logika jika sablon sudah di klik selesai, maka data jumlah sisi yang diinput akan menambah angka 0 dari “0 dari 20 selesai” sesuai dengan jumlah sisi yang yang diinput, dan setelah selesai maka border row akan warna biru
