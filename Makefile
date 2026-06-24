include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-mitmproxy
PKG_VERSION:=0.4.0
PKG_RELEASE:=1

PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=luci-app-mitmproxy contributors

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=3. Applications
	TITLE:=LuCI support for mitmproxy transparent capture
	DEPENDS:=+luci-base +rpcd +uci +firewall4 +nftables +docker +dockerd +ca-bundle
	PKGARCH:=all
endef

define Package/$(PKG_NAME)/description
LuCI application for managing transparent mitmproxy capture on OpenWrt.
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/mitmproxy
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/
	$(CP) ./root/* $(1)/
	$(INSTALL_DIR) $(1)/www
	$(CP) ./htdocs/* $(1)/www/
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
