package com.seamarg.backend.certificate;

import java.time.Duration;

public record CertificateSettings(
		String awsRegion,
		String documentBucketName,
		String appDataTableName,
		long maxUploadBytes,
		Duration downloadUrlTtl,
		String openAiApiKey,
		String openAiModel,
		String minimaxApiKey,
		String minimaxBaseUrl,
		String minimaxModel) {
}
