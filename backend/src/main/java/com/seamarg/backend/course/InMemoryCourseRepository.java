package com.seamarg.backend.course;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory {@link CourseRepository} used when no DynamoDB table is configured
 * (local development), mirroring the certificate/profile fallbacks. Seat
 * adjustments are guarded by {@code synchronized} so the capacity check stays
 * correct without a real transaction.
 */
class InMemoryCourseRepository implements CourseRepository {

	private final Map<String, CourseItem> store = new ConcurrentHashMap<>();

	@Override
	public void put(CourseItem item) {
		store.put(key(item.pk(), item.sk()), stamp(item));
	}

	@Override
	public Optional<CourseItem> get(String pk, String sk) {
		return Optional.ofNullable(store.get(key(pk, sk)));
	}

	@Override
	public List<CourseItem> queryPartition(String pk) {
		var results = new ArrayList<CourseItem>();
		for (var item : store.values()) {
			if (item.pk().equals(pk)) {
				results.add(item);
			}
		}
		return results;
	}

	@Override
	public List<CourseItem> queryPartitionPrefix(String pk, String skPrefix) {
		var results = new ArrayList<CourseItem>();
		for (var item : store.values()) {
			if (item.pk().equals(pk) && item.sk().startsWith(skPrefix)) {
				results.add(item);
			}
		}
		return results;
	}

	@Override
	public List<CourseItem> queryIndex(String gsi1Pk) {
		var results = new ArrayList<CourseItem>();
		for (var item : store.values()) {
			if (gsi1Pk.equals(item.gsi1Pk())) {
				results.add(item);
			}
		}
		return results;
	}

	@Override
	public List<CourseItem> scanByEntityType(String entityType) {
		var results = new ArrayList<CourseItem>();
		for (var item : store.values()) {
			if (entityType.equals(item.entityType())) {
				results.add(item);
			}
		}
		return results;
	}

	@Override
	public void delete(String pk, String sk) {
		store.remove(key(pk, sk));
	}

	@Override
	public synchronized boolean putIfAbsent(CourseItem item) {
		var mapKey = key(item.pk(), item.sk());
		if (store.containsKey(mapKey)) {
			return false;
		}
		store.put(mapKey, stamp(item));
		return true;
	}

	@Override
	public synchronized boolean confirmEnrollmentAndReserveSeat(String batchPk, String batchSk,
			String enrollmentPk, String enrollmentSk, String enrollmentPayloadJson) {
		var batch = store.get(key(batchPk, batchSk));
		if (batch == null) {
			return false;
		}
		var confirmed = batch.number("confirmedSeats", 0);
		var total = batch.number("totalSeats", 0);
		if (confirmed >= total) {
			return false;
		}
		var numbers = new LinkedHashMap<>(batch.numbers());
		numbers.put("confirmedSeats", confirmed + 1);
		store.put(key(batchPk, batchSk), stamp(CourseItem.builder(batch.pk(), batch.sk())
			.index(batch.gsi1Pk(), batch.gsi1Sk())
			.entityType(batch.entityType())
			.payload(batch.payloadJson())
			.numbers(numbers)
			.build()));
		updateEnrollmentPayload(enrollmentPk, enrollmentSk, enrollmentPayloadJson);
		return true;
	}

	@Override
	public synchronized void updateEnrollmentAndReleaseSeat(String batchPk, String batchSk,
			String enrollmentPk, String enrollmentSk, String enrollmentPayloadJson, boolean releaseSeat) {
		if (releaseSeat) {
			var batch = store.get(key(batchPk, batchSk));
			if (batch != null) {
				var confirmed = batch.number("confirmedSeats", 0);
				if (confirmed > 0) {
					var numbers = new LinkedHashMap<>(batch.numbers());
					numbers.put("confirmedSeats", confirmed - 1);
					store.put(key(batchPk, batchSk), stamp(CourseItem.builder(batch.pk(), batch.sk())
						.index(batch.gsi1Pk(), batch.gsi1Sk())
						.entityType(batch.entityType())
						.payload(batch.payloadJson())
						.numbers(numbers)
						.build()));
				}
			}
		}
		updateEnrollmentPayload(enrollmentPk, enrollmentSk, enrollmentPayloadJson);
	}

	private void updateEnrollmentPayload(String pk, String sk, String payloadJson) {
		var existing = store.get(key(pk, sk));
		if (existing == null) {
			return;
		}
		store.put(key(pk, sk), stamp(CourseItem.builder(existing.pk(), existing.sk())
			.index(existing.gsi1Pk(), existing.gsi1Sk())
			.entityType(existing.entityType())
			.payload(payloadJson)
			.numbers(existing.numbers())
			.build()));
	}

	private static CourseItem stamp(CourseItem item) {
		return CourseItem.builder(item.pk(), item.sk())
			.index(item.gsi1Pk(), item.gsi1Sk())
			.entityType(item.entityType())
			.payload(item.payloadJson())
			.numbers(item.numbers())
			.updatedAt(Instant.now())
			.build();
	}

	private static String key(String pk, String sk) {
		return pk + "|" + sk;
	}
}
