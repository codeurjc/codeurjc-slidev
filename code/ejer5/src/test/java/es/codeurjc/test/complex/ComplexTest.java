package es.codeurjc.test.complex;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class ComplexTest {

	private Complex zero;

	@BeforeEach
	public void setUp() {
		zero = new Complex(0, 0);
	}
	
	@Test
	public void givenComplex0_0_whenReciprocal_thenExceptionIsThrown() {

		ArithmeticException actual = assertThrows(ArithmeticException.class, () -> {
			
			zero.reciprocal();
			
		});

		assertEquals(actual.getMessage(), "division by zero");
	}
}
