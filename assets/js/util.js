(function() {
	'use strict';

	var prioritized = new WeakMap();
	var scrollFrame = null;

	function elementsFor(elements) {
		if (typeof elements === 'string')
			return Array.from(document.querySelectorAll(elements));

		if (elements instanceof Element || elements === window || elements === document)
			return [elements];

		return Array.from(elements || []);
	}

	function navList(nav) {
		return Array.from(nav.querySelectorAll('a')).map(function(link) {
			var item = link.cloneNode(false);
			var indent = Math.max(0, (function() {
				var count = 0;
				for (var parent = link.parentElement; parent && parent !== nav; parent = parent.parentElement)
					if (parent.tagName === 'LI')
						count++;
				return count - 1;
			})());

			item.className = 'link depth-' + indent;
			item.replaceChildren();
			var span = document.createElement('span');
			span.className = 'indent-' + indent;
			item.append(span, document.createTextNode(link.textContent));
			return item.outerHTML;
		}).join('');
	}

	function panel(element, userConfig) {
		var config = Object.assign({
			delay: 0,
			hideOnClick: false,
			hideOnEscape: false,
			hideOnSwipe: false,
			resetScroll: false,
			resetForms: false,
			side: null,
			target: element,
			visibleClass: 'visible'
		}, userConfig || {});
		var target = typeof config.target === 'string'
			? document.querySelector(config.target)
			: config.target;
		var id = element.id;
		var touchPosX = null;
		var touchPosY = null;

		if (!target)
			throw new Error('Panel target was not found.');

		element.style.msOverflowStyle = '-ms-autohiding-scrollbar';
		element.style.webkitOverflowScrolling = 'touch';

		function hide(event) {
			if (!target.classList.contains(config.visibleClass))
				return;

			if (event) {
				event.preventDefault();
				event.stopPropagation();
			}

			target.classList.remove(config.visibleClass);
			window.setTimeout(function() {
				if (config.resetScroll)
					element.scrollTop = 0;

				if (config.resetForms)
					element.querySelectorAll('form').forEach(function(form) {
						form.reset();
					});
			}, config.delay);
		}

		element.addEventListener('click', function(event) {
			var anchor = event.target.closest('a');
			if (anchor && element.contains(anchor)) {
				var href = anchor.getAttribute('href');

				if (href === '#' + id) {
					event.preventDefault();
					event.stopPropagation();
					target.classList.remove(config.visibleClass);
					return;
				}

				if (config.hideOnClick && href && href !== '#' && href !== '') {
					event.preventDefault();
					event.stopPropagation();
					hide();

					window.setTimeout(function() {
						if (anchor.target === '_blank')
							window.open(href);
						else
							window.location.href = href;
					}, config.delay + 10);
					return;
				}
			}

			event.stopPropagation();
		});

		element.addEventListener('touchstart', function(event) {
			if (!event.touches.length)
				return;
			touchPosX = event.touches[0].pageX;
			touchPosY = event.touches[0].pageY;
		});

		element.addEventListener('touchmove', function(event) {
			if (touchPosX === null || touchPosY === null || !event.touches.length)
				return;

			var diffX = touchPosX - event.touches[0].pageX;
			var diffY = touchPosY - event.touches[0].pageY;
			var height = element.offsetHeight;
			var remainingScroll = element.scrollHeight - element.scrollTop;
			var swiped = false;

			if (config.hideOnSwipe) {
				var boundary = 20;
				var delta = 50;

				switch (config.side) {
					case 'left':
						swiped = Math.abs(diffY) < boundary && diffX > delta;
						break;
					case 'right':
						swiped = Math.abs(diffY) < boundary && diffX < -delta;
						break;
					case 'top':
						swiped = Math.abs(diffX) < boundary && diffY > delta;
						break;
					case 'bottom':
						swiped = Math.abs(diffX) < boundary && diffY < -delta;
						break;
				}
			}

			if (swiped) {
				touchPosX = null;
				touchPosY = null;
				hide();
				event.stopPropagation();
				return;
			}

			if ((element.scrollTop < 0 && diffY < 0)
			|| (remainingScroll > height - 2 && remainingScroll < height + 2 && diffY > 0)) {
				event.preventDefault();
				event.stopPropagation();
			}
		});

		['touchend', 'touchstart', 'touchmove'].forEach(function(type) {
			element.addEventListener(type, function(event) {
				event.stopPropagation();
			});
		});

		document.body.addEventListener('click', function(event) {
			var anchor = event.target.closest('a');
			if (anchor && anchor.getAttribute('href') === '#' + id) {
				event.preventDefault();
				event.stopPropagation();
				target.classList.toggle(config.visibleClass);
				return;
			}

			if (!element.contains(event.target))
				hide(event);
		});

		document.body.addEventListener('touchend', function(event) {
			if (!element.contains(event.target))
				hide(event);
		});

		if (config.hideOnEscape)
			window.addEventListener('keydown', function(event) {
				if (event.key === 'Escape' || event.keyCode === 27)
					hide(event);
			});

		return { hide: hide };
	}

	function placeholder(forms) {
		var list = elementsFor(forms);
		if ('placeholder' in document.createElement('input'))
			return;

		list.forEach(function(form) {
			form.querySelectorAll('input[type="text"], textarea').forEach(function(input) {
				var showPlaceholder = function() {
					if (!input.value) {
						input.value = input.getAttribute('placeholder') || '';
						input.classList.add('polyfill-placeholder');
					}
				};
				var hidePlaceholder = function() {
					if (input.classList.contains('polyfill-placeholder')) {
						input.value = '';
						input.classList.remove('polyfill-placeholder');
					}
				};
				input.addEventListener('blur', showPlaceholder);
				input.addEventListener('focus', hidePlaceholder);
				showPlaceholder();
			});

			form.addEventListener('submit', function() {
				form.querySelectorAll('.polyfill-placeholder').forEach(function(input) {
					input.value = '';
				});
			});
		});
	}

	function prioritize(elements, condition) {
		elementsFor(elements).forEach(function(element) {
			var previous = prioritized.get(element);

			if (previous) {
				if (!condition) {
					previous.parent.insertBefore(element, previous.next);
					prioritized.delete(element);
				}
				return;
			}

			if (!condition || !element.parentNode || !element.previousSibling)
				return;

			prioritized.set(element, {
				parent: element.parentNode,
				next: element.nextSibling
			});
			element.parentNode.insertBefore(element, element.parentNode.firstChild);
		});
	}

	function scrollToAnchor(event, options) {
		var anchor = event.currentTarget;
		var href = anchor.getAttribute('href');
		if (!href || href.charAt(0) !== '#' || href.length < 2)
			return;

		var target = document.getElementById(decodeURIComponent(href.slice(1)));
		if (!target)
			return;

		event.preventDefault();
		var settings = Object.assign({ anchor: 'top', offset: 0, speed: 1000 }, options || {});
		var top = target.getBoundingClientRect().top + window.pageYOffset;
		if (settings.anchor === 'middle')
			top -= (window.innerHeight - target.offsetHeight) / 2;
		top = Math.max(0, top - (typeof settings.offset === 'function' ? settings.offset() : settings.offset));

		var start = window.pageYOffset;
		var distance = top - start;
		var startTime = null;
		if (scrollFrame !== null)
			window.cancelAnimationFrame(scrollFrame);

		function animate(time) {
			if (startTime === null)
				startTime = time;
			var progress = settings.speed <= 0 ? 1 : Math.min(1, (time - startTime) / settings.speed);
			var eased = 0.5 - Math.cos(Math.PI * progress) / 2;
			window.scrollTo(0, start + distance * eased);
			if (progress < 1)
				scrollFrame = window.requestAnimationFrame(animate);
			else
				scrollFrame = null;
		}

		scrollFrame = window.requestAnimationFrame(animate);
	}

	function scrolly(selector, options) {
		var settings = Object.assign({ anchor: 'top', offset: 0, speed: 1000 }, options || {});
		document.querySelectorAll(selector).forEach(function(anchor) {
			anchor.addEventListener('click', function(event) {
				scrollToAnchor(event, settings);
			});
		});
	}

	function scrollex(element, options) {
		var settings = Object.assign({
			top: 0,
			bottom: 0,
			delay: 0,
			mode: 'default',
			enter: null,
			leave: null,
			initialize: null,
			terminate: null,
			scroll: null
		}, options || {});
		var state = null;
		var timeout = null;
		var frame = null;

		function pixels(value, size, viewport) {
			if (typeof value !== 'string')
				return value;
			if (value.slice(-1) === '%')
				return parseInt(value, 10) / 100 * size;
			if (value.slice(-2) === 'vh')
				return parseInt(value, 10) / 100 * viewport;
			return parseInt(value, 10);
		}

		function check() {
			frame = null;
			var y = window.pageYOffset;
			var height = window.innerHeight;
			var rect = element.getBoundingClientRect();
			var elementTop = rect.top + y;
			var elementHeight = rect.height;
			var top = elementTop + pixels(settings.top, elementHeight, height);
			var bottom = elementTop + elementHeight - pixels(settings.bottom, elementHeight, height);
			var point = settings.mode === 'top' || settings.mode === 'top-only' ? y
				: settings.mode === 'bottom' || settings.mode === 'bottom-only' ? y + height
				: settings.mode === 'middle' ? y + height / 2
				: null;
			var active;

			switch (settings.mode) {
				case 'top':
					active = point >= top && bottom >= point;
					break;
				case 'bottom':
					active = point >= top && bottom >= point;
					break;
				case 'middle':
					active = point >= top && bottom >= point;
					break;
				case 'top-only':
					active = top >= y && y + height >= top;
					break;
				case 'bottom-only':
					active = bottom >= y && bottom <= y + height;
					break;
				default:
					active = y + height >= top && bottom >= y;
			}

			if (active !== state) {
				state = active;
				var callback = active ? settings.enter : settings.leave;
				if (callback)
					callback.call(element);
			}

			if (settings.scroll)
				settings.scroll.call(element, (y + height / 2 - top) / (bottom - top));
		}

		function schedule() {
			window.clearTimeout(timeout);
			timeout = window.setTimeout(function() {
				if (frame === null)
					frame = window.requestAnimationFrame(check);
			}, settings.delay);
		}

		if (settings.initialize)
			settings.initialize.call(element);

		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		window.addEventListener('load', schedule);
		schedule();

		return function() {
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
			window.removeEventListener('load', schedule);
			window.clearTimeout(timeout);
			if (frame !== null)
				window.cancelAnimationFrame(frame);
			if (settings.terminate)
				settings.terminate.call(element);
		};
	}

	window.util = {
		navList: navList,
		panel: panel,
		placeholder: placeholder,
		prioritize: prioritize,
		scrolly: scrolly,
		scrollex: scrollex
	};
})();
