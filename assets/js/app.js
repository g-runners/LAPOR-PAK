(function () {
	'use strict';

	var storageKey = 'lapor-pak-reports-v1';
	var statuses = ['Menunggu ditangani', 'Dalam penanganan', 'Selesai'];
	var severityOrder = { Tinggi: 3, Sedang: 2, Rendah: 1 };
	var reports = [];
	var storageReady = true;
	var selectedPhoto = null;
	var previewUrl = '';
	var toastTimer;
	var list = document.getElementById('report-list');
	var form = document.getElementById('report-form');
	var modal = document.getElementById('report-modal');
	var toast = document.getElementById('toast');
	var storageError = document.getElementById('storage-error');
	var photoInput = document.getElementById('report-photo');
	var photoPreview = document.getElementById('photo-preview');

	function escapeHtml(value) {
		return String(value).replace(/[&<>"']/g, function (character) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
		});
	}

	function loadReports() {
		try {
			var saved = localStorage.getItem(storageKey);
			reports = saved ? JSON.parse(saved) : [];
			if (!Array.isArray(reports))
				throw new Error('Format data laporan tidak valid.');
		}
		catch (error) {
			storageReady = false;
			storageError.hidden = false;
			console.error('Gagal membaca data LAPOR PAK dari penyimpanan browser.', error);
			showToast('Data laporan gagal dibaca. Penyimpanan browser perlu diperiksa.');
			reports = [];
		}
	}

	function persistReports() {
		if (!storageReady)
			return false;

		try {
			localStorage.setItem(storageKey, JSON.stringify(reports));
			return true;
		}
		catch (error) {
			storageReady = false;
			storageError.hidden = false;
			console.error('Gagal menyimpan data LAPOR PAK ke penyimpanan browser.', error);
			showToast('Laporan gagal disimpan. Ruang penyimpanan browser mungkin penuh.');
			return false;
		}
	}

	function showToast(message) {
		toast.textContent = message;
		toast.classList.add('is-visible');
		window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(function () {
			toast.classList.remove('is-visible');
		}, 3400);
	}

	function classifySeverity(text) {
		var description = text.toLowerCase();
		if (/\b(amblas|longsor|putus|sangat dalam|lubang besar|membahayakan|kecelakaan|parah)\b/.test(description))
			return 'Tinggi';
		if (/\b(lubang|retak|bergelombang|terkelupas|rusak|genangan)\b/.test(description))
			return 'Sedang';
		return 'Rendah';
	}

	function dateLabel(value) {
		var date = new Date(value);
		return isNaN(date.getTime()) ? 'Tanggal tidak tersedia' : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function statusClass(status) {
		if (status === 'Selesai')
			return 'status-complete';
		if (status === 'Dalam penanganan')
			return 'status-progress';
		return 'status-pending';
	}

	function renderReport(report) {
		var options = statuses.map(function (status) {
			return '<option value="' + status + '"' + (report.status === status ? ' selected' : '') + '>' + status + '</option>';
		}).join('');
		var photo = report.photo
			? '<img class="report-photo" src="' + report.photo + '" alt="Foto kerusakan: ' + escapeHtml(report.title) + '" />'
			: '<div class="report-photo report-photo-placeholder" aria-hidden="true">⌁</div>';
		var proof = report.repairPhoto
			? '<a class="repair-proof" href="' + report.repairPhoto + '" target="_blank" rel="noopener">▧ Lihat foto perbaikan</a>'
			: '<label class="repair-upload">' + (report.status === 'Selesai' ? '＋ Tambah foto perbaikan' : '＋ Unggah foto perbaikan') + '<input type="file" accept="image/jpeg,image/png,image/webp" data-action="repair-photo" data-id="' + escapeHtml(report.id) + '" aria-label="Unggah foto setelah perbaikan" /></label>';
		var rating = report.status === 'Selesai'
			? '<div class="rating" role="group" aria-label="Penilaian hasil perbaikan"><span class="rating-label">' + (report.rating ? 'Penilaian' : 'Nilai hasil') + '</span>' + [1, 2, 3, 4, 5].map(function (value) {
				return '<button type="button" class="' + (report.rating >= value ? 'is-selected' : '') + '" data-action="rate" data-id="' + escapeHtml(report.id) + '" data-rating="' + value + '" aria-label="' + value + ' bintang">★</button>';
			}).join('') + '</div>'
			: '';

		return '<article class="report-card" data-severity="' + escapeHtml(report.severity) + '">' +
			photo +
			'<div class="report-main">' +
				'<div class="report-topline"><span class="severity-pill severity-' + report.severity.toLowerCase() + '">Kerusakan ' + escapeHtml(report.severity) + '</span><span class="status-pill ' + statusClass(report.status) + '">' + escapeHtml(report.status) + '</span></div>' +
				'<h3>' + escapeHtml(report.title) + '</h3>' +
				'<div class="report-location"><span aria-hidden="true">⌖</span>' + escapeHtml(report.location) + (report.coordinates ? ' <span>·</span> <a href="https://www.google.com/maps?q=' + encodeURIComponent(report.coordinates) + '" target="_blank" rel="noopener">Lihat peta</a>' : '') + '</div>' +
				'<div class="report-meta"><span>▤ ' + dateLabel(report.createdAt) + '</span><span>◉ ' + escapeHtml(report.id) + '</span></div>' +
				'<p class="report-description">' + escapeHtml(report.description) + '</p>' +
				(report.repairPhoto ? '<a class="repair-proof repair-proof--inline" href="' + report.repairPhoto + '" target="_blank" rel="noopener">▧ Lihat foto perbaikan</a>' : '') +
			'</div>' +
			'<div class="report-controls"><label class="visually-hidden" for="status-' + escapeHtml(report.id) + '">Ubah status ' + escapeHtml(report.title) + '</label><select class="status-select" id="status-' + escapeHtml(report.id) + '" data-action="status" data-id="' + escapeHtml(report.id) + '">' + options + '</select>' +
				(report.repairPhoto ? '' : proof) + rating +
			'</div>' +
		'</article>';
	}

	function render() {
		document.getElementById('stat-total').textContent = reports.length;
		document.getElementById('stat-pending').textContent = reports.filter(function (report) { return report.status === statuses[0]; }).length;
		document.getElementById('stat-progress').textContent = reports.filter(function (report) { return report.status === statuses[1]; }).length;
		document.getElementById('stat-complete').textContent = reports.filter(function (report) { return report.status === statuses[2]; }).length;
		document.getElementById('nav-report-count').textContent = reports.length;

		var query = document.getElementById('report-search').value.trim().toLowerCase();
		var filter = document.getElementById('status-filter').value;
		var visibleReports = reports.filter(function (report) {
			var matchesQuery = !query || [report.title, report.location, report.description, report.id].join(' ').toLowerCase().includes(query);
			return matchesQuery && (filter === 'all' || report.status === filter);
		}).sort(function (first, second) {
			var severityDifference = severityOrder[second.severity] - severityOrder[first.severity];
			return severityDifference || new Date(second.createdAt) - new Date(first.createdAt);
		});

		if (visibleReports.length) {
			list.innerHTML = visibleReports.map(renderReport).join('');
			return;
		}

		var hasReports = reports.length > 0;
		list.innerHTML = '<div class="empty-state"><span class="empty-icon">⌁</span><h3>' + (hasReports ? 'Laporan tidak ditemukan' : 'Belum ada laporan jalan') + '</h3><p>' + (hasReports ? 'Coba ubah kata pencarian atau filter status.' : 'Jadilah warga pertama yang melaporkan kondisi jalan di sekitar Anda.') + '</p>' + (hasReports ? '' : '<button class="button button-primary" type="button" data-open-form><span class="button-plus">＋</span> Buat laporan pertama</button>') + '</div>';
	}

	function openForm() {
		if (!storageReady) {
			showToast('Formulir dinonaktifkan sampai penyimpanan browser dapat digunakan.');
			return;
		}
		modal.hidden = false;
		document.body.classList.add('modal-open');
		window.setTimeout(function () { document.getElementById('report-title').focus(); }, 20);
	}

	function closeForm() {
		modal.hidden = true;
		document.body.classList.remove('modal-open');
	}

	function imageAsDataUrl(file) {
		return new Promise(function (resolve, reject) {
			var reader = new FileReader();
			reader.onerror = function () { reject(new Error('Foto gagal dibaca. Pilih file lain dan coba lagi.')); };
			reader.onload = function () {
				var image = new Image();
				image.onerror = function () { reject(new Error('File foto tidak dapat dibuka.')); };
				image.onload = function () {
					var scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
					var canvas = document.createElement('canvas');
					canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
					canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
					var context = canvas.getContext('2d');
					if (!context) {
						reject(new Error('Foto tidak dapat diproses di browser ini.'));
						return;
					}
					context.fillStyle = '#ffffff';
					context.fillRect(0, 0, canvas.width, canvas.height);
					context.drawImage(image, 0, 0, canvas.width, canvas.height);
					resolve(canvas.toDataURL('image/jpeg', 0.78));
				};
				image.src = reader.result;
			};
			reader.readAsDataURL(file);
		});
	}

	function validateImage(file) {
		return file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024;
	}

	document.addEventListener('click', function (event) {
		var openButton = event.target.closest('[data-open-form]');
		if (openButton) {
			event.preventDefault();
			openForm();
			return;
		}
		if (event.target.closest('.modal-close, .modal-cancel')) {
			closeForm();
			return;
		}
		if (event.target === modal) {
			closeForm();
			return;
		}
		var ratingButton = event.target.closest('[data-action="rate"]');
		if (ratingButton) {
			var ratedReport = reports.find(function (report) { return report.id === ratingButton.dataset.id; });
			if (!ratedReport)
				return;
			var previousRating = ratedReport.rating;
			ratedReport.rating = Number(ratingButton.dataset.rating);
			if (persistReports()) {
				render();
				showToast('Terima kasih atas penilaian Anda.');
			}
			else {
				ratedReport.rating = previousRating;
				render();
			}
		}
	});

	document.addEventListener('keydown', function (event) {
		if (event.key === 'Escape' && !modal.hidden)
			closeForm();
	});

	document.getElementById('report-search').addEventListener('input', render);
	document.getElementById('status-filter').addEventListener('change', render);
	document.querySelector('.nav-link[href="#laporan"]').addEventListener('click', function () {
		document.querySelectorAll('.nav-link').forEach(function (link) { link.classList.remove('is-active'); });
		this.classList.add('is-active');
		document.getElementById('sidebar').classList.remove('is-open');
		document.querySelector('.mobile-menu').setAttribute('aria-expanded', 'false');
	});
	document.querySelector('.nav-link[href="#dashboard"]').addEventListener('click', function () {
		document.querySelectorAll('.nav-link').forEach(function (link) { link.classList.remove('is-active'); });
		this.classList.add('is-active');
		document.getElementById('sidebar').classList.remove('is-open');
		document.querySelector('.mobile-menu').setAttribute('aria-expanded', 'false');
	});
	document.querySelector('.mobile-menu').addEventListener('click', function () {
		var isOpen = document.getElementById('sidebar').classList.toggle('is-open');
		this.setAttribute('aria-expanded', String(isOpen));
	});
	document.getElementById('locate-button').addEventListener('click', function () {
		var message = document.getElementById('location-message');
		if (!navigator.geolocation) {
			message.textContent = 'Browser ini tidak mendukung akses lokasi.';
			return;
		}
		message.textContent = 'Meminta akses lokasi...';
		navigator.geolocation.getCurrentPosition(function (position) {
			var coordinates = position.coords.latitude.toFixed(5) + ', ' + position.coords.longitude.toFixed(5);
			document.getElementById('report-coordinates').value = coordinates;
			message.textContent = 'Lokasi GPS tercatat. Isi juga nama jalan agar mudah dikenali.';
		}, function (error) {
			message.textContent = error.code === error.PERMISSION_DENIED
				? 'Izin lokasi ditolak. Anda tetap bisa mengisi nama jalan secara manual.'
				: 'Lokasi tidak berhasil didapatkan. Silakan isi nama jalan secara manual.';
			console.warn('Lokasi perangkat tidak dapat diakses.', error);
		}, { enableHighAccuracy: true, timeout: 10000 });
	});

	photoInput.addEventListener('change', function () {
		selectedPhoto = photoInput.files[0] || null;
		document.getElementById('form-error').textContent = '';
		if (previewUrl)
			URL.revokeObjectURL(previewUrl);
		previewUrl = '';
		if (selectedPhoto && validateImage(selectedPhoto)) {
			previewUrl = URL.createObjectURL(selectedPhoto);
			photoPreview.src = previewUrl;
			photoPreview.hidden = false;
			document.querySelector('.upload-box strong').textContent = selectedPhoto.name;
			document.querySelector('.upload-box small').textContent = 'Foto siap dilampirkan';
		}
		else if (selectedPhoto) {
			photoPreview.hidden = true;
			document.querySelector('.upload-box strong').textContent = 'Pilih foto kerusakan';
			document.querySelector('.upload-box small').textContent = 'File harus berupa JPG, PNG, atau WebP dan maks. 5 MB';
		}
	});

	form.addEventListener('submit', async function (event) {
		event.preventDefault();
		var errorBox = document.getElementById('form-error');
		errorBox.textContent = '';
		if (!storageReady) {
			errorBox.textContent = 'Penyimpanan browser tidak tersedia. Laporan belum dapat dikirim.';
			return;
		}
		if (!validateImage(selectedPhoto)) {
			errorBox.textContent = 'Pilih foto JPG, PNG, atau WebP berukuran maksimal 5 MB.';
			return;
		}

		var submitButton = form.querySelector('[type="submit"]');
		submitButton.disabled = true;
		submitButton.textContent = 'Memproses foto...';
		try {
			var formData = new FormData(form);
			var title = formData.get('title').trim();
			var description = formData.get('description').trim();
			var report = {
				id: 'LP-' + Date.now().toString(36).slice(-6).toUpperCase(),
				title: title,
				location: formData.get('location').trim(),
				description: description,
				coordinates: formData.get('coordinates'),
				severity: classifySeverity(title + ' ' + description),
				status: statuses[0],
				photo: await imageAsDataUrl(selectedPhoto),
				repairPhoto: '',
				rating: 0,
				createdAt: new Date().toISOString()
			};
			reports.push(report);
			if (!persistReports()) {
				reports.pop();
				return;
			}
			form.reset();
			selectedPhoto = null;
			photoPreview.hidden = true;
			document.querySelector('.upload-box strong').textContent = 'Pilih foto kerusakan';
			document.querySelector('.upload-box small').textContent = 'Pastikan kondisi jalan terlihat jelas';
			document.getElementById('location-message').textContent = '';
			if (previewUrl)
				URL.revokeObjectURL(previewUrl);
			previewUrl = '';
			closeForm();
			render();
			showToast('Laporan berhasil disimpan. Tingkat kerusakan diperkirakan dari deskripsi.');
			document.getElementById('laporan').scrollIntoView({ behavior: 'smooth' });
		}
		catch (error) {
			errorBox.textContent = error.message || 'Laporan gagal diproses. Silakan coba lagi.';
			console.error('Laporan jalan gagal diproses.', error);
		}
		finally {
			submitButton.disabled = false;
			submitButton.innerHTML = 'Kirim laporan <span>→</span>';
		}
	});

	list.addEventListener('change', async function (event) {
		var control = event.target;
		var report = reports.find(function (item) { return item.id === control.dataset.id; });
		if (!report)
			return;
		if (control.dataset.action === 'status') {
			var previousStatus = report.status;
			report.status = control.value;
			if (persistReports()) {
				render();
				showToast('Status laporan ' + report.id + ' diperbarui.');
			}
			else {
				report.status = previousStatus;
				render();
			}
			return;
		}
		if (control.dataset.action === 'repair-photo') {
			var file = control.files[0];
			if (!file)
				return;
			if (!validateImage(file)) {
				showToast('Pilih foto JPG, PNG, atau WebP berukuran maksimal 5 MB.');
				control.value = '';
				return;
			}
			try {
				var previousPhoto = report.repairPhoto;
				report.repairPhoto = await imageAsDataUrl(file);
				if (persistReports()) {
					render();
					showToast('Foto perbaikan berhasil disimpan.');
				}
				else {
					report.repairPhoto = previousPhoto;
					render();
				}
			}
			catch (error) {
				showToast(error.message || 'Foto perbaikan gagal diproses.');
				console.error('Foto perbaikan gagal diproses.', error);
			}
		}
	});

	document.querySelector('.notice-close').addEventListener('click', function () {
		document.querySelector('.notice').hidden = true;
	});

	loadReports();
	render();

	var dashboardObserver;
	var dashboardHeader = document.getElementById('header');
	var dashboardNav = document.getElementById('nav');
	var dashboardTopbar = document.querySelector('.topbar');

	function setDashboardMode(active) {
		document.body.classList.toggle('dashboard-visible', active);
		dashboardHeader.classList.toggle('dashboard-header', active);
		if (active && dashboardNav.parentElement !== dashboardTopbar)
			dashboardTopbar.appendChild(dashboardNav);
		else if (!active && dashboardNav.parentElement !== dashboardHeader)
			dashboardHeader.appendChild(dashboardNav);
	}

	if ('IntersectionObserver' in window) {
		dashboardObserver = new IntersectionObserver(function (entries) {
			setDashboardMode(!entries[0].isIntersecting);
		}, { rootMargin: '-48px 0px 0px 0px' });
		dashboardObserver.observe(document.getElementById('banner'));
	}
	else {
		window.addEventListener('scroll', function () {
			setDashboardMode(document.getElementById('banner').getBoundingClientRect().bottom <= dashboardHeader.offsetHeight);
		}, { passive: true });
	}

	setDashboardMode(document.getElementById('banner').getBoundingClientRect().bottom <= dashboardHeader.offsetHeight);
}());
