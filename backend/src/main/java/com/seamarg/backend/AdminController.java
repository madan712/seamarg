package com.seamarg.backend;

import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/api/admin")
public class AdminController {

	@GetMapping("/hello")
	public AdminResponse hello(Authentication authentication) {
		String principal = authentication.getName();
		log.info("Handling admin hello request for principal={}", principal);
		return new AdminResponse("Hello from the admin API", principal);
	}

	public record AdminResponse(String message, String principal) {
	}
}
