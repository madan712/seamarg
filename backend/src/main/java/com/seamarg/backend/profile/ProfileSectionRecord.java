package com.seamarg.backend.profile;

import java.time.Instant;

/**
 * One stored profile section. {@code payloadJson} holds the section's field
 * values as JSON so heterogeneous sections (booleans, arrays, etc.) can be
 * stored uniformly without a fixed column per field.
 */
record ProfileSectionRecord(String userId, ProfileSection section, String payloadJson, Instant updatedAt) {
}
