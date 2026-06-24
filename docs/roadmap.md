# Roadmap

## Near Term

- Publish GitHub Release IPKs from OpenWrt 24.10.7 SDK builds.
- Keep the CI matrix covering common x86, generic ARM, and rockchip ARM64 targets.
- Add small smoke checks for generated package metadata.
- Keep README installation guidance aligned with the release workflow.

## Compatibility

- Evaluate OpenWrt 23.05 support separately if users need older images.
- Track OpenWrt 25.12 package manager changes before advertising support.
- Consider a signed package feed later if users need `opkg update` and `opkg upgrade` workflows instead of release asset downloads.

## Features

- DHCPv6 and SLAAC address discovery for IPv6 targets.
- Target groups and presets for repeat debugging sessions.
- Optional scheduled capture windows.
- Better certificate install guidance for managed Android and iOS devices.
- More diagnostics for Docker storage, image pull, and port conflicts.

## Maintenance

- Keep generated files and local build outputs out of source control.
- Avoid adding device-specific notes to public docs.
- If native binaries are introduced later, switch away from `LUCI_PKGARCH:=all` and publish per-target packages.
