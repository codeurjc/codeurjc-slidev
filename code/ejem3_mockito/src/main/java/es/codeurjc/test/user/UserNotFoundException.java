package es.codeurjc.test.user;

/**
 * Excepción que se lanza cuando no se encuentra un usuario en la base de datos.
 */
public class UserNotFoundException extends RuntimeException {
    
    public UserNotFoundException(String message) {
        super(message);
    }
}
