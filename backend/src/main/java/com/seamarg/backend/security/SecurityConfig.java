package com.seamarg.backend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, AdminPasswordAuthenticationFilter adminPasswordFilter,
			@Value("${seamarg.security.admin.role:ADMIN}") String adminRole) throws Exception {
		var adminAuthority = AdminSecurityProperties.authorityFromRole(adminRole);

		return http.csrf(AbstractHttpConfigurer::disable)
			.cors(Customizer.withDefaults())
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(authorize -> authorize
				.requestMatchers("/api/public/**", "/api/hello", "/actuator/health/**", "/actuator/info").permitAll()
				.requestMatchers(HttpMethod.OPTIONS, "/api/**").permitAll()
				.requestMatchers("/api/customer/**").authenticated()
				.requestMatchers("/api/admin/**").hasAuthority(adminAuthority)
				.anyRequest().denyAll())
			.oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
			.addFilterBefore(adminPasswordFilter, AuthorizationFilter.class)
			.build();
	}

	@Bean
	JwtDecoder jwtDecoder(@Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri:}") String issuerUri) {
		if (StringUtils.hasText(issuerUri)) {
			return JwtDecoders.fromIssuerLocation(issuerUri);
		}

		return token -> {
			throw new JwtException("Customer JWT issuer is not configured.");
		};
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource(
			@Value("${seamarg.cors.allowed-origins:}") String allowedOrigins) {
		var configuration = new CorsConfiguration();
		configuration.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
			.map(String::trim)
			.filter(StringUtils::hasText)
			.toList());
		configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "OPTIONS"));
		configuration.setAllowedHeaders(Arrays.asList("Authorization", "Content-Type",
			AdminPasswordAuthenticationFilter.ADMIN_PASSWORD_HEADER));
		configuration.setExposedHeaders(Arrays.asList("Location"));
		configuration.setMaxAge(3600L);

		var source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/api/**", configuration);
		return source;
	}
}
