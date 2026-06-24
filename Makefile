include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-mitmproxy
PKG_VERSION:=0.4.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI support for mitmproxy transparent capture
LUCI_DEPENDS:=+luci-base +rpcd +uci +firewall4 +nftables +docker +dockerd +ca-bundle
LUCI_PKGARCH:=all

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=luci-app-mitmproxy contributors

define Package/$(PKG_NAME)/conffiles
/etc/config/mitmproxy
endef

include $(TOPDIR)/feeds/luci/luci.mk
