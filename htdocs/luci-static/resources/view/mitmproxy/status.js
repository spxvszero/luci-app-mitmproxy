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

function statusText(value, yes, no) {
	return value ? yes : no;
}

function hasCjkText(value) {
	return /[\u4e00-\u9fff]/.test(String(value || ''));
}

function localeLooksChinese() {
	var langs = [];

	if (typeof document !== 'undefined' && document.documentElement)
		langs.push(document.documentElement.lang || document.documentElement.getAttribute('lang') || '');

	if (typeof navigator !== 'undefined') {
		if (navigator.language)
			langs.push(navigator.language);

		if (navigator.languages)
			langs = langs.concat(navigator.languages);
	}

	if (/zh/i.test(langs.join(' ')))
		return true;

	return hasCjkText(_('Clean'));
}

function localText(text, zhText) {
	if (localeLooksChinese())
		return zhText;

	return _(text);
}

function row(label, value) {
	return E('tr', {}, [
		E('td', { 'class': 'td left', 'width': '35%' }, label),
		E('td', { 'class': 'td left' }, value)
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			callCtl('status'),
			callCtl('logs', [ '80' ]),
			callCtl('certs'),
			callCtl('nft-summary')
		]);
	},

	handleCommand: function(command) {
		return callCtl(command).then(function() {
			ui.addNotification(null, E('p', {}, _('Command completed.')), 'info');
			window.setTimeout(function() {
				window.location.reload();
			}, 500);
		});
	},

	renderButtons: function(status) {
		var self = this;
		var disabledStart = (!status.docker_available || !status.fw4_available) ? 'disabled' : null;
		var disabledRules = !status.fw4_available ? 'disabled' : null;

		return E('div', { 'class': 'cbi-section-actions' }, [
			E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'disabled': disabledStart,
				'click': function(ev) {
					ev.preventDefault();
					return self.handleCommand('start');
				}
			}, _('Start')),
			' ',
			E('button', {
				'class': 'btn cbi-button cbi-button-negative',
				'click': function(ev) {
					ev.preventDefault();
					return self.handleCommand('stop');
				}
			}, _('Stop')),
			' ',
			E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'disabled': disabledStart,
				'click': function(ev) {
					ev.preventDefault();
					return self.handleCommand('restart');
				}
			}, _('Restart')),
			' ',
			E('button', {
				'class': 'btn cbi-button cbi-button-negative',
				'disabled': disabledRules,
				'click': function(ev) {
					ev.preventDefault();

					if (!window.confirm(localText(
						'Clean will stop mitmproxy, remove the mitmproxy container, clear generated firewall rules, and erase mitmproxy runtime state. Docker images, saved settings, and targets are kept. Continue?',
						'清空会停止 mitmproxy、删除 mitmproxy 容器、清理已生成的防火墙规则，并清空 mitmproxy 运行状态。Docker 镜像、已保存设置和目标设备会保留。是否继续？'
					)))
						return Promise.resolve();

					return self.handleCommand('clean');
				}
			}, localText('Clean', '清空')),
			' ',
			E('button', {
				'class': 'btn cbi-button cbi-button-apply',
				'disabled': disabledRules,
				'click': function(ev) {
					ev.preventDefault();
					return self.handleCommand('apply-rules');
				}
			}, _('Sync runtime'))
		]);
	},

	renderCerts: function(certs) {
		var files = certs.files || [];
		var primary = certs.primary;
		var certPage = (typeof L !== 'undefined' && L.url) ? L.url('admin/services/mitmproxy/certificates') : '#';

		if (!files.length)
			return E('div', {}, [
				E('em', {}, _('No public CA certificate has been generated yet.')),
				E('p', {}, E('a', { 'href': certPage }, _('Open Certificates')))
			]);

		return E('div', {}, [
			primary ? E('p', {}, [
				_('Primary mobile certificate: '),
				E('a', { 'href': primary.url, 'target': '_blank', 'rel': 'noopener' }, primary.name)
			]) : E('em', {}, _('No primary certificate selected.')),
			E('p', {}, E('a', { 'href': certPage }, _('Open Certificates for QR code and mobile setup notes.')))
		]);
	},

	renderLogs: function(logs) {
		var lines = (logs && logs.logs) ? logs.logs : [];

		if (!lines.length)
			return E('em', {}, _('No recent log lines.'));

		return E('pre', {
			'style': 'max-height: 360px; overflow: auto; white-space: pre-wrap;'
		}, lines.join('\n'));
	},

	renderRuleSummary: function(summary) {
		var config = summary.config || {};
		var runtime = summary.runtime || {};
		var file = summary.file || {};
		var lines = file.lines || [];
		var targets = (config.targets || []).join(', ') || '-';
		var targetsV4 = (config.targets_v4 || []).join(', ') || '-';
		var targetsV6 = (config.targets_v6 || []).join(', ') || '-';
		var interfaces = (config.interfaces || []).join(', ') || '-';
		var tcpPorts = (config.tcp_ports || []).join(', ') || '-';
		var excludes = (config.exclude_cidr || []).join(', ') || '-';
		var excludes6 = (config.exclude_cidr6 || []).join(', ') || '-';
		var ignoreHosts = (config.ignore_hosts || []).join(', ') || '-';
		var quicTargets = (config.quic_targets || []).join(', ') || '-';
		var quicTargetsV4 = (config.quic_targets_v4 || []).join(', ') || '-';
		var quicTargetsV6 = (config.quic_targets_v6 || []).join(', ') || '-';
		var warnings = config.warnings || [];

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('nft rule summary')),
			E('table', { 'class': 'table' }, [
				row(_('Config valid'), config.valid ? _('Yes') : (config.error || _('No'))),
				row(_('Rule file'), file.exists ? file.path : _('Not generated')),
				row(_('Runtime matches'), String(runtime.match_count || 0)),
				row(_('Prerouting chain'), runtime.prerouting_chain ? _('Present') : _('Missing')),
				row(_('QUIC chain'), runtime.quic_chain ? _('Present') : _('Missing')),
				row(_('IPv4 client set'), runtime.client_set_v4 ? _('Present') : _('Missing')),
				row(_('IPv6 client set'), runtime.client_set_v6 ? _('Present') : _('Missing')),
				row(_('IPv4 QUIC client set'), runtime.quic_client_set_v4 ? _('Present') : _('Missing')),
				row(_('IPv6 QUIC client set'), runtime.quic_client_set_v6 ? _('Present') : _('Missing')),
				row(_('IPv4 exclude set'), runtime.exclude_set_v4 ? _('Present') : _('Missing')),
				row(_('IPv6 exclude set'), runtime.exclude_set_v6 ? _('Present') : _('Missing')),
				row(_('IPv6 interception'), config.ipv6_enabled ? _('Enabled') : _('Disabled')),
				row(_('Targets'), targets),
				row(_('IPv4 targets'), targetsV4),
				row(_('IPv6 targets'), targetsV6),
				row(_('QUIC-blocked targets'), quicTargets),
				row(_('IPv4 QUIC-blocked targets'), quicTargetsV4),
				row(_('IPv6 QUIC-blocked targets'), quicTargetsV6),
				row(_('Ingress interfaces'), interfaces),
				row(_('TCP ports'), tcpPorts),
				row(_('Default QUIC block'), config.block_quic_default ? _('Enabled') : _('Disabled')),
				row(_('Excluded CIDR'), excludes),
				row(_('Excluded IPv6 CIDR'), excludes6),
				row(_('Warnings'), warnings.length ? warnings.join(', ') : '-'),
				row(_('Ignored hosts'), ignoreHosts)
			]),
			lines.length ? E('pre', {
				'style': 'max-height: 280px; overflow: auto; white-space: pre-wrap;'
			}, lines.join('\n')) : E('em', {}, _('No generated nft file.'))
		]);
	},

	render: function(data) {
		var status = data[0];
		var logs = data[1];
		var certs = data[2];
		var ruleSummary = data[3];
		var webUrl = 'http://' + window.location.hostname + ':' + status.ports.web + '/';
		var webPassword = (status.web && status.web.password) ? status.web.password : '';
		var packageVersion = (status.package && status.package.version) ? status.package.version : (status.version || '-');
		var notices = [];
		var children;

		if (!status.docker_available)
			notices.push(E('div', { 'class': 'alert-message warning' }, _('Docker is not available on this system.')));

		if (!status.fw4_available)
			notices.push(E('div', { 'class': 'alert-message warning' }, _('firewall4/fw4 is not available on this system.')));

		if (status.last_error)
			notices.push(E('div', { 'class': 'alert-message error' }, status.last_error));

		children = [
			E('h2', {}, _('mitmproxy')),
			E('div', { 'class': 'cbi-map-descr' }, _('Transparent capture status and controls.'))
		].concat(notices, [
			this.renderButtons(status),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Runtime status')),
				E('table', { 'class': 'table' }, [
					row(_('Version'), packageVersion),
					row(_('Service enabled'), statusText(status.enabled, _('Enabled'), _('Disabled'))),
					row(_('Docker'), statusText(status.docker_available, _('Available'), _('Missing'))),
					row(_('firewall4'), statusText(status.fw4_available, _('Available'), _('Missing'))),
					row(_('Container'), status.container.name + ' - ' + statusText(status.container.running, _('running'), _('stopped'))),
					row(_('Image'), status.container.image),
					row(_('Proxy port'), String(status.ports.proxy)),
					row(_('mitmweb'), E('a', { 'href': webUrl, 'target': '_blank', 'rel': 'noopener' }, webUrl)),
					row(_('mitmweb password'), webPassword ? E('code', {}, webPassword) : E('em', {}, _('Not set'))),
					row(_('Rules'), statusText(status.rules.exists && status.rules.enabled, _('Applied'), _('Not applied'))),
					row(_('Enabled targets'), String(status.rules.target_count)),
					row(_('IPv4 targets'), String(status.rules.target_count_v4 || 0)),
					row(_('IPv6 targets'), String(status.rules.target_count_v6 || 0)),
					row(_('QUIC-blocked targets'), String(status.rules.quic_target_count || 0)),
					row(_('IPv4 QUIC-blocked targets'), String(status.rules.quic_target_count_v4 || 0)),
					row(_('IPv6 QUIC-blocked targets'), String(status.rules.quic_target_count_v6 || 0)),
					row(_('Default QUIC block'), status.rules.block_quic_default ? _('Enabled') : _('Disabled')),
					row(_('IPv6 interception'), status.rules.ipv6_enabled ? _('Enabled') : _('Disabled')),
					row(_('Ingress interfaces'), String(status.rules.interface_count)),
					row(_('Excluded IPv6 CIDR'), String(status.rules.exclude_cidr6_count || 0)),
					row(_('Ignored hosts'), String(status.rules.ignore_host_count || 0))
				])
			]),
			this.renderRuleSummary(ruleSummary),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('CA certificates')),
				this.renderCerts(certs)
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Recent logs')),
				this.renderLogs(logs)
			])
		]);

		return E('div', { 'class': 'cbi-map' }, children);
	}
});
