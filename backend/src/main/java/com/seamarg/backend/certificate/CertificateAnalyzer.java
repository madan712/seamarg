package com.seamarg.backend.certificate;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
class CertificateAnalyzer {

	private final OpenAiCertificateExtractor openAiCertificateExtractor;
	private final LocalCertificateExtractor localCertificateExtractor;

	CertificateAnalyzer(OpenAiCertificateExtractor openAiCertificateExtractor,
			LocalCertificateExtractor localCertificateExtractor) {
		this.openAiCertificateExtractor = openAiCertificateExtractor;
		this.localCertificateExtractor = localCertificateExtractor;
	}

	CertificateExtraction analyze(String originalFilename, String contentType, byte[] content) {
		if (openAiCertificateExtractor.isConfigured()) {
			try {
				return openAiCertificateExtractor.analyze(originalFilename, contentType, content);
			} catch (RuntimeException exception) {
				log.warn("Falling back to local certificate extraction for file={}", originalFilename, exception);
			}
		}

		return localCertificateExtractor.analyze(originalFilename, contentType, content);
	}
}
