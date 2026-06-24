(function(global) {
	'use strict';

	var VERSION = 5;
	var SIZE = VERSION * 4 + 17;
	var DATA_CODEWORDS = 108;
	var ECC_CODEWORDS = 26;
	var MAX_BYTES = 106;
	var EXP = [];
	var LOG = [];

	function initGalois() {
		var x = 1;
		var i;

		for (i = 0; i < 255; i++) {
			EXP[i] = x;
			LOG[x] = i;
			x <<= 1;
			if (x & 0x100)
				x ^= 0x11d;
		}

		for (i = 255; i < 512; i++)
			EXP[i] = EXP[i - 255];
	}

	function gfMul(a, b) {
		if (!a || !b)
			return 0;

		return EXP[LOG[a] + LOG[b]];
	}

	function rsGenerator(degree) {
		var result = [ 1 ];
		var i, j, next;

		for (i = 0; i < degree; i++) {
			next = new Array(result.length + 1);
			for (j = 0; j < next.length; j++)
				next[j] = 0;

			for (j = 0; j < result.length; j++) {
				next[j] ^= result[j];
				next[j + 1] ^= gfMul(result[j], EXP[i]);
			}

			result = next;
		}

		return result;
	}

	function rsRemainder(data, degree) {
		var generator = rsGenerator(degree);
		var message = data.slice();
		var i, j, factor;

		for (i = 0; i < degree; i++)
			message.push(0);

		for (i = 0; i < data.length; i++) {
			factor = message[i];
			if (!factor)
				continue;

			for (j = 0; j < generator.length; j++)
				message[i + j] ^= gfMul(generator[j], factor);
		}

		return message.slice(data.length);
	}

	function utf8Bytes(text) {
		var encoded, bytes = [];
		var i, code;

		if (global.TextEncoder)
			return Array.prototype.slice.call(new global.TextEncoder().encode(text));

		encoded = unescape(encodeURIComponent(text));
		for (i = 0; i < encoded.length; i++) {
			code = encoded.charCodeAt(i);
			bytes.push(code & 0xff);
		}

		return bytes;
	}

	function appendBits(bits, value, length) {
		var i;

		for (i = length - 1; i >= 0; i--)
			bits.push((value >>> i) & 1);
	}

	function makeDataCodewords(text) {
		var bytes = utf8Bytes(text);
		var bits = [];
		var data = [];
		var maxBits = DATA_CODEWORDS * 8;
		var terminator;
		var i, value;

		if (bytes.length > MAX_BYTES)
			throw new Error('QR input is too long for the bundled encoder.');

		appendBits(bits, 0x4, 4);
		appendBits(bits, bytes.length, 8);
		for (i = 0; i < bytes.length; i++)
			appendBits(bits, bytes[i], 8);

		terminator = Math.min(4, maxBits - bits.length);
		for (i = 0; i < terminator; i++)
			bits.push(0);

		while (bits.length % 8)
			bits.push(0);

		for (i = 0; i < bits.length; i += 8) {
			value = 0;
			for (var j = 0; j < 8; j++)
				value = (value << 1) | bits[i + j];
			data.push(value);
		}

		while (data.length < DATA_CODEWORDS)
			data.push(data.length % 2 ? 0x11 : 0xec);

		return data;
	}

	function blankMatrix() {
		var modules = [];
		var reserved = [];
		var y, x;

		for (y = 0; y < SIZE; y++) {
			modules[y] = [];
			reserved[y] = [];
			for (x = 0; x < SIZE; x++) {
				modules[y][x] = false;
				reserved[y][x] = false;
			}
		}

		return { modules: modules, reserved: reserved };
	}

	function setFunction(matrix, x, y, dark) {
		if (x < 0 || y < 0 || x >= SIZE || y >= SIZE)
			return;

		matrix.modules[y][x] = !!dark;
		matrix.reserved[y][x] = true;
	}

	function drawFinder(matrix, x, y) {
		var dx, dy, xx, yy, dark;

		for (dy = -1; dy <= 7; dy++) {
			for (dx = -1; dx <= 7; dx++) {
				xx = x + dx;
				yy = y + dy;
				if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE)
					continue;

				dark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
					(dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
						(dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
				setFunction(matrix, xx, yy, dark);
			}
		}
	}

	function drawAlignment(matrix, cx, cy) {
		var dx, dy, distance;

		for (dy = -2; dy <= 2; dy++) {
			for (dx = -2; dx <= 2; dx++) {
				distance = Math.max(Math.abs(dx), Math.abs(dy));
				setFunction(matrix, cx + dx, cy + dy, distance !== 1);
			}
		}
	}

	function getBit(value, index) {
		return ((value >>> index) & 1) !== 0;
	}

	function drawFormatBits(matrix, mask) {
		var data = (1 << 3) | mask;
		var rem = data;
		var bits, i;

		for (i = 0; i < 10; i++)
			rem = (rem << 1) ^ (((rem >>> 9) & 1) ? 0x537 : 0);

		bits = ((data << 10) | rem) ^ 0x5412;

		for (i = 0; i <= 5; i++)
			setFunction(matrix, 8, i, getBit(bits, i));
		setFunction(matrix, 8, 7, getBit(bits, 6));
		setFunction(matrix, 8, 8, getBit(bits, 7));
		setFunction(matrix, 7, 8, getBit(bits, 8));
		for (i = 9; i < 15; i++)
			setFunction(matrix, 14 - i, 8, getBit(bits, i));
		for (i = 0; i < 8; i++)
			setFunction(matrix, SIZE - 1 - i, 8, getBit(bits, i));
		for (i = 8; i < 15; i++)
			setFunction(matrix, 8, SIZE - 15 + i, getBit(bits, i));
		setFunction(matrix, 8, SIZE - 8, true);
	}

	function drawFunctionPatterns(matrix) {
		var i;

		drawFinder(matrix, 0, 0);
		drawFinder(matrix, SIZE - 7, 0);
		drawFinder(matrix, 0, SIZE - 7);

		for (i = 0; i < SIZE; i++) {
			if (!matrix.reserved[6][i])
				setFunction(matrix, i, 6, i % 2 === 0);
			if (!matrix.reserved[i][6])
				setFunction(matrix, 6, i, i % 2 === 0);
		}

		drawAlignment(matrix, 30, 30);
		drawFormatBits(matrix, 0);
	}

	function placeData(matrix, codewords) {
		var bitLength = codewords.length * 8;
		var bitIndex = 0;
		var right, vert, upward, y, x, dx, bit;

		for (right = SIZE - 1; right >= 1; right -= 2) {
			if (right === 6)
				right--;

			upward = ((SIZE - 1 - right) / 2) % 2 === 0;
			for (vert = 0; vert < SIZE; vert++) {
				y = upward ? SIZE - 1 - vert : vert;
				for (dx = 0; dx < 2; dx++) {
					x = right - dx;
					if (matrix.reserved[y][x])
						continue;

					bit = false;
					if (bitIndex < bitLength)
						bit = getBit(codewords[Math.floor(bitIndex / 8)], 7 - (bitIndex % 8));
					matrix.modules[y][x] = bit;
					bitIndex++;
				}
			}
		}
	}

	function applyMask(matrix) {
		var x, y;

		for (y = 0; y < SIZE; y++) {
			for (x = 0; x < SIZE; x++) {
				if (!matrix.reserved[y][x] && ((x + y) % 2 === 0))
					matrix.modules[y][x] = !matrix.modules[y][x];
			}
		}

		drawFormatBits(matrix, 0);
	}

	function makeMatrix(text) {
		var data = makeDataCodewords(text);
		var ecc = rsRemainder(data, ECC_CODEWORDS);
		var matrix = blankMatrix();

		drawFunctionPatterns(matrix);
		placeData(matrix, data.concat(ecc));
		applyMask(matrix);

		return matrix.modules;
	}

	function svgEscape(value) {
		return String(value).replace(/[&<>"']/g, function(ch) {
			return {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;'
			}[ch];
		});
	}

	function createSvg(text, options) {
		var modules = makeMatrix(text);
		var border = options && options.border != null ? options.border : 4;
		var moduleCount = SIZE + border * 2;
		var path = [];
		var y, x;
		var svg;

		for (y = 0; y < SIZE; y++) {
			for (x = 0; x < SIZE; x++) {
				if (modules[y][x])
					path.push('M' + (x + border) + ' ' + (y + border) + 'h1v1h-1z');
			}
		}

		svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 ' + moduleCount + ' ' + moduleCount);
		svg.setAttribute('width', String(options && options.size || 224));
		svg.setAttribute('height', String(options && options.size || 224));
		svg.setAttribute('role', 'img');
		svg.setAttribute('aria-label', options && options.label || 'QR code');
		svg.setAttribute('shape-rendering', 'crispEdges');
		svg.innerHTML = '<rect width="100%" height="100%" fill="#fff"/>' +
			'<path fill="#000" d="' + svgEscape(path.join('')) + '"/>';

		return svg;
	}

	function render(node, text, options) {
		var svg;

		while (node.firstChild)
			node.removeChild(node.firstChild);

		try {
			svg = createSvg(text, options || {});
			node.appendChild(svg);
		} catch (err) {
			node.appendChild(document.createTextNode(err && err.message ? err.message : String(err)));
		}
	}

	initGalois();

	global.MitmproxyQRCode = {
		render: render,
		createSvg: createSvg,
		maxBytes: MAX_BYTES
	};
})(window);
