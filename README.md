# luci-app-mitmproxy

`luci-app-mitmproxy` is a LuCI app for managing mitmproxy transparent capture on OpenWrt and FriendlyWrt. It lets an administrator choose IP, CIDR, or interface based traffic targets, run mitmproxy in Docker host networking mode, and manage the generated firewall4/nftables rules from the web UI.

The package is written as LuCI JavaScript, POSIX shell, UCI config, and LuCI ACL/menu metadata. It is packaged as `Architecture: all`, so the same release IPK is intended for supported x86 and ARM OpenWrt targets.

## Requirements

- OpenWrt or FriendlyWrt 24.10.x with `opkg`, `firewall4`, and `nftables`.
- LuCI and rpcd.
- Docker on the router: `docker` and `dockerd`.
- Enough storage for the selected mitmproxy Docker image.

Install dependencies first when your image does not include them:

```sh
opkg update
opkg install luci-base rpcd uci firewall4 nftables docker dockerd ca-bundle
```

## Install From GitHub Release

Download the latest `luci-app-mitmproxy_*_all.ipk` from the GitHub Releases page, then install it on the router:

```sh
opkg install /tmp/luci-app-mitmproxy_VERSION_all.ipk
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

After installation, open LuCI and go to **Services > mitmproxy**.

To update, download the newer release IPK and run `opkg install` on that file again. Existing `/etc/config/mitmproxy` settings are preserved as package configuration.

## Build From Source

Use an OpenWrt 24.10 SDK that matches your target. Example:

```sh
git clone https://github.com/<owner>/luci-app-mitmproxy.git
cd openwrt-sdk
./scripts/feeds update -a
./scripts/feeds install -a
mkdir -p package/luci-app-mitmproxy
cp -a /path/to/luci-app-mitmproxy/. package/luci-app-mitmproxy/
make defconfig
make package/luci-app-mitmproxy/compile V=s
```

The package appears under `bin/packages/.../luci/`.

## Basic Usage

1. Install Docker and this LuCI app.
2. Open **Services > mitmproxy > Rules** and confirm the ingress interface, ports, Docker image, and web port.
3. Open **Targets** and add a target IP or CIDR, for example `192.0.2.10` or `2001:db8::10`.
4. Start the service from **Status**.
5. Install and trust the mitmproxy CA certificate on the selected client when HTTPS interception is needed.

The default installed configuration is disabled. No capture rules are generated until the service and selected targets are enabled.

## GitHub Actions Release

Release builds use OpenWrt 24.10.7 SDKs for:

- `x86/64`
- `armsr/armv7`
- `armsr/armv8`
- `rockchip/armv8`

Each SDK job builds the package and checks that the generated IPK metadata is `Package: luci-app-mitmproxy` and `Architecture: all`. The release publishes one `*_all.ipk` plus build summaries.

## Local Checks

```sh
node --check htdocs/luci-static/resources/view/mitmproxy/status.js
node --check htdocs/luci-static/resources/view/mitmproxy/targets.js
node --check htdocs/luci-static/resources/view/mitmproxy/rules.js
node --check htdocs/luci-static/resources/view/mitmproxy/certificates.js
node --check htdocs/luci-static/resources/mitmproxy/qrcode.js
```

Linux CI also runs `sh -n` on package shell files and validates JSON metadata.

## Safety Notes

- Only configured targets are captured.
- QUIC blocking is available so browsers can fall back from HTTP/3 to inspectable TLS over TCP.
- Private CA key material stays under `/etc/mitmproxy`; only public CA files are published for download.
- Generated firewall rules are owned by this package and are cleaned when the service is stopped.
