package es.codeurjc.test.user;

/**
 * Excepción lanzada cuando un usuario no puede ser eliminado de la base de datos.
 * 
 * Puede ocurrir por diferentes razones:
 * - El usuario tiene dependencias (registros relacionados)
 * - Restricciones de integridad referencial
 * - Permisos insuficientes
 * - Error de conexión a la base de datos
 */
public class UserDeletionException extends RuntimeException {
    
    public UserDeletionException(String message) {
        super(message);
    }
    
    public UserDeletionException(String message, Throwable cause) {
        super(message, cause);
    }
}
