package com.seamarg.backend.certificate;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.time.Duration;

@Configuration
class CertificateInfrastructureConfig {

	@Bean
	ObjectMapper objectMapper() {
		return new ObjectMapper().findAndRegisterModules();
	}

	@Bean
	CertificateSettings certificateSettings(
			@Value("${seamarg.aws.region}") String awsRegion,
			@Value("${seamarg.certificates.storage.bucket-name:}") String documentBucketName,
			@Value("${seamarg.certificates.data.table-name:}") String appDataTableName,
			@Value("${seamarg.certificates.max-upload-bytes}") long maxUploadBytes,
			@Value("${seamarg.certificates.download-url-ttl-seconds}") long downloadUrlTtlSeconds,
			@Value("${seamarg.ai.openai.api-key:}") String openAiApiKey,
			@Value("${seamarg.ai.openai.model}") String openAiModel) {
		return new CertificateSettings(
			awsRegion,
			documentBucketName,
			appDataTableName,
			maxUploadBytes,
			Duration.ofSeconds(downloadUrlTtlSeconds),
			openAiApiKey,
			openAiModel);
	}

	@Bean
	S3Client s3Client(CertificateSettings settings) {
		return S3Client.builder()
			.region(Region.of(settings.awsRegion()))
			.credentialsProvider(DefaultCredentialsProvider.create())
			.build();
	}

	@Bean
	S3Presigner s3Presigner(CertificateSettings settings) {
		return S3Presigner.builder()
			.region(Region.of(settings.awsRegion()))
			.credentialsProvider(DefaultCredentialsProvider.create())
			.build();
	}

	@Bean
	DynamoDbClient dynamoDbClient(CertificateSettings settings) {
		return DynamoDbClient.builder()
			.region(Region.of(settings.awsRegion()))
			.credentialsProvider(DefaultCredentialsProvider.create())
			.build();
	}

	@Bean
	DocumentStorage documentStorage(CertificateSettings settings, S3Client s3Client, S3Presigner s3Presigner) {
		if (!StringUtils.hasText(settings.documentBucketName())) {
			return new UnavailableDocumentStorage();
		}

		return new S3DocumentStorage(settings, s3Client, s3Presigner);
	}

	@Bean
	CertificateRepository certificateRepository(CertificateSettings settings, DynamoDbClient dynamoDbClient) {
		if (!StringUtils.hasText(settings.appDataTableName())) {
			return new InMemoryCertificateRepository();
		}

		return new DynamoDbCertificateRepository(settings, dynamoDbClient);
	}

	@Bean
	CertificateDataRepository certificateDataRepository(CertificateSettings settings, DynamoDbClient dynamoDbClient) {
		if (!StringUtils.hasText(settings.appDataTableName())) {
			return new InMemoryCertificateDataRepository();
		}

		return new DynamoDbCertificateDataRepository(settings, dynamoDbClient);
	}
}
