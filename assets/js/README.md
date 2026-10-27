# Utilitas `util.js`

`util.js` berisi fungsi JavaScript vanilla yang dapat dipakai lewat objek global
`util`. File ini harus dimuat sebelum `main.js`.

```html
<script src="assets/js/util.js"></script>
<script src="assets/js/main.js"></script>
```

## Daftar fungsi

| Fungsi | Kegunaan |
| --- | --- |
| `util.navList(nav)` | Membuat string HTML tautan dari semua tautan di elemen navigasi, dengan kelas kedalaman untuk indentasi. |
| `util.panel(element, options)` | Menambahkan perilaku buka/tutup panel, misalnya menu samping. |
| `util.placeholder(forms)` | Fallback placeholder untuk input teks dan textarea di browser lama yang belum mendukung placeholder bawaan. |
| `util.prioritize(elements, condition)` | Memindahkan elemen ke awal parent-nya, lalu mengembalikannya ke posisi semula. |
| `util.scrolly(selector, options)` | Menambahkan smooth scroll ke tautan internal yang cocok dengan selector. |
| `util.scrollex(element, options)` | Memanggil callback saat elemen memasuki atau meninggalkan area yang ditentukan relatif ke viewport. |

## `util.navList(nav)`

Mengambil semua tautan di dalam elemen navigasi dan menghasilkan string HTML.
Kelas `depth-N` dan `indent-N` menunjukkan tingkat kedalaman daftar.

```js
var nav = document.querySelector('#nav');
var linksHtml = util.navList(nav);
document.querySelector('#mobile-menu').innerHTML = linksHtml;
```

Parameter `nav` harus berupa elemen DOM. Fungsi mengembalikan string HTML,
bukan elemen DOM.

## `util.panel(element, options)`

Mengaktifkan perilaku panel pada elemen DOM. Tautan dengan `href="#ID_PANEL"`
akan membuka/menutup panel, jika `ID_PANEL` adalah id elemen panel. Fungsi ini
mengembalikan objek dengan metode `hide()`.

```html
<a href="#menu">Buka menu</a>
<nav id="menu">
  <a href="layanan.html">Layanan</a>
</nav>
```

```js
var menu = document.querySelector('#menu');
var menuPanel = util.panel(menu, {
  target: document.body,
  visibleClass: 'is-menu-visible',
  hideOnClick: true,
  hideOnEscape: true,
  hideOnSwipe: true,
  side: 'right',
  delay: 300,
  resetScroll: true,
  resetForms: true
});

// Tutup panel secara manual:
menuPanel.hide();
```

Opsi:

| Opsi | Default | Kegunaan |
| --- | --- | --- |
| `target` | Elemen panel | Elemen yang diberi/dihapus kelas saat panel dibuka atau ditutup. Bisa berupa elemen DOM atau selector string. |
| `visibleClass` | `'visible'` | Kelas yang menandai panel sedang terbuka. |
| `hideOnClick` | `false` | Tutup panel saat tautan tujuan di dalam panel diklik. |
| `hideOnEscape` | `false` | Tutup panel saat tombol Escape ditekan. |
| `hideOnSwipe` | `false` | Tutup panel saat pengguna menggeser ke arah yang sesuai dengan `side`. |
| `side` | `null` | Arah panel: `'left'`, `'right'`, `'top'`, atau `'bottom'`; dipakai untuk mendeteksi arah swipe. |
| `delay` | `0` | Jeda dalam milidetik sebelum reset scroll/form; untuk navigasi tautan, panel ditutup sebelum halaman dialihkan. |
| `resetScroll` | `false` | Kembalikan posisi scroll panel ke atas setelah ditutup. |
| `resetForms` | `false` | Reset form di dalam panel setelah ditutup. |

Pastikan panel memiliki `id` dan tautan pemicu menggunakan `href` yang cocok,
misalnya `href="#menu"` untuk panel `id="menu"`.

## `util.placeholder(forms)`

Fallback ini hanya aktif jika browser tidak mendukung atribut `placeholder`
secara native. Parameter dapat berupa selector string, satu elemen form, atau
kumpulan elemen form. Implementasi ini mencakup input teks dan textarea.

```js
util.placeholder('form');
```

Pada browser modern fungsi langsung selesai tanpa mengubah form.

## `util.prioritize(elements, condition)`

Jika `condition` bernilai `true`, pindahkan elemen ke posisi pertama di parent.
Panggil lagi dengan `false` untuk mengembalikan elemen ke posisi sebelumnya.
Parameter `elements` dapat berupa selector string, elemen DOM, atau kumpulan
elemen.

```js
var sidebar = document.querySelector('.sidebar');

// Pindahkan sidebar ke awal parent:
util.prioritize(sidebar, true);

// Kembalikan ke posisi semula:
util.prioritize(sidebar, false);
```

## `util.scrolly(selector, options)`

Menambahkan smooth scroll pada tautan yang href-nya menunjuk ke id elemen
halaman, misalnya `href="#kontak"`.

```html
<a class="scrolly" href="#kontak">Lihat kontak</a>
<section id="kontak">...</section>
```

```js
util.scrolly('.scrolly', {
  speed: 1500,
  offset: function() {
    return document.querySelector('#header').offsetHeight;
  }
});
```

Opsi:

| Opsi | Default | Kegunaan |
| --- | --- | --- |
| `speed` | `1000` | Durasi animasi scroll dalam milidetik. Nilai nol atau lebih kecil akan langsung menuju tujuan. |
| `offset` | `0` | Jarak dalam piksel yang dikurangi dari posisi tujuan. Bisa berupa angka atau fungsi yang mengembalikan angka, misalnya tinggi header tetap. |
| `anchor` | `'top'` | Posisi target. `'top'` menyelaraskan target ke atas; `'middle'` menempatkannya kira-kira di tengah viewport. |

Contoh tanpa konfigurasi khusus:

```js
util.scrolly('a.scrolly');
```

## `util.scrollex(element, options)`

Memantau posisi sebuah elemen ketika halaman di-scroll atau ukuran viewport
berubah. Fungsi mengembalikan fungsi pembersih untuk melepas event listener.

```js
var banner = document.querySelector('#banner');

var stopWatching = util.scrollex(banner, {
  bottom: document.querySelector('#header').offsetHeight,
  enter: function() {
    document.body.classList.add('banner-visible');
  },
  leave: function() {
    document.body.classList.remove('banner-visible');
  }
});

// Jika pemantauan tidak diperlukan lagi:
stopWatching();
```

Opsi:

| Opsi | Default | Kegunaan |
| --- | --- | --- |
| `top` | `0` | Insets dari tepi atas elemen sebelum menghitung area pemantauan. |
| `bottom` | `0` | Insets dari tepi bawah elemen sebelum menghitung area pemantauan. |
| `mode` | `'default'` | Cara menentukan kapan elemen aktif; mode yang tersedia dijelaskan di bawah. |
| `delay` | `0` | Jeda dalam milidetik sebelum pemeriksaan scroll dijalankan. |
| `initialize` | `null` | Callback yang dipanggil sekali saat pemantauan mulai. |
| `enter` | `null` | Callback saat elemen berubah menjadi aktif. |
| `leave` | `null` | Callback saat elemen berubah menjadi tidak aktif. |
| `scroll` | `null` | Callback pada pemeriksaan scroll, menerima angka progress relatif terhadap area elemen. |
| `terminate` | `null` | Callback saat fungsi pembersih dipanggil. |

Mode:

- `'default'`: aktif selama elemen (setelah memperhitungkan `top`/`bottom`)
  beririsan dengan viewport.
- `'top'`: aktif ketika tepi atas viewport berada dalam area elemen.
- `'bottom'`: aktif ketika tepi bawah viewport berada dalam area elemen.
- `'middle'`: aktif ketika titik tengah viewport berada dalam area elemen.
- `'top-only'`: aktif ketika batas atas area elemen berada di viewport.
- `'bottom-only'`: aktif ketika batas bawah area elemen berada di viewport.

Nilai `top` dan `bottom` dapat berupa angka piksel atau string seperti
`'20px'`, `'10%'`, dan `'15vh'`.

## Contoh penggunaan di proyek ini

`main.js` menggunakan `scrolly` untuk tautan smooth scroll, `panel` untuk menu,
dan `scrollex` untuk mengubah kelas header saat banner melintasi viewport.
Umumnya, fungsi-fungsi ini dipanggil setelah elemen terkait tersedia di halaman.
