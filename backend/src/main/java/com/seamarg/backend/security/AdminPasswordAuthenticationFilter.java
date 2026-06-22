package com.seamarg.backend.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class AdminPasswordAuthenticationFilter extends OncePerRequestFilter {

	public static final String ADMIN_PASSWORD_HEADER = "X-Admin-Password";

	private final String adminPassword;

	public AdminPasswordAuthenticationFilter(@Value("${seamarg.security.admin.password:}") String adminPassword) {
		this.adminPassword = adminPassword;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
			throws ServletException, IOException {
		if (!isAdminPath(requestPath(request))) {
			filterChain.doFilter(request, response);
			return;
		}

		if (!StringUtils.hasText(adminPassword)) {
			SecurityContextHolder.clearContext();
			response.sendError(HttpServletResponse.SC_SERVICE_UNAVAILABLE, "Admin authentication is not configured.");
			return;
		}

		if (!passwordMatches(request.getHeader(ADMIN_PASSWORD_HEADER))) {
			SecurityContextHolder.clearContext();
			response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "AdminPassword realm=\"seamarg-admin\"");
			response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Admin password is required.");
			return;
		}

		var authentication = new UsernamePasswordAuthenticationToken("admin", null,
				List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
		var context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(authentication);
		SecurityContextHolder.setContext(context);

		try {
			filterChain.doFilter(request, response);
		}
		finally {
			SecurityContextHolder.clearContext();
		}
	}

	private boolean passwordMatches(String providedPassword) {
		if (providedPassword == null) {
			return false;
		}

		return MessageDigest.isEqual(providedPassword.getBytes(StandardCharsets.UTF_8),
				adminPassword.getBytes(StandardCharsets.UTF_8));
	}

	private boolean isAdminPath(String path) {
		return path.equals("/api/admin") || path.startsWith("/api/admin/");
	}

	private String requestPath(HttpServletRequest request) {
		var requestUri = request.getRequestURI();
		var contextPath = request.getContextPath();
		if (StringUtils.hasText(contextPath) && requestUri.startsWith(contextPath)) {
			return requestUri.substring(contextPath.length());
		}
		return requestUri;
	}
}
