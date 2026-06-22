package com.seamarg.backend;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

	@GetMapping("/hello")
	public AdminResponse hello(Authentication authentication) {
		return new AdminResponse("Hello from the admin API", authentication.getName());
	}

	public record AdminResponse(String message, String principal) {
	}
}
