package es.codeurjc.test.ejem;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
 
public class SumTest {
	
	@ParameterizedTest
	@ValueSource(ints = {-1, 5, 10})
	public void test(int argument) {
		assertTrue(argument > 0 && argument <= 5);
	}
	
}