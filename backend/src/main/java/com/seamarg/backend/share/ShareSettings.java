package com.seamarg.backend.share;

import java.time.Duration;

/**
 * Configuration for the document-sharing feature.
 *
 * @param appDataTableName the shared single-table name (empty → in-memory fallback)
 * @param linkTtl          how long a generated share link stays redeemable (design D5, default 30m)
 * @param sessionTtl       how long a redeemed share-session token stays valid
 * @param hmacSecret       secret used to sign share-session tokens (blank → random per-boot)
 */
record ShareSettings(String appDataTableName, Duration linkTtl, Duration sessionTtl, String hmacSecret) {
}
