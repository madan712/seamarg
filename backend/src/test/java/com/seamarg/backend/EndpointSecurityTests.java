package com.seamarg.backend;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.springframework.http.MediaType;

import com.seamarg.backend.security.AdminPasswordAuthenticationFilter;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
		"seamarg.security.admin.username=test-admin",
		"seamarg.security.admin.password=test-admin-password",
		"seamarg.security.admin.role=SEAMARG_ADMIN"
})
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
	void customerCertificateListRequiresJwt() throws Exception {
		mockMvc.perform(get("/api/customer/certificates")).andExpect(status().isUnauthorized());
	}

	@Test
	void customerCertificateListAllowsJwtAccess() throws Exception {
		mockMvc.perform(get("/api/customer/certificates").with(jwt().jwt(token -> token.subject("customer-123"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$").isArray());
	}

	@Test
	void customerCertificateUploadNeedsConfiguredStorage() throws Exception {
		var certificate = new MockMultipartFile(
			"file",
			"medical-fitness-certificate.txt",
			"text/plain",
			"Medical Fitness Certificate valid until 31/12/2027".getBytes());

		mockMvc.perform(multipart("/api/customer/certificates")
				.file(certificate)
				.with(jwt().jwt(token -> token.subject("customer-123"))))
			.andExpect(status().isServiceUnavailable())
			.andExpect(jsonPath("$.message").value(
				"Certificate document storage is not configured. Set SEAMARG_DOCUMENT_BUCKET for the backend."));
	}

	@Test
	void customerProfileRequiresJwt() throws Exception {
		mockMvc.perform(get("/api/customer/profile")).andExpect(status().isUnauthorized());
	}

	@Test
	void customerProfileReturnsSavedSectionForSameUser() throws Exception {
		mockMvc.perform(put("/api/customer/profile/main")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"firstName\":\"Madan\",\"lastName\":\"Chaudhary\",\"dateOfBirth\":\"1986-09-15\"}")
				.with(jwt().jwt(token -> token.subject("profile-user-1"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.firstName").value("Madan"));

		mockMvc.perform(get("/api/customer/profile")
				.with(jwt().jwt(token -> token.subject("profile-user-1"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.main.firstName").value("Madan"))
			.andExpect(jsonPath("$.main.lastName").value("Chaudhary"));
	}

	@Test
	void customerProfileRejectsMainInformationMissingRequiredFields() throws Exception {
		mockMvc.perform(put("/api/customer/profile/main")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"firstName\":\"Madan\",\"lastName\":\"Chaudhary\"}")
				.with(jwt().jwt(token -> token.subject("profile-user-2"))))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.message").value("Date of Birth is required."));
	}

	@Test
	void customerProfileRejectsUnknownSection() throws Exception {
		mockMvc.perform(put("/api/customer/profile/not-a-section")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{}")
				.with(jwt().jwt(token -> token.subject("profile-user-3"))))
			.andExpect(status().isBadRequest());
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
			.andExpect(jsonPath("$.message").value("Hello from the test admin API"))
			.andExpect(jsonPath("$.principal").value("test-admin"));
	}
}
