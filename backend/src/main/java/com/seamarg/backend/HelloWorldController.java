package com.seamarg.backend;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HelloWorldController {

	@GetMapping("/hello")
	public HelloResponse hello() {
		return new HelloResponse("Hello message from seamarg backend");
	}

	public record HelloResponse(String message) {
	}
}
