package es.codeurjc.test.user;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.atMost;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

/**
 * GUÍA COMPLETA DE MOCKITO - CONCEPTOS FUNDAMENTALES
 * 
 * Este ejemplo enseña TODOS los conceptos clave de Mockito:
 * 
 * 1. CREAR MOCKS - Cómo mockear una dependencia
 * 2. VALORES POR DEFECTO - Qué devuelven los mocks sin configurar
 * 3. MÉTODOS SIN PARÁMETROS - Configurar when() para métodos sin args
 * 4. MÉTODOS VOID - Usar doThrow() para forzar excepciones
 * 5. MÉTODOS CON PARÁMETROS - Configurar respuestas según entrada
 * 6. MATCHERS - Usar eq(), anyString(), etc.
 * 7. MOCKS QUE DEVUELVEN MOCKS - Encadenar objetos mockeados
 * 8. VERIFICACIONES - verify(), times(), never()
 */
public class UserServiceTest {

    @Test
    public void test01_CreateMock() {
        // CREAR el mock de la base de datos
        UserDatabase databaseMock = mock(UserDatabase.class);

        // El mock NO es una base de datos real
        // Es un objeto falso creado por Mockito

        // Podemos inyectarlo en nuestro servicio
        UserService userService = new UserService(databaseMock);

        // CONCLUSIÓN: mock() crea un objeto falso que implementa la interfaz
    }

    @Test
    public void test02_DefaultValues() {
        UserDatabase databaseMock = mock(UserDatabase.class);

        // SIN configurar, findByName() devuelve NULL (es un objeto)
        User user = databaseMock.findByName("cualquier-nombre");
        assertNull(user);

        // SIN configurar, isConnected() devuelve FALSE (es boolean)
        boolean connected = databaseMock.isConnected();
        assertFalse(connected);

        // SIN configurar, save() devuelve FALSE (es boolean)
        boolean saved = databaseMock.save(new User("Test", 20));
        assertFalse(saved);

        // CONCLUSIÓN: Los mocks sin configurar son seguros pero inactivos
    }

    @Test
    public void test03_WhenThenReturn_MethodWithoutParameters() {
        UserDatabase databaseMock = mock(UserDatabase.class);

        // CONFIGURAR: Cuando llamen a isConnected(), devolver TRUE
        when(databaseMock.isConnected()).thenReturn(true);

        // VERIFICAR: Ahora devuelve true en lugar del false por defecto
        assertTrue(databaseMock.isConnected());

        // Podemos usarlo en nuestro servicio
        UserService userService = new UserService(databaseMock);
        assertTrue(userService.isServiceAvailable());

        // CONCLUSIÓN: when().thenReturn() configura el comportamiento del mock
    }

    @Test
    public void test04_ProblemWithDefaultValues() {
        UserDatabase databaseMock = mock(UserDatabase.class);
        UserService userService = new UserService(databaseMock);

        // El mock devuelve null por defecto
        // getUserByName() lanza excepción cuando recibe null de la BD
        assertThrows(UserNotFoundException.class, () -> {
            userService.getUserByName("Juan");
        });

        // CONCLUSIÓN: Debemos configurar el mock para que devuelva lo que necesitamos
    }

    @Test
    public void test05_WhenWithSpecificParameters() {
        UserDatabase databaseMock = mock(UserDatabase.class);
        UserService userService = new UserService(databaseMock);

        // CONFIGURAR: Si buscan "Juan", devolver un usuario específico
        User juan = new User("Juan", 25);
        when(databaseMock.findByName("Juan")).thenReturn(juan);

        // VERIFICAR: Cada parámetro devuelve su respuesta configurada
        assertEquals(25, userService.getUserByName("Juan").getAge());

        // Parámetros NO configurados devuelven null por defecto
        assertThrows(UserNotFoundException.class, () -> userService.getUserByName("Desconocido"));
    }

    @Test
    public void test06_Matcher_AnyString() {
        UserDatabase databaseMock = mock(UserDatabase.class);

        // CONFIGURAR: Para CUALQUIER nombre, devolver un usuario genérico
        User generic = new User("Generico", 99);
        when(databaseMock.findByName(anyString())).thenReturn(generic);

        // VERIFICAR: Funciona con cualquier String
        assertEquals(99, databaseMock.findByName("Ana").getAge());
        assertEquals(99, databaseMock.findByName("Luis").getAge());
        assertEquals(99, databaseMock.findByName("Cualquiera").getAge());

        // CONCLUSIÓN: anyString() hace que el mock responda igual para cualquier
        // entrada
    }

    @Test
    public void test07_Matcher_Any() {
        UserDatabase databaseMock = mock(UserDatabase.class);

        // CONFIGURAR: save() devuelve true para CUALQUIER User
        when(databaseMock.save(any(User.class))).thenReturn(true);

        // VERIFICAR: Funciona con cualquier usuario
        assertTrue(databaseMock.save(new User("Ana", 20)));
        assertTrue(databaseMock.save(new User("Luis", 30)));
        assertTrue(databaseMock.save(new User("Carlos", 40)));

        // CONCLUSIÓN: any() es útil cuando no importa el objeto específico
    }

    @Test
    public void test08_WhenWithSpecificParameters() {
        UserDatabase databaseMock = mock(UserDatabase.class);
        UserService userService = new UserService(databaseMock);

        // CONFIGURAR: Si buscan "Juan", devolver un usuario específico
        User juan = new User("Juan", 25);
        when(databaseMock.findByName(anyString())).thenReturn(juan);

        // VERIFICAR: Cada parámetro devuelve su respuesta configurada
        assertEquals(25, userService.getUserByName("Juan").getAge());
    }

    @Test
    public void test09_WhenWithSpecificParameters_MockedUser() {
        UserDatabase databaseMock = mock(UserDatabase.class);
        UserService userService = new UserService(databaseMock);

        // CREAR un mock de User (en lugar de new User("Juan", 25))
        User juanMock = mock(User.class);

        // CONFIGURAR el comportamiento del User mockeado
        when(juanMock.getName()).thenReturn("Juan");
        when(juanMock.getAge()).thenReturn(25);

        // CONFIGURAR: Si buscan "Juan", devolver el usuario mockeado
        when(databaseMock.findByName("Juan")).thenReturn(juanMock);

        // VERIFICAR: Cada parámetro devuelve su respuesta configurada
        assertEquals(25, userService.getUserByName("Juan").getAge());

        // Parámetros NO configurados devuelven null por defecto
        assertThrows(UserNotFoundException.class, () -> userService.getUserByName("Desconocido"));

        // CONCLUSIÓN: Mockear el objeto de retorno da más flexibilidad y control
    }

    @Test
    public void test10_AdvantagesOfMockingReturns() {
        UserDatabase databaseMock = mock(UserDatabase.class);

        // Crear un User mock con comportamiento especial
        User userMock = mock(User.class);

        // Podemos hacer que los métodos devuelvan lo que queramos
        when(userMock.getName()).thenReturn("Usuario");
        when(userMock.getAge())
                .thenReturn(10) // Primera llamada
                .thenReturn(20) // Segunda llamada
                .thenReturn(30); // Tercera llamada

        when(databaseMock.findByName(anyString())).thenReturn(userMock);

        // VERIFICAR: La edad cambia en cada llamada
        User user = databaseMock.findByName("Test");
        assertEquals(10, user.getAge());
        assertEquals(20, user.getAge());
        assertEquals(30, user.getAge());
        assertEquals(30, user.getAge()); // El último valor se convierte en el valor por defecto

        // CONCLUSIÓN: Mocks dentro de mocks dan control total sobre el comportamiento
    }

    @Test
    public void test11_DoThrow_SimulateException() {
        UserDatabase databaseMock = mock(UserDatabase.class);
        UserService userService = new UserService(databaseMock);

        // SIMULAR: delete() lanza UserDeletionException (usuario tiene dependencias)
        doThrow(new UserDeletionException("Usuario tiene pedidos asociados"))
                .when(databaseMock)
                .delete("UsuarioConPedidos");

        // VERIFICAR: El servicio maneja la excepción y devuelve false
        boolean deleted = userService.deleteUser("UsuarioConPedidos");
        assertFalse(deleted);

        // VERIFICAR: Podemos capturar la excepción directamente si llamamos al mock
        Exception exception = assertThrows(UserDeletionException.class, () -> {
            databaseMock.delete("UsuarioConPedidos");
        });
        assertEquals("Usuario tiene pedidos asociados", exception.getMessage());

        // Otros usuarios NO lanzan excepción (solo configuramos para uno específico)
        assertFalse(databaseMock.delete("OtroUsuario")); // Devuelve false por defecto

        // CONCLUSIÓN: doThrow() simula errores/excepciones de forma realista
    }

    @Test
    public void test12_Verify_BasicCall() {
        UserDatabase databaseMock = mock(UserDatabase.class);
        UserService userService = new UserService(databaseMock);

        // CONFIGURAR
        when(databaseMock.findByName("Ana")).thenReturn(new User("Ana", 25));

        // ACTUAR: Llamar al servicio
        userService.getUserByName("Ana");

        // VERIFICAR: Se llamó a findByName con "Ana"
        verify(databaseMock).findByName("Ana");

        // CONCLUSIÓN: verify() confirma que el método se ejecutó
    }

    @Test
    public void test13_Verify_Never() {
        UserDatabase databaseMock = mock(UserDatabase.class);
        UserService userService = new UserService(databaseMock);

        // CONFIGURAR: Usuario ya existe
        when(databaseMock.findByName("Ana")).thenReturn(new User("Ana", 30));

        // ACTUAR: Intentar crear usuario que ya existe
        boolean created = userService.createUser("Ana", 30);

        // VERIFICAR: NO se creó (retorna false)
        assertFalse(created);

        // VERIFICAR: findByName SÍ se llamó (para verificar si existe)
        verify(databaseMock).findByName("Ana");

        // VERIFICAR: save() NUNCA se llamó (porque ya existía)
        verify(databaseMock, never()).save(any(User.class));

        // CONCLUSIÓN: never() es perfecto para verificar que NO ocurrió algo
    }

    @Test
    public void test14_Verify_TimesVariants() {
        UserDatabase databaseMock = mock(UserDatabase.class);

        // ACTUAR
        databaseMock.isConnected();
        databaseMock.isConnected();
        databaseMock.isConnected();

        // VERIFICAR: Diferentes formas
        verify(databaseMock, times(3)).isConnected(); // Exactamente 3
        verify(databaseMock, atLeast(2)).isConnected(); // Al menos 2
        verify(databaseMock, atMost(5)).isConnected(); // Como máximo 5

        // CONCLUSIÓN: Tenemos varias opciones para verificar cantidad de llamadas
    }

}
