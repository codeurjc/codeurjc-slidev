package es.codeurjc.test.user;

/**
 * Interfaz que representa una base de datos de usuarios.
 * 
 * En producción, esta interfaz:
 * - Se conectaría a una base de datos real (MySQL, PostgreSQL, MongoDB, etc.)
 * - Ejecutaría queries SQL o NoSQL
 * - Manejaría conexiones, transacciones, errores de red, etc.
 * - Sería lenta (acceso a disco, red, etc.)
 * 
 * En tests, usaremos un mock para:
 * - NO conectarnos a una base de datos real
 * - Simular diferentes escenarios (usuario encontrado, no encontrado, error)
 * - Hacer los tests rápidos (sin I/O real)
 */
public interface UserDatabase {
    
    /**
     * Busca un usuario por su nombre en la base de datos
     * 
     * @param name Nombre del usuario a buscar
     * @return El usuario encontrado, o null si no existe
     */
    User findByName(String name);
    
    /**
     * Guarda un usuario en la base de datos
     * 
     * @param user Usuario a guardar
     * @return true si se guardó correctamente, false si falló
     */
    boolean save(User user);
    
    /**
     * Elimina un usuario de la base de datos
     * 
     * @param name Nombre del usuario a eliminar
     * @return true si se eliminó, false si no existía
     * @throws UserDeletionException si el usuario no puede ser eliminado
     */
    boolean delete(String name) throws UserDeletionException;
    
    /**
     * Verifica si la base de datos está disponible
     * 
     * @return true si está conectada y operativa
     */
    boolean isConnected();
}
