package com.seamarg.backend.share;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * DynamoDB-backed {@link ShareRepository}. Shares carry a {@code gsi1Pk =
 * SHARETOKEN#<hash>} so the recipient can be resolved by token via the existing
 * {@code gsi1} index (no new index needed), and an {@code expiresAt} epoch-seconds
 * attribute so DynamoDB TTL auto-removes them after they lapse.
 */
class DynamoDbShareRepository implements ShareRepository {

	private static final String ENTITY_TYPE = "SHARE";
	private static final String VISIBILITY_ENTITY_TYPE = "SHARE_VISIBILITY";
	private static final String SHARE_SK_PREFIX = "SHARE#";
	private static final String VISIBILITY_SK_PREFIX = "SHAREVIS#";
	private static final String TOKEN_GSI_PREFIX = "SHARETOKEN#";
	private static final String GSI_NAME = "gsi1";

	private final String tableName;
	private final DynamoDbClient dynamoDbClient;

	DynamoDbShareRepository(String tableName, DynamoDbClient dynamoDbClient) {
		this.tableName = tableName;
		this.dynamoDbClient = dynamoDbClient;
	}

	@Override
	public void save(ShareItem share) {
		var item = new HashMap<String, AttributeValue>();
		item.put("pk", AttributeValue.fromS(userPk(share.ownerSub())));
		item.put("sk", AttributeValue.fromS(shareSk(share.shareId())));
		item.put("gsi1Pk", AttributeValue.fromS(TOKEN_GSI_PREFIX + share.tokenHash()));
		item.put("gsi1Sk", AttributeValue.fromS(share.shareId()));
		item.put("entityType", AttributeValue.fromS(ENTITY_TYPE));
		item.put("shareId", AttributeValue.fromS(share.shareId()));
		item.put("userId", AttributeValue.fromS(share.ownerSub()));
		item.put("tokenHash", AttributeValue.fromS(share.tokenHash()));
		item.put("status", AttributeValue.fromS(share.status().name()));
		item.put("allowDownload", AttributeValue.fromBool(share.allowDownload()));
		if (share.recipientLabel() != null && !share.recipientLabel().isBlank()) {
			item.put("recipientLabel", AttributeValue.fromS(share.recipientLabel()));
		}
		item.put("createdAt", AttributeValue.fromS(share.createdAt().toString()));
		// TTL attribute: DynamoDB requires epoch seconds as a Number.
		item.put("expiresAt", AttributeValue.fromN(Long.toString(share.expiresAt().getEpochSecond())));
		item.put("expiresAtIso", AttributeValue.fromS(share.expiresAt().toString()));
		item.put("viewCount", AttributeValue.fromN(Long.toString(share.viewCount())));
		item.put("downloadCount", AttributeValue.fromN(Long.toString(share.downloadCount())));
		if (share.lastAccessedAt() != null) {
			item.put("lastAccessedAt", AttributeValue.fromS(share.lastAccessedAt().toString()));
		}

		dynamoDbClient.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
	}

	@Override
	public List<ShareItem> listByOwner(String ownerSub) {
		var response = dynamoDbClient.query(QueryRequest.builder()
			.tableName(tableName)
			.keyConditionExpression("pk = :pk and begins_with(sk, :sk)")
			.expressionAttributeValues(Map.of(
				":pk", AttributeValue.fromS(userPk(ownerSub)),
				":sk", AttributeValue.fromS(SHARE_SK_PREFIX)))
			.build());

		return response.items().stream().map(DynamoDbShareRepository::fromItem).toList();
	}

	@Override
	public Optional<ShareItem> findByOwnerAndId(String ownerSub, String shareId) {
		var response = dynamoDbClient.getItem(GetItemRequest.builder()
			.tableName(tableName)
			.key(Map.of(
				"pk", AttributeValue.fromS(userPk(ownerSub)),
				"sk", AttributeValue.fromS(shareSk(shareId))))
			.build());
		if (!response.hasItem() || response.item().isEmpty()) {
			return Optional.empty();
		}
		return Optional.of(fromItem(response.item()));
	}

	@Override
	public Optional<ShareItem> findByTokenHash(String tokenHash) {
		var response = dynamoDbClient.query(QueryRequest.builder()
			.tableName(tableName)
			.indexName(GSI_NAME)
			.keyConditionExpression("gsi1Pk = :pk")
			.expressionAttributeValues(Map.of(":pk", AttributeValue.fromS(TOKEN_GSI_PREFIX + tokenHash)))
			.limit(1)
			.build());
		if (response.items().isEmpty()) {
			return Optional.empty();
		}
		return Optional.of(fromItem(response.items().get(0)));
	}

	@Override
	public void markShareable(String userId, String fileId) {
		var item = new HashMap<String, AttributeValue>();
		item.put("pk", AttributeValue.fromS(userPk(userId)));
		item.put("sk", AttributeValue.fromS(VISIBILITY_SK_PREFIX + fileId));
		item.put("entityType", AttributeValue.fromS(VISIBILITY_ENTITY_TYPE));
		item.put("userId", AttributeValue.fromS(userId));
		item.put("fileId", AttributeValue.fromS(fileId));
		item.put("updatedAt", AttributeValue.fromS(Instant.now().toString()));
		dynamoDbClient.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
	}

	@Override
	public void clearShareable(String userId, String fileId) {
		dynamoDbClient.deleteItem(DeleteItemRequest.builder()
			.tableName(tableName)
			.key(Map.of(
				"pk", AttributeValue.fromS(userPk(userId)),
				"sk", AttributeValue.fromS(VISIBILITY_SK_PREFIX + fileId)))
			.build());
	}

	@Override
	public Set<String> shareableFileIds(String userId) {
		var response = dynamoDbClient.query(QueryRequest.builder()
			.tableName(tableName)
			.keyConditionExpression("pk = :pk and begins_with(sk, :sk)")
			.expressionAttributeValues(Map.of(
				":pk", AttributeValue.fromS(userPk(userId)),
				":sk", AttributeValue.fromS(VISIBILITY_SK_PREFIX)))
			.build());

		var ids = new LinkedHashSet<String>();
		for (var item : response.items()) {
			var fileId = item.get("fileId");
			if (fileId != null && fileId.s() != null) {
				ids.add(fileId.s());
			}
			else {
				var sk = item.get("sk");
				if (sk != null && sk.s() != null && sk.s().startsWith(VISIBILITY_SK_PREFIX)) {
					ids.add(sk.s().substring(VISIBILITY_SK_PREFIX.length()));
				}
			}
		}
		return ids;
	}

	private static ShareItem fromItem(Map<String, AttributeValue> item) {
		return new ShareItem(
			string(item, "shareId"),
			string(item, "userId"),
			string(item, "tokenHash"),
			ShareStatus.valueOf(string(item, "status")),
			item.containsKey("allowDownload") && Boolean.TRUE.equals(item.get("allowDownload").bool()),
			string(item, "recipientLabel"),
			instant(item, "createdAt"),
			expiresAt(item),
			longNumber(item, "viewCount"),
			longNumber(item, "downloadCount"),
			instant(item, "lastAccessedAt"));
	}

	private static Instant expiresAt(Map<String, AttributeValue> item) {
		var iso = string(item, "expiresAtIso");
		if (iso != null) {
			return Instant.parse(iso);
		}
		var epoch = item.get("expiresAt");
		return epoch == null ? null : Instant.ofEpochSecond(Long.parseLong(epoch.n()));
	}

	private static String string(Map<String, AttributeValue> item, String key) {
		var value = item.get(key);
		return value == null ? null : value.s();
	}

	private static long longNumber(Map<String, AttributeValue> item, String key) {
		var value = item.get(key);
		return value == null || value.n() == null ? 0L : Long.parseLong(value.n());
	}

	private static Instant instant(Map<String, AttributeValue> item, String key) {
		var value = string(item, key);
		return value == null ? null : Instant.parse(value);
	}

	private static String userPk(String userId) {
		return "USER#" + userId;
	}

	private static String shareSk(String shareId) {
		return SHARE_SK_PREFIX + shareId;
	}
}
