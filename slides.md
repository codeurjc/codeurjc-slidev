---
layout: cover
date: 02-2026
subject: Ampliación de Ingeniería del Software
lesson: "Bloque 1: Introducción a pruebas software"
authors: Micael Gallego, Francisco Gortázar, Michel Maes, Óscar Soto e Iván Chicano
colorSchema: light
aspectRatio: 16/9
---

# Ejercicios Tema 1.2: Pruebas unitarias

---

# Casos de Test
## Ejercicio 1
- Implementa varios tests de la clase `Complex`
- Comprueba que el complejo `Complex(0, 0)` tiene parte real y parte imaginaria 0.
- Comprueba que `Complex(0, 0)` es el valor neutro de la operación suma:
    - `Complex(0, 0) + Complex(1, 1) == Complex(1, 1)`
    - `Complex(1, 1) + Complex(0, 0) == Complex(1, 1)`

---

# Casos de Test
## Ejercicio 2
- Transforma el Ejercicio 1 para usar Test fixtures
- Define un atributo `zero` que se inicializa en un método setUp anotado como `@BeforeEach`
- Ese atributo se usará siempre que se necesite el número complejo 0+0i:
    - `zero + Complex(1, 1) == Complex(1, 1)`
    - `Complex(1, 1) + zero == Complex(1, 1)`