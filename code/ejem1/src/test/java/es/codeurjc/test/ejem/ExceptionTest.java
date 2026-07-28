package es.codeurjc.test.ejem;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import org.junit.jupiter.api.Test;

public class ExceptionTest {
	
	@Test
	public void arrayExceptionTest0() {
		
		try {
			Integer.parseInt("No integer");
			fail("No exception thrown");
		}catch(NumberFormatException e){
			assertTrue(true);
		}catch(Exception e){
			fail("Unexpected exception thrown");
		}
		
	}

	@Test
	public void arrayExceptionTest1() {

		assertThrows(NumberFormatException.class, () -> {
			
			Integer.parseInt("No integer");
			
		});

	}
	
	@Test
	public void arrayExceptionTest2() {

		NumberFormatException ex = assertThrows(NumberFormatException.class, () -> {
			
			Integer.parseInt("No integer");
			
		});
		
		assertEquals("For input string: \"No integer\"", ex.getMessage());		
	}
}