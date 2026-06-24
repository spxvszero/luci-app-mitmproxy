# Design

## Goal

This package provides a LuCI control surface for mitmproxy transparent capture on OpenWrt and FriendlyWrt. It focuses on targeted debugging: capture only selected clients, networks, or ingress interfaces while leaving the rest of the router traffic alone.

## Architecture

```text
LuCI pages
  -> rpcd file exec ACL
  -> /usr/sbin/mitmproxyctl
  -> UCI config, Docker, firewall4/nftables, certificate files
```

Core decisions:

- Run mitmproxy in a Docker container with host networking.
- Keep traffic selection in OpenWrt firewall4/nftables, not inside Docker networking.
- Generate runtime nftables rules from UCI targets and service settings.
- Use LuCI JavaScript pages for status, targets, rules, and certificate guidance.
- Keep the default installed state disabled.

## Traffic Model

The controller reads enabled targets from `/etc/config/mitmproxy` and generates nftables source sets. TCP 80 and TCP 443 can be redirected to the mitmproxy transparent listener. UDP 443 can be rejected for selected targets so clients fall back from QUIC/HTTP3 to TCP.

IPv4 targets are enabled by default when configured. IPv6 interception has a separate `ipv6_enabled` flag so dual-stack networks do not change behavior unexpectedly.

## Security Model

- LuCI can execute only `/usr/sbin/mitmproxyctl` through the package ACL.
- Docker socket access is never exposed to the browser.
- Private mitmproxy CA files remain in `/etc/mitmproxy`.
- Public CA material is copied to `/www/mitmproxy-ca` only after it exists.
- Service startup, rule generation, and cleanup are handled by one controller script.

## Packaging Model

The package is architecture independent:

- LuCI JavaScript lives under `htdocs/`.
- Router-side shell, init scripts, UCI defaults, ACL, and menu files live under `root/`.
- The OpenWrt package Makefile sets `PKGARCH:=all`.

GitHub release builds still use multiple OpenWrt SDK targets to prove the package builds cleanly for common x86 and ARM environments.
