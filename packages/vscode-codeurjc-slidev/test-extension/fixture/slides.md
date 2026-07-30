---
theme: codeurjc-slidev-theme
---

# Fixture slide

```java
public GestorNotas(DBAlumno alumnos) { // [!mark] Injects the dependency
  this.alumnos = alumnos;
}
```

<<< @/code/Foo.java java
[!mark:"getNotasAlumno"] Fetches the student's grades

---

<<< @/
