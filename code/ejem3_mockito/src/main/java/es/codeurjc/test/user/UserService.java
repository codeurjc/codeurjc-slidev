package es.codeurjc.test.user;

/**
 * Servicio que maneja la lógica de negocio relacionada con usuarios.
 * 
 * Este ejemplo es perfecto para entender Mockito porque:
 * - La lógica es simple (buscar usuarios, validaciones)
 * - Tiene una dependencia clara (UserDatabase) que podemos mockear
 * - NO queremos acceder a una base de datos real durante los tests
 */
public class UserService {
    
    private UserDatabase database;
    
    public UserService(UserDatabase database) {
        this.database = database;
    }
    
    /**
     * Obtiene un usuario por su nombre.
     * Lanza excepción si el usuario no existe.
     * 
     * @param name Nombre del usuario a buscar
     * @return El usuario encontrado
     * @throws UserNotFoundException si el usuario no existe en la base de datos
     */
    public User getUserByName(String name) {
        User user = database.findByName(name);
        
        if (user == null) {
            throw new UserNotFoundException("Usuario no encontrado: " + name);
        }
        
        return user;
    }
    
    /**
     * Crea un nuevo usuario si no existe ya.
     * 
     * @param name Nombre del usuario
     * @param email Email del usuario
     * @param age Edad del usuario
     * @return true si se creó correctamente, false si ya existía
     */
    public boolean createUser(String name, int age) {
        // Verificar si ya existe
        User existing = database.findByName(name);
        if (existing != null) {
            return false; // Ya existe, no se crea
        }
        
        // Crear nuevo usuario
        User newUser = new User(name, age);
        return database.save(newUser);
    }
    
    /**
     * Elimina un usuario si existe.
     * 
     * @param name Nombre del usuario a eliminar
     * @return true si se eliminó, false si no existía o no pudo ser eliminado
     */
    public boolean deleteUser(String name) {
        try {
            return database.delete(name);
        } catch (UserDeletionException e) {
            // El usuario no puede ser eliminado (tiene dependencias, etc.)
            return false;
        }
    }
    
    /**
     * Verifica si un usuario es mayor de edad (>= 18 años)
     * 
     * @param name Nombre del usuario
     * @return true si es mayor de edad
     * @throws UserNotFoundException si el usuario no existe
     */
    public boolean isAdult(String name) {
        User user = getUserByName(name); // Reutiliza el método que lanza excepción
        return user.getAge() >= 18;
    }
    
    /**
     * Verifica si el servicio está operativo
     * 
     * @return true si la base de datos está conectada
     */
    public boolean isServiceAvailable() {
        return database.isConnected();
    }
}
