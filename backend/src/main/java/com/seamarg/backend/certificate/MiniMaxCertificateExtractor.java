package com.seamarg.backend.certificate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reads certificate metadata from an uploaded scan using MiniMax's
 * OpenAI-compatible Chat Completions API with a vision-capable model. Returns
 * suggestions only (the user reviews before saving). Never throws: any failure
 * yields an empty extraction so the upload itself still succeeds.
 */
@Slf4j
@Component
class MiniMaxCertificateExtractor {

	private final CertificateSettings settings;
	private final ObjectMapper objectMapper;
	private final HttpClient httpClient;

	MiniMaxCertificateExtractor(CertificateSettings settings, ObjectMapper objectMapper) {
		this.settings = settings;
		this.objectMapper = objectMapper;
		this.httpClient = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(20))
			.build();
	}

	boolean isConfigured() {
		return StringUtils.hasText(settings.minimaxApiKey()) && StringUtils.hasText(settings.minimaxBaseUrl());
	}

	CertificateEntryExtraction analyze(String originalFilename, String contentType, byte[] content) {
		if (!isConfigured()) {
			return CertificateEntryExtraction.empty("minimax-unconfigured",
				"AI extraction is not configured; enter the details manually.");
		}

		var safeContentType = StringUtils.hasText(contentType) ? contentType : "application/octet-stream";
		if (!safeContentType.startsWith("image/")) {
			// The vision model expects an image; PDFs/other types are not sent for now.
			return CertificateEntryExtraction.empty("minimax-skipped",
				"AI reading currently supports image scans; enter the details manually for this file type.");
		}

		try {
			var request = HttpRequest.newBuilder(URI.create(chatCompletionsUrl()))
				.timeout(Duration.ofSeconds(90))
				.header("Authorization", "Bearer " + settings.minimaxApiKey())
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(
					objectMapper.writeValueAsString(buildRequestBody(safeContentType, content))))
				.build();
			var response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				log.warn("MiniMax certificate extraction failed: status={} model={} url={} body={}",
					response.statusCode(), settings.minimaxModel(), chatCompletionsUrl(), truncate(response.body()));
				return CertificateEntryExtraction.empty("minimax-error",
					"AI reading was unavailable; enter the details manually.");
			}

			return parse(response.body());
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			return CertificateEntryExtraction.empty("minimax-error", "AI reading was interrupted; enter details manually.");
		} catch (RuntimeException | java.io.IOException exception) {
			log.warn("MiniMax certificate extraction request failed for file={}", originalFilename, exception);
			return CertificateEntryExtraction.empty("minimax-error",
				"AI reading was unavailable; enter the details manually.");
		}
	}

	private String chatCompletionsUrl() {
		var base = settings.minimaxBaseUrl();
		var trimmed = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
		return trimmed + "/chat/completions";
	}

	private Map<String, Object> buildRequestBody(String contentType, byte[] content) {
		var dataUrl = "data:%s;base64,%s".formatted(contentType, Base64.getEncoder().encodeToString(content));

		var userContent = List.of(
			Map.of("type", "text", "text", """
				Read this maritime certificate scan and extract these fields as JSON:
				number (certificate number, or null), issuedDate (YYYY-MM-DD or null),
				expiryDate (YYYY-MM-DD or null), issuePlace (or null), issuingAuthority (or null),
				confidence (0..1), notes (short review note).
				Respond with ONLY a JSON object and nothing else. Use null for fields you cannot read.
				"""),
			Map.of("type", "image_url", "image_url", Map.of("url", dataUrl)));

		var body = new LinkedHashMap<String, Object>();
		body.put("model", settings.minimaxModel());
		body.put("messages", List.of(
			Map.of("role", "system", "content",
				"You extract structured maritime certificate metadata. Do not infer official validity or approval."),
			Map.of("role", "user", "content", userContent)));
		body.put("response_format", Map.of("type", "json_object"));
		return body;
	}

	private CertificateEntryExtraction parse(String responseBody) {
		try {
			var root = objectMapper.readTree(responseBody);
			var contentNode = root.path("choices").path(0).path("message").path("content");
			if (contentNode.isMissingNode() || !contentNode.isTextual()) {
				log.warn("MiniMax extraction had no usable content: body={}", truncate(responseBody));
				return CertificateEntryExtraction.empty("minimax-error", "AI reading returned no usable content.");
			}
			var extraction = objectMapper.readTree(contentNode.asText());

			return new CertificateEntryExtraction(
				text(extraction, "number"),
				text(extraction, "issuedDate"),
				text(extraction, "expiryDate"),
				text(extraction, "issuePlace"),
				text(extraction, "issuingAuthority"),
				clampConfidence(extraction.path("confidence").asDouble(0.0)),
				"minimax:" + settings.minimaxModel(),
				text(extraction, "notes"));
		} catch (RuntimeException | com.fasterxml.jackson.core.JsonProcessingException exception) {
			log.warn("Could not parse MiniMax extraction response", exception);
			return CertificateEntryExtraction.empty("minimax-error", "AI reading returned an unreadable response.");
		}
	}

	private static double clampConfidence(double value) {
		return Math.max(0.0, Math.min(1.0, value));
	}

	private static String truncate(String value) {
		if (value == null) {
			return "";
		}
		return value.length() <= 500 ? value : value.substring(0, 500) + "…";
	}

	private static String text(JsonNode node, String field) {
		var value = node.get(field);
		if (value == null || value.isNull()) {
			return null;
		}
		var text = value.asText();
		return StringUtils.hasText(text) ? text.trim() : null;
	}
}
