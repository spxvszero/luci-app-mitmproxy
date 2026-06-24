# Implementation

## Package Layout

- `Makefile`: OpenWrt package metadata and LuCI packaging entrypoint.
- `htdocs/luci-static/resources/view/mitmproxy/`: LuCI pages.
- `htdocs/luci-static/resources/mitmproxy/qrcode.js`: QR code helper for certificate download links.
- `root/usr/sbin/mitmproxyctl`: backend controller.
- `root/etc/config/mitmproxy`: default UCI config.
- `root/etc/uci-defaults/99_luci_mitmproxy`: first-install setup and migrations.
- `root/etc/init.d/mitmproxy`: service lifecycle wrapper.
- `root/usr/share/luci/menu.d/`: LuCI menu metadata.
- `root/usr/share/rpcd/acl.d/`: LuCI RPC permissions.

## UCI Model

`config mitmproxy 'main'` stores service and runtime settings:

- service enablement
- Docker image, container name, config directory
- transparent listener and mitmweb ports
- ingress interfaces
- TCP interception flags
- default QUIC blocking behavior
- IPv6 enablement
- destination exclude lists
- ignored host patterns

`config target` sections store capture targets:

- `type`: `ip` or `cidr`
- `ip` or `cidr`: IPv4 or IPv6 target value
- `enabled`: whether the target participates in generated rules
- `quic_policy`: `inherit`, `block`, or `allow`
- `name`, `comment`, and optional `mac` for display and lease correlation

## Controller Commands

`mitmproxyctl` is the only backend command LuCI needs. Important commands include:

- `status`: service, Docker, firewall, version, and last error summary.
- `start`, `stop`, `restart`, `clean`: lifecycle operations.
- `apply-rules`: sync UCI settings to Docker and nftables runtime.
- `list-targets`, `add-target`, `set-target`, `delete-target`: target management.
- `list-leases`: DHCP lease display data.
- `list-interfaces`: available ingress interfaces.
- `nft-summary`: generated rule and runtime state summary.
- `certs`: CA certificate publishing status.
- `mobile-diagnostics`: focused hints for mobile HTTPS capture.

## nftables Behavior

The generated rules are written under `/etc/nftables.d/mitmproxy.nft` for firewall4 inclusion. The file defines only sets and chains for the `inet fw4` context.

Generated structures include:

- IPv4 source and exclude sets.
- IPv6 source and exclude sets when IPv6 interception is enabled.
- Optional QUIC source sets.
- TCP redirect rules for selected targets and ports.
- UDP 443 reject rules for targets whose effective QUIC policy is block.

Rule updates use a temporary file and replace the runtime file only after generation succeeds. Cleanup removes package-owned chains and sets.

## LuCI Pages

- **Status**: service state, Docker state, generated rule summary, logs, start/stop/restart/clean actions.
- **Targets**: configured targets, DHCP lease association, quick-add from lease data.
- **Rules**: ingress interfaces, interception flags, exclude lists, ignored hosts, container settings.
- **Certificates**: CA state, download links, QR code, and platform guidance.

## Release Build

The release workflow builds the package with OpenWrt 24.10.7 SDKs for `x86/64`, `armsr/armv7`, `armsr/armv8`, and `rockchip/armv8`. Since the package is architecture independent, the release attaches one `luci-app-mitmproxy_*_all.ipk` after all matrix jobs pass.
