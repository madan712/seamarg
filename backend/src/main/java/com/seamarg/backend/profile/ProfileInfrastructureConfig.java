package com.seamarg.backend.profile;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

@Configuration
class ProfileInfrastructureConfig {

	@Bean
	ProfileSettings profileSettings(@Value("${seamarg.app-data.table-name:}") String appDataTableName) {
		return new ProfileSettings(appDataTableName);
	}

	@Bean
	ProfileRepository profileRepository(ProfileSettings settings, DynamoDbClient dynamoDbClient) {
		if (!StringUtils.hasText(settings.appDataTableName())) {
			return new InMemoryProfileRepository();
		}
		return new DynamoDbProfileRepository(settings, dynamoDbClient);
	}
}
