package es.codeurjc.test.complex;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.offset;

import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

public class ComplexAbsTest {

	@ParameterizedTest(name = "{index}: ({0}).abs() == {1}")
	@MethodSource("values")
	public void absoluteTest(Complex complex, double result) {
		assertThat(complex.abs()).isCloseTo(result, offset(0.001));
	}
	
	public static Stream<Arguments> values() {

		return Stream.of(
				Arguments.of(new Complex(0, 0), 0),
				Arguments.of(new Complex(1, 1), 1.41421),
				Arguments.of(new Complex(2, 2), 2.82843),
				Arguments.of(new Complex(5, 5), 7.07107),
				Arguments.of(new Complex(10, 10), 14.1421),
				Arguments.of(new Complex(10, 1), 10.0498),
				Arguments.of(new Complex(20, 2), 20.099)
		);

	}
}
