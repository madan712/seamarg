package com.seamarg.backend.certificate;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

class DynamoDbCertificateRepository implements CertificateRepository {

	private static final String ENTITY_TYPE = "CERTIFICATE";

	private final CertificateSettings settings;
	private final DynamoDbClient dynamoDbClient;

	DynamoDbCertificateRepository(CertificateSettings settings, DynamoDbClient dynamoDbClient) {
		this.settings = settings;
		this.dynamoDbClient = dynamoDbClient;
	}

	@Override
	public void save(CertificateRecord certificate) {
		dynamoDbClient.putItem(PutItemRequest.builder()
			.tableName(settings.appDataTableName())
			.item(toItem(certificate))
			.build());
	}

	@Override
	public List<CertificateRecord> findByUserId(String userId) {
		var response = dynamoDbClient.query(QueryRequest.builder()
			.tableName(settings.appDataTableName())
			.keyConditionExpression("pk = :pk and begins_with(sk, :sk)")
			.expressionAttributeValues(Map.of(
				":pk", AttributeValue.fromS(userPk(userId)),
				":sk", AttributeValue.fromS("CERTIFICATE#")))
			.build());

		return response.items()
			.stream()
			.map(this::fromItem)
			.sorted(Comparator.comparing(CertificateRecord::uploadedAt).reversed())
			.toList();
	}

	@Override
	public Optional<CertificateRecord> findByUserIdAndCertificateId(String userId, String certificateId) {
		return findByUserId(userId)
			.stream()
			.filter(certificate -> certificate.certificateId().equals(certificateId))
			.findFirst();
	}

	private Map<String, AttributeValue> toItem(CertificateRecord certificate) {
		var item = new HashMap<String, AttributeValue>();
		putString(item, "pk", userPk(certificate.userId()));
		putString(item, "sk", certificateSk(certificate.certificateId()));
		putString(item, "gsi1Pk", ENTITY_TYPE);
		putString(item, "gsi1Sk", certificate.uploadedAt() + "#" + certificate.certificateId());
		putString(item, "entityType", ENTITY_TYPE);
		putString(item, "certificateId", certificate.certificateId());
		putString(item, "userId", certificate.userId());
		putString(item, "originalFilename", certificate.originalFilename());
		putString(item, "contentType", certificate.contentType());
		putNumber(item, "sizeBytes", certificate.sizeBytes());
		putString(item, "bucketName", certificate.bucketName());
		putString(item, "objectKey", certificate.objectKey());
		putInstant(item, "uploadedAt", certificate.uploadedAt());
		putInstant(item, "updatedAt", certificate.updatedAt());
		putString(item, "processingStatus", certificate.processingStatus());
		putString(item, "documentName", certificate.documentName());
		putString(item, "documentCategory", certificate.documentCategory());
		putString(item, "rank", certificate.rank());
		putLocalDate(item, "expiryDate", certificate.expiryDate());
		putString(item, "issuer", certificate.issuer());
		putString(item, "certificateNumber", certificate.certificateNumber());
		putDouble(item, "confidence", certificate.confidence());
		putString(item, "extractionSource", certificate.extractionSource());
		putString(item, "extractionNotes", certificate.extractionNotes());
		return item;
	}

	private CertificateRecord fromItem(Map<String, AttributeValue> item) {
		return new CertificateRecord(
			string(item, "certificateId"),
			string(item, "userId"),
			string(item, "originalFilename"),
			string(item, "contentType"),
			longNumber(item, "sizeBytes"),
			string(item, "bucketName"),
			string(item, "objectKey"),
			instant(item, "uploadedAt"),
			instant(item, "updatedAt"),
			string(item, "processingStatus"),
			string(item, "documentName"),
			string(item, "documentCategory"),
			string(item, "rank"),
			localDate(item, "expiryDate"),
			string(item, "issuer"),
			string(item, "certificateNumber"),
			doubleNumber(item, "confidence"),
			string(item, "extractionSource"),
			string(item, "extractionNotes"));
	}

	private static void putString(Map<String, AttributeValue> item, String key, String value) {
		if (value != null && !value.isBlank()) {
			item.put(key, AttributeValue.fromS(value));
		}
	}

	private static void putNumber(Map<String, AttributeValue> item, String key, long value) {
		item.put(key, AttributeValue.fromN(Long.toString(value)));
	}

	private static void putDouble(Map<String, AttributeValue> item, String key, Double value) {
		if (value != null) {
			item.put(key, AttributeValue.fromN(Double.toString(value)));
		}
	}

	private static void putInstant(Map<String, AttributeValue> item, String key, Instant value) {
		if (value != null) {
			item.put(key, AttributeValue.fromS(value.toString()));
		}
	}

	private static void putLocalDate(Map<String, AttributeValue> item, String key, LocalDate value) {
		if (value != null) {
			item.put(key, AttributeValue.fromS(value.toString()));
		}
	}

	private static String string(Map<String, AttributeValue> item, String key) {
		var value = item.get(key);
		return value == null ? null : value.s();
	}

	private static long longNumber(Map<String, AttributeValue> item, String key) {
		var value = item.get(key);
		return value == null ? 0L : Long.parseLong(value.n());
	}

	private static Double doubleNumber(Map<String, AttributeValue> item, String key) {
		var value = item.get(key);
		return value == null ? null : Double.parseDouble(value.n());
	}

	private static Instant instant(Map<String, AttributeValue> item, String key) {
		var value = string(item, key);
		return value == null ? null : Instant.parse(value);
	}

	private static LocalDate localDate(Map<String, AttributeValue> item, String key) {
		var value = string(item, key);
		return value == null ? null : LocalDate.parse(value);
	}

	private static String userPk(String userId) {
		return "USER#" + userId;
	}

	private static String certificateSk(String certificateId) {
		return "CERTIFICATE#" + certificateId;
	}
}
