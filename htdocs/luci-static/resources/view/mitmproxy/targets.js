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

function row(cells) {
	return E('tr', {}, cells.map(function(cell) {
		return E('td', { 'class': 'td left' }, cell);
	}));
}

function formatLeaseExpires(lease) {
	var seconds = Number(lease.expires_in || 0);

	if (!seconds)
		return '-';

	if (seconds < 60)
		return _('%ds').format(seconds);

	if (seconds < 3600)
		return _('%dm').format(Math.floor(seconds / 60));

	if (seconds < 86400)
		return _('%dh').format(Math.floor(seconds / 3600));

	return _('%dd').format(Math.floor(seconds / 86400));
}

function quicPolicyText(policy) {
	switch (policy) {
	case 'block':
		return _('Block');
	case 'allow':
		return _('Allow');
	default:
		return _('Inherit');
	}
}

function quicEffectiveText(effective) {
	return effective ? _('UDP 443 blocked') : _('UDP 443 allowed');
}

function quicPolicySelect(value, onchange, attrs) {
	var selectAttrs = { 'class': 'cbi-input-select' };
	var key;

	value = value || 'inherit';
	attrs = attrs || {};
	for (key in attrs)
		selectAttrs[key] = attrs[key];
	if (onchange)
		selectAttrs.change = function(ev) {
			return onchange(ev.target.value);
		};

	return E('select', selectAttrs, [
		E('option', { 'value': 'inherit', 'selected': value === 'inherit' ? 'selected' : null }, _('Inherit')),
		E('option', { 'value': 'block', 'selected': value === 'block' ? 'selected' : null }, _('Block')),
		E('option', { 'value': 'allow', 'selected': value === 'allow' ? 'selected' : null }, _('Allow'))
	]);
}

return view.extend({
	refreshTimer: null,

	load: function() {
		return Promise.all([
			callCtl('list-targets'),
			callCtl('list-leases')
		]);
	},

	applyRules: function() {
		return callCtl('apply-rules').then(function() {
			ui.addNotification(null, E('p', {}, _('Rules applied.')), 'info');
		});
	},

	reloadSoon: function() {
		window.setTimeout(function() {
			window.location.reload();
		}, 500);
	},

	scheduleRefresh: function() {
		var self = this;

		if (this.refreshTimer)
			window.clearTimeout(this.refreshTimer);

		this.refreshTimer = window.setTimeout(function() {
			self.refreshTables(false);
		}, 15000);
	},

	refreshTables: function(showNotification) {
		var self = this;

		return Promise.all([
			callCtl('list-targets'),
			callCtl('list-leases')
		]).then(function(data) {
			var targets = data[0].targets || [];
			var leases = data[1].leases || [];
			var targetsNode = document.getElementById('mitmproxy-targets-section');
			var leasesNode = document.getElementById('mitmproxy-leases-section');

			if (targetsNode)
				targetsNode.parentNode.replaceChild(self.renderTargets(targets), targetsNode);

			if (leasesNode)
				leasesNode.parentNode.replaceChild(self.renderLeases(leases, targets), leasesNode);

			if (showNotification)
				ui.addNotification(null, E('p', {}, _('Device list refreshed.')), 'info');

			self.scheduleRefresh();
		}).catch(function(err) {
			self.scheduleRefresh();
			throw err;
		});
	},

	handleAddManual: function() {
		var type = document.getElementById('mitmproxy-target-type').value;
		var value = document.getElementById('mitmproxy-target-value').value.trim();
		var name = document.getElementById('mitmproxy-target-name').value.trim();
		var comment = document.getElementById('mitmproxy-target-comment').value.trim();
		var quicPolicy = document.getElementById('mitmproxy-target-quic-policy').value;

		if (type === 'ip' && !isIPv4(value) && !isIPv6(value)) {
			ui.addNotification(null, E('p', {}, _('Invalid IP address.')), 'danger');
			return Promise.resolve();
		}

		if (type === 'cidr' && !isCIDR(value) && !isCIDR6(value)) {
			ui.addNotification(null, E('p', {}, _('Invalid CIDR.')), 'danger');
			return Promise.resolve();
		}

		return callCtl('add-target', [ type, value, name || value, comment, '1', '', quicPolicy ])
			.then(this.applyRules.bind(this))
			.then(this.reloadSoon.bind(this));
	},

	handleAddLease: function(lease) {
		return callCtl('add-target', [
			'ip',
			lease.ip,
			lease.hostname || lease.ip,
			'from DHCP lease',
			'1',
			lease.mac || '',
			'inherit'
		]).then(this.applyRules.bind(this)).then(this.reloadSoon.bind(this));
	},

	handleToggle: function(target, enabled) {
		return callCtl('set-target', [ target.id, 'enabled', enabled ? '1' : '0' ])
			.then(this.applyRules.bind(this))
			.then(this.reloadSoon.bind(this));
	},

	handleQuicPolicy: function(target, policy) {
		return callCtl('set-target', [ target.id, 'quic_policy', policy ])
			.then(this.applyRules.bind(this))
			.then(this.reloadSoon.bind(this));
	},

	handleDelete: function(target) {
		if (!window.confirm(_('Delete this target?')))
			return Promise.resolve();

		return callCtl('delete-target', [ target.id ])
			.then(this.applyRules.bind(this))
			.then(this.reloadSoon.bind(this));
	},

	targetValue: function(target) {
		return target.type === 'cidr' ? target.cidr : target.ip;
	},

	renderManualAdd: function() {
		var self = this;

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Add target')),
			E('div', { 'class': 'table' }, [
				E('div', { 'class': 'tr' }, [
					E('div', { 'class': 'td left' }, [
						E('select', { 'id': 'mitmproxy-target-type', 'class': 'cbi-input-select' }, [
							E('option', { 'value': 'ip' }, _('IP address')),
							E('option', { 'value': 'cidr' }, _('CIDR range'))
						])
					]),
					E('div', { 'class': 'td left' }, [
						E('input', {
							'id': 'mitmproxy-target-value',
							'class': 'cbi-input-text',
							'type': 'text',
							'placeholder': '192.0.2.10 or 2001:db8::123'
						})
					]),
					E('div', { 'class': 'td left' }, [
						E('input', {
							'id': 'mitmproxy-target-name',
							'class': 'cbi-input-text',
							'type': 'text',
							'placeholder': _('Name')
						})
					]),
					E('div', { 'class': 'td left' }, [
						E('input', {
							'id': 'mitmproxy-target-comment',
							'class': 'cbi-input-text',
							'type': 'text',
							'placeholder': _('Comment')
						})
					]),
					E('div', { 'class': 'td left' }, [
						quicPolicySelect('inherit', null, { 'id': 'mitmproxy-target-quic-policy' })
					]),
					E('div', { 'class': 'td left' }, [
						E('button', {
							'class': 'btn cbi-button cbi-button-add',
							'click': function(ev) {
								ev.preventDefault();
								return self.handleAddManual();
							}
						}, _('Add'))
					])
				])
			])
		]);
	},

	renderTargets: function(targets) {
		var self = this;
		var rows = targets.map(function(target) {
			var lease = target.lease || {};
			var leaseInfo = lease.present ? [
				lease.hostname || 'unknown',
				lease.mac || target.mac || '-',
				formatLeaseExpires(lease)
			].join(' / ') : '-';

			return row([
				target.enabled ? _('Enabled') : _('Disabled'),
				target.name || self.targetValue(target),
				target.type,
				target.family === 'ipv6' ? _('IPv6') : _('IPv4'),
				self.targetValue(target),
				target.mac || '-',
				leaseInfo,
				target.comment || '-',
				E('span', {}, [
					quicPolicySelect(target.quic_policy || 'inherit', function(value) {
						return self.handleQuicPolicy(target, value);
					}),
					E('br'),
					E('small', {}, quicEffectiveText(target.effective_block_quic))
				]),
				E('span', {}, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': function(ev) {
							ev.preventDefault();
							return self.handleToggle(target, !target.enabled);
						}
					}, target.enabled ? _('Disable') : _('Enable')),
					' ',
					E('button', {
						'class': 'btn cbi-button cbi-button-remove',
						'click': function(ev) {
							ev.preventDefault();
							return self.handleDelete(target);
						}
					}, _('Delete'))
				])
			]);
		});

		if (!rows.length)
			rows.push(E('tr', {}, E('td', { 'class': 'td left', 'colspan': 10 }, _('No targets configured.'))));

		return E('div', { 'id': 'mitmproxy-targets-section', 'class': 'cbi-section' }, [
			E('h3', {}, _('Configured targets')),
			E('p', {}, _('IPv6 targets are manual in this version. Mobile IPv6 privacy addresses may rotate; confirm the current address if traffic is not captured.')),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th left' }, _('State')),
					E('th', { 'class': 'th left' }, _('Name')),
					E('th', { 'class': 'th left' }, _('Type')),
					E('th', { 'class': 'th left' }, _('Family')),
					E('th', { 'class': 'th left' }, _('Value')),
					E('th', { 'class': 'th left' }, _('MAC')),
					E('th', { 'class': 'th left' }, _('Lease')),
					E('th', { 'class': 'th left' }, _('Comment')),
					E('th', { 'class': 'th left' }, _('QUIC policy')),
					E('th', { 'class': 'th left' }, _('Actions'))
				])
			].concat(rows))
		]);
	},

	renderLeases: function(leases, targets) {
		var self = this;
		var byIp = {};
		var rows;

		targets.forEach(function(target) {
			if (target.type === 'ip' && target.ip)
				byIp[target.ip] = target;
		});

		rows = leases.map(function(lease) {
			var target = byIp[lease.ip];
			var action = target ? E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': function(ev) {
					ev.preventDefault();
					return self.handleToggle(target, !target.enabled);
				}
			}, target.enabled ? _('Disable') : _('Enable')) : E('button', {
				'class': 'btn cbi-button cbi-button-add',
				'click': function(ev) {
					ev.preventDefault();
					return self.handleAddLease(lease);
				}
			}, _('Add target'));

			return row([
				lease.hostname || 'unknown',
				lease.ip,
				lease.mac || '-',
				formatLeaseExpires(lease),
				target ? (target.enabled ? _('Enabled') : _('Disabled')) : _('Not configured'),
				target ? [
					quicPolicyText(target.quic_policy),
					' / ',
					quicEffectiveText(target.effective_block_quic)
				] : '-',
				action
			]);
		});

		if (!rows.length)
			rows.push(E('tr', {}, E('td', { 'class': 'td left', 'colspan': 7 }, _('No DHCP leases found.'))));

		return E('div', { 'id': 'mitmproxy-leases-section', 'class': 'cbi-section' }, [
			E('h3', {}, _('DHCPv4 leases')),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th left' }, _('Hostname')),
					E('th', { 'class': 'th left' }, _('IPv4')),
					E('th', { 'class': 'th left' }, _('MAC')),
					E('th', { 'class': 'th left' }, _('Lease')),
					E('th', { 'class': 'th left' }, _('Target state')),
					E('th', { 'class': 'th left' }, _('Target QUIC')),
					E('th', { 'class': 'th left' }, _('Actions'))
				])
			].concat(rows))
		]);
	},

	render: function(data) {
		var targets = data[0].targets || [];
		var leases = data[1].leases || [];
		var self = this;

		this.scheduleRefresh();

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('mitmproxy targets')),
			E('div', { 'class': 'cbi-map-descr' }, _('Choose IPv4 or IPv6 addresses and CIDR ranges to capture. IPv6 interception must also be enabled on the Rules page.')),
			E('div', { 'class': 'cbi-section-actions' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': function(ev) {
						ev.preventDefault();
						return self.refreshTables(true);
					}
				}, _('Refresh devices'))
			]),
			this.renderManualAdd(),
			this.renderTargets(targets),
			this.renderLeases(leases, targets)
		]);
	}
});
