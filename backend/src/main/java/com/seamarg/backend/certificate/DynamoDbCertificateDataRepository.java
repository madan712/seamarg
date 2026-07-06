package com.seamarg.backend.certificate;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * DynamoDB-backed {@link CertificateDataRepository}. Stores one item per
 * (user, sort key) with the JSON payload under the {@code payload} attribute:
 * {@code pk = USER#<sub>}, {@code sk = <sortKey>}.
 */
class DynamoDbCertificateDataRepository implements CertificateDataRepository {

	private static final String ENTITY_TYPE = "CERTIFICATE";

	private final CertificateSettings settings;
	private final DynamoDbClient dynamoDbClient;

	DynamoDbCertificateDataRepository(CertificateSettings settings, DynamoDbClient dynamoDbClient) {
		this.settings = settings;
		this.dynamoDbClient = dynamoDbClient;
	}

	@Override
	public Optional<String> findPayload(String userId, String sortKey) {
		var response = dynamoDbClient.getItem(GetItemRequest.builder()
			.tableName(settings.appDataTableName())
			.key(Map.of(
				"pk", AttributeValue.fromS(userPk(userId)),
				"sk", AttributeValue.fromS(sortKey)))
			.build());

		if (!response.hasItem() || response.item().isEmpty()) {
			return Optional.empty();
		}

		var payload = response.item().get("payload");
		return payload == null ? Optional.empty() : Optional.ofNullable(payload.s());
	}

	@Override
	public void savePayload(String userId, String sortKey, String payloadJson) {
		var item = new HashMap<String, AttributeValue>();
		item.put("pk", AttributeValue.fromS(userPk(userId)));
		item.put("sk", AttributeValue.fromS(sortKey));
		item.put("entityType", AttributeValue.fromS(ENTITY_TYPE));
		item.put("userId", AttributeValue.fromS(userId));
		if (payloadJson != null && !payloadJson.isBlank()) {
			item.put("payload", AttributeValue.fromS(payloadJson));
		}
		item.put("updatedAt", AttributeValue.fromS(Instant.now().toString()));

		dynamoDbClient.putItem(PutItemRequest.builder()
			.tableName(settings.appDataTableName())
			.item(item)
			.build());
	}

	@Override
	public List<StoredCertificateData> findByUserIdAndPrefix(String userId, String sortKeyPrefix) {
		var response = dynamoDbClient.query(QueryRequest.builder()
			.tableName(settings.appDataTableName())
			.keyConditionExpression("pk = :pk and begins_with(sk, :sk)")
			.expressionAttributeValues(Map.of(
				":pk", AttributeValue.fromS(userPk(userId)),
				":sk", AttributeValue.fromS(sortKeyPrefix)))
			.build());

		var results = new ArrayList<StoredCertificateData>();
		for (var item : response.items()) {
			var sk = item.get("sk");
			var payload = item.get("payload");
			if (sk != null) {
				results.add(new StoredCertificateData(sk.s(), payload == null ? null : payload.s()));
			}
		}
		return results;
	}

	@Override
	public List<UserScopedData> findAllByPrefix(String sortKeyPrefix) {
		var results = new ArrayList<UserScopedData>();
		Map<String, AttributeValue> lastKey = null;

		do {
			var request = ScanRequest.builder()
				.tableName(settings.appDataTableName())
				.filterExpression("begins_with(sk, :sk)")
				.expressionAttributeValues(Map.of(":sk", AttributeValue.fromS(sortKeyPrefix)))
				.exclusiveStartKey(lastKey == null || lastKey.isEmpty() ? null : lastKey)
				.build();
			var response = dynamoDbClient.scan(request);

			for (var item : response.items()) {
				var sk = item.get("sk");
				if (sk == null) {
					continue;
				}
				var userId = item.get("userId");
				var payload = item.get("payload");
				var updatedAt = item.get("updatedAt");
				results.add(new UserScopedData(
					userId == null ? null : userId.s(),
					sk.s(),
					payload == null ? null : payload.s(),
					updatedAt == null ? null : Instant.parse(updatedAt.s())));
			}

			lastKey = response.lastEvaluatedKey();
		} while (lastKey != null && !lastKey.isEmpty());

		return results;
	}

	private static String userPk(String userId) {
		return "USER#" + userId;
	}
}
