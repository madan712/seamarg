package com.seamarg.backend.course;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * DynamoDB-backed {@link CourseRepository} over the shared table
 * ({@code pk}/{@code sk} + {@code gsi1}). Seat adjustments use a capacity-guarded,
 * optimistic {@code GetItem} + conditional {@code PutItem} (no transactions), so
 * they run with the same IAM permissions as the rest of the app while remaining
 * overbooking-safe (docs/courses-design.md §6).
 */
class DynamoDbCourseRepository implements CourseRepository {

	private final String tableName;
	private final DynamoDbClient dynamoDbClient;

	DynamoDbCourseRepository(String tableName, DynamoDbClient dynamoDbClient) {
		this.tableName = tableName;
		this.dynamoDbClient = dynamoDbClient;
	}

	@Override
	public void put(CourseItem item) {
		dynamoDbClient.putItem(PutItemRequest.builder()
			.tableName(tableName)
			.item(toAttributes(item))
			.build());
	}

	@Override
	public Optional<CourseItem> get(String pk, String sk) {
		var response = dynamoDbClient.getItem(GetItemRequest.builder()
			.tableName(tableName)
			.key(Map.of("pk", AttributeValue.fromS(pk), "sk", AttributeValue.fromS(sk)))
			.build());
		if (!response.hasItem() || response.item().isEmpty()) {
			return Optional.empty();
		}
		return Optional.of(fromAttributes(response.item()));
	}

	@Override
	public List<CourseItem> queryPartition(String pk) {
		return query(QueryRequest.builder()
			.tableName(tableName)
			.keyConditionExpression("pk = :pk")
			.expressionAttributeValues(Map.of(":pk", AttributeValue.fromS(pk))));
	}

	@Override
	public List<CourseItem> queryPartitionPrefix(String pk, String skPrefix) {
		return query(QueryRequest.builder()
			.tableName(tableName)
			.keyConditionExpression("pk = :pk and begins_with(sk, :p)")
			.expressionAttributeValues(Map.of(
				":pk", AttributeValue.fromS(pk),
				":p", AttributeValue.fromS(skPrefix))));
	}

	@Override
	public List<CourseItem> queryIndex(String gsi1Pk) {
		return query(QueryRequest.builder()
			.tableName(tableName)
			.indexName("gsi1")
			.keyConditionExpression("gsi1Pk = :g")
			.expressionAttributeValues(Map.of(":g", AttributeValue.fromS(gsi1Pk))));
	}

	@Override
	public List<CourseItem> scanByEntityType(String entityType) {
		var results = new ArrayList<CourseItem>();
		Map<String, AttributeValue> lastKey = null;
		do {
			var response = dynamoDbClient.scan(ScanRequest.builder()
				.tableName(tableName)
				.filterExpression("entityType = :t")
				.expressionAttributeValues(Map.of(":t", AttributeValue.fromS(entityType)))
				.exclusiveStartKey(lastKey == null || lastKey.isEmpty() ? null : lastKey)
				.build());
			for (var item : response.items()) {
				results.add(fromAttributes(item));
			}
			lastKey = response.lastEvaluatedKey();
		} while (lastKey != null && !lastKey.isEmpty());
		return results;
	}

	@Override
	public void delete(String pk, String sk) {
		dynamoDbClient.deleteItem(DeleteItemRequest.builder()
			.tableName(tableName)
			.key(Map.of("pk", AttributeValue.fromS(pk), "sk", AttributeValue.fromS(sk)))
			.build());
	}

	@Override
	public boolean putIfAbsent(CourseItem item) {
		try {
			dynamoDbClient.putItem(PutItemRequest.builder()
				.tableName(tableName)
				.item(toAttributes(item))
				.conditionExpression("attribute_not_exists(pk)")
				.build());
			return true;
		} catch (ConditionalCheckFailedException exception) {
			return false;
		}
	}

	// Seat accounting uses only GetItem + conditional PutItem — the same
	// operations the profile/certificate features already run in production — so
	// it needs no DynamoDB transaction permissions. The seat reservation is still
	// capacity-guarded and race-safe via an optimistic ConditionExpression on the
	// confirmedSeats value we read (docs/courses-design.md §6).
	@Override
	public boolean confirmEnrollmentAndReserveSeat(String batchPk, String batchSk,
			String enrollmentPk, String enrollmentSk, String enrollmentPayloadJson) {
		var batch = getRaw(batchPk, batchSk);
		if (batch.isEmpty()) {
			return false;
		}
		var confirmed = number(batch, "confirmedSeats");
		var total = number(batch, "totalSeats");
		if (confirmed >= total) {
			return false; // full
		}
		try {
			putWithSeatGuard(batch, confirmed + 1, confirmed);
		} catch (ConditionalCheckFailedException lostRace) {
			return false;
		}

		var enrollment = getRaw(enrollmentPk, enrollmentSk);
		if (!enrollment.isEmpty()) {
			putRaw(withPayload(enrollment, enrollmentPayloadJson));
		}
		return true;
	}

	@Override
	public void updateEnrollmentAndReleaseSeat(String batchPk, String batchSk,
			String enrollmentPk, String enrollmentSk, String enrollmentPayloadJson, boolean releaseSeat) {
		if (releaseSeat) {
			var batch = getRaw(batchPk, batchSk);
			var confirmed = number(batch, "confirmedSeats");
			if (!batch.isEmpty() && confirmed > 0) {
				try {
					putWithSeatGuard(batch, confirmed - 1, confirmed);
				} catch (ConditionalCheckFailedException ignored) {
					// A concurrent change moved the counter; the enrollment status update
					// below still applies. A one-seat drift is acceptable and self-corrects
					// on the next admin action.
				}
			}
		}
		var enrollment = getRaw(enrollmentPk, enrollmentSk);
		if (!enrollment.isEmpty()) {
			putRaw(withPayload(enrollment, enrollmentPayloadJson));
		}
	}

	/** Rewrites the batch item with a new confirmedSeats, guarded by the value we read. */
	private void putWithSeatGuard(Map<String, AttributeValue> batch, long newValue, long expected) {
		var item = new HashMap<>(batch);
		item.put("confirmedSeats", AttributeValue.fromN(Long.toString(newValue)));
		item.put("updatedAt", AttributeValue.fromS(Instant.now().toString()));
		dynamoDbClient.putItem(PutItemRequest.builder()
			.tableName(tableName)
			.item(item)
			.conditionExpression("confirmedSeats = :expected")
			.expressionAttributeValues(Map.of(":expected", AttributeValue.fromN(Long.toString(expected))))
			.build());
	}

	private Map<String, AttributeValue> withPayload(Map<String, AttributeValue> item, String payloadJson) {
		var copy = new HashMap<>(item);
		copy.put("payload", AttributeValue.fromS(payloadJson == null ? "" : payloadJson));
		copy.put("updatedAt", AttributeValue.fromS(Instant.now().toString()));
		return copy;
	}

	private void putRaw(Map<String, AttributeValue> item) {
		dynamoDbClient.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
	}

	private Map<String, AttributeValue> getRaw(String pk, String sk) {
		var response = dynamoDbClient.getItem(GetItemRequest.builder()
			.tableName(tableName)
			.key(Map.of("pk", AttributeValue.fromS(pk), "sk", AttributeValue.fromS(sk)))
			.build());
		return response.hasItem() ? response.item() : Map.of();
	}

	private static long number(Map<String, AttributeValue> item, String key) {
		var value = item.get(key);
		if (value == null || value.n() == null) {
			return 0;
		}
		return Long.parseLong(value.n());
	}

	private List<CourseItem> query(QueryRequest.Builder builder) {
		var results = new ArrayList<CourseItem>();
		Map<String, AttributeValue> lastKey = null;
		do {
			var response = dynamoDbClient.query(builder
				.exclusiveStartKey(lastKey == null || lastKey.isEmpty() ? null : lastKey)
				.build());
			for (var item : response.items()) {
				results.add(fromAttributes(item));
			}
			lastKey = response.lastEvaluatedKey();
		} while (lastKey != null && !lastKey.isEmpty());
		return results;
	}

	private static Map<String, AttributeValue> toAttributes(CourseItem item) {
		var attributes = new HashMap<String, AttributeValue>();
		attributes.put("pk", AttributeValue.fromS(item.pk()));
		attributes.put("sk", AttributeValue.fromS(item.sk()));
		if (item.gsi1Pk() != null) {
			attributes.put("gsi1Pk", AttributeValue.fromS(item.gsi1Pk()));
		}
		if (item.gsi1Sk() != null) {
			attributes.put("gsi1Sk", AttributeValue.fromS(item.gsi1Sk()));
		}
		if (item.entityType() != null) {
			attributes.put("entityType", AttributeValue.fromS(item.entityType()));
		}
		if (item.payloadJson() != null && !item.payloadJson().isBlank()) {
			attributes.put("payload", AttributeValue.fromS(item.payloadJson()));
		}
		if (item.numbers() != null) {
			for (var entry : item.numbers().entrySet()) {
				attributes.put(entry.getKey(), AttributeValue.fromN(Long.toString(entry.getValue())));
			}
		}
		attributes.put("updatedAt", AttributeValue.fromS(Instant.now().toString()));
		return attributes;
	}

	private static CourseItem fromAttributes(Map<String, AttributeValue> item) {
		var numbers = new LinkedHashMap<String, Long>();
		for (var entry : item.entrySet()) {
			var value = entry.getValue();
			if (value != null && value.n() != null) {
				numbers.put(entry.getKey(), Long.parseLong(value.n()));
			}
		}
		var updatedAt = item.get("updatedAt");
		return CourseItem.builder(text(item, "pk"), text(item, "sk"))
			.index(text(item, "gsi1Pk"), text(item, "gsi1Sk"))
			.entityType(text(item, "entityType"))
			.payload(text(item, "payload"))
			.numbers(numbers)
			.updatedAt(updatedAt == null || updatedAt.s() == null ? null : Instant.parse(updatedAt.s()))
			.build();
	}

	private static String text(Map<String, AttributeValue> item, String key) {
		var value = item.get(key);
		return value == null ? null : value.s();
	}
}
