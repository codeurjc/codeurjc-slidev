package es.codeurjc.test.ejem;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledOnOs;
import org.junit.jupiter.api.condition.OS;

public class Conditionals {

	@Test
	@DisabledOnOs(OS.WINDOWS)
	void doNotRunOnWindows() {
		System.out.println("This test is not executed on Windows");
		assertTrue(true);
	}
	
	@Test
	@DisabledOnOs({OS.LINUX, OS.MAC})
	void runOnlyInWindows() {
		System.out.println("This test is only executed on Windows");
		assertTrue(true);
	}

}
