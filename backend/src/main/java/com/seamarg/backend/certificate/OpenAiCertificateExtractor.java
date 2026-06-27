package com.seamarg.backend.certificate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Component
class OpenAiCertificateExtractor {

	private static final URI RESPONSES_API_URI = URI.create("https://api.openai.com/v1/responses");

	private final CertificateSettings settings;
	private final ObjectMapper objectMapper;
	private final HttpClient httpClient;

	OpenAiCertificateExtractor(CertificateSettings settings, ObjectMapper objectMapper) {
		this.settings = settings;
		this.objectMapper = objectMapper;
		this.httpClient = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(20))
			.build();
	}

	boolean isConfigured() {
		return StringUtils.hasText(settings.openAiApiKey());
	}

	CertificateExtraction analyze(String originalFilename, String contentType, byte[] content) {
		if (!isConfigured()) {
			throw new IllegalStateException("OpenAI extraction is not configured.");
		}

		try {
			var request = HttpRequest.newBuilder(RESPONSES_API_URI)
				.timeout(Duration.ofSeconds(90))
				.header("Authorization", "Bearer " + settings.openAiApiKey())
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(
					buildRequestBody(originalFilename, contentType, content))))
				.build();
			var response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				log.warn("OpenAI certificate extraction failed with status={}", response.statusCode());
				throw new IllegalStateException("OpenAI extraction failed with status " + response.statusCode());
			}

			return parseExtraction(response.body()).normalized();
		} catch (IOException exception) {
			throw new IllegalStateException("OpenAI extraction request failed.", exception);
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("OpenAI extraction request was interrupted.", exception);
		}
	}

	private Map<String, Object> buildRequestBody(String originalFilename, String contentType, byte[] content) {
		var userContent = new java.util.ArrayList<Map<String, Object>>();
		userContent.add(fileInputPart(originalFilename, contentType, content));
		userContent.add(Map.of(
			"type", "input_text",
			"text", """
				Analyze this uploaded Indian merchant navy certificate or document.
				Extract the best available document name, document category, seafarer rank, expiry date, issuer,
				certificate number, confidence, and short review notes. Use null when a field is not visible.
				Known ranks: %s.
				Known document names: %s.
				Return ISO-8601 date format for expiryDate.
				""".formatted(
					String.join(", ", KnownCertificateDocuments.RANKS),
					KnownCertificateDocuments.DOCUMENT_TYPES.stream()
						.map(KnownCertificateDocuments.DocumentType::name)
						.distinct()
						.toList())));

		var body = new LinkedHashMap<String, Object>();
		body.put("model", settings.openAiModel());
		body.put("input", List.of(
			Map.of(
				"role", "system",
				"content", "You extract structured maritime certificate metadata. Do not infer official validity or approval."),
			Map.of(
				"role", "user",
				"content", userContent)));
		body.put("text", Map.of("format", responseSchema()));
		return body;
	}

	private static Map<String, Object> fileInputPart(String originalFilename, String contentType, byte[] content) {
		var safeContentType = StringUtils.hasText(contentType) ? contentType : "application/octet-stream";
		var dataUrl = "data:%s;base64,%s".formatted(
			safeContentType,
			Base64.getEncoder().encodeToString(content));

		if (safeContentType.startsWith("image/")) {
			return Map.of(
				"type", "input_image",
				"image_url", dataUrl);
		}

		return Map.of(
			"type", "input_file",
			"filename", StringUtils.hasText(originalFilename) ? originalFilename : "document",
			"file_data", dataUrl);
	}

	private static Map<String, Object> responseSchema() {
		return Map.of(
			"type", "json_schema",
			"name", "merchant_navy_certificate_extraction",
			"strict", true,
			"schema", Map.of(
				"type", "object",
				"additionalProperties", false,
				"properties", Map.of(
					"documentName", nullableString(),
					"documentCategory", nullableString(),
					"rank", nullableString(),
					"expiryDate", nullableString(),
					"issuer", nullableString(),
					"certificateNumber", nullableString(),
					"confidence", Map.of("type", "number", "minimum", 0, "maximum", 1),
					"notes", nullableString()),
				"required", List.of(
					"documentName",
					"documentCategory",
					"rank",
					"expiryDate",
					"issuer",
					"certificateNumber",
					"confidence",
					"notes")));
	}

	private static Map<String, Object> nullableString() {
		return Map.of("type", List.of("string", "null"));
	}

	private CertificateExtraction parseExtraction(String responseBody) throws JsonProcessingException {
		var root = objectMapper.readTree(responseBody);
		var outputText = findOutputText(root)
			.orElseThrow(() -> new IllegalStateException("OpenAI extraction response did not contain output text."));
		var extractionNode = objectMapper.readTree(outputText);

		return new CertificateExtraction(
			text(extractionNode, "documentName"),
			text(extractionNode, "documentCategory"),
			text(extractionNode, "rank"),
			date(extractionNode, "expiryDate"),
			text(extractionNode, "issuer"),
			text(extractionNode, "certificateNumber"),
			number(extractionNode, "confidence"),
			"openai:" + settings.openAiModel(),
			text(extractionNode, "notes"));
	}

	private static Optional<String> findOutputText(JsonNode node) {
		if (node == null || node.isNull()) {
			return Optional.empty();
		}

		if (node.isObject()
				&& node.has("type")
				&& "output_text".equals(node.get("type").asText())
				&& node.has("text")
				&& node.get("text").isTextual()) {
			return Optional.of(node.get("text").asText());
		}

		if (node.has("output_text") && node.get("output_text").isTextual()) {
			return Optional.of(node.get("output_text").asText());
		}

		for (var child : node) {
			var text = findOutputText(child);
			if (text.isPresent()) {
				return text;
			}
		}

		return Optional.empty();
	}

	private static String text(JsonNode node, String fieldName) {
		var value = node.get(fieldName);
		return value == null || value.isNull() ? null : value.asText();
	}

	private static LocalDate date(JsonNode node, String fieldName) {
		var value = text(node, fieldName);
		return value == null ? null : LocalDate.parse(value);
	}

	private static Double number(JsonNode node, String fieldName) {
		var value = node.get(fieldName);
		return value == null || value.isNull() ? null : value.asDouble();
	}
}
