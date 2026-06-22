package com.seamarg.backend;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public")
public class PublicController {

	@GetMapping("/hello")
	public PublicResponse hello() {
		return new PublicResponse("Hello from the public API");
	}

	public record PublicResponse(String message) {
	}
}
