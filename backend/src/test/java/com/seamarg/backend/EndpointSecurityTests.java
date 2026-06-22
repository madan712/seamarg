package com.seamarg.backend;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.seamarg.backend.security.AdminPasswordAuthenticationFilter;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "seamarg.security.admin.password=test-admin-password")
@AutoConfigureMockMvc
class EndpointSecurityTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void publicEndpointAllowsAnonymousAccess() throws Exception {
		mockMvc.perform(get("/api/public/hello"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.message").value("Hello from the public API"));
	}

	@Test
	void customerEndpointRequiresJwt() throws Exception {
		mockMvc.perform(get("/api/customer/hello")).andExpect(status().isUnauthorized());
	}

	@Test
	void customerEndpointAllowsJwtAccess() throws Exception {
		mockMvc.perform(get("/api/customer/hello").with(jwt().jwt(token -> token.subject("customer-123"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.message").value("Hello from the customer API"))
			.andExpect(jsonPath("$.subject").value("customer-123"));
	}

	@Test
	void adminEndpointRequiresStaticPassword() throws Exception {
		mockMvc.perform(get("/api/admin/hello")).andExpect(status().isUnauthorized());
	}

	@Test
	void adminEndpointRejectsWrongStaticPassword() throws Exception {
		mockMvc.perform(get("/api/admin/hello").header(AdminPasswordAuthenticationFilter.ADMIN_PASSWORD_HEADER, "wrong"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void adminEndpointAllowsCorrectStaticPassword() throws Exception {
		mockMvc.perform(get("/api/admin/hello")
			.header(AdminPasswordAuthenticationFilter.ADMIN_PASSWORD_HEADER, "test-admin-password"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.message").value("Hello from the admin API"))
			.andExpect(jsonPath("$.principal").value("admin"));
	}
}
