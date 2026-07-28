package es.codeurjc.test.user;

/**
 * Clase simple que representa un usuario.
 */
public class User {
    
    private String name;
    private int age;
    
    public User(String name, int age) {
        this.name = name;
        this.age = age;
    }
    
    public String getName() {
        return name;
    }
    
    public int getAge() {
        return age;
    }
}
