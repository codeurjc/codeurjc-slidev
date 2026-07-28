package es.codeurjc.test.ejem;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

public class Sum4Test {
	
	@ParameterizedTest(name = "{index}: {0}+{1}= {2}")
	@MethodSource("values")
	public void test(int a, int b, int result) {
		assertEquals(a + b, result);
	}
	
	public static Stream<Arguments> values() {
		return Stream.of(
				Arguments.of(0, 0, 0),
				Arguments.of(1, 1, 2)
		);		
	}	

}