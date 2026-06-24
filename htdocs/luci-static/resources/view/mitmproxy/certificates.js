'use strict';
'require view';
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
	}).catch(function(err) {
		var message = err && err.message ? err.message : String(err);
		ui.addNotification(null, E('p', {}, message), 'danger');
		throw err;
	});
}

function loadQrScript() {
	return new Promise(function(resolve, reject) {
		var script;
		var src;

		if (window.MitmproxyQRCode) {
			resolve(window.MitmproxyQRCode);
			return;
		}

		src = (typeof L !== 'undefined' && L.resource) ?
			L.resource('mitmproxy/qrcode.js') :
			'/luci-static/resources/mitmproxy/qrcode.js';

		script = document.createElement('script');
		script.src = src;
		script.async = true;
		script.onload = function() {
			resolve(window.MitmproxyQRCode);
		};
		script.onerror = function() {
			reject(new Error(_('Failed to load QR code renderer.')));
		};
		document.head.appendChild(script);
	});
}

function pageOrigin() {
	if (window.location.origin)
		return window.location.origin;

	return window.location.protocol + '//' + window.location.host;
}

function absoluteUrl(file) {
	if (!file || !file.url)
		return '';

	return pageOrigin() + file.url;
}

function row(label, value) {
	return E('tr', {}, [
		E('td', { 'class': 'td left', 'width': '35%' }, label),
		E('td', { 'class': 'td left' }, value)
	]);
}

function boolText(value) {
	return value ? _('Yes') : _('No');
}

function policyLabel(policy, effective) {
	var text;

	switch (policy) {
	case 'block':
		text = _('Block');
		break;
	case 'allow':
		text = _('Allow');
		break;
	default:
		text = _('Inherit');
		break;
	}

	return text + ' / ' + (effective ? _('blocking UDP 443') : _('allowing UDP 443'));
}

function targetsWithIp(targets) {
	return (targets || []).filter(function(target) {
		return target.type === 'ip' && target.ip;
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			callCtl('certs'),
			callCtl('status'),
			callCtl('nft-summary'),
			callCtl('list-targets'),
			loadQrScript()
		]);
	},

	renderQrLater: function(url) {
		window.setTimeout(function() {
			var node = document.getElementById('mitmproxy-ca-qr');

			if (node && window.MitmproxyQRCode)
				window.MitmproxyQRCode.render(node, url, {
					size: 224,
					label: _('CA certificate download QR code')
				});
		}, 0);
	},

	runDiagnostics: function() {
		var self = this;
		var input = document.getElementById('mitmproxy-diagnostics-ip');
		var result = document.getElementById('mitmproxy-diagnostics-result');
		var ip = input ? input.value.trim() : '';

		return callCtl('mobile-diagnostics', ip ? [ ip ] : []).then(function(data) {
			var node = self.renderDiagnosticsResult(data);

			if (result && result.parentNode)
				result.parentNode.replaceChild(node, result);

			ui.addNotification(null, E('p', {}, _('Diagnostics completed.')), 'info');
		});
	},

	renderPrimaryCertificate: function(certs, status) {
		var primary = certs.primary;
		var url = absoluteUrl(primary);
		var self = this;

		if (!primary)
			return E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Mobile CA certificate')),
				E('div', { 'class': 'alert-message warning' }, _('No public CA certificate has been generated yet. Start mitmproxy once, then reopen this page.')),
				E('div', { 'class': 'cbi-section-actions' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'disabled': status.docker_available && status.fw4_available ? null : 'disabled',
						'click': function(ev) {
							ev.preventDefault();
							return callCtl('start').then(function() {
								window.setTimeout(function() {
									window.location.reload();
								}, 500);
							});
						}
					}, _('Start mitmproxy'))
				])
			]);

		this.renderQrLater(url);

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Mobile CA certificate')),
			E('table', { 'class': 'table' }, [
				row(_('Primary file'), primary.name),
				row(_('Download URL'), E('a', { 'href': primary.url, 'target': '_blank', 'rel': 'noopener' }, url)),
				row(_('Router path'), E('code', {}, primary.path)),
				row(_('SHA256'), primary.sha256 ? E('code', {}, primary.sha256) : E('em', {}, _('Unavailable')))
			]),
			E('div', {
				'id': 'mitmproxy-ca-qr',
				'style': 'display:inline-block;padding:12px;border:1px solid #d1d5db;background:#fff;margin:.75rem 0;'
			}, _('Rendering QR code...')),
			E('div', { 'class': 'cbi-section-actions' }, [
				E('a', {
					'class': 'btn cbi-button cbi-button-action',
					'href': primary.url,
					'target': '_blank',
					'rel': 'noopener'
				}, _('Download certificate')),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-apply',
					'click': function(ev) {
						ev.preventDefault();
						return callCtl('certs').then(function() {
							ui.addNotification(null, E('p', {}, _('Certificate directory refreshed.')), 'info');
						});
					}
				}, _('Refresh certificates')),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': function(ev) {
						ev.preventDefault();
						return self.runDiagnostics();
					}
				}, _('Run diagnostics'))
			])
		]);
	},

	renderFiles: function(certs) {
		var files = certs.files || [];

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Published public files')),
			files.length ? E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th left' }, _('Name')),
					E('th', { 'class': 'th left' }, _('URL')),
					E('th', { 'class': 'th left' }, _('SHA256'))
				])
			].concat(files.map(function(file) {
				return E('tr', {}, [
					E('td', { 'class': 'td left' }, file.name),
					E('td', { 'class': 'td left' }, E('a', { 'href': file.url, 'target': '_blank', 'rel': 'noopener' }, file.url)),
					E('td', { 'class': 'td left' }, file.sha256 ? E('code', {}, file.sha256) : '-')
				]);
			}))) : E('em', {}, _('No public certificate files are available yet.'))
		]);
	},

	renderInstructions: function() {
		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Mobile installation notes')),
			E('h4', {}, _('iPhone / iPad')),
			E('ol', {}, [
				E('li', {}, _('Open this page from Safari on the device, then scan or tap the certificate download link.')),
				E('li', {}, _('Install the downloaded profile in Settings.')),
				E('li', {}, _('Open Settings > General > About > Certificate Trust Settings and enable full trust for the mitmproxy CA.')),
				E('li', {}, _('After testing, remove the profile and disable full trust.'))
			]),
			E('h4', {}, _('Android')),
			E('ol', {}, [
				E('li', {}, _('Open the certificate URL on the device and install it as a CA certificate when Android prompts.')),
				E('li', {}, _('For browser testing, confirm the browser uses the Android user CA store.')),
				E('li', {}, _('Apps targeting Android 7 or newer usually do not trust user-installed CAs unless the app explicitly opts in. For debug builds, add a network security config that trusts user CAs or bundle the mitmproxy CA for debugging only.')),
				E('li', {}, _('If one app still fails while browser HTTPS works, suspect certificate pinning or app-specific trust settings.'))
			]),
			E('h4', {}, _('QUIC / HTTP/3')),
			E('p', {}, _('UDP 443 must be blocked for many mobile apps to fall back to TCP 443, where transparent HTTPS interception can see the connection. Use per-target QUIC policy on the Targets page when only some devices should block QUIC.')),
			E('h4', {}, _('IPv6')),
			E('p', {}, _('On dual-stack networks, iOS and Android may prefer IPv6. If IPv4 capture works but some HTTPS traffic is missing, add the device IPv6 address as a target and enable IPv6 interception on the Rules page. IPv6 privacy addresses may rotate.'))
		]);
	},

	renderDesktopInstructions: function() {
		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Desktop installation notes')),
			E('h4', {}, _('macOS')),
			E('ol', {}, [
				E('li', {}, _('Download the public CA certificate on the Mac.')),
				E('li', {}, _('Open Keychain Access and import the certificate into the login or System keychain.')),
				E('li', {}, _('Open the certificate, expand Trust, then set SSL/TLS trust to Always Trust.')),
				E('li', {}, _('Restart browsers or apps that were already open before testing HTTPS traffic.'))
			]),
			E('h4', {}, _('Windows')),
			E('ol', {}, [
				E('li', {}, _('Download the .cer certificate on the Windows PC.')),
				E('li', {}, _('Open it and choose Install Certificate. Use Local Machine if you want all users to trust it, or Current User for only your account.')),
				E('li', {}, _('Choose Place all certificates in the following store, then select Trusted Root Certification Authorities.')),
				E('li', {}, _('Complete the wizard, then restart browsers or apps before testing.'))
			]),
			E('h4', {}, _('Linux')),
			E('ol', {}, [
				E('li', {}, _('Download the PEM certificate and save it with a .crt extension.')),
				E('li', {}, [
					_('On Debian or Ubuntu, copy it to '),
					E('code', {}, '/usr/local/share/ca-certificates/mitmproxy-ca.crt'),
					_(' and run '),
					E('code', {}, 'sudo update-ca-certificates'),
					_('.')
				]),
				E('li', {}, _('On Fedora, RHEL, or other distributions, use the system trust tool provided by the distribution, then restart browsers or apps.')),
				E('li', {}, _('Firefox, Chromium profiles, Java, Python, Node.js, Electron apps, and some CLI tools may use their own CA stores or environment variables. Import the CA there as well if system trust is not enough.'))
			]),
			E('p', {}, _('Remove the mitmproxy CA from the desktop trust store after testing. A trusted debugging CA can decrypt HTTPS traffic for any matching target while the proxy is active.'))
		]);
	},

	renderDiagnostics: function(targets) {
		var ipTargets = targetsWithIp(targets);
		var self = this;

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Mobile diagnostics')),
			E('div', { 'class': 'table' }, [
				E('div', { 'class': 'tr' }, [
					E('div', { 'class': 'td left' }, [
						E('input', {
							'id': 'mitmproxy-diagnostics-ip',
							'class': 'cbi-input-text',
							'type': 'text',
							'list': 'mitmproxy-target-ip-list',
							'placeholder': '192.168.1.23 or 2001:db8::123'
						}),
						E('datalist', { 'id': 'mitmproxy-target-ip-list' }, ipTargets.map(function(target) {
							return E('option', {
								'value': target.ip,
								'label': (target.name || target.ip) + ' / ' + (target.family || 'ipv4')
							});
						}))
					]),
					E('div', { 'class': 'td left' }, [
						E('button', {
							'class': 'btn cbi-button cbi-button-action',
							'click': function(ev) {
								ev.preventDefault();
								return self.runDiagnostics();
							}
						}, _('Run diagnostics'))
					])
				])
			]),
			E('div', { 'id': 'mitmproxy-diagnostics-result' }, [
				E('em', {}, _('Run diagnostics after selecting or entering the device IPv4 or IPv6 address.'))
			])
		]);
	},

	renderDiagnosticsResult: function(data) {
		var checks = data.checks || {};
		var target = data.target;
		var hints = data.hints || [];

		return E('div', { 'id': 'mitmproxy-diagnostics-result' }, [
			E('table', { 'class': 'table' }, [
				row(_('Certificates generated'), boolText(checks.certificates_generated)),
				row(_('Public CA available'), boolText(checks.public_ca_available)),
				row(_('Container running'), boolText(checks.container_running)),
				row(_('Rules applied'), boolText(checks.rules_enabled && checks.rules_file_exists)),
				row(_('TCP 443 enabled'), boolText(checks.tcp443_enabled)),
				row(_('IPv6 interception'), boolText(checks.ipv6_enabled)),
				row(_('Target found'), boolText(checks.target_found)),
				row(_('Target enabled'), boolText(checks.target_enabled)),
				row(_('Target in rules'), boolText(checks.target_in_rules)),
				row(_('DHCP lease present'), boolText(checks.dhcp_lease_present)),
				row(_('Target family'), target ? (target.family === 'ipv6' ? _('IPv6') : _('IPv4')) : '-'),
				row(_('Effective QUIC policy'), policyLabel(target ? target.quic_policy : 'inherit', checks.effective_block_quic))
			]),
			target ? E('p', {}, [
				_('Matched target: '),
				E('code', {}, target.name || target.id),
				' (',
				E('code', {}, target.id),
				')'
			]) : E('p', {}, _('No target matched the supplied IP address.')),
			hints.length ? E('ul', {}, hints.map(function(hint) {
				return E('li', {}, hint);
			})) : E('em', {}, _('No obvious issue was detected.'))
		]);
	},

	renderRuleSummary: function(summary, status) {
		var config = summary.config || {};
		var runtime = summary.runtime || {};
		var quicTargets = config.quic_targets || [];
		var quicTargetsV6 = config.quic_targets_v6 || [];
		var targetsUrl = (typeof L !== 'undefined' && L.url) ? L.url('admin/services/mitmproxy/targets') : '#';

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Capture summary')),
			E('table', { 'class': 'table' }, [
				row(_('Service'), status.enabled ? _('Enabled') : _('Disabled')),
				row(_('Rules'), status.rules && status.rules.enabled ? _('Applied') : _('Not applied')),
				row(_('Enabled targets'), String(status.rules ? status.rules.target_count : 0)),
				row(_('IPv6 interception'), status.rules && status.rules.ipv6_enabled ? _('Enabled') : _('Disabled')),
				row(_('QUIC-blocked targets'), quicTargets.length ? quicTargets.join(', ') : '-'),
				row(_('IPv6 QUIC-blocked targets'), quicTargetsV6.length ? quicTargetsV6.join(', ') : '-'),
				row(_('Runtime QUIC set'), runtime.quic_client_set ? _('Present') : _('Missing')),
				row(_('Runtime IPv6 client set'), runtime.client_set_v6 ? _('Present') : _('Missing'))
			]),
			E('p', {}, E('a', { 'href': targetsUrl }, _('Open Targets to change per-device QUIC policy.')))
		]);
	},

	render: function(data) {
		var certs = data[0];
		var status = data[1];
		var summary = data[2];
		var targets = (data[3] && data[3].targets) || [];

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('mitmproxy certificates')),
			E('div', { 'class': 'cbi-map-descr' }, _('Download and trust the mitmproxy public CA certificate for mobile HTTPS debugging.')),
			this.renderPrimaryCertificate(certs, status),
			this.renderRuleSummary(summary, status),
			this.renderDiagnostics(targets),
			this.renderInstructions(),
			this.renderDesktopInstructions(),
			this.renderFiles(certs)
		]);
	}
});
