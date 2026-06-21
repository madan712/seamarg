package com.seamarg.backend;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class HelloWorldControllerTests {

	@Test
	void helloReturnsGreeting() {
		HelloWorldController controller = new HelloWorldController();

		assertEquals("Hello message from seamarg backend", controller.hello().message());
	}
}
