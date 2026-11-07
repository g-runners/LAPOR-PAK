(function () {
	'use strict';

	var reports = Array.isArray(window.laporPakReports) ? window.laporPakReports : [];
	var severityRank = { Tinggi: 3, Sedang: 2, Rendah: 1 };
	var colors = { Tinggi: '#db5b46', Sedang: '#e5a331', Rendah: '#379778' };
	var markers = new Map();
	var routeControl = null;
	var userMarker = null;
	var message = document.getElementById('map-message');
	var map = L.map('report-map', { zoomControl: false }).setView([-6.2383, 107.0257], 13);

	L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
	}).addTo(map);
	L.control.zoom({ position: 'bottomright' }).addTo(map);

	function escapeHtml(value) {
		return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
		});
	}

	function sortedReports(items) {
		return items.slice().sort(function (first, second) {
			return (severityRank[second.severity] - severityRank[first.severity]) ||
				new Date(second.createdAt) - new Date(first.createdAt);
		});
	}

	function popupContent(report) {
		return '<div class="map-popup">' +
			'<span class="severity-tag severity-' + escapeHtml(report.severity.toLowerCase()) + '">Kerusakan ' + escapeHtml(report.severity) + '</span>' +
			'<h3>' + escapeHtml(report.title) + '</h3>' +
			'<p>' + escapeHtml(report.location) + '</p>' +
			'<span class="map-popup-status">' + escapeHtml(report.status) + '</span>' +
			'<button type="button" class="popup-route" data-route-id="' + escapeHtml(report.id) + '">Rute ke lokasi</button>' +
			'</div>';
	}

	function showDetail(report) {
		var detail = document.getElementById('map-detail');
		detail.innerHTML = '<p class="map-eyebrow">DETAIL LAPORAN</p>' +
			(report.photo ? '<img class="detail-photo" src="' + escapeHtml(report.photo) + '" alt="Foto ' + escapeHtml(report.title) + '">' : '') +
			'<span class="severity-tag severity-' + escapeHtml(report.severity.toLowerCase()) + '">Kerusakan ' + escapeHtml(report.severity) + '</span>' +
			'<h2>' + escapeHtml(report.title) + '</h2>' +
			'<p class="detail-location">⌖ ' + escapeHtml(report.location) + '</p>' +
			'<p class="detail-status">Status: <strong>' + escapeHtml(report.status) + '</strong></p>' +
			'<p>' + escapeHtml(report.description) + '</p>' +
			(report.repairPhoto ? '<a class="proof-link" href="' + escapeHtml(report.repairPhoto) + '" target="_blank" rel="noopener">Lihat foto setelah perbaikan</a>' : '') +
			(Number.isFinite(report.lat) && Number.isFinite(report.lng)
				? '<button class="operator-primary detail-route" type="button" data-route-id="' + escapeHtml(report.id) + '">Tampilkan rute</button>'
				: '<p>Koordinat laporan belum tersedia untuk membuat rute.</p>');
	}

	function focusReport(report) {
		var marker = markers.get(String(report.id));
		showDetail(report);
		if (!marker) {
			message.textContent = 'Laporan ini belum memiliki koordinat pada peta.';
			return;
		}
		message.textContent = '';
		map.flyTo([report.lat, report.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
		marker.openPopup();
	}

	function renderList(items) {
		var list = document.getElementById('map-report-list');
		document.getElementById('map-result-count').textContent = items.length;
		if (!items.length) {
			list.innerHTML = '<div class="map-empty">Tidak ada laporan yang cocok dengan pencarian atau filter.</div>';
			return;
		}
		list.innerHTML = sortedReports(items).map(function (report) {
			return '<button class="map-report-item" type="button" data-report-id="' + escapeHtml(report.id) + '">' +
				'<span class="severity-dot severity-' + escapeHtml(report.severity.toLowerCase()) + '"></span>' +
				'<span class="map-report-copy"><strong>' + escapeHtml(report.title) + '</strong><small>' + escapeHtml(report.location) + '</small><small>' + escapeHtml(report.status) + '</small></span>' +
				'<span class="map-report-chevron">›</span></button>';
		}).join('');
	}

	function applyFilters() {
		var query = document.getElementById('map-search').value.trim().toLowerCase();
		var status = document.getElementById('map-status').value;
		var severity = document.getElementById('map-severity').value;
		var visibleReports = reports.filter(function (report) {
			var text = [report.id, report.title, report.location, report.description].join(' ').toLowerCase();
			return (!query || text.includes(query)) &&
				(!status || report.status === status) &&
				(!severity || report.severity === severity);
		});

		markers.forEach(function (marker, id) {
			var visible = visibleReports.some(function (report) { return String(report.id) === id; });
			if (visible && !map.hasLayer(marker)) marker.addTo(map);
			else if (!visible && map.hasLayer(marker)) map.removeLayer(marker);
		});
		renderList(visibleReports);
	}

	function showRoute(report) {
		if (!navigator.geolocation) {
			message.textContent = 'Browser tidak mendukung akses lokasi untuk membuat rute.';
			return;
		}
		if (!L.Routing) {
			message.textContent = 'Layanan rute tidak berhasil dimuat. Periksa koneksi internet.';
			return;
		}
		message.textContent = 'Mengambil lokasi perangkat untuk membuat rute...';
		navigator.geolocation.getCurrentPosition(function (position) {
			if (routeControl) map.removeControl(routeControl);
			var current = L.latLng(position.coords.latitude, position.coords.longitude);
			routeControl = L.Routing.control({
				waypoints: [current, L.latLng(report.lat, report.lng)],
				router: L.Routing.osrmv1({ language: 'id' }),
				routeWhileDragging: false,
				addWaypoints: false,
				draggableWaypoints: false,
				fitSelectedRoutes: true,
				show: false,
				createMarker: function () { return null; },
				lineOptions: { styles: [{ color: '#176d59', weight: 6, opacity: 0.82 }] }
			}).addTo(map);
			routeControl.on('routingerror', function () {
				message.textContent = 'Rute tidak dapat dibuat. Lokasi mungkin tidak terjangkau layanan rute.';
			});
			message.textContent = '';
		}, function (error) {
			message.textContent = error.code === error.PERMISSION_DENIED
				? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk membuat rute.'
				: 'Lokasi tidak berhasil didapatkan. Coba lagi atau periksa GPS perangkat.';
			console.warn('Lokasi untuk rute tidak dapat diakses.', error);
		}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
	}

	reports.forEach(function (report) {
		if (!Number.isFinite(report.lat) || !Number.isFinite(report.lng)) return;
		var marker = L.circleMarker([report.lat, report.lng], {
			radius: 9,
			color: '#fff',
			weight: 2,
			fillColor: colors[report.severity] || colors.Rendah,
			fillOpacity: 0.95
		}).addTo(map);
		marker.bindPopup(popupContent(report));
		marker.on('click', function () { showDetail(report); });
		markers.set(String(report.id), marker);
	});

	if (markers.size > 1) {
		map.fitBounds(L.featureGroup(Array.from(markers.values())).getBounds(), { padding: [35, 35], maxZoom: 15 });
	}
	else if (markers.size === 1) {
		map.setView(Array.from(markers.values())[0].getLatLng(), 15);
	}

	document.getElementById('map-search').addEventListener('input', applyFilters);
	document.getElementById('map-status').addEventListener('change', applyFilters);
	document.getElementById('map-severity').addEventListener('change', applyFilters);
	document.getElementById('map-report-list').addEventListener('click', function (event) {
		var button = event.target.closest('[data-report-id]');
		if (!button) return;
		var report = reports.find(function (item) { return String(item.id) === button.dataset.reportId; });
		if (report) focusReport(report);
	});
	document.addEventListener('click', function (event) {
		var routeButton = event.target.closest('[data-route-id]');
		if (!routeButton) return;
		var report = reports.find(function (item) { return String(item.id) === routeButton.dataset.routeId; });
		if (report) showRoute(report);
	});
	document.getElementById('map-locate').addEventListener('click', function () {
		if (!navigator.geolocation) {
			message.textContent = 'Browser tidak mendukung akses lokasi.';
			return;
		}
		message.textContent = 'Mengambil lokasi perangkat...';
		navigator.geolocation.getCurrentPosition(function (position) {
			var location = [position.coords.latitude, position.coords.longitude];
			if (!userMarker) {
				userMarker = L.circleMarker(location, {
					radius: 8, color: '#fff', weight: 3, fillColor: '#2784d8', fillOpacity: 1
				}).addTo(map).bindPopup('Lokasi Anda');
			}
			else userMarker.setLatLng(location);
			map.setView(location, 16);
			userMarker.openPopup();
			message.textContent = '';
		}, function (error) {
			message.textContent = error.code === error.PERMISSION_DENIED
				? 'Izin lokasi ditolak.'
				: 'Lokasi tidak tersedia. Periksa GPS perangkat dan coba lagi.';
			console.warn('Lokasi perangkat tidak dapat diakses.', error);
		}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
	});
	document.getElementById('map-hide-route').addEventListener('click', function () {
		if (routeControl) {
			map.removeControl(routeControl);
			routeControl = null;
			message.textContent = 'Rute disembunyikan.';
		}
	});
	applyFilters();
}());
