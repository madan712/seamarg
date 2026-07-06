package com.seamarg.backend.profile;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Stores each profile section as a single item in the shared single-table
 * design: {@code pk = USER#<sub>}, {@code sk = PROFILE#<SECTION>}.
 */
class DynamoDbProfileRepository implements ProfileRepository {

	private static final String ENTITY_TYPE = "PROFILE";

	private final ProfileSettings settings;
	private final DynamoDbClient dynamoDbClient;

	DynamoDbProfileRepository(ProfileSettings settings, DynamoDbClient dynamoDbClient) {
		this.settings = settings;
		this.dynamoDbClient = dynamoDbClient;
	}

	@Override
	public List<ProfileSectionRecord> findByUserId(String userId) {
		var response = dynamoDbClient.query(QueryRequest.builder()
			.tableName(settings.appDataTableName())
			.keyConditionExpression("pk = :pk and begins_with(sk, :sk)")
			.expressionAttributeValues(Map.of(
				":pk", AttributeValue.fromS(userPk(userId)),
				":sk", AttributeValue.fromS(ProfileSection.sortKeyPrefix())))
			.build());

		var records = new ArrayList<ProfileSectionRecord>();
		for (var item : response.items()) {
			ProfileSection.fromSortKey(string(item, "sk"))
				.ifPresent(section -> records.add(new ProfileSectionRecord(
					userId,
					section,
					string(item, "payload"),
					instant(item, "updatedAt"))));
		}
		return records;
	}

	@Override
	public List<ProfileSectionRecord> findAll() {
		var records = new ArrayList<ProfileSectionRecord>();
		Map<String, AttributeValue> lastKey = null;

		do {
			var request = ScanRequest.builder()
				.tableName(settings.appDataTableName())
				.filterExpression("entityType = :entityType")
				.expressionAttributeValues(Map.of(":entityType", AttributeValue.fromS(ENTITY_TYPE)))
				.exclusiveStartKey(lastKey == null || lastKey.isEmpty() ? null : lastKey)
				.build();
			var response = dynamoDbClient.scan(request);

			for (var item : response.items()) {
				ProfileSection.fromSortKey(string(item, "sk"))
					.ifPresent(section -> records.add(new ProfileSectionRecord(
						string(item, "userId"),
						section,
						string(item, "payload"),
						instant(item, "updatedAt"))));
			}

			lastKey = response.lastEvaluatedKey();
		} while (lastKey != null && !lastKey.isEmpty());

		return records;
	}

	@Override
	public ProfileSectionRecord save(ProfileSectionRecord record) {
		var item = new HashMap<String, AttributeValue>();
		putString(item, "pk", userPk(record.userId()));
		putString(item, "sk", record.section().sortKey());
		putString(item, "entityType", ENTITY_TYPE);
		putString(item, "userId", record.userId());
		putString(item, "section", record.section().slug());
		putString(item, "payload", record.payloadJson());
		if (record.updatedAt() != null) {
			putString(item, "updatedAt", record.updatedAt().toString());
		}

		dynamoDbClient.putItem(PutItemRequest.builder()
			.tableName(settings.appDataTableName())
			.item(item)
			.build());
		return record;
	}

	private static void putString(Map<String, AttributeValue> item, String key, String value) {
		if (value != null && !value.isBlank()) {
			item.put(key, AttributeValue.fromS(value));
		}
	}

	private static String string(Map<String, AttributeValue> item, String key) {
		var value = item.get(key);
		return value == null ? null : value.s();
	}

	private static Instant instant(Map<String, AttributeValue> item, String key) {
		var value = string(item, key);
		return value == null ? null : Instant.parse(value);
	}

	private static String userPk(String userId) {
		return "USER#" + userId;
	}
}
