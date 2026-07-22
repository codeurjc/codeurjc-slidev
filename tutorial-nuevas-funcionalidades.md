---
layout: cover
date: 07-2026
subject: codeurjc-slidev
lesson: "Tutorial: nuevas funcionalidades del repositorio"
authors: Micael Gallego, Francisco Gortázar, Michel Maes, Óscar Soto e Iván Chicano
colorSchema: light
aspectRatio: 16/9
---

# Tutorial: Nuevas funcionalidades de codeurjc-slidev

---

# Editor visual de layout
- Cada slide con el layout `default` incluye una capa de edición integrada en el panel **SideEditor** de Slidev (pestaña "Layout")
- Arrastra y redimensiona la barra roja, el logo, el título y el contenido
- Los cambios se pueden deshacer (undo) antes de guardar
- Al guardar, la posición se persiste como variables CSS en el propio `.vue` del layout, o se puede guardar como un layout `.vue` nuevo

---

# Auto-fit del tamaño de texto
- El contenido de cada slide ajusta automáticamente su tamaño de letra para caber en la caja de contenido
- Si el texto cabe de sobra, se mantiene un tamaño cómodo por defecto (no crece innecesariamente)
- Si el texto es demasiado largo, se reduce progresivamente hasta encajar
- Se recalcula también si el tamaño de la caja de contenido cambia (p. ej. al arrastrarla con el editor)

---

# Pegar y posicionar imágenes
- Pega una imagen (Ctrl+V) directamente sobre una slide en modo edición
- La imagen se sube automáticamente y se inserta como `![](ruta)` en el markdown de la slide, sin pipeline manual de assets
- Se puede elegir la posición de la imagen respecto al contenido:
    - **Debajo** del texto (`below`): la imagen se centra bajo el contenido
    - **A la derecha** del texto (`right`): el contenido se estrecha para dejar hueco a la imagen
- La imagen es un elemento más del editor de layout: se puede arrastrar, redimensionar y su posición se guarda igual que el resto

---

# Doble clic para editar texto
- Haz doble clic sobre el título o el contenido ya renderizado de una slide
- El editor salta automáticamente al markdown de esa slide y selecciona el texto pulsado
- Permite pasar directamente de "veo un error en la slide" a "lo edito", sin buscar manualmente la línea en el markdown

---

# Anotaciones de código: callouts
## ¿Qué son?
- Permiten marcar una línea, un rango de líneas o una subcadena dentro de un bloque de código
- Cada marca puede llevar un comentario que se renderiza como una caja (callout) conectada al código mediante un conector en L
- Las marcas se escriben como comentario al final de la línea de código y **se eliminan del código renderizado**: el público nunca las ve

---

# Anotaciones de código: sintaxis
```
// [!mark[:start|:end][(<inicio>-<fin>)][@<x>,<y>]] <comentario>
```
- No hace falta id: las marcas no se referencian entre sí, así que no se escribe ninguno (se genera internamente solo para uso interno)
- `<comentario>`: todo lo que va después del `]`; si se deja vacío, la línea se resalta pero no aparece ninguna caja
- Formas disponibles:
    - Línea completa: `// [!mark] comentario`
    - Rango multilínea: `// [!mark:start]` ... `// [!mark:end]`
    - Subcadena: `// [!mark(<inicio>-<fin>)] comentario`, con `<inicio>`/`<fin>` como índices de carácter (base 0, fin exclusivo) sobre la línea de código
    - Posición fija: `@x,y` justo antes del `]` (se escribe solo al arrastrar el callout en el editor)

---

# Anotaciones de código: ejemplo
```java
public GestorNotas(DBAlumno alumnos) { // [!mark] Inyecta la dependencia de la base de datos
	this.alumnos = alumnos;              // [!mark(1-13)] Solo la subcadena
}

public float calculaNotaMedia(long idAlumno) {
	List<Float> notas = alumnos.getNotasAlumno(idAlumno); // [!mark(29-53)] Obtiene las notas del alumno
	float suma = 0.0f; // [!mark:start] Recorre las notas para sumarlas
	for(float nota : notas) {
		suma += nota;
	}
	return suma / notas.size(); // [!mark:end]
}
```

---

# Anotaciones de código: colocación y arrastre
- Los callouts se colocan automáticamente alrededor del bloque de código: **derecha → izquierda → debajo → encima**, el primer lado donde quepan
- Se dimensionan según el texto del comentario (con un ancho máximo, creciendo en alto si hace falta)
- Si un lado ya está ocupado por otro callout del mismo bloque, el nuevo se apila junto al hueco libre más cercano a su propio resaltado
- En modo edición, arrastrar un callout escribe su posición como `@x,y` en la marca, para que persista entre recargas y sobreviva a ediciones posteriores del código

---
layout: copyright
---

# Tutorial: Nuevas funcionalidades de codeurjc-slidev
