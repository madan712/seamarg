package com.seamarg.backend;

import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/api/customer")
public class CustomerController {

	@GetMapping("/hello")
	public CustomerResponse hello(JwtAuthenticationToken authentication) {
		String subject = authentication.getToken().getSubject();
		log.info("Handling customer hello request for subject={}", subject);
		return new CustomerResponse("Hello from the customer API", subject);
	}

	public record CustomerResponse(String message, String subject) {
	}
}
