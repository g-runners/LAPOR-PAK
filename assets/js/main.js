/*
	Spectral by HTML5 UP
	html5up.net | @ajlkn
	Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
*/

(function() {
	'use strict';

	var body = document.body;
	var banner = document.getElementById('banner');
	var header = document.getElementById('header');
	var menu = document.getElementById('menu');

	breakpoints({
		xlarge: [ '1281px', '1680px' ],
		large: [ '981px', '1280px' ],
		medium: [ '737px', '980px' ],
		small: [ '481px', '736px' ],
		xsmall: [ null, '480px' ]
	});

	window.addEventListener('load', function() {
		window.setTimeout(function() {
			body.classList.remove('is-preload');
		}, 100);
	});

	if (browser.mobile)
		body.classList.add('is-mobile');
	else {
		breakpoints.on('>medium', function() {
			body.classList.remove('is-mobile');
		});

		breakpoints.on('<=medium', function() {
			body.classList.add('is-mobile');
		});
	}

	if (header)
		util.scrolly('.scrolly', {
			speed: 1500,
			offset: function() {
				return header.offsetHeight;
			}
		});

	if (menu) {
		var close = document.createElement('a');
		close.href = '#menu';
		close.className = 'close';
		close.setAttribute('aria-label', 'Close menu');
		menu.append(close);
		body.append(menu);

		util.panel(menu, {
			delay: 500,
			hideOnClick: true,
			hideOnSwipe: true,
			resetScroll: true,
			resetForms: true,
			side: 'right',
			target: body,
			visibleClass: 'is-menu-visible'
		});
	}

	if (banner && header && header.classList.contains('alt')) {
		window.addEventListener('resize', function() {
			window.dispatchEvent(new Event('scroll'));
		});

		util.scrollex(banner, {
			bottom: header.offsetHeight + 1,
			terminate: function() {
				header.classList.remove('alt');
			},
			enter: function() {
				header.classList.add('alt');
			},
			leave: function() {
				header.classList.remove('alt');
			}
		});
	}
})();
