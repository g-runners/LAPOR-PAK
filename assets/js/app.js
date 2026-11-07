(function () {
	'use strict';

	var statuses = ['Menunggu ditangani', 'Dalam penanganan', 'Selesai'];
	var severityOrder = { Tinggi: 3, Sedang: 2, Rendah: 1 };
	var reports = [];
	var selectedPhoto = null;
	var previewUrl = '';
	var csrfToken = document.querySelector('meta[name="csrf-token"]').content;
	var toastTimer;
	var list = document.getElementById('report-list');
	var form = document.getElementById('report-form');
	var modal = document.getElementById('report-modal');
	var toast = document.getElementById('toast');
	var storageError = document.getElementById('storage-error');
	var photoInput = document.getElementById('report-photo');
	var cameraFileInput = document.getElementById('camera-file');
	var photoPreview = document.getElementById('photo-preview');
	var cameraModal = document.getElementById('camera-modal');
	var cameraVideo = document.getElementById('camera-video');
	var cameraStream = null;
	var reportMap = null;
	var reportMarker = null;
	var mapStatus = document.getElementById('map-status');
	var coordinateInput = document.getElementById('report-coordinates');

	function parseCoordinates(value) {
		var coordinates = value.split(',').map(function (part) { return Number(part.trim()); });
		if (coordinates.length !== 2 || !isFinite(coordinates[0]) || !isFinite(coordinates[1]))
			return null;
		if (coordinates[0] < -90 || coordinates[0] > 90 || coordinates[1] < -180 || coordinates[1] > 180)
			return null;
		return coordinates;
	}

	function setMapSelection(latlng, centerMap) {
		coordinateInput.value = latlng.lat.toFixed(6) + ', ' + latlng.lng.toFixed(6);
		if (!reportMap)
			return;

		if (reportMarker)
			reportMarker.setLatLng(latlng);
		else {
			reportMarker = window.L.marker(latlng, { draggable: true }).addTo(reportMap);
			reportMarker.on('dragend', function () {
				setMapSelection(reportMarker.getLatLng(), false);
			});
		}

		if (centerMap)
			reportMap.setView(latlng, Math.max(reportMap.getZoom(), 16));
		mapStatus.textContent = 'Titik dipilih: ' + coordinateInput.value;
	}

	function initializeReportMap() {
		if (!window.L) {
			mapStatus.textContent = 'Peta gagal dimuat. Periksa koneksi internet; lokasi GPS tetap bisa digunakan.';
			return;
		}

		if (!reportMap) {
			reportMap = window.L.map('location-map').setView([-6.2383, 107.0257], 14);
			var tileLayer = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
			}).addTo(reportMap);
			tileLayer.on('tileerror', function () {
				mapStatus.textContent = 'Peta dasar gagal dimuat. Periksa koneksi internet Anda.';
			});
			reportMap.on('click', function (event) {
				setMapSelection(event.latlng, false);
			});
		}

		window.requestAnimationFrame(function () {
			reportMap.invalidateSize();
			var savedCoordinates = parseCoordinates(coordinateInput.value);
			if (savedCoordinates)
				setMapSelection({ lat: savedCoordinates[0], lng: savedCoordinates[1] }, true);
			else
				mapStatus.textContent = 'Ketuk peta untuk memilih titik, atau geser pin setelah memilih.';
		});
	}

	function escapeHtml(value) {
		return String(value).replace(/[&<>"']/g, function (character) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
		});
	}

	function apiRequest(url, options) {
		options = options || {};
		options.headers = Object.assign({}, options.headers || {}, { 'X-CSRF-Token': csrfToken });
		return fetch(url, options).then(async function (response) {
			var payload = {};
			try {
				payload = await response.json();
			}
			catch (error) {
				if (response.ok)
					return {};
			}
			if (!response.ok)
				throw new Error(payload.error || 'Permintaan gagal diproses oleh server.');
			return payload;
		});
	}

	async function loadReports() {
		try {
			reports = await apiRequest('/api/reports');
			if (!Array.isArray(reports))
				throw new Error('Server mengirim format laporan yang tidak valid.');
			storageError.hidden = true;
		}
		catch (error) {
			storageError.hidden = false;
			console.error('Gagal memuat laporan dari server LAPOR PAK.', error);
			showToast(error.message || 'Laporan gagal dimuat dari server.');
			reports = [];
		}
		render();
	}

	function showToast(message) {
		toast.textContent = message;
		toast.classList.add('is-visible');
		window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(function () {
			toast.classList.remove('is-visible');
		}, 3400);
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

	function severityClass(severity) {
		return severity === 'Tinggi' ? 'high' : severity === 'Sedang' ? 'medium' : 'low';
	}

	function renderReport(report) {
		var severity = severityClass(report.severity);
		var photo = report.photo
			? '<img class="report-photo" src="' + report.photo + '" alt="Foto kerusakan: ' + escapeHtml(report.title) + '" />'
			: '<div class="report-photo report-photo-placeholder" aria-hidden="true">⌁</div>';
		var rating = report.status === 'Selesai'
			? '<div class="rating" role="group" aria-label="Penilaian hasil perbaikan"><span class="rating-label">' + (report.rating ? 'Penilaian' : 'Nilai hasil') + '</span>' + [1, 2, 3, 4, 5].map(function (value) {
				return '<button type="button" class="' + (report.rating >= value ? 'is-selected' : '') + '" data-action="rate" data-id="' + escapeHtml(report.id) + '" data-rating="' + value + '" aria-label="' + value + ' bintang">★</button>';
			}).join('') + '</div>'
			: '';

		return '<article class="report-card" data-severity="' + severity + '">' +
			photo +
			'<div class="report-main">' +
				'<div class="report-topline"><span class="severity-pill severity-' + severity + '">Kerusakan ' + escapeHtml(report.severity) + '</span><span class="status-pill ' + statusClass(report.status) + '">' + escapeHtml(report.status) + '</span></div>' +
				'<h3>' + escapeHtml(report.title) + '</h3>' +
				'<div class="report-location"><span aria-hidden="true">⌖</span>' + escapeHtml(report.location) + (report.coordinates ? ' <span>·</span> <a href="https://www.google.com/maps?q=' + encodeURIComponent(report.coordinates) + '" target="_blank" rel="noopener">Lihat peta</a>' : '') + '</div>' +
				'<div class="report-meta"><span>▤ ' + dateLabel(report.createdAt) + '</span><span>◉ ' + escapeHtml(report.id) + '</span></div>' +
				'<p class="report-description">' + escapeHtml(report.description) + '</p>' +
			'</div>' +
			'<div class="report-controls">' + rating + '</div>' +
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
		modal.hidden = false;
		document.body.classList.add('modal-open');
		window.setTimeout(function () {
			initializeReportMap();
			document.getElementById('report-title').focus();
		}, 20);
	}

	function closeForm() {
		closeCamera();
		modal.hidden = true;
		document.body.classList.remove('modal-open');
	}

	function stopCameraStream() {
		if (!cameraStream)
			return;
		cameraStream.getTracks().forEach(function (track) { track.stop(); });
		cameraStream = null;
		cameraVideo.srcObject = null;
		document.getElementById('camera-capture').disabled = true;
	}

	function closeCamera() {
		stopCameraStream();
		cameraModal.hidden = true;
	}

	function setReportPhoto(file) {
		try {
			var transfer = new DataTransfer();
			transfer.items.add(file);
			photoInput.files = transfer.files;
			photoInput.dispatchEvent(new Event('change', { bubbles: true }));
			return true;
		}
		catch (error) {
			console.error('Foto dari kamera tidak dapat disiapkan untuk laporan.', error);
			return false;
		}
	}

	function useCameraFile(file) {
		if (!file)
			return;
		if (!setReportPhoto(file))
			showToast('Foto tidak dapat digunakan. Silakan pilih ulang foto.');
	}

	async function openCamera() {
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			cameraFileInput.click();
			return;
		}

		cameraModal.hidden = false;
		document.getElementById('camera-message').textContent = 'Meminta izin kamera...';
		try {
			cameraStream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
			});
			cameraVideo.srcObject = cameraStream;
			await cameraVideo.play();
			document.getElementById('camera-message').textContent = 'Arahkan kamera ke kondisi jalan yang ingin dilaporkan.';
			document.getElementById('camera-capture').disabled = false;
		}
		catch (error) {
			closeCamera();
			if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
				showToast('Izin kamera ditolak. Izinkan kamera di browser atau pilih foto dari perangkat.');
			}
			else {
				showToast('Kamera tidak dapat dibuka. Anda tetap bisa memilih foto dari perangkat.');
			}
			console.warn('Kamera untuk foto laporan tidak dapat dibuka.', error);
			cameraFileInput.click();
		}
	}

	function captureCameraPhoto() {
		if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
			document.getElementById('camera-message').textContent = 'Kamera belum siap. Tunggu sebentar lalu coba lagi.';
			return;
		}
		var canvas = document.getElementById('camera-canvas');
		var scale = Math.min(1, 1280 / Math.max(cameraVideo.videoWidth, cameraVideo.videoHeight));
		canvas.width = Math.round(cameraVideo.videoWidth * scale);
		canvas.height = Math.round(cameraVideo.videoHeight * scale);
		var context = canvas.getContext('2d');
		if (!context) {
			showToast('Foto kamera tidak dapat diproses di browser ini.');
			return;
		}
		context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
		canvas.toBlob(function (blob) {
			if (!blob) {
				showToast('Foto kamera gagal diproses. Silakan coba lagi.');
				return;
			}
			if (blob.size > 5 * 1024 * 1024) {
				document.getElementById('camera-message').textContent = 'Ukuran foto melebihi 5 MB. Atur kamera ke resolusi lebih rendah lalu ambil ulang.';
				return;
			}
			var photo = new File([blob], 'laporan-jalan-' + Date.now() + '.jpg', { type: 'image/jpeg' });
			if (setReportPhoto(photo)) {
				closeCamera();
				showToast('Foto kamera berhasil dilampirkan.');
			}
			else {
				document.getElementById('camera-message').textContent = 'Foto gagal dilampirkan. Pilih foto dari perangkat.';
			}
		}, 'image/jpeg', 0.78);
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
		if (event.target === cameraModal || event.target.closest('.camera-close, #camera-cancel')) {
			closeCamera();
			return;
		}
		if (event.target === modal) {
			closeForm();
			return;
		}
		var ratingButton = event.target.closest('[data-action="rate"]');
		if (ratingButton) {
			apiRequest('/api/reports/' + encodeURIComponent(ratingButton.dataset.id) + '/rating', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rating: Number(ratingButton.dataset.rating) })
			}).then(function () {
				showToast('Terima kasih atas penilaian Anda.');
				return loadReports();
			}).catch(function (error) {
				showToast(error.message || 'Penilaian gagal dikirim.');
				console.error('Penilaian laporan gagal dikirim.', error);
			});
		}
	});

	document.addEventListener('keydown', function (event) {
		if (event.key === 'Escape' && !cameraModal.hidden)
			closeCamera();
		else if (event.key === 'Escape' && !modal.hidden)
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
			setMapSelection({ lat: position.coords.latitude, lng: position.coords.longitude }, true);
			message.textContent = 'Lokasi GPS tercatat. Isi juga nama jalan agar mudah dikenali.';
		}, function (error) {
			message.textContent = error.code === error.PERMISSION_DENIED
				? 'Izin lokasi ditolak. Anda tetap bisa mengisi nama jalan secara manual.'
				: 'Lokasi tidak berhasil didapatkan. Silakan isi nama jalan secara manual.';
			console.warn('Lokasi perangkat tidak dapat diakses.', error);
		}, { enableHighAccuracy: true, timeout: 10000 });
	});

	document.getElementById('camera-button').addEventListener('click', openCamera);
	document.getElementById('camera-close').addEventListener('click', closeCamera);
	document.getElementById('camera-cancel').addEventListener('click', closeCamera);
	document.getElementById('camera-capture').addEventListener('click', captureCameraPhoto);
	cameraFileInput.addEventListener('change', function () {
		useCameraFile(cameraFileInput.files[0]);
		cameraFileInput.value = '';
	});

	function updatePhotoPreview(file) {
		selectedPhoto = file || null;
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
	}

	photoInput.addEventListener('change', function () {
		updatePhotoPreview(photoInput.files[0]);
	});

	form.addEventListener('submit', async function (event) {
		event.preventDefault();
		var errorBox = document.getElementById('form-error');
		errorBox.textContent = '';
		if (!validateImage(selectedPhoto)) {
			errorBox.textContent = 'Pilih foto JPG, PNG, atau WebP berukuran maksimal 5 MB.';
			return;
		}

		var submitButton = form.querySelector('[type="submit"]');
		submitButton.disabled = true;
		submitButton.textContent = 'Mengirim laporan...';
		try {
			var formData = new FormData(form);
			await apiRequest('/api/reports', { method: 'POST', body: formData });
			form.reset();
			selectedPhoto = null;
			if (reportMarker) {
				reportMap.removeLayer(reportMarker);
				reportMarker = null;
			}
			photoPreview.hidden = true;
			document.querySelector('.upload-box strong').textContent = 'Pilih foto kerusakan';
			document.querySelector('.upload-box small').textContent = 'Pastikan kondisi jalan terlihat jelas';
			document.getElementById('location-message').textContent = '';
			mapStatus.textContent = 'Ketuk peta untuk memilih titik, atau geser pin setelah memilih.';
			if (previewUrl)
				URL.revokeObjectURL(previewUrl);
			previewUrl = '';
			closeForm();
			await loadReports();
			showToast('Laporan berhasil dikirim ke server.');
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
