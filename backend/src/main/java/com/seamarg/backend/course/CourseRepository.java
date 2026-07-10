package com.seamarg.backend.course;

import java.util.List;
import java.util.Optional;

/**
 * Single-table access for the Courses domain (docs/courses-design.md §2–§3).
 * All hot-path reads are single-partition queries on the base table or the
 * {@code gsi1} index; there are no full-table scans here.
 */
interface CourseRepository {

	void put(CourseItem item);

	Optional<CourseItem> get(String pk, String sk);

	/** All items in a base-table partition. */
	List<CourseItem> queryPartition(String pk);

	/** Items in a base-table partition whose sort key begins with the prefix. */
	List<CourseItem> queryPartitionPrefix(String pk, String skPrefix);

	/** All items in a {@code gsi1} partition (small partitions; caller filters/sorts). */
	List<CourseItem> queryIndex(String gsi1Pk);

	/**
	 * Every item of a given {@code entityType} across the table (a scan). Only
	 * used off the hot path — e.g. the admin "all enrollment requests" queue,
	 * where there is no single partition holding every enrollment.
	 */
	List<CourseItem> scanByEntityType(String entityType);

	void delete(String pk, String sk);

	/**
	 * Conditional create used as the enrollment duplicate guard: writes the item
	 * only if no row already exists at its (pk, sk). Returns {@code false} when a
	 * row is already present.
	 */
	boolean putIfAbsent(CourseItem item);

	/**
	 * Atomically confirm an enrollment and consume one batch seat
	 * ({@code confirmedSeats + 1}) only while {@code confirmedSeats < totalSeats}.
	 * Returns {@code false} (no writes applied) when the batch is full.
	 */
	boolean confirmEnrollmentAndReserveSeat(String batchPk, String batchSk,
			String enrollmentPk, String enrollmentSk, String enrollmentPayloadJson);

	/**
	 * Update an enrollment payload and, when {@code releaseSeat} is true, free one
	 * batch seat ({@code confirmedSeats - 1}, floored at zero). Used for reject and
	 * cancellation.
	 */
	void updateEnrollmentAndReleaseSeat(String batchPk, String batchSk,
			String enrollmentPk, String enrollmentSk, String enrollmentPayloadJson, boolean releaseSeat);
}
