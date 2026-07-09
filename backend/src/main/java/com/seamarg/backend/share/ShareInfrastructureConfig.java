package com.seamarg.backend.share;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

import java.time.Duration;

/**
 * Wires the document-sharing feature. Mirrors the certificate module's fallback
 * pattern: when no app-data table is configured (local dev) an in-memory
 * repository is used, so the feature runs without AWS. The {@link DynamoDbClient}
 * bean is shared with the certificate module.
 */
@Configuration
class ShareInfrastructureConfig {

	@Bean
	ShareSettings shareSettings(
			@Value("${seamarg.app-data.table-name:}") String appDataTableName,
			@Value("${seamarg.share.link-ttl-seconds:1800}") long linkTtlSeconds,
			@Value("${seamarg.share.session-ttl-seconds:900}") long sessionTtlSeconds,
			@Value("${seamarg.share.hmac-secret:}") String hmacSecret) {
		return new ShareSettings(
			appDataTableName,
			Duration.ofSeconds(linkTtlSeconds),
			Duration.ofSeconds(sessionTtlSeconds),
			hmacSecret);
	}

	@Bean
	ShareRepository shareRepository(ShareSettings settings, DynamoDbClient dynamoDbClient) {
		if (!StringUtils.hasText(settings.appDataTableName())) {
			return new InMemoryShareRepository();
		}
		return new DynamoDbShareRepository(settings.appDataTableName(), dynamoDbClient);
	}
}
