package com.seamarg.backend.security;

import org.springframework.util.StringUtils;

public final class AdminSecurityProperties {

	public static final String DEFAULT_USERNAME = "admin";
	public static final String DEFAULT_ROLE = "ADMIN";

	private AdminSecurityProperties() {
	}

	public static String usernameOrDefault(String username) {
		return StringUtils.hasText(username) ? username.trim() : DEFAULT_USERNAME;
	}

	public static String authorityFromRole(String role) {
		var normalizedRole = StringUtils.hasText(role) ? role.trim() : DEFAULT_ROLE;
		if (normalizedRole.startsWith("ROLE_")) {
			return normalizedRole;
		}
		return "ROLE_" + normalizedRole;
	}
}
