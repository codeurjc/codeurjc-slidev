package es.codeurjc.test.ejem;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("When running Calculator")
public class Calculadora6Test {
	
	Calculadora calc;

	@BeforeEach
	public void setUp() {
		this.calc = new Calculadora();
	}

	@Test
	@DisplayName("Then suma method should return the sum of two numbers")
	public void testSuma() {

		double res = calc.suma(1, 1);
		assertEquals(2, res, 0, "1+1 should be equal to 2");
	}

	@Test
	@DisplayName("Then resta method should return the subtraction of two numbers")
	public void testResta() {

		double res = calc.resta(1, 1);
		assertEquals(0, res, 0, "1-1 should be equal to 0");
	}
}