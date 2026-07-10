package com.seamarg.backend.course;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

/**
 * Wires the {@link CourseRepository}: DynamoDB when {@code SEAMARG_APP_DATA_TABLE}
 * is set, otherwise the in-memory fallback (local development). Reuses the
 * {@code DynamoDbClient} and {@code ObjectMapper} beans already published by the
 * certificate module in the same context.
 */
@Configuration
class CourseInfrastructureConfig {

	@Bean
	CourseRepository courseRepository(
			@Value("${seamarg.app-data.table-name:}") String appDataTableName,
			DynamoDbClient dynamoDbClient) {
		if (!StringUtils.hasText(appDataTableName)) {
			return new InMemoryCourseRepository();
		}
		return new DynamoDbCourseRepository(appDataTableName, dynamoDbClient);
	}
}
