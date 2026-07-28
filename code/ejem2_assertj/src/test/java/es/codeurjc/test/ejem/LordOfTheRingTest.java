package es.codeurjc.test.ejem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.assertj.core.util.Arrays;
import org.junit.jupiter.api.Test;

class LordOfTheRingTest {
	
	String[] fellowshipOfTheRing = Arrays.array(
		"Frodo", "Sam", "Merry", "Pippin", "Gandalf", "Legolas", "Gimli", "Aragorn", "Boromir"
	);

	@Test
	public void testMembers() {
		assertThat(fellowshipOfTheRing).hasSize(9)
                               .contains("Frodo", "Sam")
                               .doesNotContain("Sauron");
	}

	@Test
	public void testMembers2() {
		assertThatThrownBy(() -> { 
			String sauron = fellowshipOfTheRing[9];
		}).isInstanceOf(Exception.class).hasMessageContaining("Index 9 out of bounds for length 9");
	}

}
