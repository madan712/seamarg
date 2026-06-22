package com.seamarg.backend;

import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/customer")
public class CustomerController {

	@GetMapping("/hello")
	public CustomerResponse hello(JwtAuthenticationToken authentication) {
		return new CustomerResponse("Hello from the customer API", authentication.getToken().getSubject());
	}

	public record CustomerResponse(String message, String subject) {
	}
}
