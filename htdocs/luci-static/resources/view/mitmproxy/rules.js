'use strict';
'require view';
'require form';
'require fs';
'require ui';

var CTL = '/usr/sbin/mitmproxyctl';

function callCtl(command, args) {
	args = args || [];

	return fs.exec(CTL, [ command ].concat(args)).then(function(res) {
		var stdout = (res.stdout || '').trim();
		var data = stdout ? JSON.parse(stdout) : {};

		if (!data.ok)
			throw new Error(data.error || _('Command failed'));

		return data;
	});
}

function isIPv4(value) {
	var parts = String(value || '').split('.');

	if (parts.length !== 4)
		return false;

	return parts.every(function(part) {
		if (!/^[0-9]+$/.test(part))
			return false;

		var number = Number(part);
		return number >= 0 && number <= 255;
	});
}

function isCIDR(value) {
	var parts = String(value || '').split('/');
	var mask;

	if (parts.length !== 2 || !isIPv4(parts[0]) || !/^[0-9]+$/.test(parts[1]))
		return false;

	mask = Number(parts[1]);
	return mask >= 0 && mask <= 32;
}

function isIPv6(value) {
	value = String(value || '').trim();

	if (!value || value.indexOf(':') < 0 || value.indexOf('%') >= 0 || value.indexOf('/') >= 0)
		return false;

	if (!/^[0-9A-Fa-f:.]+$/.test(value) || /:::/.test(value))
		return false;

	if (value.charAt(0) === ':' && value.indexOf('::') !== 0)
		return false;

	if (value.charAt(value.length - 1) === ':' && value.lastIndexOf('::') !== value.length - 2)
		return false;

	if ((value.match(/::/g) || []).length > 1)
		return false;

	return true;
}

function isCIDR6(value) {
	var parts = String(value || '').split('/');
	var mask;

	if (parts.length !== 2 || !isIPv6(parts[0]) || !/^[0-9]+$/.test(parts[1]))
		return false;

	mask = Number(parts[1]);
	return mask >= 0 && mask <= 128;
}

function isInterfaceName(value) {
	return /^[A-Za-z0-9_.:-]+$/.test(String(value || ''));
}

function isContainerName(value) {
	return /^[A-Za-z0-9_.-]+$/.test(String(value || ''));
}

function isIgnoreHost(value) {
	value = String(value || '');
	return value.length > 0 && value.length <= 256 && /^[A-Za-z0-9_.*?+^$|()/{}:.,\\-]+$/.test(value);
}

function validateDynamicList(value, validator) {
	var values = Array.isArray(value) ? value : [ value ];

	return values.every(function(item) {
		item = String(item || '').trim();
		return !item || validator(item);
	});
}

function helpStyle() {
	return E('style', { 'type': 'text/css' }, [
		'.mitmproxy-help{display:inline-block;position:relative;margin-left:.35rem;vertical-align:middle}',
		'.mitmproxy-help-button{width:1.45em;height:1.45em;line-height:1.15;border-radius:50%;border:1px solid #8c98a4;background:#fff;color:#334155;font-weight:700;cursor:help;padding:0;text-align:center}',
		'.mitmproxy-help-button:hover,.mitmproxy-help-button:focus{border-color:#2563eb;color:#1d4ed8;outline:none;box-shadow:0 0 0 2px rgba(37,99,235,.18)}',
		'.mitmproxy-help-popover{display:none;position:absolute;z-index:2000;top:100%;left:0;width:28rem;max-width:calc(100vw - 4rem);box-sizing:border-box;padding:.75rem .85rem;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#1f2937;box-shadow:0 10px 30px rgba(15,23,42,.18);font-size:.875rem;line-height:1.45;text-align:left;direction:ltr}',
		'.mitmproxy-help.is-hover .mitmproxy-help-popover,.mitmproxy-help.is-open .mitmproxy-help-popover{display:block}',
		'.mitmproxy-help-popover strong{display:block;margin-bottom:.35rem}',
		'.mitmproxy-help-popover code{display:block;margin-top:.35rem;padding:.18rem .3rem;border-radius:4px;background:#f1f5f9;color:#0f172a;white-space:nowrap;overflow:auto}'
	].join('\n'));
}

function ignoredHostsHelp() {
	var help, button, closeHelp, closeOnOutside, closeOnEscape;

	closeHelp = function() {
		help.classList.remove('is-open');
		button.setAttribute('aria-expanded', 'false');
		document.removeEventListener('mousedown', closeOnOutside, true);
		document.removeEventListener('touchstart', closeOnOutside, true);
		document.removeEventListener('keydown', closeOnEscape, true);
	};

	closeOnOutside = function(ev) {
		if (!help.contains(ev.target))
			closeHelp();
	};

	closeOnEscape = function(ev) {
		if (ev.key === 'Escape')
			closeHelp();
	};

	button = E('button', {
			'type': 'button',
			'class': 'mitmproxy-help-button',
			'aria-label': _('Explain ignored hosts'),
			'aria-expanded': 'false',
			'click': function(ev) {
				ev.preventDefault();
				ev.stopPropagation();

				if (help.classList.contains('is-open')) {
					closeHelp();
					return;
				}

				help.classList.add('is-open');
				button.setAttribute('aria-expanded', 'true');
				window.setTimeout(function() {
					document.addEventListener('mousedown', closeOnOutside, true);
					document.addEventListener('touchstart', closeOnOutside, true);
					document.addEventListener('keydown', closeOnEscape, true);
				}, 0);
			}
		}, '?');

	help = E('span', {
		'class': 'mitmproxy-help',
		'mouseenter': function() {
			help.classList.add('is-hover');
		},
		'mouseleave': function() {
			help.classList.remove('is-hover');
		}
	}, [
		button,
		E('span', { 'class': 'mitmproxy-help-popover', 'role': 'tooltip' }, [
			E('strong', {}, _('Ignored hosts')),
			E('span', {}, _('Matches the host:port value mitmproxy sees, such as HTTP Host, TLS SNI, or a destination IP plus port. Matching traffic still reaches mitmproxy, but mitmproxy skips interception and decryption.')),
			E('code', {}, '^(.+\\.)?example\\.com:443$'),
			E('code', {}, '^192\\.168\\.2\\.10:(80|443)$')
		])
	]);

	return help;
}

function attachIgnoredHostsHelp(root) {
	var row = root.querySelector('[data-name="ignore_host"]');
	var input, title, field;

	if (!row) {
		input = root.querySelector('[id*="ignore_host"], [name*="ignore_host"]');
		if (input)
			row = input.closest('.cbi-value') || input.parentNode;
	}

	if (!row || row.querySelector('.mitmproxy-help'))
		return;

	title = row.querySelector('.cbi-value-title, label');
	if (title) {
		title.appendChild(ignoredHostsHelp());
		return;
	}

	field = row.querySelector('.cbi-value-field') || row;
	field.insertBefore(E('div', { 'class': 'cbi-value-description' }, [
		_('Ignored hosts'),
		ignoredHostsHelp()
	]), field.firstChild);
}

return view.extend({
	load: function() {
		return callCtl('list-interfaces');
	},

	applyRuntimeChanges: function() {
		return callCtl('apply-rules').then(function(res) {
			var apply = res.apply || {};
			var message;

			if (!res.enabled)
				message = _('Configuration saved. Service is disabled, so runtime settings will take effect on next start.');
			else if (apply.container_rebuilt)
				message = _('Configuration applied. The mitmproxy container was rebuilt to use the new runtime settings.');
			else if (apply.container_started)
				message = _('Configuration applied. The mitmproxy container was started to match the enabled service state.');
			else
				message = _('Configuration applied. Firewall rules were updated; container restart was not needed.');

			ui.addNotification(null, E('p', {}, message), 'info');
			return res;
		}).catch(function(err) {
			var message = err && err.message ? err.message : String(err);
			ui.addNotification(null, E('p', {}, message), 'danger');
			throw err;
		});
	},

	handleSaveApply: function(ev, mode) {
		var self = this;

		return this.map.save().then(function() {
			if (self.root)
				attachIgnoredHostsHelp(self.root);

			return ui.changes.apply(mode == '0');
		}).then(function() {
			return self.applyRuntimeChanges();
		});
	},

	render: function(data) {
		var interfaces = data.interfaces || [];
		var m = new form.Map('mitmproxy', _('mitmproxy'), _('Transparent proxy rule and runtime settings. Save & Apply will update firewall rules and automatically rebuild the container when runtime settings change.'));
		var s, o;

		s = m.section(form.NamedSection, 'main', 'mitmproxy', _('Rules'));
		s.anonymous = true;

		o = s.option(form.DynamicList, 'interface', _('Ingress interfaces'));
		o.rmempty = false;
		o.validate = function(sectionId, value) {
			if (validateDynamicList(value, isInterfaceName))
				return true;

			return _('Interface names may only contain letters, numbers, dot, underscore, colon, and dash.');
		};
		interfaces.forEach(function(iface) {
			var label = iface.name;

			if (!iface.present)
				label += ' (' + _('missing') + ')';

			o.value(iface.name, label);
		});
		o.default = 'br-lan';

		o = s.option(form.Flag, 'intercept_http', _('Intercept TCP 80'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'intercept_https', _('Intercept TCP 443'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'block_quic', _('Block UDP 443 / QUIC by default'));
		o.description = _('Targets set to inherit use this default. Targets set to block or allow override it.');
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'ipv6_enabled', _('Enable IPv6 interception'));
		o.description = _('Default is off. When enabled, only configured IPv6 targets are captured; DHCPv6/SLAAC discovery is not automatic in this version.');
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.DynamicList, 'exclude_cidr', _('Excluded destination CIDR'));
		o.default = '127.0.0.0/8';
		o.rmempty = true;
		o.validate = function(sectionId, value) {
			if (validateDynamicList(value, function(item) { return isCIDR(item) || isIPv4(item); }))
				return true;

			return _('Must be an IPv4 address or IPv4 CIDR.');
		};

		o = s.option(form.DynamicList, 'exclude_cidr6', _('Excluded IPv6 destination CIDR'));
		o.default = '::1/128';
		o.rmempty = true;
		o.validate = function(sectionId, value) {
			if (validateDynamicList(value, function(item) { return isCIDR6(item) || isIPv6(item); }))
				return true;

			return _('Must be an IPv6 address or IPv6 CIDR without a zone suffix.');
		};

		o = s.option(form.DynamicList, 'ignore_host', _('Ignored hosts'));
		o.rmempty = true;
		o.validate = function(sectionId, value) {
			if (validateDynamicList(value, isIgnoreHost))
				return true;

			return _('Use a hostname, IP, or regular expression without spaces.');
		};

		o = s.option(form.Value, 'listen_port', _('Proxy listen port'));
		o.default = '8080';
		o.datatype = 'port';
		o.rmempty = false;

		o = s.option(form.Value, 'web_port', _('mitmweb port'));
		o.default = '8081';
		o.datatype = 'port';
		o.rmempty = false;

		o = s.option(form.Value, 'image', _('Docker image'));
		o.default = 'mitmproxy/mitmproxy';
		o.rmempty = false;

		o = s.option(form.Value, 'container_name', _('Container name'));
		o.default = 'mitmproxy';
		o.rmempty = false;
		o.validate = function(sectionId, value) {
			if (isContainerName(value))
				return true;

			return _('Container names may only contain letters, numbers, dot, underscore, and dash.');
		};

		o = s.option(form.Value, 'confdir', _('Config directory'));
		o.default = '/etc/mitmproxy';
		o.rmempty = false;

		return Promise.resolve(m.render()).then(function(node) {
			var root = E('div', {}, [ helpStyle(), node ]);

			this.map = m;
			this.root = root;
			attachIgnoredHostsHelp(root);

			return root;
		}.bind(this));
	}
});
