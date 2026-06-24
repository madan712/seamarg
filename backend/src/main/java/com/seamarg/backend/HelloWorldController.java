package com.seamarg.backend;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/api")
public class HelloWorldController {

	@GetMapping("/hello")
	public HelloResponse hello() {
		log.info("Handling hello request");
		return new HelloResponse("Hello message from seamarg backend");
	}

	public record HelloResponse(String message) {
	}
}
