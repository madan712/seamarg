package com.seamarg.backend;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/api/public")
public class PublicController {

	@GetMapping("/hello")
	public PublicResponse hello() {
		log.info("Handling public hello request");
		return new PublicResponse("Hello from the public API");
	}

	public record PublicResponse(String message) {
	}
}
