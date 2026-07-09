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
	void customerMainDocumentsRequiresJwt() throws Exception {
		mockMvc.perform(get("/api/customer/certificates/main-documents")).andExpect(status().isUnauthorized());
	}

	@Test
	void customerMainDocumentsReturnsSavedChecklistForSameUser() throws Exception {
		mockMvc.perform(put("/api/customer/certificates/main-documents")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"foet\":true,\"highVoltage\":false}")
				.with(jwt().jwt(token -> token.subject("maindocs-user-1"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.foet").value(true));

		mockMvc.perform(get("/api/customer/certificates/main-documents")
				.with(jwt().jwt(token -> token.subject("maindocs-user-1"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.foet").value(true))
			.andExpect(jsonPath("$.highVoltage").value(false));
	}

	@Test
	void customerMainDocumentsDoesNotLeakAcrossUsers() throws Exception {
		mockMvc.perform(put("/api/customer/certificates/main-documents")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"tbosiet\":true}")
				.with(jwt().jwt(token -> token.subject("maindocs-user-2"))))
			.andExpect(status().isOk());

		mockMvc.perform(get("/api/customer/certificates/main-documents")
				.with(jwt().jwt(token -> token.subject("maindocs-user-3"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.tbosiet").doesNotExist());
	}

	@Test
	void customerCertificateEntriesRequireJwt() throws Exception {
		mockMvc.perform(get("/api/customer/certificates/entries")).andExpect(status().isUnauthorized());
	}

	@Test
	void customerCertificateEntrySavesAndListsByCategory() throws Exception {
		mockMvc.perform(put("/api/customer/certificates/general/stcw-basic-safety-training")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"issuedDate\":\"2024-01-10\",\"issuePlace\":\"Mumbai\","
					+ "\"issuingAuthority\":\"DG Shipping\",\"number\":\"ABC-1\"}")
				.with(jwt().jwt(token -> token.subject("cert-user-1"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.issuePlace").value("Mumbai"));

		mockMvc.perform(get("/api/customer/certificates/entries")
				.with(jwt().jwt(token -> token.subject("cert-user-1"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.general['stcw-basic-safety-training'].issuingAuthority").value("DG Shipping"));
	}

	@Test
	void customerCertificateEntryRejectsMissingRequiredFields() throws Exception {
		mockMvc.perform(put("/api/customer/certificates/general/stcw-basic-safety-training")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"issuedDate\":\"2024-01-10\",\"issuePlace\":\"Mumbai\"}")
				.with(jwt().jwt(token -> token.subject("cert-user-2"))))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.message").value("Issuing Authority is required."));
	}

	@Test
	void customerCertificateEntryRejectsPastExpiryDate() throws Exception {
		mockMvc.perform(put("/api/customer/certificates/general/stcw-basic-safety-training")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"issuedDate\":\"2010-01-10\",\"issuePlace\":\"Mumbai\","
					+ "\"issuingAuthority\":\"DG Shipping\",\"expiryDate\":\"2000-01-01\"}")
				.with(jwt().jwt(token -> token.subject("cert-user-3"))))
			.andExpect(status().isBadRequest());
	}

	@Test
	void customerCertificateEntryRejectsUnknownCategory() throws Exception {
		mockMvc.perform(put("/api/customer/certificates/not-a-category/some-type")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{}")
				.with(jwt().jwt(token -> token.subject("cert-user-4"))))
			.andExpect(status().isBadRequest());
	}

	@Test
	void customerCertificateFileUploadRequiresJwt() throws Exception {
		var file = new MockMultipartFile("file", "cert.png", "image/png", new byte[] { 1, 2, 3 });
		mockMvc.perform(multipart("/api/customer/certificates/general/stcw-basic-safety-training/file").file(file))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void customerCertificateFileUploadNeedsConfiguredStorage() throws Exception {
		var file = new MockMultipartFile("file", "cert.png", "image/png", new byte[] { 1, 2, 3 });
		mockMvc.perform(multipart("/api/customer/certificates/general/stcw-basic-safety-training/file")
				.file(file)
				.with(jwt().jwt(token -> token.subject("cert-file-1"))))
			.andExpect(status().isServiceUnavailable());
	}

	@Test
	void customerCertificateDownloadUrlWithoutFileFails() throws Exception {
		mockMvc.perform(get("/api/customer/certificates/general/stcw-basic-safety-training/download-url")
				.with(jwt().jwt(token -> token.subject("cert-file-2"))))
			.andExpect(status().isBadRequest());
	}

	@Test
	void customerSharesRequireJwt() throws Exception {
		mockMvc.perform(get("/api/customer/shares")).andExpect(status().isUnauthorized());
		mockMvc.perform(get("/api/customer/files/shareable")).andExpect(status().isUnauthorized());
	}

	@Test
	void customerCanFlagShareableCreateAndRevokeAShare() throws Exception {
		// Save a certificate entry with an attached file so the user owns something shareable.
		mockMvc.perform(put("/api/customer/certificates/general/stcw-basic-safety-training")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"issuedDate\":\"2024-01-10\",\"issuePlace\":\"Mumbai\","
					+ "\"issuingAuthority\":\"DG Shipping\",\"number\":\"ABC-1\","
					+ "\"file\":{\"bucketName\":\"b\",\"objectKey\":\"k\",\"originalFilename\":\"stcw.pdf\","
					+ "\"contentType\":\"application/pdf\",\"sizeBytes\":2048}}")
				.with(jwt().jwt(token -> token.subject("share-user-1"))))
			.andExpect(status().isOk());

		mockMvc.perform(put("/api/customer/files/visibility")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"fileId\":\"entry~general~stcw-basic-safety-training\",\"shareable\":true}")
				.with(jwt().jwt(token -> token.subject("share-user-1"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.shareable").value(true));

		var response = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
				.post("/api/customer/shares")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"allowDownload\":true,\"recipientLabel\":\"Port Agent\"}")
				.with(jwt().jwt(token -> token.subject("share-user-1"))))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.token").isNotEmpty())
			.andExpect(jsonPath("$.shareId").isNotEmpty())
			.andReturn();

		var body = response.getResponse().getContentAsString();
		var shareId = com.jayway.jsonpath.JsonPath.read(body, "$.shareId").toString();

		mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
				.post("/api/customer/shares/" + shareId + "/revoke")
				.with(jwt().jwt(token -> token.subject("share-user-1"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("REVOKED"));
	}

	@Test
	void publicRedeemIsAnonymousAndReportsGoneForAnUnknownToken() throws Exception {
		// Reaches the controller without a JWT (no 401), and an unknown token is 410 Gone.
		mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
				.post("/api/public/shares/redeem")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"totally-made-up\"}"))
			.andExpect(status().isGone());
	}

	@Test
	void publicFilesEndpointRejectsAMissingSession() throws Exception {
		mockMvc.perform(get("/api/public/shares/files")).andExpect(status().isUnauthorized());
	}

	@Test
	void publicDownloadAcceptsTheSessionInTheRequestBody() throws Exception {
		// Owner creates a share, then we redeem it anonymously to get a session token.
		var createResponse = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
				.post("/api/customer/shares")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"allowDownload\":true}")
				.with(jwt().jwt(token -> token.subject("share-dl-user"))))
			.andExpect(status().isCreated())
			.andReturn();
		var shareToken =
			com.jayway.jsonpath.JsonPath.read(createResponse.getResponse().getContentAsString(), "$.token")
				.toString();

		var redeemResponse = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
				.post("/api/public/shares/redeem")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"" + shareToken + "\"}"))
			.andExpect(status().isOk())
			.andReturn();
		var sessionToken =
			com.jayway.jsonpath.JsonPath.read(redeemResponse.getResponse().getContentAsString(), "$.sessionToken")
				.toString();

		// A valid session in the BODY (no custom header) is accepted: the request gets past auth and
		// fails only at file resolution (410), proving the body-delivered session works end to end.
		mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
				.post("/api/public/shares/files/download")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"fileId\":\"does-not-exist\",\"download\":false,\"session\":\"" + sessionToken + "\"}"))
			.andExpect(status().isGone());

		// A bogus session in the body is still rejected as unauthorized.
		mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
				.post("/api/public/shares/files/download")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"fileId\":\"does-not-exist\",\"download\":false,\"session\":\"bad-token\"}"))
			.andExpect(status().isUnauthorized());
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
